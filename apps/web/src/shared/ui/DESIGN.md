# ThreadLens Design System Guide

**Quartz Mono** — cold graphite, restrained quartz highlights, no decoration for its own sake.

---

## 핵심 원칙

1. **토큰만 쓴다** — 하드코딩된 색, 크기, radius는 금지. 예외: `0`, `100%`, `999px` (pill).
2. **그라데이션은 토큰 이름으로만** — CSS 파일에서 `linear-gradient(`, `radial-gradient(` 직접 작성 금지. 토큰에 정의된 것만 참조.
3. **디자인 시스템 컴포넌트는 피처 클래스를 모른다** — `overview-*`, `detail-*`, `provider-*` 같은 피처 접두사를 디자인 시스템 파일에서 사용하면 안 됨.
4. **global element selector 금지** — `button { }`, `input { }` 등은 reset.css에만 허용. 스타일은 클래스로만.
5. **스페이싱은 스케일로** — 아래 스케일에 없는 값이면 왜 필요한지 근거가 있어야 함.

---

## 토큰 계층

```
tokens.css   ← 모든 CSS 변수 정의 (수정 대상)
components.css ← 디자인 시스템 공용 클래스
layout.css   ← 쉘/레이아웃 전용
[feature].css ← 피처 전용 (디자인 시스템 토큰만 참조)
```

### 색상 토큰 카테고리

| 카테고리 | 접두사 | 용도 |
|---|---|---|
| 배경 | `--bg`, `--bg-elev`, `--panel` | 전체 페이지 레이어 |
| 구분선 | `--line`, `--line-soft` | 보더 |
| 텍스트 | `--text`, `--text-secondary`, `--muted` | 텍스트 |
| 액센트 | `--accent`, `--accent-strong`, `--accent-dim` | 강조색 |
| 상태 | `--success`, `--warn`, `--info` | 시멘틱 색상 (`-dim` 변형 포함) |
| 인터랙션 | `--hover`, `--active`, `--focus-ring` | 상태 레이어 |
| 서페이스 | `--surface-*` | 컴포넌트별 조합 토큰 |
| 스테이트 | `--state-*` | 보더/배경 조합 토큰 |

### 서페이스 토큰 사용 기준

서페이스 토큰은 레이어 깊이로 고른다:

```
--surface-card-bg          ← 카드, 기본 컨테이너
--surface-card-bg-strong   ← 카드 위에 올라오는 요소
--surface-stage-bg         ← 패널/스테이지 전체 배경
--surface-nav-bg           ← 네비게이션 바
--surface-pill-bg          ← 칩/태그/작은 뱃지
```

**금지**: `--surface-elevated-subtle-soft-mid-strong` 같은 변형을 새로 추가하지 말 것. 기존 토큰 중 가장 가까운 것을 쓰거나, 새 시멘틱 토큰으로 명명.

### 그라데이션 토큰

그라데이션이 필요한 경우 반드시 토큰에 정의하고 이름으로 참조:

```css
/* ✅ 올바름 */
background: var(--gradient-accent);
background: var(--hero-bg);

/* ❌ 금지 — CSS 파일에 직접 작성 */
background: linear-gradient(135deg, #edf1f3 0%, #c7d1d8 46%);
background: radial-gradient(circle at 100% 0%, rgba(255,148,148,0.14), transparent);
```

**그라데이션 허용 범위:**
- 히어로/랜딩 배경 (`--hero-bg`, `--page-haze`)
- 스켈레톤 시머 (애니메이션 목적)
- 스테이터스 fill 바 (`--state-*-fill-gradient`)
- 네비 active 버튼 (`--nav-btn-active-bg`)
- KPI 카드 상태 힌트 (`--surface-kpi-*`)

**그라데이션 금지:**
- 일반 카드 배경
- 버튼 hover/active 상태
- 텍스트 배경
- 폼 필드 배경 (현재 `--surface-form-field-bg`는 리팩터 대상)
- 패널 헤더 (현재 `--surface-panel-header`는 리팩터 대상)

---

## 타이포그래피 스케일

