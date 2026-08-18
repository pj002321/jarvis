"use client";

import { useMemo, useState } from "react";
import type { GraphNode, GraphEdge } from "@/lib/codeGraph";

export default function CodeGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const size = 800;
  const radius = size / 2 - 80;
  const center = size / 2;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      map.set(n.id, { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) });
    });
    return map;
  }, [nodes, radius, center]);

  if (nodes.length === 0) {
    return (
      <p className="text-cyan-700 text-xs p-2">
        import 관계나 DB 외래키를 찾지 못했습니다. (import 문 또는 .prisma/.sql 파일이 필요합니다)
      </p>
    );
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      <defs>
        <filter id="node-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="graph-pop" style={{ transformOrigin: `${center}px ${center}px` }}>
        {edges.map((e, i) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          const active = hover !== null && (hover === e.source || hover === e.target);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={e.kind === "fk" ? "#e879f9" : "#22d3ee"}
              strokeOpacity={active ? 0.9 : 0.22}
              strokeWidth={active ? 2.4 : 1.2}
              strokeDasharray={e.kind === "fk" ? "3 3" : "6 5"}
              className="edge-flow"
            />
          );
        })}

        {nodes.map((n, i) => {
          const p = positions.get(n.id)!;
          const active = hover === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer node-pop"
              style={{ animationDelay: `${Math.min(i * 18, 400)}ms` }}
            >
              <circle
                r={n.kind === "table" ? 7 : 5}
                fill={n.kind === "table" ? "#e879f9" : "#22d3ee"}
                fillOpacity={active ? 1 : 0.65}
                filter="url(#node-glow)"
              />
              <text
                x={0}
                y={-10}
                textAnchor="middle"
                fontSize={8}
                fill={active ? "#ffffff" : "#7dd3fc"}
                className="select-none"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
