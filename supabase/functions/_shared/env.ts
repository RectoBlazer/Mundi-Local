export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getSupabaseEnv() {
  // NOTE: Supabase CLI local edge runtime skips env vars starting with SUPABASE_.
  // Use SB_* in supabase/functions/.env.
  const url = requireEnv("SB_URL");
  const anonKey = requireEnv("SB_ANON_KEY");
  const serviceRoleKey = requireEnv("SB_SERVICE_ROLE_KEY");
  return { url, anonKey, serviceRoleKey };
}

export function getGeminiApiKey() {
  return requireEnv("GEMINI_API_KEY");
}

export function getTelegramEnv() {
  const botToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET");
  return { botToken, webhookSecret };
}
