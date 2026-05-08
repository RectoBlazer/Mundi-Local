type GeminiInlineDataPart = {
  inlineData: {
    mimeType: string;
    data: string; // base64
  };
};

type GeminiTextPart = { text: string };

type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type GeminiGenerateJsonParams = {
  apiKey: string;
  model:
    | "gemini-2.5-flash"
    | "gemini-2.5-pro"
    | (string & {});
  system: string;
  userText: string;
  // Optional vision input
  image?: {
    mimeType: string;
    dataBase64: string;
  };
  // If the model returns non-JSON, we can retry once with a stricter instruction.
  maxRetries?: number;
};

// add generateImage helper
export async function generateImage(
  adminClient: any,
  userId: string,
  productId: string,
  platform: string,
  productName: string,
  productImageUrl: string,
  adVisual: string
) {
  const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const imageUrl = productImageUrl
    .replace(/^http:\/\/127\.0\.0\.1:54321/i, SB_URL)
    .replace(/^http:\/\/localhost:54321/i, SB_URL);

  const productImage = await fetchAsBase64(imageUrl);

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set");
    return null;
  }

  const imgPrompt = `Create a high-impact ${platform} ad image for the product "${productName}".
Use the attached product photo as the source — keep the product's true shape, color, and details accurate.
Place it in an engaging scene: ${adVisual ?? "studio lighting, vibrant background, modern lifestyle styling"}.
Add a small, tasteful text overlay with the product name "${productName}". Avoid extra text. Square 1:1, photoreal, polished commercial look.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: imgPrompt },
          {
            inlineData: {
              mimeType: productImage.mimeType,
              data: productImage.dataBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["Text", "Image"], // REQUIRED for image generation
      temperature: 0.4,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("Gemini image gen failed:", res.status, txt);
    return null;
  }

  const json = await res.json();
  
  // Gemini returns generated images as inlineData parts in the response
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const mime = part.inlineData.mimeType;
      const b64 = part.inlineData.data;
      const ext = mime.split("/")[1].replace("jpeg", "jpg");
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${userId}/ads/${productId}-${Date.now()}-${platform.toLowerCase()}.${ext}`;
      
      const { error: upErr } = await adminClient.storage
        .from("product-images")
        .upload(path, bytes, { contentType: mime, upsert: true });
        
      if (!upErr) {
        const { data: pub } = adminClient.storage.from("product-images").getPublicUrl(path);
        return pub.publicUrl;
      }
      
      console.error("Upload error:", upErr);
      return null;
    }
  }

  console.error("No image part found in Gemini response:", JSON.stringify(json, null, 2));
  return null;
}

async function geminiGenerateContentRaw(params: GeminiGenerateJsonParams): Promise<string> {
  const { apiKey, model, system, userText, image } = params;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const userParts: GeminiPart[] = [{ text: userText }];
  if (image) {
    userParts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.dataBase64,
      },
    });
  }

  const body = {
    systemInstruction: {
      parts: [{ text: system }],
    },
    contents: [
      {
        role: "user",
        parts: userParts,
      } satisfies GeminiContent,
    ],
    generationConfig: {
      // Strong hint to return JSON.
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API ${res.status}: ${txt}`);
  }

  const json = await res.json();
  // Typical shape: candidates[0].content.parts[0].text
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text)
    ?.filter(Boolean)
    ?.join("") ?? "";

  return text;
}

function stripJsonCodeFences(s: string) {
  return s
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export async function geminiGenerateJson<T = unknown>(params: GeminiGenerateJsonParams): Promise<T> {
  const maxRetries = params.maxRetries ?? 1;

  let lastText = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const extra = attempt === 0
      ? ""
      : "\n\nIMPORTANT: You MUST return only valid minified JSON (no markdown, no code fences, no commentary).";

    lastText = await geminiGenerateContentRaw({
      ...params,
      system: params.system + extra,
    });

    const candidate = stripJsonCodeFences(lastText);

    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try again
    }
  }

  throw new Error(`Gemini returned malformed JSON: ${lastText.slice(0, 500)}`);
}

export async function fetchAsBase64(url: string): Promise<{ mimeType: string; dataBase64: string }>{
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = new Uint8Array(await res.arrayBuffer());

  // Deno supports btoa on strings; convert bytes to binary string first.
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const dataBase64 = btoa(bin);

  return { mimeType: contentType, dataBase64 };
}
