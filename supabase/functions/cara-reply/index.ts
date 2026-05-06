import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGeminiApiKey, getSupabaseEnv } from "../_shared/env.ts";
import { geminiGenerateJson } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Cara, a helpful customer support agent for a small business.
You will be given a customer ticket with (channel, customer_handle, message).
Draft a reply the business owner can send.

If the customer shows clear intent to purchase (e.g. "I want to order", "how to buy", "checkout", "can I get 2 of ..."), set buy_intent=true.
If buy_intent=true, try to infer:
- product_name (string)
- qty (integer, default 1)
If you cannot infer product_name, set it to "(unknown)" and ask a clarifying question in the reply.

Return STRICT JSON only:
{
  "reply": string,
  "buy_intent": boolean,
  "confidence": number,
  "product_name": string | null,
  "qty": number | null
}

Rules:
- confidence is 0..1.
- Keep reply under 120 words.
- Be polite, concise, and helpful.
- Ask at most 1-2 clarifying questions.`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url: SB_URL, anonKey: SB_ANON_KEY, serviceRoleKey: SB_SERVICE_ROLE_KEY } = getSupabaseEnv();
    const GEMINI_API_KEY = getGeminiApiKey();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const body = await req.json().catch(() => ({}));
    const ticket_id = body?.ticket_id;
    if (!ticket_id) return jsonResponse({ error: "Missing ticket_id" }, 400);

    // User-scoped read
    const userClient = createClient(SB_URL, SB_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const { data: ticket, error: ticketErr } = await userClient
      .from("customer_tickets")
      .select("id, user_id, channel, customer_handle, message, status")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) return jsonResponse({ error: "Ticket not found" }, 404);

    const userText = `Channel: ${ticket.channel}\nCustomer: ${ticket.customer_handle}\nMessage: ${ticket.message}`;

    const parsed = await geminiGenerateJson<{
      reply: string;
      buy_intent: boolean;
      confidence: number;
      product_name: string | null;
      qty: number | null;
    }>({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      system: SYSTEM_PROMPT,
      userText,
      maxRetries: 1,
    });

    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    const buy_intent = Boolean(parsed.buy_intent);
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const product_name = typeof parsed.product_name === "string" ? parsed.product_name : null;
    const qty = typeof parsed.qty === "number" && Number.isFinite(parsed.qty) ? Math.max(1, Math.floor(parsed.qty)) : null;

    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    // Persist draft reply onto the ticket (matches migration: customer_tickets.ai_reply)
    if (reply) {
      const { error: updErr } = await admin
        .from("customer_tickets")
        .update({
          ai_reply: reply,
          status: "replied",
        })
        .eq("id", ticket.id);

      if (updErr) {
        console.error("customer_tickets update error", updErr);
      }
    }

    // Create pending order row if buy intent detected (matches migration schema)
    let pending_order_id: string | null = null;
    if (buy_intent) {
      const pn = product_name && product_name.trim().length ? product_name.trim() : "(unknown)";
      const q = qty ?? 1;

      const { data: po, error: poErr } = await admin
        .from("pending_orders")
        .insert({
          user_id: user.id,
          ticket_id: ticket.id,
          product_name: pn,
          qty: q,
          customer_handle: ticket.customer_handle,
          status: "pending",
        })
        .select("id")
        .single();

      if (poErr) {
        console.error("pending_orders insert error", poErr);
      } else {
        pending_order_id = po?.id ?? null;
      }
    }

    await admin.from("agent_logs").insert({
      user_id: user.id,
      agent: "cara",
      action: "draft_reply",
      status: "success",
      payload: {
        ticket_id: ticket.id,
        buy_intent,
        confidence,
        pending_order_id,
      },
    });

    return jsonResponse({ reply, buy_intent, confidence, product_name, qty, pending_order_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("cara-reply error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
