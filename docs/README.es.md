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

[English](../README.md) · [한국어](README.ko.md) · [中文](README.zh-CN.md) · [日本語](README.ja.md) · Español · [Português](README.pt-BR.md)

---

Recuerdas la conversación — solo que no sabes si fue en Codex, Claude, Gemini o Copilot.

ThreadLens te permite buscar, abrir y revisar conversaciones, analizar el impacto, hacer backup y limpiar con seguridad tus sesiones de IA locales desde un solo lugar. Sin sincronización en la nube, sin cuenta — solo las sesiones que ya tienes en tu máquina.

<img src="assets/threadlens-demo-es-compact.gif" alt="Demo de ThreadLens" width="100%" />

---

| Antes | Con ThreadLens |
|---|---|
| Buscar manualmente en carpetas ocultas de providers | Buscar en Codex, Claude, Gemini y Copilot a la vez |
| Olvidar en qué herramienta estaba la respuesta | Abrir directamente las transcripciones coincidentes |
| La limpieza requiere tocar archivos directamente | Backup primero, revisar impacto y limpiar con seguridad |
| Los flujos de escritorio, web y terminal van por separado | La misma API local en escritorio, web y TUI |

## Funciones

- **Búsqueda** — encuentra sesiones de Codex, Claude, Gemini y Copilot con una sola palabra clave.
- **Transcript** — abre conversaciones completas sin navegar por las carpetas de cada provider.
- **Limpieza segura** — haz backup, dry-run y confirm token antes de cualquier acción destructiva.
- **Thread review** — inspecciona el alcance del hilo en Codex, sesiones relacionadas e historial de auditoría.
- **Provider health** — estado del provider, flujo de descubrimiento de sesiones y problemas de ruta/configuración en una sola pantalla.
- **TUI** — los mismos flujos de trabajo en la terminal, orientados al teclado.

Para detalles de rutas, limitaciones y soporte actual, consulta [Provider support](PROVIDER_SUPPORT.md).

## Primeros pasos

### Escritorio

[macOS .dmg ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0-arm64.dmg) · [Windows .exe ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens.0.3.0.exe) · [Linux .AppImage ↗](https://github.com/hanityx/threadlens/releases/download/v0.3.0/ThreadLens-0.3.0.AppImage)

Las versiones de macOS y Windows no están firmadas.

### Desde el código fuente

Requiere Node.js 22.12+ y pnpm 10.33.2+.

```bash
git clone https://github.com/hanityx/threadlens.git
cd threadlens
pnpm install && pnpm dev
```

| Comando | Descripción |
|---|---|
| `pnpm dev` | Web UI :5174 · API :8788 |
| `pnpm dev:tui` | terminal workbench |
| `pnpm dev:desktop` | Electron escritorio |

## Hoja de ruta

Los próximos lanzamientos se centran en:

- **0.3.x** — correcciones de bugs y estabilidad, mejoras de fiabilidad de providers, mejoras generales de UX
- **0.4** — navegación de sesiones, visibilidad de backups, guía de errores, análisis de impacto de sesión

## Documentación

- [Flujos de trabajo](WORKFLOWS.md)
- [Soporte de providers](PROVIDER_SUPPORT.md)
- [Seguridad](../SECURITY.md)
- [Arquitectura](ARCHITECTURE.md)
- [Guía de TUI](TUI.md)

## Contributing

Se aceptan reportes de bugs, sugerencias de funciones, mejoras de soporte de providers y contribuciones de código de todo tipo.

## License

MIT
