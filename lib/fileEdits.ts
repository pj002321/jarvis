// The assistant is instructed (see app/api/chat/route.ts SYSTEM_PROMPT) to wrap any file
// it wants to write in <file path="...">...</file> blocks. We parse those out of the
// streamed response, strip them from the displayed chat text, and write them to disk
// via the File System Access API when the user clicks "적용".
const FILE_BLOCK_RE = /<file path="([^"]+)">\n([\s\S]*?)\n<\/file>/g;

export type FileEdit = { path: string; content: string };

export function extractFileEdits(text: string): FileEdit[] {
  const edits: FileEdit[] = [];
  let m: RegExpExecArray | null;
  FILE_BLOCK_RE.lastIndex = 0;
  while ((m = FILE_BLOCK_RE.exec(text))) {
    edits.push({ path: m[1], content: m[2] });
  }
  return edits;
}

export function stripFileBlocks(text: string): string {
  FILE_BLOCK_RE.lastIndex = 0;
  return text.replace(FILE_BLOCK_RE, (_match, path) => `📝 ${path} 수정 제안 (아래 버튼으로 적용하세요)`);
}

export async function writeFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("잘못된 파일 경로입니다.");
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
