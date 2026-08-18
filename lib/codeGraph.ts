export type GraphNode = { id: string; label: string; kind: "file" | "table" };
export type GraphEdge = { source: string; target: string; kind: "import" | "fk" };

// ponytail: regex-based extraction, not a real parser (ts-morph/AST) — swap in if imports with
// complex aliases (tsconfig paths, barrel re-exports) start producing misses
const IMPORT_RE = /(?:import\s+[\s\S]*?\s+from\s+|import\s*\(|require\()\s*['"](\.[^'"]+)['"]/g;

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function resolveImport(fromPath: string, spec: string, allPaths: Set<string>): string | null {
  const dir = fromPath.split("/").slice(0, -1).join("/");
  const base = normalize(`${dir}/${spec}`);
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`,
  ];
  return candidates.find((c) => allPaths.has(c)) ?? null;
}

function extractImportEdges(fileMap: Map<string, string>): GraphEdge[] {
  const allPaths = new Set(fileMap.keys());
  const edges: GraphEdge[] = [];
  for (const [path, content] of fileMap) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) continue;
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(content))) {
      const resolved = resolveImport(path, m[1], allPaths);
      if (resolved && resolved !== path) edges.push({ source: path, target: resolved, kind: "import" });
    }
  }
  return edges;
}

// Prisma `model X { field Y @relation(...) }` and SQL `FOREIGN KEY ... REFERENCES` -> table FK edges
function extractForeignKeyEdges(fileMap: Map<string, string>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const [path, content] of fileMap) {
    if (/\.prisma$/.test(path)) {
      const modelRe = /model\s+(\w+)\s*\{([^}]*)\}/g;
      let mm: RegExpExecArray | null;
      while ((mm = modelRe.exec(content))) {
        const modelName = mm[1];
        const fieldRe = /^\s*\w+\s+(\w+)(\[\])?\s*[^\n]*$/gm;
        let fm: RegExpExecArray | null;
        while ((fm = fieldRe.exec(mm[2]))) {
          const fieldType = fm[1];
          if (/^[A-Z]/.test(fieldType) && fieldType !== modelName) {
            edges.push({ source: `table:${modelName}`, target: `table:${fieldType}`, kind: "fk" });
          }
        }
      }
    }
    if (/\.sql$/.test(path) || /CREATE TABLE/i.test(content)) {
      const tableRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"[]?(\w+)[`"\]]?\s*\(([\s\S]*?)\)\s*;/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tableRe.exec(content))) {
        const tableName = tm[1];
        const fkRe = /REFERENCES\s+[`"[]?(\w+)[`"\]]?/gi;
        let fkm: RegExpExecArray | null;
        while ((fkm = fkRe.exec(tm[2]))) {
          edges.push({ source: `table:${tableName}`, target: `table:${fkm[1]}`, kind: "fk" });
        }
      }
    }
  }
  return edges;
}

const MAX_NODES = 40; // ponytail: keep the hologram legible; swap for zoom/pan clustering if repos need more

export function buildCodeGraph(fileMap: Map<string, string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const edges = [...extractImportEdges(fileMap), ...extractForeignKeyEdges(fileMap)];

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  const keptIds = new Set(
    Array.from(degree.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_NODES)
      .map(([id]) => id)
  );

  const keptEdges = edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
  const nodes: GraphNode[] = Array.from(keptIds).map((id) => ({
    id,
    label: id.startsWith("table:") ? id.slice(6) : id.split("/").pop()!,
    kind: id.startsWith("table:") ? "table" : "file",
  }));

  return { nodes, edges: keptEdges };
}
