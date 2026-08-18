const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error("unreachable");
    const data = await res.json();
    const installed: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
    return Response.json({ reachable: true, installed });
  } catch {
    return Response.json({ reachable: false, installed: [] });
  }
}
