import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGeminiApiKey, getSupabaseEnv } from "../_shared/env.ts";
import { fetchAsBase64, geminiGenerateJson, generateImage } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Mira, a witty malaysian social-media copywriter for small businesses.
Given a product (name, description, price(in Malaysian Ringgit), and image), write short, punchy posts for Instagram, TikTok, and Facebook in manglish.
Return STRICT JSON in this shape:
{
  "posts": [
    { "platform": "Instagram", "caption": "...", "hashtags": ["tag1","tag2"], "ad_visual": "short visual brief for the ad image" },
    { "platform": "TikTok", "caption": "...", "hashtags": ["tag1","tag2"], "ad_visual": "short visual brief for the ad image" },
    { "platform": "Facebook", "caption": "...", "hashtags": ["tag1","tag2"], "ad_visual": "short visual brief for the ad image" }
  ]
}
Captions: 2-4 sentences, emojis welcome, end with a clear CTA. Hashtags: 5-8 lowercase, no # symbol.
ad_visual: 1-2 sentence brief describing an engaging ad scene tailored to the platform (mood, background, props, lighting). Keep the product itself unchanged.`;

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

    function rewriteLocalUrl(u: string, sbUrl: string) {
      return u
        .replace(/^http:\/\/127\.0\.0\.1:54321/i, sbUrl)
        .replace(/^http:\/\/localhost:54321/i, sbUrl);
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

    const imageUrl = product.image_url ? rewriteLocalUrl(product.image_url, SB_URL) : null;
    const image = imageUrl ? await fetchAsBase64(imageUrl) : undefined;

    const parsed = await geminiGenerateJson<{
      posts?: {
        platform: string;
        caption: string;
        hashtags: string[];
        ad_visual?: string;
      }[];
    }>({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      system: SYSTEM_PROMPT,
      userText,
      image,
      maxRetries: 1,
    });

  const adminClient = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

  const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
  const results: any[] = [];

  // Generate ONE ad image before the loop 
  let generatedAdImage: string | null = null;
  
  // Use the first post's ad_visual (or combine all briefs into one)
  const firstVisual = posts.find(p => p.ad_visual)?.ad_visual;
  
  if (imageUrl && firstVisual) {
    try {
      generatedAdImage = await generateImage(
        adminClient,
        user.id,
        product.id,
        "ad",
        product.name,
        imageUrl,
        firstVisual
      );
    } catch (e) {
      console.error("ad image error", e);
      // generatedAdImage stays null, will fall back to product image
    }
  }

  // Loop: reuse the single generated image for all posts ──
  for (const p of posts) {
    // Use generated image if available, otherwise fall back to original product image
    const adImageUrl = generatedAdImage ?? product.image_url ?? null;

    const { data: row, error: insertErr } = await adminClient
      .from("social_posts")
      .insert({
        user_id: user.id,
        product_id: product.id,
        platform: p.platform,
        caption: p.caption,
        hashtags: p.hashtags ?? [],
        image_url: adImageUrl,
        status: "draft",
      })
      .select("*")
      .single();
      
    if (insertErr) {
      console.error("Insert error:", insertErr);
    } else if (row) {
      results.push(row);
    }
  }

  await adminClient.from("agent_logs").insert({
    user_id: user.id,
    agent: "mira",
    action: "generate_posts",
    status: "success",
    payload: { product_id: product.id, count: results.length },
  });

  return new Response(JSON.stringify({ posts: results }), {
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
