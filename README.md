# JARVIS UI

로컬 프로젝트 폴더를 지정하면 파일 트리를 시각화하고, 채팅(텍스트/음성)으로 코드에 대해 질문하고 답변받을 수 있는 Iron Man JARVIS 스타일 HUD 데스크톱 도구입니다. Next.js 기반이며 Claude(Anthropic API)로 답변을 생성합니다.

## 실행

```bash
npm install
npm run build
npm run start
```

`http://localhost:3000` 접속 후:

1. 설정에서 Anthropic API 키 입력 (브라우저 로컬에만 저장됨)
2. 왼쪽 패널의 "📂 폴더 열기" 버튼으로 분석할 로컬 프로젝트 폴더 선택 (Chrome File System Access API, 경로 입력 불필요)
3. 트리 / 그래프 보기 전환 — 그래프는 import 관계와 DB 외래키(Prisma `model`, SQL `REFERENCES`)를 홀로그램 스타일로 시각화
4. 채팅창에 질문 입력 또는 마이크 버튼으로 음성 질문

폴더 스캔과 관련 파일 검색은 모두 브라우저에서 수행되며, 질문 시 관련 파일 내용만 컨텍스트로 Claude에 전달됩니다 (`lib/clientScan.ts`, `lib/codeGraph.ts`, `app/api/chat/route.ts`). 서버는 파일시스템에 접근하지 않습니다. 폴더 열기는 Chrome 계열 브라우저에서만 지원됩니다.

## macOS 데스크톱 앱으로 실행

바탕화면의 `JARVIS.app`을 더블클릭하면 서버가 자동으로 시작되고 브라우저 앱 창으로 열립니다.
