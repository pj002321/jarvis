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
  ["pkg/util.py", `def helper():\n    return 1\n`],
  ["pkg/main.py", `from pkg.util import helper\nimport util\n`],
  ["pkg/sub/mod.py", `from ..util import helper\n`],
  [
    "gen_schema.py",
    `SCHEMA = f"""\nCREATE TABLE items (\n  id INT PRIMARY KEY,\n  order_id INT,\n  FOREIGN KEY (order_id) REFERENCES orders(id)\n){{STRICT}}\n"""\n`,
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
assert.ok(
  edges.some((e) => e.source === "pkg/main.py" && e.target === "pkg/util.py" && e.kind === "import"),
  "python absolute-ish import (dotted module path) not resolved"
);
assert.ok(
  edges.some((e) => e.source === "pkg/sub/mod.py" && e.target === "pkg/util.py" && e.kind === "import"),
  "python relative import (from ..util import x) not resolved"
);
assert.ok(
  edges.some((e) => e.source === "table:items" && e.target === "table:orders" && e.kind === "fk"),
  "sql FK embedded in python f-string (no trailing semicolon) not extracted"
);
assert.ok(nodes.length === new Set(nodes.map((n) => n.id)).size, "duplicate node ids");

console.log(`OK: ${nodes.length} nodes, ${edges.length} edges`);
