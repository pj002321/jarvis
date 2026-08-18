const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function POST(req: Request) {
  const { model } = await req.json();
  if (!model) {
    return new Response(JSON.stringify({ error: "model required" }), { status: 400 });
  }

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

  if (!ollamaRes.ok) {
    return new Response(JSON.stringify({ error: "모델 삭제에 실패했습니다." }), { status: 502 });
  }

  return Response.json({ ok: true });
}
