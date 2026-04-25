<h1>
  <img src="../apps/web/public/favicon.svg" alt="ThreadLens 아이콘" width="24" />
  ThreadLens
</h1>

<p align="left">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/License-MIT-emerald.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-%3E%3D22.12-blue" alt="Node" /></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm-%3E%3D10.33.2-orange" alt="pnpm" /></a>
  <a href="https://github.com/hanityx/threadlens/actions/workflows/ci.yml"><img src="https://github.com/hanityx/threadlens/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Codex-111111?style=flat-square&logo=openai&logoColor=white&labelColor=111111&color=111111" alt="Codex" />
  <img src="https://img.shields.io/badge/Claude-111111?style=flat-square&logo=anthropic&logoColor=white&labelColor=111111&color=111111" alt="Claude" />
  <img src="https://img.shields.io/badge/Gemini-111111?style=flat-square&logo=googlegemini&logoColor=white&labelColor=111111&color=111111" alt="Gemini" />
  <img src="https://img.shields.io/badge/Copilot-111111?style=flat-square&logo=githubcopilot&logoColor=white&labelColor=111111&color=111111" alt="Copilot" />
</p>

[English](../README.md) | 한국어

로컬에 쌓인 AI 대화, 한 곳에서 찾고 정리합니다.

Codex, Claude, Gemini, Copilot의 세션을 검색하고, 트랜스크립트를 확인하고, 파일을 백업하고, 지울 것만 골라서 삭제할 수 있습니다. 파일을 건드리기 전에 항상 dry-run 확인 단계를 거칩니다. 전부 로컬에서 동작합니다.

## 개요

<p align="center">
  <img src="assets/readme-overview-v4.png" alt="ThreadLens 개요 대시보드" />
</p>

<p align="center">
  <sub>Overview에서 최근 활동, 프로바이더 상태, 런타임 신호를 한눈에 확인합니다.</sub>
</p>

## 데모

<p align="center">
  <img src="assets/threadlens-demo.gif" alt="ThreadLens 검색 및 트랜스크립트 데모" />
</p>

<p align="center">
  <sub>키워드로 전체 프로바이더를 검색하고, 세션을 열어 트랜스크립트를 바로 확인합니다.</sub>
</p>

## 주요 워크플로우

<p align="center">
  <img src="assets/readme-search-sessions-composite.png" alt="ThreadLens 검색 및 세션 화면" />
</p>

<p align="center">
  <sub>Search는 모든 프로바이더에서 문구로 대화를 찾아줍니다. Sessions는 원본 세션 파일, 트랜스크립트, 파일 액션을 제공합니다.</sub>
</p>

<p align="center">
  <img src="assets/readme-tui-search.png" alt="ThreadLens TUI 검색 화면" width="49.5%" />
  <img src="assets/readme-tui-sessions.png" alt="ThreadLens TUI 세션 화면" width="49.5%" />
</p>

<p align="center">
  <sub>TUI는 같은 검색·세션 워크플로우를 터미널에서 키보드 중심으로 제공합니다.</sub>
</p>

## Features

- **멀티 프로바이더 검색** — Codex, Claude, Gemini, Copilot 전체에서 문구나 키워드로 대화 검색
- **트랜스크립트 리뷰** — 프로바이더별 폴더를 뒤지지 않고 세션 파일과 전체 트랜스크립트를 바로 확인
- **백업 우선** — 세션 파일을 건드리기 전에 먼저 백업; 백업 파일은 타임스탬프가 붙은 로컬 디렉토리에 저장
- **안전한 정리** — 파괴적인 작업은 dry-run 필수, confirm 토큰이 실제 실행을 승인
- **Codex 스레드 리뷰** — 스레드 영향 분석과 타겟 정리를 위한 전용 워크플로우
- **터미널 워크벤치** — 동일한 프로바이더 범위와 로컬 API를 공유하는 키보드 중심 TUI
- **Web · TUI · 데스크톱** — 모든 서페이스가 같은 로컬 Fastify API에서 동작, 클라우드 불필요

## 시작하기

런타임 기준: Node.js 22.12 이상, pnpm 10.33.2 이상입니다. 로컬 `.nvmrc`는 개발용 최소 Node 22 기준선을 고정하고, CI는 지원되는 Node 22 라인에서 실행됩니다.

```bash
pnpm install
pnpm dev
```

- Web UI: `http://127.0.0.1:5174`
- API: `http://127.0.0.1:8788`

```bash
pnpm dev:tui      # 터미널 워크벤치
pnpm dev:desktop  # Electron 셸
```

## 데스크톱

macOS, Windows, Linux용 패키지는 GitHub Releases에서 제공합니다. 로컬 빌드는 기본적으로 서명되지 않습니다 — 빌드 및 서명 세부 사항은 [`apps/desktop-electron/README.md`](../apps/desktop-electron/README.md)를 참고하세요.

## 문서

- [아키텍처](ARCHITECTURE.md)
- [워크플로우](WORKFLOWS.md)
- [프로바이더 지원](PROVIDER_SUPPORT.md)
- [TUI 가이드](TUI.md)
- [디자인 시스템](DESIGN_SYSTEM.md)

## 기여

개발 환경 설정, 이슈 리포트, PR 체크리스트는 [CONTRIBUTING.md](../CONTRIBUTING.md)를 읽어주세요.

## 보안

취약점은 [SECURITY.md](../SECURITY.md)와 GitHub 비공개 취약점 신고를 이용해주세요.

## 라이선스

[MIT](../LICENSE)
