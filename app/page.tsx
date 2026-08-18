"use client";

import { useEffect, useRef, useState } from "react";
import type { TreeNode } from "@/lib/scan";
import CodeTree from "@/components/CodeTree";

type Message = { role: "user" | "assistant"; content: string };

const KEY_STORAGE = "jarvis_api_key";
const DIR_STORAGE = "jarvis_dir";

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
  const [dir, setDir] = useState("");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const recognitionRef = useRef<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORAGE) ?? "";
    setApiKey(saved);
    if (!saved) setShowSettings(true);

    const savedDir = localStorage.getItem(DIR_STORAGE) ?? "";
    if (savedDir) {
      setDir(savedDir);
      scanDir(savedDir);
    }

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

  function saveKey(key: string) {
    setApiKey(key);
    localStorage.setItem(KEY_STORAGE, key);
    setShowSettings(false);
  }

  async function scanDir(target: string) {
    const path = target.trim();
    if (!path) return;
    setScanning(true);
    setScanError("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: path }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "스캔 실패");
        setTree(null);
        return;
      }
      setTree(data.tree);
      localStorage.setItem(DIR_STORAGE, path);
    } catch {
      setScanError("서버에 연결할 수 없습니다.");
    } finally {
      setScanning(false);
    }
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
        body: JSON.stringify({ messages: nextMessages, apiKey, dir: tree ? dir : undefined }),
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

      {/* Left: code tree panel */}
      <div className="w-full md:w-80 shrink-0 flex flex-col border border-cyan-900/60 rounded-xl p-3 bg-black/20 max-h-[45vh] md:max-h-[calc(100vh-2rem)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            scanDir(dir);
          }}
          className="flex gap-2 mb-2"
        >
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="/path/to/project"
            className="flex-1 bg-black/40 border border-cyan-800/60 rounded px-2 py-1 text-xs text-cyan-100 outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={scanning}
            className="px-2 py-1 text-xs border border-cyan-600 rounded text-cyan-300 disabled:opacity-40"
          >
            {scanning ? "..." : "스캔"}
          </button>
        </form>
        {scanError && <p className="text-red-400 text-xs mb-2">{scanError}</p>}
        {tree && (
          <p className="text-cyan-600 text-xs mb-2">
            {tree.name} · 파일 {countFiles(tree)}개
          </p>
        )}
        <div className="flex-1 overflow-y-auto">
          {tree ? (
            <CodeTree tree={tree} />
          ) : (
            <p className="text-cyan-700 text-xs">분석할 로컬 프로젝트 경로를 입력하세요.</p>
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
