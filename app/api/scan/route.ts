import { buildTree } from "@/lib/scan";

export async function POST(req: Request) {
  const { dir } = await req.json();
  if (!dir || typeof dir !== "string") {
    return Response.json({ error: "폴더 경로를 입력하세요." }, { status: 400 });
  }
  try {
    const tree = await buildTree(dir);
    return Response.json({ tree });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `폴더를 읽을 수 없습니다: ${message}` }, { status: 400 });
  }
}
