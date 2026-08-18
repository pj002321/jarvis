import { readdir, readFile, stat } from "fs/promises";
import path from "path";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".turbo",
  "coverage", ".vercel", ".cache", "__pycache__", ".venv", "venv",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx",
  ".css", ".scss", ".html", ".py", ".go", ".rs", ".java", ".kt", ".c",
  ".cpp", ".h", ".hpp", ".rb", ".php", ".sql", ".yml", ".yaml", ".toml",
  ".sh", ".txt", ".env", ".graphql", ".vue", ".svelte", ".swift",
]);

const MAX_FILE_READ_BYTES = 300_000; // ponytail: per-file cap, chunked reading if huge files matter later

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: TreeNode[];
};

function isTextFile(name: string) {
  const ext = path.extname(name).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || /^(dockerfile|makefile|readme)$/i.test(name);
}

export async function buildTree(dir: string, maxDepth = 6): Promise<TreeNode> {
  async function walk(current: string, depth: number): Promise<TreeNode> {
    const st = await stat(current);
    const name = path.basename(current) || current;
    if (!st.isDirectory()) {
      return { name, path: current, type: "file", size: st.size };
    }
    if (depth >= maxDepth) {
      return { name, path: current, type: "dir", children: [] };
    }
    const entries = await readdir(current, { withFileTypes: true });
    const children: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      children.push(await walk(path.join(current, entry.name), depth + 1));
    }
    children.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1
    );
    return { name, path: current, type: "dir", children };
  }
  return walk(dir, 0);
}

export type ScoredFile = { path: string; score: number; content: string };

// ponytail: naive keyword-count search over file contents, swap for embeddings if repo size makes this slow
export async function searchRelevantFiles(
  dir: string,
  query: string,
  limit = 6,
  maxFilesScanned = 2000
): Promise<ScoredFile[]> {
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
  let scanned = 0;

  async function walk(current: string) {
    if (scanned >= maxFilesScanned) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (scanned >= maxFilesScanned) return;
      if (entry.name.startsWith(".")) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!isTextFile(entry.name)) continue;
      scanned++;
      const st = await stat(full).catch(() => null);
      if (!st || st.size > MAX_FILE_READ_BYTES) continue;
      const content = await readFile(full, "utf-8").catch(() => "");
      if (!content) continue;
      const lower = content.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        score += (lower.split(kw).length - 1) * (path.basename(full).toLowerCase().includes(kw) ? 3 : 1);
      }
      if (score > 0) results.push({ path: full, score, content });
    }
  }

  await walk(dir);
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function treeSummary(node: TreeNode, prefix = "", lines: string[] = [], maxLines = 400): string {
  if (lines.length >= maxLines) return lines.join("\n");
  lines.push(`${prefix}${node.type === "dir" ? node.name + "/" : node.name}`);
  if (node.children) {
    for (const child of node.children) {
      treeSummary(child, prefix + "  ", lines, maxLines);
      if (lines.length >= maxLines) break;
    }
  }
  return lines.join("\n");
}
