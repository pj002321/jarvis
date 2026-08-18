export type LocalModel = {
  tag: string;
  label: string;
  params: string;
  minRamGB: number;
  coding?: boolean;
  note: string;
};

// ponytail: hand-curated snapshot of the Ollama library, not a live catalog fetch — refresh this
// list (or switch to scraping https://ollama.com/library) if it drifts noticeably out of date.
export const LOCAL_MODELS: LocalModel[] = [
  { tag: "qwen2.5:72b", label: "Qwen 2.5 72B", params: "72B", minRamGB: 64, coding: false, note: "최상급, 대형 워크스테이션급 메모리 필요" },
  { tag: "llama3.1:70b", label: "Llama 3.1 70B", params: "70B", minRamGB: 64, coding: false, note: "범용 최상급" },
  { tag: "qwen3-coder:30b", label: "Qwen3 Coder 30B", params: "30B", minRamGB: 24, coding: true, note: "코딩 특화 대형" },
  { tag: "qwen2.5:32b", label: "Qwen 2.5 32B", params: "32B", minRamGB: 24, coding: false, note: "고성능 범용" },
  { tag: "gemma3:27b", label: "Gemma 3 27B", params: "27B", minRamGB: 24, coding: false, note: "고성능 범용" },
  { tag: "deepseek-coder-v2:16b", label: "DeepSeek-Coder-V2 16B", params: "16B", minRamGB: 16, coding: true, note: "코딩 특화" },
  { tag: "qwen2.5-coder:14b", label: "Qwen 2.5 Coder 14B", params: "14B", minRamGB: 12, coding: true, note: "코딩 특화, 균형잡힌 크기" },
  { tag: "gemma3:12b", label: "Gemma 3 12B", params: "12B", minRamGB: 10, coding: false, note: "16GB급에서 최고 품질" },
  { tag: "mistral-nemo:12b", label: "Mistral Nemo 12B", params: "12B", minRamGB: 10, coding: false, note: "범용, 긴 컨텍스트" },
  { tag: "phi4-mini", label: "Phi-4 Mini", params: "3.8B", minRamGB: 6, coding: false, note: "추론에 강한 소형 모델" },
  { tag: "qwen3:8b", label: "Qwen 3 8B", params: "8B", minRamGB: 8, coding: false, note: "범용, 최신 세대" },
  { tag: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder 7B", params: "7B", minRamGB: 6, coding: true, note: "가벼운 코딩 특화" },
  { tag: "llama3.1:8b", label: "Llama 3.1 8B", params: "8B", minRamGB: 6, coding: false, note: "범용, 안정적" },
  { tag: "gemma2:9b", label: "Gemma 2 9B", params: "9B", minRamGB: 7, coding: false, note: "범용" },
  { tag: "qwen2.5:3b", label: "Qwen 2.5 3B", params: "3B", minRamGB: 4, coding: false, note: "빠른 응답, 저사양용" },
  { tag: "llama3.2:3b", label: "Llama 3.2 3B", params: "3B", minRamGB: 4, coding: false, note: "빠른 응답, 저사양용" },
];

// Recommend models that fit comfortably alongside macOS + the app itself.
const OS_OVERHEAD_GB = 4;

export function recommendModels(totalMemGB: number): LocalModel[] {
  const budget = totalMemGB - OS_OVERHEAD_GB;
  return LOCAL_MODELS.filter((m) => m.minRamGB <= budget).sort((a, b) => b.minRamGB - a.minRamGB);
}
