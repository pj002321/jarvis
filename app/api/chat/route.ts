import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT =
  "You are J.A.R.V.I.S., Tony Stark's AI assistant: sharp, dry-witted, unfailingly polite, and extremely concise. Address the user as 'sir' or 'ma'am' occasionally. Keep answers short and to the point unless asked for detail. When code context is provided, ground your answer in it and cite file paths.";

const OLLAMA_URL = "http://localhost:11434";

export async function POST(req: Request) {
  const { messages, apiKey, context, backend, model } = await req.json();
  const system = context ? `${SYSTEM_PROMPT}\n\nRelevant code from the project:${context}` : SYSTEM_PROMPT;
  const encoder = new TextEncoder();

  if (backend === "local") {
    if (!model) {
      return new Response(JSON.stringify({ error: "로컬 모델이 선택되지 않았습니다" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = new ReadableStream({
      async start(controller) {
        try {
          const res = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              stream: true,
              messages: [{ role: "system", content: system }, ...messages],
            }),
          });
          if (!res.body) throw new Error("Ollama에 연결할 수 없습니다.");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const chunk = JSON.parse(line);
              if (chunk.message?.content) controller.enqueue(encoder.encode(chunk.message.content));
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(encoder.encode(`[오류: ${message}]`));
        }
        controller.close();
      },
    });

    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "No API key configured" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropic = new Anthropic({ apiKey: key });

  const body = new ReadableStream({
    async start(controller) {
      try {
        const stream = await anthropic.messages.stream({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system,
          messages,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`[오류: ${message}]`));
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
