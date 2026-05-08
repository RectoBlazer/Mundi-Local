import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGeminiApiKey, getSupabaseEnv } from "../_shared/env.ts";
import { geminiGenerateJson } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url: SB_URL, anonKey: SB_ANON_KEY, serviceRoleKey: SB_SERVICE_ROLE_KEY } = getSupabaseEnv();
    const GEMINI_API_KEY = getGeminiApiKey();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SB_URL, SB_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { csv, file_name } = await req.json();
    if (!csv || typeof csv !== "string") {
      return new Response(JSON.stringify({ error: "csv required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trim CSV to keep prompt small
    const trimmed = csv.length > 20000 ? csv.slice(0, 20000) + "\n... (truncated)" : csv;

    const systemPrompt = `You are Finn, a financial analyst for small businesses. Analyze the provided CSV (transactions/expenses/earnings) and return STRICT JSON matching this TypeScript type — no prose, no markdown, no code fences:

{
  "cash_flow_health": { "score": number (0-100), "label": string (e.g. "Healthy", "At Risk", "Critical"), "commentary": string (1-2 sentences) },
  "totals": { "earnings": number, "expenses": number, "net": number, "currency": string (3-letter code, infer from data, default "MYR") },
  "waste_detection": Array<{ "category": string, "amount": number, "reason": string }>,
  "action_plan": Array<{ "title": string, "impact": "Low" | "Medium" | "High", "effort": "Low" | "Medium" | "High" }>,
  "history": Array<{ "date": string (YYYY-MM-DD), "earnings": number, "expenses": number, "net": number }>,
  "forecast": Array<{ "date": string (YYYY-MM-DD), "projected_net": number, "projected_earnings": number, "projected_expenses": number }>
}

Rules: round numbers to 2 decimals. Limit waste_detection to top 3. Limit action_plan to 4 items. Be concrete and reference the data.

For "history": aggregate the CSV by day and return one entry per day in chronological order (max 90 most-recent days). Use 0 when a side has no value.
For "forecast": project the NEXT 30 consecutive days starting the day after the last history date. Base the projection on observed trend, seasonality (weekday patterns), and recurring categories. Return exactly 30 entries, chronological.`;

    const summary = await geminiGenerateJson({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      system: systemPrompt,
      userText: `File: ${file_name}\n\nCSV:\n${trimmed}`,
      maxRetries: 1,
    });

    // Service role for write
    const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY);
    const { data: row, error: insertErr } = await admin
      .from("business_data")
      .insert({
        user_id: userId,
        type: "expense",
        file_name: file_name ?? "upload.csv",
        raw_csv: trimmed,
        summary,
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    await admin.from("agent_logs").insert({
      user_id: userId,
      agent: "finn",
      action: "analyze_csv",
      status: "success",
      payload: { file_name, score: (summary as any)?.cash_flow_health?.score },
    });

    return new Response(JSON.stringify({ id: row.id, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("finn-analyze error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
