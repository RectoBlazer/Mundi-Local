import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "Missing product_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SB_URL")!,
      Deno.env.get("SB_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userText = `Product name: ${product.name}
Description: ${product.description ?? "(none)"}
Price: ${product.price ?? "n/a"}
Stock: ${product.stock}
${product.image_url ? "An image is attached — read the visual cues (color, style, mood) and weave them into the caption." : ""}`;

    const userContent: unknown[] = [{ type: "text", text: userText }];
    if (product.image_url) {
      userContent.push({ type: "image_url", image_url: { url: product.image_url } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI error", aiRes.status, txt);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable Cloud." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { posts?: { platform: string; caption: string; hashtags: string[] }[] } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const posts = Array.isArray(parsed.posts) ? parsed.posts : [];

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
        }))
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
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mira-generate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});