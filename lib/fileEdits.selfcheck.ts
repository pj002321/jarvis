import assert from "node:assert";
import { extractFileEdits, stripFileBlocks } from "./fileEdits.ts";

const response = `설명입니다.\n\n<file path="src/a.ts">\nexport const a = 2;\n</file>\n\n다음 파일도 고쳤어요.\n\n<file path="src/sub/b.py">\ndef b():\n    return 2\n</file>\n`;

const edits = extractFileEdits(response);
assert.strictEqual(edits.length, 2, "expected 2 file edits");
assert.strictEqual(edits[0].path, "src/a.ts");
assert.strictEqual(edits[0].content, "export const a = 2;");
assert.strictEqual(edits[1].path, "src/sub/b.py");
assert.strictEqual(edits[1].content, "def b():\n    return 2");

const stripped = stripFileBlocks(response);
assert.ok(!stripped.includes("<file"), "file blocks not stripped from display text");
assert.ok(stripped.includes("src/a.ts"), "stripped text should still mention the file path");

console.log(`OK: ${edits.length} edits parsed, blocks stripped`);
