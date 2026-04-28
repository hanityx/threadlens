<h1>
  <img src="../apps/web/public/favicon.svg" alt="" width="28" />
  ThreadLens
</h1>

<p align="left">
  <a href="https://github.com/hanityx/threadlens/releases/latest"><img src="https://img.shields.io/github/v/release/hanityx/threadlens?label=latest&color=4f46e5" alt="release" /></a>
  <a href="https://github.com/hanityx/threadlens/actions/workflows/ci.yml"><img src="https://github.com/hanityx/threadlens/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e.svg" alt="MIT" /></a>
</p>

<p align="left">
  <img src="https://img.shields.io/badge/Codex-111111?style=flat-square&logo=openai&logoColor=white" alt="Codex" />
  <img src="https://img.shields.io/badge/Claude-111111?style=flat-square&logo=anthropic&logoColor=white" alt="Claude" />
  <img src="https://img.shields.io/badge/Gemini-111111?style=flat-square&logo=googlegemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Copilot-111111?style=flat-square&logo=githubcopilot&logoColor=white" alt="Copilot" />
</p>

[English](../README.md) · 한국어 · [中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Português](README.pt-BR.md)

---

그 대화는 기억나는데, Codex였는지 Claude였는지 Gemini였는지 Copilot이었는지 모르겠을 때가 있습니다.

ThreadLens는 로컬에 흩어진 AI 세션을 한 곳에서 검색하고, 대화를 열어 리뷰하고, 영향도를 분석하고, 파일을 백업하고,<br/>안전하게 정리할 수 있게 해줍니다. 클라우드도 계정도 없이, 기기에 이미 있는 세션에서 바로 시작합니다.

<img src="assets/threadlens-demo-ko-compact.gif" alt="ThreadLens 데모" width="100%" />

---

| 기존 방식 | ThreadLens |
|---|---|
| 숨겨진 provider 폴더를 직접 뒤짐 | 여러 provider의 AI 세션을 한 번에 검색 |
| 어느 도구에 답이 있었는지 기억나지 않음 | 매칭된 transcript를 바로 열람 |
| 정리하려면 파일을 직접 건드려야 해서 부담됨 | 먼저 백업하고, 영향 범위를 확인한 뒤 안전하게 정리 |
| 데스크톱, 웹, 터미널 흐름이 따로 움직임 | 같은 로컬 API를 데스크톱, 웹, TUI에서 사용 |

## 기능

- **검색** — Codex, Claude, Gemini, Copilot 세션을 하나의 키워드로 검색합니다.
- **Transcript** — provider별 폴더를 직접 찾지 않아도 전체 대화를 열어볼 수 있습니다.
- **안전한 정리** — 파괴적인 작업 전에 백업, dry-run, confirm token으로 실행합니다.
- **Thread review** — Codex 스레드 범위, 관련 세션, audit history를 확인합니다.
- **Provider health** — provider 상태, 세션 탐색 흐름, 경로/설정 문제를 한 화면에서 확인합니다.
- **TUI** — 같은 워크플로우를 터미널에서 키보드 중심으로 사용할 수 있습니다.

경로, 제한 사항, 현재 지원 범위는 [Provider support](PROVIDER_SUPPORT.md)를 참고하세요.

## 시작하기

### 데스크톱

[macOS .dmg ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0-arm64.dmg) · [Windows .exe ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens.0.3.0.exe) · [Linux .AppImage ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0.AppImage)

macOS, Windows 빌드는 unsigned입니다.

### 소스

Node.js 22.12+와 pnpm 10.33.2+가 필요합니다.

```bash
git clone https://github.com/hanityx/threadlens.git
cd threadlens
pnpm install && pnpm dev
```

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 웹 UI :5174 · API :8788 |
| `pnpm dev:tui` | 터미널 워크벤치 |
| `pnpm dev:desktop` | Electron 데스크톱 |

## 로드맵

가까운 릴리즈에서는 다음에 집중합니다.

- **0.3.x** — 버그 수정 및 릴리즈 안정성 강화, provider 안정성 개선, 전반적인 UX 개선
- **0.4** — 세션 탐색 개선, 백업 가시성, 에러 안내, 세션 영향 분석

## 문서

- [Workflows](WORKFLOWS.md)
- [Provider support](PROVIDER_SUPPORT.md)
- [Security](../SECURITY.md)
- [Architecture](ARCHITECTURE.md)
- [TUI guide](TUI.md)

## Contributing

버그 리포트, 기능 제안, provider 지원 개선, 코드 기여 등 모든 형태의 참여를 환영합니다.

## License

MIT