```
--text-xs:    0.6rem   ← 레이블, 배지 (아주 작은 것)
--text-sm:    0.68rem  ← 메타, 태그, 모노 레이블
--text-base:  0.78rem  ← 보조 텍스트, 힌트
--text-md:    0.88rem  ← 본문 기본
--text-lg:    1rem     ← 서브헤딩, 강조 레이블
--text-xl:    1.2rem   ← 카드 타이틀
--text-2xl:   1.5rem   ← 섹션 헤딩
--text-3xl:   2rem     ← 페이지 헤딩
--text-4xl:   clamp(2.5rem, 4vw, 4rem)  ← 히어로
```

display 토큰(`--text-display-*`)은 랜딩/히어로 섹션 전용.

**규칙:**
- 본문 최소 크기: `--text-md` (0.88rem)
- 인터랙티브 요소 최소 크기: `--text-sm` (0.68rem)
- 3xs, 2xs는 신규 사용 금지 (기존 코드 유지보수만)

---

## 스페이싱 스케일

토큰이 없어 현재 하드코딩 중. 아래 값만 사용:

| 이름 | 값 | 용도 |
|---|---|---|
| 2 | 2px | 아이콘 내부 |
| 4 | 4px | 인라인 gap |
| 6 | 6px | 레이블 - 값 사이 |
| 8 | 8px | 컴포넌트 내부 gap |
| 10 | 10px | 패딩 small |
| 12 | 12px | 패딩 base |
| 14 | 14px | 패딩 md |
| 16 | 16px | 패딩 lg |
| 20 | 20px | 섹션 gap |
| 24 | 24px | 카드 gap |
| 32 | 32px | 레이아웃 gap |

이 스케일 외 값(예: 11px, 15px, 18px)은 추가 금지.

> TODO: 이 값들을 `--space-{n}` 토큰으로 tokens.css에 추가 예정.

---

## Radius 스케일

```
--radius-sm:        6px   ← 인풋 내부 요소, 코드블록
--radius-md:        10px  ← 인풋, 드롭다운
--radius-card:      12px  ← 카드
--radius-lg:        14px  ← 패널 내부 섹션
--radius-container: 18px  ← 컨테이너
--radius-xl:        20px  ← 큰 컨테이너
--radius-modal:     22px  ← 모달, 오버레이
--radius-shell-md:  24px  ← 쉘 요소
--radius-shell-lg:  28px  ← 레일
--radius-shell-xl:  32px  ← 최상위 쉘
--radius-pill:      999px ← 칩, 뱃지, 태그
```

하드코딩된 px 값(예: `border-radius: 26px`)은 가장 가까운 토큰으로 교체.

---

## 컴포넌트 규칙

### 버튼

```tsx
// ✅ 디자인 시스템 버튼
import { Button } from "@/design-system";
<Button variant="accent">저장</Button>
<Button variant="outline">취소</Button>
<Button variant="danger">삭제</Button>
<Button variant="base">기본</Button>

// ❌ 직접 className 사용
<button className="btn-accent">저장</button>
```

버튼 variant 추가 기준: accent/outline/danger/base 4개로 커버 안 되는 경우에만. PR에서 근거 필요.

### 카드

```tsx
// ✅
import { Card, CardTitle, CardDescription } from "@/design-system";
<Card>...</Card>
<Card variant="kpi">...</Card>

// ❌ 피처 클래스 직접 사용
<article className="overview-insight-card is-primary">
```

`Card` 컴포넌트가 내부적으로 `overview-insight-card`를 쓰는 현재 구조는 리팩터 대상. 디자인 시스템 전용 클래스로 교체 필요.

### Badge / Chip

Badge는 현재 `detail-hero-pill` 클래스를 사용 중 → 리팩터 대상. 디자인 시스템 내부에서 피처 클래스를 참조하면 안 됨.

### 상태 표시

```tsx
// ✅
import { StatusPill } from "@/design-system";
<StatusPill variant="active">Active</StatusPill>
<StatusPill variant="detected" interactive action="설정">Detected</StatusPill>

// ❌
<span className="status-active status-pill">Active</span>
```

---

