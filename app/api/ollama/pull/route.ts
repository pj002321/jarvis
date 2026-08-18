const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function POST(req: Request) {
  const { model } = await req.json();
  if (!model) {
    return new Response(JSON.stringify({ error: "model required" }), { status: 400 });
  }

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });

  if (!ollamaRes.body) {
    return new Response(JSON.stringify({ error: "Ollama에 연결할 수 없습니다." }), { status: 502 });
  }

  return new Response(ollamaRes.body, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
