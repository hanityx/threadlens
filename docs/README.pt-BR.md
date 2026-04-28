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

[English](../README.md) · [한국어](README.ko.md) · [中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · Português

---

Você lembra da conversa — só não sabe se foi no Codex, Claude, Gemini ou Copilot.

ThreadLens deixa você pesquisar, abrir e revisar conversas, analisar impacto, fazer backup e limpar com segurança suas sessões de IA locais em um só lugar. Sem sincronização na nuvem, sem conta — só as sessões que já estão na sua máquina.

<img src="assets/threadlens-demo-pt-BR-compact.gif" alt="Demo do ThreadLens" width="100%" />

---

| Antes | Com ThreadLens |
|---|---|
| Buscar manualmente em pastas ocultas de providers | Pesquisar no Codex, Claude, Gemini e Copilot de uma vez |
| Esquecer em qual ferramenta estava a resposta | Abrir transcrições correspondentes diretamente |
| Limpeza exige mexer nos arquivos diretamente | Backup primeiro, revisar impacto e limpar com segurança |
| Fluxos de desktop, web e terminal separados | Mesma API local no desktop, web e TUI |

## Recursos

- **Busca** — encontre sessões do Codex, Claude, Gemini e Copilot com uma palavra-chave.
- **Transcript** — abra conversas completas sem navegar pelas pastas de cada provider.
- **Limpeza segura** — faça backup, dry-run e confirm token antes de qualquer ação destrutiva.
- **Thread review** — inspecione o escopo do thread no Codex, sessões relacionadas e histórico de auditoria.
- **Provider health** — status do provider, fluxo de descoberta de sessões e problemas de caminho/configuração em uma tela.
- **TUI** — os mesmos fluxos de trabalho no terminal, com foco no teclado.

Para detalhes de caminhos, limitações e suporte atual, consulte [Provider support](PROVIDER_SUPPORT.md).

## Primeiros passos

### Desktop

[macOS .dmg ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0-arm64.dmg) · [Windows .exe ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens.0.3.0.exe) · [Linux .AppImage ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0.AppImage)

As versões de macOS e Windows não são assinadas.

### Pelo código-fonte

Requer Node.js 22.12+ e pnpm 10.33.2+.

```bash
git clone https://github.com/hanityx/threadlens.git
cd threadlens
pnpm install && pnpm dev
```

| Comando | Descrição |
|---|---|
| `pnpm dev` | Web UI :5174 · API :8788 |
| `pnpm dev:tui` | terminal workbench |
| `pnpm dev:desktop` | Electron desktop |

## Roadmap

Os próximos lançamentos focam em:

- **0.3.x** — correções de bugs e estabilidade, melhorias de confiabilidade de providers, melhorias gerais de UX
- **0.4** — navegação de sessões, visibilidade de backups, orientação de erros, análise de impacto de sessão

## Documentação

- [Fluxos de trabalho](WORKFLOWS.md)
- [Suporte a providers](PROVIDER_SUPPORT.md)
- [Segurança](../SECURITY.md)
- [Arquitetura](ARCHITECTURE.md)
- [Guia do TUI](TUI.md)

## Contributing

Relatórios de bugs, sugestões de funcionalidades, melhorias de suporte a providers e contribuições de código de qualquer tipo são bem-vindos.

## License

MIT
