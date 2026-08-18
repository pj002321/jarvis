"use client";

import { useEffect, useRef, useState } from "react";
import type { TreeNode } from "@/lib/types";
import { scanDirectory, searchRelevantFiles, supportsDirectoryPicker } from "@/lib/clientScan";
import { buildCodeGraph, type GraphNode, type GraphEdge } from "@/lib/codeGraph";
import { loadDirHandle, saveDirHandle } from "@/lib/dirHandleStore";
import CodeTree from "@/components/CodeTree";
import CodeGraph from "@/components/CodeGraph";

type Message = { role: "user" | "assistant"; content: string };
type ViewMode = "tree" | "graph";

const KEY_STORAGE = "jarvis_api_key";
const MAX_CONTEXT_CHARS = 40_000;

function countFiles(node: TreeNode): number {
  if (node.type === "file") return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countFiles(c), 0);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [fileMap, setFileMap] = useState<Map<string, string> | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const recognitionRef = useRef<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORAGE) ?? "";
    setApiKey(saved);
    if (!saved) setShowSettings(true);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "ko-KR";
      recognition.interimResults = false;
      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setInput(text);
        send(text);
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!supportsDirectoryPicker()) return;
    (async () => {
      const handle = await loadDirHandle().catch(() => null);
      if (!handle) return;
      const perm = await (handle as any).queryPermission({ mode: "read" }).catch(() => "denied");
      if (perm === "granted") {
        await scanAndSet(handle);
      } else if (perm === "prompt") {
        setPendingHandle(handle);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveKey(key: string) {
    setApiKey(key);
    localStorage.setItem(KEY_STORAGE, key);
    setShowSettings(false);
  }

  async function scanAndSet(handle: FileSystemDirectoryHandle) {
    setScanning(true);
    setScanError("");
    try {
      const { tree, fileMap } = await scanDirectory(handle);
      setTree(tree);
      setFileMap(fileMap);
      setGraph(buildCodeGraph(fileMap));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "폴더를 읽을 수 없습니다.");
    } finally {
      setScanning(false);
    }
  }

  async function openFolder() {
    if (!supportsDirectoryPicker()) {
      alert("이 브라우저는 폴더 열기를 지원하지 않습니다. Chrome을 사용해주세요.");
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await (window as any).showDirectoryPicker();
    } catch {
      return; // user cancelled the dialog
    }
    await saveDirHandle(handle).catch(() => {});
    setPendingHandle(null);
    await scanAndSet(handle);
  }

  async function reconnectFolder() {
    if (!pendingHandle) return;
    setScanning(true);
    try {
      const perm = await (pendingHandle as any).requestPermission({ mode: "read" });
      if (perm !== "granted") {
        setScanError("폴더 접근 권한이 거부되었습니다. 다시 열어주세요.");
        setScanning(false);
        return;
      }
    } catch {
      setScanError("폴더 접근 권한 요청에 실패했습니다. 다시 열어주세요.");
      setScanning(false);
      return;
    }
    await scanAndSet(pendingHandle);
    setPendingHandle(null);
  }

  function toggleListening() {
    if (!recognitionRef.current) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.");
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function buildContext(query: string): string {
    if (!fileMap) return "";
    const matches = searchRelevantFiles(fileMap, query);
    let context = "";
    for (const m of matches) {
      const chunk = `\n\n### ${m.path}\n\`\`\`\n${m.content.slice(0, 6000)}\n\`\`\``;
      if (context.length + chunk.length > MAX_CONTEXT_CHARS) break;
      context += chunk;
    }
    return context;
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, apiKey, context: buildContext(content) || undefined }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        setMessages([...nextMessages, { role: "assistant", content: `오류: ${err.error}` }]);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: full }]);
      }
      speak(full);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row p-4 gap-4 relative overflow-hidden">
      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-4 right-4 text-cyan-400/70 hover:text-cyan-300 text-sm border border-cyan-800 rounded px-3 py-1 z-10"
      >
        설정
      </button>

      {/* Left: code tree / relationship graph panel */}
      <div className="w-full md:w-96 shrink-0 flex flex-col border border-cyan-900/60 rounded-xl p-3 bg-black/20 max-h-[55vh] md:max-h-[calc(100vh-2rem)]">
        <div className="flex gap-2 mb-2">
          <button
            onClick={openFolder}
            disabled={scanning}
            className="flex-1 px-2 py-1.5 text-xs border border-cyan-600 rounded text-cyan-300 disabled:opacity-40 bg-cyan-950/30"
          >
            {scanning ? "스캔 중..." : "📂 폴더 열기"}
          </button>
          {tree && (
            <div className="flex border border-cyan-800/60 rounded overflow-hidden text-xs">
              <button
                onClick={() => setViewMode("tree")}
                className={`px-2 py-1.5 ${viewMode === "tree" ? "bg-cyan-800/50 text-cyan-100" : "text-cyan-600"}`}
              >
                트리
              </button>
              <button
                onClick={() => setViewMode("graph")}
                className={`px-2 py-1.5 ${viewMode === "graph" ? "bg-cyan-800/50 text-cyan-100" : "text-cyan-600"}`}
              >
                그래프
              </button>
            </div>
          )}
        </div>
        {pendingHandle && !tree && (
          <button
            onClick={reconnectFolder}
            disabled={scanning}
            className="mb-2 px-2 py-1.5 text-xs border border-cyan-700 rounded text-cyan-400 bg-cyan-950/20 disabled:opacity-40"
          >
            🔗 이전 폴더 "{pendingHandle.name}" 다시 열기
          </button>
        )}
        {scanError && <p className="text-red-400 text-xs mb-2">{scanError}</p>}
        {tree && (
          <p className="text-cyan-600 text-xs mb-2">
            {tree.name} · 파일 {countFiles(tree)}개
            {viewMode === "graph" && ` · 관계 ${graph.edges.length}개`}
          </p>
        )}
        <div className="flex-1 overflow-y-auto">
          {!tree && (
            <p className="text-cyan-700 text-xs">
              "폴더 열기"로 분석할 로컬 프로젝트를 선택하세요.
            </p>
          )}
          {tree && viewMode === "tree" && <CodeTree tree={tree} />}
          {tree && viewMode === "graph" && (
            <div>
              <CodeGraph nodes={graph.nodes} edges={graph.edges} />
              <div className="flex gap-4 text-[10px] text-cyan-600 justify-center mt-1">
                <span className="text-cyan-400">● import</span>
                <span className="text-fuchsia-400">● DB 외래키</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: HUD + chat */}
      <div className="flex-1 flex flex-col items-center justify-between overflow-hidden">
        <h1 className="tracking-[0.3em] text-cyan-400/80 text-sm mt-2">J.A.R.V.I.S</h1>

        <div className="relative w-40 h-40 md:w-56 md:h-56 flex items-center justify-center shrink-0">
          <div className="absolute inset-0 rounded-full border border-cyan-500/30 ring-slow" />
          <div className="absolute inset-4 rounded-full border border-cyan-400/20 ring-fast" />
          <div className="absolute inset-10 rounded-full border-2 border-dashed border-cyan-400/30 ring-slow" />
          <div
            className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-cyan-400/20 border border-cyan-300 ${
              busy || listening ? "core-active" : "core-idle"
            }`}
          />
        </div>

        <div className="w-full max-w-xl flex-1 my-4 overflow-y-auto space-y-3 text-sm px-2">
          {messages.length === 0 && (
            <p className="text-cyan-600/50 text-center mt-8">
              {tree ? `${tree.name} 프로젝트에 대해 무엇이든 물어보세요, sir.` : "무엇을 도와드릴까요, sir?"}
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block px-3 py-2 rounded-lg max-w-[85%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-cyan-900/40 text-cyan-100"
                    : "bg-black/40 border border-cyan-800/50 text-cyan-300"
                }`}
              >
                {m.content || "..."}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="w-full max-w-xl flex gap-2"
        >
          <button
            type="button"
            onClick={toggleListening}
            className={`px-4 py-2 rounded-lg border ${
              listening
                ? "border-red-400 text-red-300 bg-red-900/30"
                : "border-cyan-600 text-cyan-300 bg-cyan-950/40"
            }`}
          >
            🎤
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하거나 마이크를 사용하세요"
            className="flex-1 bg-black/40 border border-cyan-800/60 rounded-lg px-4 py-2 outline-none focus:border-cyan-400 text-cyan-100 placeholder:text-cyan-700"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-cyan-600 text-cyan-300 bg-cyan-950/40 disabled:opacity-40"
          >
            전송
          </button>
        </form>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-20">
          <div className="bg-[#0a1014] border border-cyan-700 rounded-xl p-6 w-full max-w-sm space-y-3">
            <h2 className="text-cyan-300 font-semibold">Anthropic API Key</h2>
            <p className="text-cyan-600 text-xs">
              브라우저에만 저장되며 서버로 전송되어 Claude 호출에만 사용됩니다.
            </p>
            <a
              href="https://console.anthropic.com/settings/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-cyan-400 underline hover:text-cyan-300"
            >
              💳 남은 크레딧 확인 (Anthropic Console)
            </a>
            <input
              type="password"
              defaultValue={apiKey}
              placeholder="sk-ant-..."
              className="w-full bg-black/40 border border-cyan-800 rounded px-3 py-2 text-cyan-100 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveKey((e.target as HTMLInputElement).value);
              }}
              id="key-input"
            />
            <div className="flex justify-end gap-2 pt-1">
              {apiKey && (
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1 text-cyan-500 text-sm"
                >
                  취소
                </button>
              )}
              <button
                onClick={() =>
                  saveKey((document.getElementById("key-input") as HTMLInputElement).value)
                }
                className="px-3 py-1 border border-cyan-600 rounded text-cyan-300 text-sm"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
