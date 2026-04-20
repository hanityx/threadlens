# ThreadLens Design System

## Purpose

This document is the single design reference for the ThreadLens web workbench.

Goals:

- keep buttons, cards, spacing, and status language consistent across surfaces
- prefer shared tokens and shared UI components over feature-local styling
- keep Storybook, CSS tokens, and the live app moving in the same direction

## Scope

The current design system is an app-level shared UI layer under `apps/web/src/shared/ui`.

- app entry: `apps/web/src/main.tsx`
- shared style entry: `apps/web/src/shared/ui/index.css`
- tokens: `apps/web/src/shared/ui/styles/tokens.css`
- shared exports: `apps/web/src/shared/ui/index.ts`
- stories: `apps/web/src/shared/ui/stories/*.stories.tsx`

Notes:

- `index.css` imports both shared UI styles and feature CSS.
- This is not a standalone package-style design system yet. It is a shared UI layer inside the app.

## Source Of Truth

Use this order when the same problem could be solved in more than one layer:

1. `styles/tokens.css`
2. `shared/ui/components/*.tsx`
3. Storybook stories
4. feature CSS and feature TSX

If there is ambiguity, solve the problem at the highest reasonable layer.

## Core Principles

### Token first

- Colors, radius, shadow, blur, and typography should be defined through tokens.
- Do not introduce raw colors, ad-hoc radius values, or one-off shadows in feature CSS.
- If a new visual language is needed, add a semantic token before adding feature-local styling.

### Shared components first

- Repeated UI such as buttons, panel headers, chips, status pills, cards, and transcript blocks should not be reinvented inside features.
- Check `shared/ui` first.
- If a repeated feature pattern has real reuse value, move it upward instead of duplicating it again.

### One UI language per surface

- Similar actions should use the same button family.
- Similar states should use the same status treatment.
- Section headers at the same hierarchy level should use the same structure and spacing.

### Storybook is a contract

- A Storybook primitive should exist only if there is real or intended app usage.
- Do not keep adding toy stories with no live adoption plan.
- If a new shared primitive is added, it should have a real usage path.

## Token Rules

### Allowed

- adding semantic tokens
- extending surfaces or states by composing existing tokens
- reusing typography, blur, surface, and state token families

### Not allowed

- new raw hex or rgba colors in feature CSS
- new gradients written directly inside feature CSS
- direct one-off status colors in feature CSS
- spacing or shape changes that only solve one spot and create a local exception

### Exception

- raw values are allowed inside token definition files
- temporary fallback literals are acceptable only during migration, and should not become the new default

## Token Layers

```
styles/tokens.css      <- CSS variable definitions
styles/components.css  <- shared component classes
styles/layout.css      <- app-shell and layout styles
[feature].css          <- feature styles that reference shared tokens
```

### Color token families

| Family | Prefix | Usage |
| --- | --- | --- |
| Background | `--bg`, `--bg-elev`, `--panel` | page and shell layers |
| Borders | `--line`, `--line-soft` | separators and outlines |
| Text | `--text`, `--text-secondary`, `--muted` | text hierarchy |
| Accent | `--accent`, `--accent-strong`, `--accent-dim` | emphasis |
| State | `--success`, `--warn`, `--info` | semantic states |
| Interaction | `--hover`, `--active`, `--focus-ring` | interactive overlays |
| Surface | `--surface-*` | component-level backgrounds |
| State surface | `--state-*` | state background and border mixes |

### Surface depth

Use surface tokens by layer depth:

```
--surface-card-bg
--surface-card-bg-strong
--surface-stage-bg
--surface-nav-bg
--surface-pill-bg
```

Do not introduce variants like `--surface-elevated-subtle-soft-mid-strong`. Pick the closest existing token or add a clearly named semantic token.

### Gradients

Gradients must be defined in tokens and referenced by name.

Allowed use cases:

- hero or landing backgrounds
- skeleton shimmer
- semantic fill bars
- active navigation surfaces
- KPI state hints

Do not use direct gradients for:

- regular card backgrounds
- button hover or active states
- form field backgrounds
- panel headers
- generic text containers

## Typography Scale

The current shared typography scale:

