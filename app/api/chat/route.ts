import Anthropic from "@anthropic-ai/sdk";
import { searchRelevantFiles } from "@/lib/scan";
import path from "path";

const SYSTEM_PROMPT =
  "You are J.A.R.V.I.S., Tony Stark's AI assistant: sharp, dry-witted, unfailingly polite, and extremely concise. Address the user as 'sir' or 'ma'am' occasionally. Keep answers short and to the point unless asked for detail. When code context is provided, ground your answer in it and cite file paths.";

const MAX_CONTEXT_CHARS = 40_000;

export async function POST(req: Request) {
  const { messages, apiKey, dir } = await req.json();
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return new Response(JSON.stringify({ error: "No API key configured" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let system = SYSTEM_PROMPT;
  if (dir) {
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const matches = lastUser ? await searchRelevantFiles(dir, lastUser.content) : [];
    if (matches.length > 0) {
      let context = "";
      for (const m of matches) {
        const rel = path.relative(dir, m.path);
        const chunk = `\n\n### ${rel}\n\`\`\`\n${m.content.slice(0, 6000)}\n\`\`\``;
        if (context.length + chunk.length > MAX_CONTEXT_CHARS) break;
        context += chunk;
      }
      system += `\n\nRelevant code from the project at ${dir}:${context}`;
    }
  }

  const anthropic = new Anthropic({ apiKey: key });
  const encoder = new TextEncoder();

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
