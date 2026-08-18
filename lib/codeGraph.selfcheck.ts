import assert from "node:assert";
import { buildCodeGraph } from "./codeGraph.ts";

const fileMap = new Map<string, string>([
  ["app/a.ts", `import { b } from "./b";\nimport { c } from "./sub/c";\n`],
  ["app/b.ts", `export const b = 1;`],
  ["app/sub/c.ts", `export const c = 2;`],
  [
    "schema.prisma",
    `model User {\n  id Int @id\n  posts Post[]\n}\nmodel Post {\n  id Int @id\n  author User @relation(fields: [authorId], references: [id])\n  authorId Int\n}\n`,
  ],
  [
    "schema.sql",
    `CREATE TABLE orders (\n  id INT PRIMARY KEY,\n  customer_id INT,\n  FOREIGN KEY (customer_id) REFERENCES customers(id)\n);\n`,
  ],
]);

const { nodes, edges } = buildCodeGraph(fileMap);

assert.ok(
  edges.some((e) => e.source === "app/a.ts" && e.target === "app/b.ts" && e.kind === "import"),
  "relative import a.ts -> b.ts not resolved"
);
assert.ok(
  edges.some((e) => e.source === "app/a.ts" && e.target === "app/sub/c.ts" && e.kind === "import"),
  "relative import a.ts -> sub/c.ts not resolved"
);
assert.ok(
  edges.some((e) => e.source === "table:Post" && e.target === "table:User" && e.kind === "fk"),
  "prisma FK Post -> User not extracted"
);
assert.ok(
  edges.some((e) => e.source === "table:orders" && e.target === "table:customers" && e.kind === "fk"),
  "sql FK orders -> customers not extracted"
);
assert.ok(nodes.length === new Set(nodes.map((n) => n.id)).size, "duplicate node ids");

console.log(`OK: ${nodes.length} nodes, ${edges.length} edges`);
