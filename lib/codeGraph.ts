export type GraphNode = { id: string; label: string; kind: "file" | "table" };
export type GraphEdge = { source: string; target: string; kind: "import" | "fk" };

// ponytail: regex-based extraction, not a real parser (ts-morph/AST) — swap in if imports with
// complex aliases (tsconfig paths, barrel re-exports) start producing misses
const IMPORT_RE = /(?:import\s+[\s\S]*?\s+from\s+|import\s*\(|require\()\s*['"](\.[^'"]+)['"]/g;
const PY_FROM_RE = /^\s*from\s+(\.*)([\w.]*)\s+import\b/gm;
const PY_IMPORT_RE = /^\s*import\s+([\w][\w.]*)/gm;

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

// Python has no bundler-style relative specifiers for plain `from x import y`, so absolute
// (dot-less) imports are resolved by unique module basename instead of path resolution.
function buildPyBasenameIndex(fileMap: Map<string, string>): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const path of fileMap.keys()) {
    if (!path.endsWith(".py")) continue;
    const file = path.split("/").pop()!.replace(/\.py$/, "");
    const key = file === "__init__" ? path.split("/").slice(-2, -1)[0] : file;
    if (!key) continue;
    const list = idx.get(key) ?? [];
    list.push(path);
    idx.set(key, list);
  }
  return idx;
}

function resolvePyRelative(fromPath: string, dots: string, modulePath: string, allPaths: Set<string>): string | null {
  let dir = fromPath.split("/").slice(0, -1);
  for (let i = 1; i < dots.length; i++) dir = dir.slice(0, -1);
  const subParts = modulePath ? modulePath.split(".") : [];
  const base = normalize([...dir, ...subParts].join("/"));
  const candidates = [`${base}.py`, `${base}/__init__.py`];
  return candidates.find((c) => allPaths.has(c)) ?? null;
}

// ponytail: basename-index resolution, not a real sys.path/package resolver — ambiguous
// basenames (two files with the same name in different dirs) are skipped rather than guessed
function extractPythonImportEdges(fileMap: Map<string, string>): GraphEdge[] {
  const allPaths = new Set(fileMap.keys());
  const basenameIndex = buildPyBasenameIndex(fileMap);
  const edges: GraphEdge[] = [];
  for (const [path, content] of fileMap) {
    if (!path.endsWith(".py")) continue;

    PY_FROM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PY_FROM_RE.exec(content))) {
      const [, dots, modulePath] = m;
      let resolved: string | null = null;
      if (dots) {
        resolved = resolvePyRelative(path, dots, modulePath, allPaths);
      } else if (modulePath) {
        const matches = basenameIndex.get(modulePath.split(".").pop()!);
        if (matches?.length === 1) resolved = matches[0];
      }
      if (resolved && resolved !== path) edges.push({ source: path, target: resolved, kind: "import" });
    }

    PY_IMPORT_RE.lastIndex = 0;
    while ((m = PY_IMPORT_RE.exec(content))) {
      const matches = basenameIndex.get(m[1].split(".").pop()!);
      if (matches?.length === 1 && matches[0] !== path) {
        edges.push({ source: path, target: matches[0], kind: "import" });
      }
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
      // ponytail: chunk by CREATE TABLE boundaries instead of balanced-paren matching, so this
      // also catches schemas embedded in another language's string literals (e.g. Python f-strings)
      // where the table definition doesn't end in a bare `);`. Real SQL parser if schemas get hairier.
      const starts: { name: string; from: number }[] = [];
      const tableNameRe = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"[]?(\w+)[`"\]]?/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tableNameRe.exec(content))) {
        starts.push({ name: tm[1], from: tm.index + tm[0].length });
      }
      for (let i = 0; i < starts.length; i++) {
        const end = i + 1 < starts.length ? starts[i + 1].from : content.length;
        const chunk = content.slice(starts[i].from, end);
        const fkRe = /REFERENCES\s+[`"[]?(\w+)[`"\]]?/gi;
        let fkm: RegExpExecArray | null;
        while ((fkm = fkRe.exec(chunk))) {
          edges.push({ source: `table:${starts[i].name}`, target: `table:${fkm[1]}`, kind: "fk" });
        }
      }
    }
  }
  return edges;
}

const MAX_NODES = 40; // ponytail: keep the hologram legible; swap for zoom/pan clustering if repos need more

export function buildCodeGraph(fileMap: Map<string, string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const edges = [
    ...extractImportEdges(fileMap),
    ...extractPythonImportEdges(fileMap),
    ...extractForeignKeyEdges(fileMap),
  ];

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
