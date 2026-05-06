import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGeminiApiKey, getSupabaseEnv } from "../_shared/env.ts";
import { fetchAsBase64, geminiGenerateJson } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Mira, a witty social-media copywriter for small businesses.
Given a product (name, description, price, and image), write short, punchy posts for Instagram, TikTok, and Facebook.
Return STRICT JSON in this shape:
{
  "posts": [
    { "platform": "Instagram", "caption": "...", "hashtags": ["tag1","tag2"] },
    { "platform": "TikTok", "caption": "...", "hashtags": ["tag1","tag2"] },
    { "platform": "Facebook", "caption": "...", "hashtags": ["tag1","tag2"] }
  ]
}
Captions: 2-4 sentences, emojis welcome, end with a clear CTA. Hashtags: 5-8 lowercase, no # symbol.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url: SB_URL, anonKey: SB_ANON_KEY, serviceRoleKey: SB_SERVICE_ROLE_KEY } = getSupabaseEnv();
    const GEMINI_API_KEY = getGeminiApiKey();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "Missing product_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SB_URL, SB_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const { data: product, error: prodErr } = await userClient
      .from("product_catalog")
      .select("*")
      .eq("id", product_id)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userText = `Product name: ${product.name}
Description: ${product.description ?? "(none)"}
Price: ${product.price ?? "n/a"}
Stock: ${product.stock}
${product.image_url ? "An image is attached — read the visual cues (color, style, mood) and weave them into the caption." : ""}`;

    const image = product.image_url ? await fetchAsBase64(product.image_url) : undefined;

    const parsed = await geminiGenerateJson<{ posts?: { platform: string; caption: string; hashtags: string[] }[] }>({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      system: SYSTEM_PROMPT,
      userText,
      image,
      maxRetries: 1,
    });

    const posts = Array.isArray(parsed.posts) ? parsed.posts : [];

    const adminClient = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    if (posts.length) {
      await adminClient.from("social_posts").insert(
        posts.map((p) => ({
          user_id: user.id,
          product_id: product.id,
          platform: p.platform,
          caption: p.caption,
          hashtags: p.hashtags ?? [],
          image_url: product.image_url,
          status: "draft",
        })),
      );
    }

    await adminClient.from("agent_logs").insert({
      user_id: user.id,
      agent: "mira",
      action: "generate_posts",
      status: "success",
      payload: { product_id: product.id, count: posts.length },
    });

    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mira-generate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
