export const config = { runtime: "edge" };

const EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

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
        message: "This deployment has no built-in Gemini API key.",
      },
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: { message: "Invalid JSON body." } });
  }

  const { text, dim } = payload || {};
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return jsonResponse(400, { error: { message: "Missing or invalid 'text'." } });
  }
  const dimension =
    Number.isInteger(dim) && dim >= 128 && dim <= 1024 ? dim : 256;

  const upstream = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: dimension,
    }),
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