## 피처 CSS 작성 규칙

피처 CSS(`overview.css`, `providers.css`, `search.css` 등)는:

1. **디자인 시스템 토큰만 참조** — 직접 hex/rgba 금지
2. **컴포넌트 override는 최소** — 디자인 시스템 컴포넌트를 피처에서 override하려면 먼저 디자인 시스템에 variant 추가 검토
3. **클래스 명명** — `[feature]-[element]-[modifier]` 패턴 (예: `overview-card-header`, `search-result-active`)

### 금지 패턴

```css
/* ❌ 직접 색상 */
color: #b5bab5;
background: rgba(181, 194, 202, 0.05);

/* ❌ 그라데이션 직접 작성 */
background: linear-gradient(155deg, #181b1d 0%, #131517 50%);

/* ❌ global element selector */
button { background: var(--btn-bg); }

/* ❌ 스케일 외 spacing */
padding: 11px 14px;  /* 10 또는 12 또는 14 중 선택 */
gap: 15px;           /* 14 또는 16 사용 */
```

---

## Storybook 요구사항

새 컴포넌트 추가 시:
- `[Component].stories.tsx` 필수
- `default` export: `{ title: "Design System/[Name]", component }`
- 모든 variant/prop 조합 커버
- dark/light 테마 양쪽 확인

```tsx
// 최소 구조
export default {
  title: "Design System/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Button variant="outline">Outline</Button>
      <Button variant="accent">Accent</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="base">Base</Button>
    </div>
  ),
};
```

---

## 리팩터 백로그

현재 알려진 문제들 (우선순위 순):

| 문제 | 파일 | 심각도 |
|---|---|---|
| `global button {}` selector | components.css:186 | 높음 |
| `Badge`가 `detail-hero-pill` 피처 클래스 사용 | Badge.tsx:9 | 높음 |
| `Card`가 `overview-insight-card` 클래스에 의존 | Card.tsx:25 | 높음 |
| 스페이싱 토큰 없음 (하드코딩) | 전체 CSS | 중간 |
| `--surface-form-field-bg`에 그라데이션 직접 내장 | tokens.css:147 | 중간 |
| `--surface-panel-header`에 그라데이션 내장 | tokens.css:240 | 중간 |
| near-duplicate surface 토큰 (~20개) | tokens.css:174-186 | 낮음 |
| 스케일 외 하드코딩 radius (22px, 26px 등) | setup.css, components.css | 낮음 |

---

## AI 작업 가이드

Codex 또는 다른 AI가 이 코드베이스에서 작업할 때:

### 반드시 지킬 것

- 색상은 `var(--*)` 토큰으로만
- 그라데이션은 신규 추가 금지. 기존 토큰 참조만 허용
- 스페이싱은 위 스케일 값만 사용 (2/4/6/8/10/12/14/16/20/24/32)
- 새 컴포넌트는 반드시 `design-system/index.ts`에 export 추가
- 새 컴포넌트는 `.stories.tsx` 동시 작성

### 절대 하지 말 것

- `background: linear-gradient(...)` 직접 작성
- `background: radial-gradient(...)` 직접 작성
- 임의 그림자 효과 (`box-shadow: 0 0 20px rgba(...)`) 추가
- `button`, `input`, `a` 등 global element selector 추가
- 디자인 시스템 컴포넌트 파일에 피처 클래스(`overview-`, `search-`, `provider-` 등) 참조
- `text-shadow` 사용
- `filter: brightness()`, `filter: drop-shadow()` 사용 (SVG 아이콘 예외)
- 애니메이션 duration 200ms 이상 추가 (기존 `--transition` 사용)
- 새 CSS 파일을 `design-system/` 폴더에 직접 추가하지 않고 피처 폴더에 추가

### 판단 기준: 디자인이 과한가?

아래 중 1개라도 해당하면 과함:
- 색상이 3가지 이상 레이어됨
- hover 시 transform + color + shadow 동시 변화
- 그라데이션 + 테두리 + 배경색이 동시에 있음
- glow 효과 (예: `box-shadow: 0 0 X rgba(...)`)
