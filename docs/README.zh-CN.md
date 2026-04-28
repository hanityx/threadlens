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

[English](../README.md) · [한국어](README.ko.md) · 中文 · [日本語](README.ja.md) · [Español](README.es.md) · [Português](README.pt-BR.md)

---

记得那段对话——却想不起是在 Codex、Claude、Gemini 还是 Copilot 里发生的。

ThreadLens 让你在一处搜索本地分散的 AI 会话、查看对话、分析影响、备份文件并安全清理。无需云同步，无需账号——从设备上已有的会话直接开始。

<img src="assets/threadlens-demo-zh-CN-compact.gif" alt="ThreadLens 演示" width="100%" />

---

| 之前 | 使用 ThreadLens |
|---|---|
| 在隐藏的 provider 文件夹中手动搜索 | 同时搜索 Codex、Claude、Gemini 和 Copilot |
| 忘记答案在哪个工具里 | 直接打开匹配的对话记录 |
| 清理文件让人不安 | 先备份，确认影响后安全清理 |
| 桌面、Web 和终端工作流各自独立 | 同一本地 API 适用于桌面、Web 和 TUI |

## 功能

- **搜索** — 用一个关键词搜索 Codex、Claude、Gemini、Copilot 的所有会话。
- **Transcript** — 无需手动找 provider 文件夹，直接打开完整对话。
- **安全清理** — 执行任何破坏性操作前先备份、dry-run 并输入 confirm token。
- **Thread 审查** — 查看 Codex 线程范围、关联会话和审计历史。
- **Provider 健康** — 在一个界面查看 provider 状态、会话发现流程及路径/配置问题。
- **TUI** — 在终端以键盘为主使用相同工作流。

经路径、限制和当前支持范围，参见 [Provider support](PROVIDER_SUPPORT.md)。

## 开始使用

### 桌面端

[macOS .dmg ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0-arm64.dmg) · [Windows .exe ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens.0.3.0.exe) · [Linux .AppImage ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0.AppImage)

macOS 和 Windows 构建版本未签名。

### 源码运行

需要 Node.js 22.12+ 和 pnpm 10.33.2+。

```bash
git clone https://github.com/hanityx/threadlens.git
cd threadlens
pnpm install && pnpm dev
```

| 命令 | 说明 |
|---|---|
| `pnpm dev` | Web UI :5174 · API :8788 |
| `pnpm dev:tui` | 终端工作台 |
| `pnpm dev:desktop` | Electron 桌面端 |

## 路线图

近期版本重点关注：

- **0.3.x** — 错误修复与版本稳定性、provider 可靠性改进、整体 UX 优化
- **0.4** — 会话导航、备份可见性、错误提示、会话影响分析

## 文档

- [工作流](WORKFLOWS.md)
- [Provider 支持](PROVIDER_SUPPORT.md)
- [安全政策](../SECURITY.md)
- [架构](ARCHITECTURE.md)
- [TUI 指南](TUI.md)

## Contributing

欢迎提交 bug 报告、功能建议、provider 支持改进以及各类代码贡献。

## License

MIT
