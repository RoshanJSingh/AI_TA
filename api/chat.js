export const config = { runtime: "edge" };

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
]);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: { message: "Method not allowed." } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(503, {
      error: {
        code: "NO_SERVER_KEY",
        message:
          "This deployment has no built-in Gemini API key. Add your own key in Settings to start chatting.",
      },
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: { message: "Invalid JSON body." } });
  }

  const { model, contents, systemInstruction, generationConfig } = payload || {};
  if (!Array.isArray(contents) || contents.length === 0) {
    return jsonResponse(400, { error: { message: "Missing 'contents'." } });
  }

  const modelId = ALLOWED_MODELS.has(model) ? model : "gemini-2.5-flash";

  const upstream = await fetch(
    `${GEMINI_BASE}/${modelId}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents, systemInstruction, generationConfig }),
    }
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") || "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
}
