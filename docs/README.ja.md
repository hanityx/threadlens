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

[English](../README.md) · [한국어](README.ko.md) · [中文](README.zh-CN.md) · 日本語 · [Español](README.es.md) · [Português](README.pt-BR.md)

---

あの会話は覚えている——でも Codex だったのか Claude だったのか Gemini だったのか、思い出せない。

ThreadLens は、ローカルに散らばった AI セッションを一か所で検索・閲覧・分析・バックアップし、安全に整理できます。クラウドも、アカウントも不要——デバイスにすでにあるセッションからすぐ始められます。

<img src="assets/threadlens-demo-ja-compact.gif" alt="ThreadLens デモ" width="100%" />

---

| 以前 | ThreadLens を使うと |
|---|---|
| 隠れた provider フォルダを手動で検索 | Codex・Claude・Gemini・Copilot をまとめて検索 |
| どのツールに答えがあったか忘れる | 一致する会話をそのまま開く |
| ファイルを直接触るのが怖い | バックアップ → 影響確認 → 安全に整理 |
| デスクトップ・Web・TUI のフローがバラバラ | 同じローカル API をどの画面からも使える |

## 機能

- **検索** — Codex・Claude・Gemini・Copilot のセッションをキーワード一つで検索。
- **Transcript** — provider フォルダを探さずに全会話を開いて確認。
- **安全な整理** — 破壊的な操作の前にバックアップ・dry-run・confirm token で実行。
- **Thread レビュー** — Codex スレッドの範囲・関連セッション・監査履歴を確認。
- **Provider health** — provider の状態、セッション探索フロー、パス/設定の問題を一画面で確認。
- **TUI** — 同じワークフローをターミナルでキーボード優先で使用。

パス詳細・制限・現在の対応範囲は [Provider support](PROVIDER_SUPPORT.md) を参照。

## はじめに

### デスクトップ

[macOS .dmg ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0-arm64.dmg) · [Windows .exe ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens.0.3.0.exe) · [Linux .AppImage ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0.AppImage)

macOS と Windows のビルドは未署名です。

### ソースから実行

Node.js 22.12+ と pnpm 10.33.2+ が必要です。

```bash
git clone https://github.com/hanityx/threadlens.git
cd threadlens
pnpm install && pnpm dev
```

| コマンド | 説明 |
|---|---|
| `pnpm dev` | Web UI :5174 · API :8788 |
| `pnpm dev:tui` | ターミナルワークベンチ |
| `pnpm dev:desktop` | Electron デスクトップ |

## ロードマップ

直近のリリースで注力する内容：

- **0.3.x** — バグ修正とリリース安定性、provider 信頼性の改善、全体的な UX 改善
- **0.4** — セッションナビゲーション、バックアップの可視性、エラーガイダンス、セッション影響分析

## ドキュメント

- [ワークフロー](WORKFLOWS.md)
- [プロバイダー対応](PROVIDER_SUPPORT.md)
- [セキュリティ](../SECURITY.md)
- [アーキテクチャ](ARCHITECTURE.md)
- [TUI ガイド](TUI.md)

## Contributing

バグ報告、機能提案、provider サポートの改善、コードへの貢献など、あらゆる形での参加を歓迎します。

## License

MIT
