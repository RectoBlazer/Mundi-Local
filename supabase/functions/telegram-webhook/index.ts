import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getSupabaseEnv, getTelegramEnv } from "../_shared/env.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractText(update: any): string {
  return (
    update?.message?.text ||
    update?.message?.caption ||
    update?.edited_message?.text ||
    update?.channel_post?.text ||
    update?.callback_query?.data ||
    ""
  );
}

function extractChatId(update: any): string | null {
  const id = update?.message?.chat?.id ?? update?.edited_message?.chat?.id ?? update?.channel_post?.chat?.id;
  return id == null ? null : String(id);
}

function extractHandle(update: any): string {
  const from = update?.message?.from ?? update?.edited_message?.from ?? update?.callback_query?.from;
  const username = from?.username ? `@${from.username}` : null;
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
  return username ?? name ?? "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ??
      req.headers.get("x-telegram-bot-api-secret-token");

    const { webhookSecret } = getTelegramEnv();
    if (!secretHeader || secretHeader !== webhookSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const update = await req.json().catch(() => null);
    if (!update) return json({ ok: true });

    const text = extractText(update);
    const externalId = extractChatId(update);
    const handle = extractHandle(update);

    if (!text || !externalId) {
      return json({ ok: true });
    }

    // NOTE: We need to map Telegram chats to a user_id (tenant).
    // For local MVP: require X-Mundi-User-Id header to route the ticket.
    // You can replace this later with a proper mapping table.
    const userId = req.headers.get("X-Mundi-User-Id") ?? req.headers.get("x-mundi-user-id");
    if (!userId) {
      return json({ error: "Missing X-Mundi-User-Id header (tenant routing)" }, 400);
    }

    const { url: SB_URL, serviceRoleKey: SB_SERVICE_ROLE_KEY } = getSupabaseEnv();
    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    const { error: insErr } = await admin.from("customer_tickets").insert({
      user_id: userId,
      channel: "telegram",
      customer_handle: handle,
      message: text,
      status: "open",
      external_id: externalId,
    });

    if (insErr) {
      console.error("telegram-webhook insert error", insErr);
      return json({ ok: true });
    }

    await admin.from("agent_logs").insert({
      user_id: userId,
      agent: "cara",
      action: "ingest_telegram",
      status: "success",
      payload: { external_id: externalId },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("telegram-webhook error", e);
    return json({ ok: true });
  }
});
