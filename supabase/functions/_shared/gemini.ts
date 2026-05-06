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
