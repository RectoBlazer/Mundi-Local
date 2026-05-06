import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SB_URL")!;
    const SERVICE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SB_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
  

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { csv, file_name } = await req.json();
    if (!csv || typeof csv !== "string") {
      return new Response(JSON.stringify({ error: "csv required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trim CSV to keep prompt small
    const trimmed = csv.length > 20000 ? csv.slice(0, 20000) + "\n... (truncated)" : csv;

    const systemPrompt = `You are Finn, a financial analyst for small businesses. Analyze the provided CSV (transactions/expenses/earnings) and return STRICT JSON matching this TypeScript type — no prose, no markdown, no code fences:

{
  "cash_flow_health": { "score": number (0-100), "label": string (e.g. "Healthy", "At Risk", "Critical"), "commentary": string (1-2 sentences) },
  "totals": { "earnings": number, "expenses": number, "net": number, "currency": string (3-letter code, infer from data, default "MYR") },
  "waste_detection": Array<{ "category": string, "amount": number, "reason": string }>,
  "action_plan": Array<{ "title": string, "impact": "Low" | "Medium" | "High", "effort": "Low" | "Medium" | "High" }>
}

Rules: round numbers to 2 decimals. Limit waste_detection to top 3. Limit action_plan to 4 items. Be concrete and reference the data.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `File: ${file_name}\n\nCSV:\n${trimmed}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to Lovable workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${aiRes.status}: ${errText}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let summary;
    try {
      summary = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("JSON parse failed", raw);
      throw new Error("AI returned malformed JSON");
    }

    // Service role for write
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
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
      payload: { file_name, score: summary?.cash_flow_health?.score },
    });

    return new Response(JSON.stringify({ id: row.id, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("finn-analyze error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});