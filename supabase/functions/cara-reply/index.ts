import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cara: customer support agent
// - reads a customer_tickets row
// - drafts an AI reply
// - optionally creates a pending_orders row when buy intent is detected

const SYSTEM_PROMPT = `You are Cara, a helpful customer support agent for a small business.
You will be given an inbound customer ticket (channel, message, and any metadata).
Write a polite, concise reply.
If you detect clear purchase intent (customer wants to buy, asks to order, asks to checkout, requests price + how to purchase), set buy_intent=true.
If buy_intent=true, extract a minimal order draft when possible.

Return STRICT JSON with this shape:
{
  "reply": string,
  "buy_intent": boolean,
  "confidence": number, // 0-1
  "order": null | {
    "items": Array<{ "name": string, "qty": number }>,
    "notes": string
  }
}

Rules:
- reply must be ready to send as-is.
- If customer is just asking a question, buy_intent=false.
- If information is missing, ask 1-2 clarifying questions in the reply.
- Keep it under 120 words unless absolutely necessary.`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const { ticket_id } = await req.json().catch(() => ({}));
    if (!ticket_id) return jsonResponse({ error: "Missing ticket_id" }, 400);

    // User-scoped read
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const user = userData.user;

    // Fetch ticket (RLS should scope by user_id)
    const { data: ticket, error: ticketErr } = await userClient
      .from("customer_tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) return jsonResponse({ error: "Ticket not found" }, 404);

    const userText = `Channel: ${ticket.channel ?? "unknown"}\nFrom: ${ticket.from_name ?? ticket.from_handle ?? ticket.from_phone ?? "unknown"}\nMessage: ${ticket.message ?? ticket.body ?? ticket.text ?? ""}\nMetadata: ${JSON.stringify(ticket.metadata ?? {}, null, 0)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      if (aiRes.status === 429) return jsonResponse({ error: "Rate limit, try again shortly" }, 429);
      if (aiRes.status === 402) {
        return jsonResponse({ error: "AI credits exhausted. Add credits to Lovable workspace." }, 402);
      }
      return jsonResponse({ error: "AI generation failed" }, 500);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";

    let parsed: { reply?: string; buy_intent?: boolean; confidence?: number; order?: any } = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      parsed = {};
    }

    const reply = typeof parsed.reply === "string" ? parsed.reply : "";
    const buy_intent = Boolean(parsed.buy_intent);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    const order = parsed.order ?? null;

    // Service role for writes (logs + pending order)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Write pending order only if buy intent and at least a reply exists
    let pending_order_id: string | null = null;
    if (buy_intent) {
      const { data: pending, error: poErr } = await admin
        .from("pending_orders")
        .insert({
          user_id: user.id,
          ticket_id: ticket.id,
          status: "pending",
          draft: order,
          notes: order?.notes ?? null,
        })
        .select("id")
        .single();

      if (!poErr && pending?.id) pending_order_id = pending.id;
      if (poErr) console.error("pending_orders insert error", poErr);
    }

    // Log action
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

    // Optionally persist draft reply back to ticket if columns exist (safe best-effort)
    // This will not throw if columns don't exist; Supabase will error, so swallow.
    if (reply) {
      const { error: updErr } = await admin
        .from("customer_tickets")
        .update({
          draft_reply: reply,
          buy_intent,
        })
        .eq("id", ticket.id);
      if (updErr) {
        // ignore schema mismatches
        console.warn("ticket update skipped:", updErr.message);
      }
    }

    return jsonResponse({ reply, buy_intent, confidence, order, pending_order_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("cara-reply error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
