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
2. 왼쪽 패널에 분석할 로컬 프로젝트의 절대 경로 입력 후 스캔
3. 채팅창에 질문 입력 또는 마이크 버튼으로 음성 질문

질문 시 서버가 지정한 폴더에서 관련 파일을 키워드로 검색해 Claude에게 컨텍스트로 전달합니다 (`lib/scan.ts`, `app/api/chat/route.ts`).

## macOS 데스크톱 앱으로 실행

바탕화면의 `JARVIS.app`을 더블클릭하면 서버가 자동으로 시작되고 브라우저 앱 창으로 열립니다.
