<h1>
  <img src="apps/web/public/favicon.svg" alt="ThreadLens 아이콘" width="24" />
  ThreadLens
</h1>

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-blue)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-orange)](https://pnpm.io)
[![CI](https://github.com/hanityx/threadlens/actions/workflows/ci.yml/badge.svg)](https://github.com/hanityx/threadlens/actions/workflows/ci.yml)

[English](README.md) | 한국어

ThreadLens는 AI 대화 검색, 프로바이더 세션 관리, 안전한 스레드 정리를 위한 로컬 워크벤치입니다.

Codex, Claude, Gemini, Copilot의 로컬 대화를 검색하고, 트랜스크립트를 확인하고, 세션 파일을 백업하고, dry-run 가드 뒤에서 파괴적인 작업을 안전하게 실행할 수 있습니다.

## 개요

<p align="center">
  <img src="docs/assets/readme-overview-v4.png" alt="ThreadLens 개요 대시보드" />
</p>

<p align="center">
  <sub>Overview에서 시작해 최근 활동, 프로바이더 상태, 런타임 복구, 기본 AI를 확인하세요.</sub>
</p>

## 주요 워크플로우

<p align="center">
  <img src="docs/assets/readme-search-sessions-composite.png" alt="ThreadLens 검색 및 세션 화면" />
</p>

<p align="center">
  <sub>문구를 알고 있다면 Search에서 시작하고, 원본 프로바이더 파일과 트랜스크립트가 필요하면 Sessions으로 전환하세요.</sub>
</p>

<p align="center">
  <img src="docs/assets/readme-tui-search.png" alt="ThreadLens TUI 검색 화면" width="49.5%" />
  <img src="docs/assets/readme-tui-sessions.png" alt="ThreadLens TUI 세션 화면" width="49.5%" />
</p>

<p align="center">
  <sub>TUI는 터미널에서 Search와 Sessions를 키보드 중심으로 제공하며, 트랜스크립트 미리보기와 백업 우선 액션을 같은 흐름에서 사용할 수 있습니다.</sub>
</p>

## 주요 기능

- `Conversation Search` — 워크플로우를 선택하기 전에 맞는 세션 또는 스레드를 먼저 찾습니다.
- `Sessions` — 프로바이더 세션 파일, 트랜스크립트 미리보기, 백업 우선 파일 액션을 제공합니다.
- `Thread` — Codex 스레드 리뷰, 영향 분석, dry-run 토큰 실행을 전용 워크플로우에서 처리합니다.
- `Overview Setup` — 기본 AI를 저장하면 `Sessions`와 `Search`가 같은 프로바이더 시작점에서 열립니다.
- `Diagnostics` — 런타임, 파서, 데이터 소스, 복구, 실행 흐름 신호를 같은 로컬 런타임에서 확인합니다.
- Web, TUI, 데스크톱이 동일한 Fastify API를 공유합니다.

## 시작하기

```bash
pnpm install
pnpm dev
```

기본 로컬 엔드포인트:

- Web UI: `http://127.0.0.1:5174`
- TS API: `http://127.0.0.1:8788`

선택적 실행:

- `pnpm dev:tui` — 터미널 워크벤치 시작
- `pnpm dev:desktop` — 개발 모드로 Electron 셸 시작

## 데스크톱 빌드 안내

- macOS, Windows, Linux용 데스크톱 패키징을 지원합니다.
- 이 저장소에서 로컬로 패키징하면 macOS와 Windows에서는 기본적으로 서명되지 않습니다.
- 릴리즈 에셋에는 항상 `ThreadLens-<version>-SHA256SUMS.txt`와 `ThreadLens-<version>-desktop-trust-notes.md`가 포함됩니다.
- macOS 서명과 공증은 릴리즈 워크플로우에 서명 시크릿이 설정된 경우에만 활성화됩니다.
- Windows 서명도 동일하게 릴리즈 워크플로우 시크릿이 필요하며, 없으면 SmartScreen 경고가 표시될 수 있습니다.
- Linux AppImage는 실행 전에 `chmod +x ThreadLens-*.AppImage`가 필요합니다.
- 패키징 결과물은 `apps/desktop-electron/dist/`에 저장됩니다.
- 데스크톱 빌드 세부 사항은 `apps/desktop-electron/README.md`를 참고하세요.

## 문서

- 아키텍처: `docs/ARCHITECTURE.md`
- 디자인 시스템: `docs/DESIGN_SYSTEM.md`
- 워크플로우: `docs/WORKFLOWS.md`
- 프로바이더 지원: `docs/PROVIDER_SUPPORT.md`
- TUI 가이드: `docs/TUI.md`
- 릴리즈 노트: GitHub Releases 및 머지된 PR 히스토리

## 기여

개발 가이드라인, 이슈 리포트, 기능 제안 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어주세요.

## 보안

취약점 신고는 [SECURITY.md](SECURITY.md)를 읽어주세요.

## 라이선스

[MIT](LICENSE)