```
--text-xs
--text-sm
--text-base
--text-md
--text-lg
--text-xl
--text-2xl
--text-3xl
--text-4xl
```

Rules:

- body text should not go below `--text-md`
- interactive labels should not go below `--text-sm`
- display tokens are for landing or hero usage only

## Spacing Scale

Use only the approved spacing scale:

`2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 32`

Values outside the scale need explicit justification and should be treated as debt, not a new normal.

## Radius Scale

Use the shared radius tokens:

`--radius-sm`, `--radius-md`, `--radius-card`, `--radius-lg`, `--radius-container`, `--radius-xl`, `--radius-modal`, `--radius-shell-md`, `--radius-shell-lg`, `--radius-shell-xl`, `--radius-pill`

Ad-hoc values should be replaced with the nearest shared token.

## Shared Components

Public exports from `shared/ui/index.ts`:

- `Badge`
- `Button`
- `Card`
- `Chip`
- `Disclosure`
- `Panel`
- `PanelHeader`
- `SegmentedNav`
- `StatusPill`

Direct-import shared component:

- `TranscriptLog` from `@/shared/ui/components/TranscriptLog`

Current high-value live primitives:

- `Button`
- `PanelHeader`
- `TranscriptLog`

Lower-adoption primitives that should be justified before more expansion:

- `Badge`
- `Card`
- `Chip`
- `Disclosure`
- `Panel`
- `SegmentedNav`
- `StatusPill`

Story-only draft currently present:

- `SearchField.stories.tsx` exists without a matching exported shared component. Treat it as draft story coverage until either the shared component is added or the orphan story is removed.

## Surface Mapping

### Overview

- CTA and secondary actions: `Button`
- section titles: `PanelHeader`
- repeated summary blocks: consider `Card`

### Sessions

- archive, dry-run, backup actions: `Button`
- section titles: `PanelHeader`
- provider mode switch: prefer one shared pattern, not multiple
- session state summary: `StatusPill` candidate

### Threads

- action row: `Button`
- section titles: `PanelHeader`
- transcript review: `TranscriptLog`
- forensic or state summary: `StatusPill` candidate

### Search

- chips and small support surfaces: `Chip` candidate
- result group shells: `Card` candidate

## New UI Rule

When adding a new block or surface:

1. Can an existing shared primitive solve it
2. Can existing tokens solve it
3. Can a repeated feature pattern be promoted to shared UI
4. Only then consider a new shared primitive

If steps 1 to 3 work, do not add a new primitive.

## Implementation Guardrails

These apply to both manual implementation and automation.

### Always do

- use shared tokens for color and state
- reference gradient tokens instead of writing gradients inline
- stay on the approved spacing scale
- export new public shared components through `shared/ui/index.ts`
- add a `.stories.tsx` file for every new public shared primitive
- document intentional direct-import exceptions such as `TranscriptLog`

### Never do

- write `linear-gradient(...)` or `radial-gradient(...)` directly in feature CSS
- add raw hex or rgba colors outside token files
- add global element selectors such as `button {}` or `input {}`
- reference feature-prefixed classes such as `overview-*`, `search-*`, `provider-*`, or `detail-*` from shared UI component files
- add text shadows
- use `filter: brightness()` or `filter: drop-shadow()` except where an SVG icon path truly requires it
- add long decorative motion without using the shared transition tokens

## Review Checklist

When reviewing design changes, check:

- whether a raw color was added
- whether a feature created its own button instead of using a shared one
- whether the same kind of state is represented in multiple ways
- whether spacing drifts away from the approved scale
- whether Storybook gained primitives with no live adoption path
- whether repeated feature UI is still being copy-pasted instead of promoted

## Known Refactor Backlog

- `styles/components.css` still carries a global button selector
- `Badge` still depends on a feature-specific class
- `Card` still depends on an overview-specific class
- spacing tokens are still hardcoded by scale instead of formal token names
- some surface tokens still carry gradient debt
- some radius values still appear as hardcoded fallbacks

## Change Criteria

Good changes:

- make actions and states more consistent across surfaces
- reduce feature-local CSS
- increase real usage of shared primitives
- make tokens and live UI line up more clearly

Bad changes:

- add more primitives with no adoption
- increase feature-specific exceptions
- make Storybook look clean while the live app still uses a different language
