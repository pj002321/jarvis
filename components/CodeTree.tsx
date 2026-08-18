"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/types";

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function extColor(name: string) {
  const ext = name.split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-300", js: "text-yellow-300",
    jsx: "text-yellow-200", json: "text-lime-400", md: "text-cyan-200",
    css: "text-pink-300", py: "text-green-300", go: "text-sky-300",
  };
  return map[ext] ?? "text-cyan-500/70";
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);

  if (node.type === "file") {
    return (
      <div
        className="flex justify-between pr-2 py-0.5 hover:bg-cyan-900/20 rounded"
        style={{ paddingLeft: depth * 14 }}
      >
        <span className={extColor(node.name)}>{node.name}</span>
        <span className="text-cyan-700 text-xs">{formatSize(node.size)}</span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 py-0.5 w-full text-left hover:bg-cyan-900/20 rounded text-cyan-300"
        style={{ paddingLeft: depth * 14 }}
      >
        <span className="text-cyan-600 w-3 inline-block">{open ? "▾" : "▸"}</span>
        {node.name}/
        <span className="text-cyan-700 text-xs ml-1">{node.children?.length ?? 0}</span>
      </button>
      {open &&
        node.children?.map((child) => (
          <Node key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export default function CodeTree({ tree }: { tree: TreeNode }) {
  return (
    <div className="text-xs font-mono overflow-y-auto max-h-full">
      <Node node={tree} depth={0} />
    </div>
  );
}
