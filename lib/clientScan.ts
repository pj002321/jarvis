import type { TreeNode } from "./types";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".turbo",
  "coverage", ".vercel", ".cache", "__pycache__", ".venv", "venv",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx",
  ".css", ".scss", ".html", ".py", ".go", ".rs", ".java", ".kt", ".c",
  ".cpp", ".h", ".hpp", ".rb", ".php", ".sql", ".yml", ".yaml", ".toml",
  ".sh", ".txt", ".prisma", ".graphql", ".vue", ".svelte", ".swift",
]);

const MAX_FILE_READ_BYTES = 300_000; // ponytail: per-file cap; large files are listed but not read into context

function isTextFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || /^(dockerfile|makefile|readme)$/i.test(name);
}

export function supportsDirectoryPicker() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export type ScanResult = { tree: TreeNode; fileMap: Map<string, string> };

// ponytail: recurses via the File System Access API (Chrome-only); no server/fs involved
export async function scanDirectory(
  rootHandle: FileSystemDirectoryHandle,
  maxFiles = 4000
): Promise<ScanResult> {
  const fileMap = new Map<string, string>();
  let scanned = 0;

  async function walk(dirHandle: FileSystemDirectoryHandle, relPath: string): Promise<TreeNode> {
    const children: TreeNode[] = [];
    // @ts-expect-error -- FileSystemDirectoryHandle async iteration isn't in the default TS DOM lib yet
    for await (const [name, entryHandle] of dirHandle.entries()) {
      if (scanned >= maxFiles) break;
      if (name.startsWith(".") && name !== ".env") continue;
      if (IGNORE_DIRS.has(name)) continue;
      const childPath = relPath ? `${relPath}/${name}` : name;

      if (entryHandle.kind === "directory") {
        children.push(await walk(entryHandle as FileSystemDirectoryHandle, childPath));
      } else {
        scanned++;
        const file = await (entryHandle as FileSystemFileHandle).getFile();
        children.push({ name, path: childPath, type: "file", size: file.size });
        if (isTextFile(name) && file.size > 0 && file.size <= MAX_FILE_READ_BYTES) {
          fileMap.set(childPath, await file.text());
        }
      }
    }
    children.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
    );
    return { name: dirHandle.name, path: relPath, type: "dir", children };
  }

  const tree = await walk(rootHandle, "");
  return { tree, fileMap };
}

export type ScoredFile = { path: string; score: number; content: string };

// ponytail: naive keyword-count search over already-read files, swap for embeddings if repo size makes this weak
export function searchRelevantFiles(
  fileMap: Map<string, string>,
  query: string,
  limit = 6
): ScoredFile[] {
  const keywords = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9가-힣_]+/i)
        .filter((w) => w.length >= 2)
    )
  );
  if (keywords.length === 0) return [];

  const results: ScoredFile[] = [];
  for (const [path, content] of fileMap) {
    const lower = content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      score += (lower.split(kw).length - 1) * (path.toLowerCase().includes(kw) ? 3 : 1);
    }
    if (score > 0) results.push({ path, score, content });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
