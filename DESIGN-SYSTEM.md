# ThreadLens Design System

## 목적

이 문서는 ThreadLens 웹 UI의 단일 디자인 기준이다.
목표는 다음 세 가지다.

- 새 화면을 만들 때 매번 다른 버튼, 카드, 간격, 상태 표현을 만들지 않는다.
- 공용 토큰과 공용 컴포넌트를 먼저 쓰고, feature 내부의 즉흥 스타일링을 줄인다.
- Storybook, CSS 토큰, 실제 앱 화면이 같은 방향을 보게 만든다.

## 현재 상태

현재 디자인 시스템은 `apps/web/src/design-system`을 중심으로 구성되어 있다.

- 진입점: `apps/web/src/main.tsx`
- 전역 스타일 진입점: `apps/web/src/design-system/index.css`
- 토큰: `apps/web/src/design-system/tokens.css`
- 공용 컴포넌트 export: `apps/web/src/design-system/index.ts`
- Storybook: `apps/web/.storybook`, `apps/web/src/design-system/*.stories.tsx`

주의:

- 현재 `index.css`는 design-system CSS만이 아니라 feature CSS도 함께 import한다.
- 즉 지금 단계는 "독립 패키지형 디자인 시스템"이 아니라 "앱 내 공용 UI 레이어"에 가깝다.

## 소스 오브 트루스

우선순위는 아래 순서다.

1. `tokens.css`
2. `design-system/*.tsx`
3. Storybook story
4. feature CSS / feature TSX

같은 문제를 어디서 해결할지 애매하면, 가능한 한 더 위 레이어에서 해결한다.

## 디자인 원칙

### 1. 토큰 우선

- 색상, radius, shadow, blur, typography는 가능한 한 토큰에서만 정의한다.
- feature CSS에서 raw color, 임의 radius, 임의 shadow를 새로 만들지 않는다.
- 새 시각 언어가 필요하면 먼저 `tokens.css`에 semantic token으로 추가한다.

### 2. 공용 컴포넌트 우선

- 버튼, 패널 헤더, 상태 pill, chip, card 같은 반복 UI는 feature 안에서 새로 만들지 않는다.
- 먼저 `design-system`에 이미 있는 컴포넌트를 사용할 수 있는지 본다.
- 없더라도 feature 내부 임시 구현보다 공용 컴포넌트로 올릴 가치가 있는지 먼저 판단한다.

### 3. 한 화면 안에서 언어를 섞지 않는다

- 같은 성격의 액션은 같은 버튼 변형을 쓴다.
- 같은 성격의 상태는 같은 상태 표현을 쓴다.
- 같은 레벨의 섹션 제목은 같은 구조와 spacing을 쓴다.

### 4. Storybook은 장식이 아니라 계약이다

- Storybook에 있는 primitive는 실제 앱에서 재사용될 의도가 있어야 한다.
- Storybook 전용 장난감 컴포넌트를 계속 늘리지 않는다.
- 새 primitive를 추가하면 실제 앱 채택 계획도 같이 있어야 한다.

## 토큰 규칙

### 허용

- semantic token 추가
- 기존 token 조합으로 surface/state 표현 확장
- typography, blur, surface, state 계열 token 재사용

### 금지

- feature CSS에 새 hex 색상 추가
- feature CSS에 새 gradient를 직접 정의
- feature CSS에 임의 상태색을 바로 박기
- "일단 여기만" 식 spacing/shape 하드코딩 확장

### 예외

- 토큰 정의 파일 안의 raw 값은 허용한다.
- fallback literal은 migration 중 최소 범위에서만 허용하고, 새 코드는 가급적 만들지 않는다.

## 공용 컴포넌트 규칙

현재 export 기준 공용 컴포넌트:

- `Badge`
- `Button`
- `Card`
- `Chip`
- `Disclosure`
- `Panel`
- `PanelHeader`
- `SegmentedNav`
- `StatusPill`

### 현재 실사용 우선 컴포넌트

실제 앱에서 이미 의미 있게 쓰이는 축은 아래다.

- `Button`
- `PanelHeader`
- `TranscriptLog`

이 셋은 계속 기준 컴포넌트로 밀고 간다.

### 아직 채택이 약한 컴포넌트

현재 앱 채택이 거의 없거나 없는 컴포넌트:

- `Badge`
- `Card`
- `Chip`
- `Disclosure`
- `Panel`
- `SegmentedNav`
- `StatusPill`

이들은 "존재 = 표준 채택 완료"가 아니다.
새 UI에서 정말 필요할 때만 채택하고, 계속 쓰이지 않으면 정리 대상이 될 수 있다.

## 화면별 우선 매핑

### Overview

- CTA / secondary action: `Button`
- setup / side section title: `PanelHeader`
- 반복 summary block: 가능하면 `Card` 검토

### Sessions

- destructive / dry-run / backup action: `Button`
- detail / table section title: `PanelHeader`
- provider filter / mode switch: `Chip` 또는 `SegmentedNav` 중 하나로 통일 검토
- session state 요약: `StatusPill` 채택 후보

### Threads

- action row: `Button`
- section title: `PanelHeader`
- transcript log: `TranscriptLog`
- forensic / status summary: `StatusPill` 채택 후보

### Search

- command / shortcut / support chip류: `Chip` 채택 후보
- result group shell: `Card` 채택 후보

## 새 UI 추가 규칙

새 화면이나 새 블록을 만들 때는 아래 순서로 본다.

1. 기존 Storybook primitive로 풀 수 있는가
2. 기존 token 조합으로 해결 가능한가
3. 기존 feature 패턴을 공용 컴포넌트로 끌어올리는 게 맞는가
4. 정말 새 primitive가 필요한가

위 1~3으로 해결되면 새 컴포넌트를 만들지 않는다.

## 리뷰 체크리스트

PR 또는 로컬 리뷰에서 아래를 본다.

- raw color를 새로 박았는가
- 공용 버튼 대신 feature 내부 버튼을 만들었는가
- 같은 종류의 상태를 다른 방식으로 표현했는가
- spacing이 token/기존 scale과 어긋나는가
- Storybook에는 있는데 앱에서 전혀 쓰지 않는 primitive를 또 늘렸는가
- 앱에서 반복되는 UI를 여전히 feature 내부에서 복붙하고 있는가

## 하지 말 것

- 디자인 시스템 명목으로 새 primitive만 계속 추가
- 실제 화면 채택 없이 Storybook story만 늘리기
- feature CSS를 한 번에 전면 교체
- 지금 단계에서 독립 패키지형 DS로 과하게 재구성
- Tailwind나 runtime CSS-in-JS로 전면 전환

## 다음 우선순위

1. `Chip`, `StatusPill`, `Card` 중 실제 채택할 후보를 1~2개만 고른다.
2. `Overview`, `Sessions`, `Search` 중 반복 표현이 가장 많은 곳부터 공용화한다.
3. Storybook에는 "실전 상태" story를 추가한다.
4. 안 쓰는 primitive가 계속 남으면 유지하지 말고 정리한다.

## 판단 기준

좋은 변화는 이렇다.

- 화면 간 액션/상태 표현이 더 비슷해진다.
- 새 UI를 만들 때 feature 내부 CSS를 덜 만든다.
- Storybook 컴포넌트가 실제 앱에서 더 많이 쓰인다.
- 토큰과 실제 화면이 더 가깝게 맞물린다.

나쁜 변화는 이렇다.

- 공용 컴포넌트 수만 늘고 앱은 그대로다.
- feature별 예외 규칙이 계속 쌓인다.
- Storybook은 예쁜데 실제 앱은 다른 언어로 그려진다.

## 상세 구현 가이드

토큰 사용 기준, 스페이싱 스케일, 그라데이션 규칙, AI 작업 지침 등 세부 규칙은 아래 파일 참조:

`apps/web/src/design-system/DESIGN.md`

### AI/Codex 작업 시 절대 금지

CSS 파일에서:

- `linear-gradient(...)` 직접 작성 — 토큰 참조만 허용
- `radial-gradient(...)` 직접 작성 — 토큰 참조만 허용
- hex 색상 직접 사용 (`#`, `rgba(`)
- `text-shadow` 사용
- `filter: brightness()` / `filter: drop-shadow()` 사용 (SVG 아이콘 예외)
- `button { }`, `input { }` 등 global element selector 추가
- 스페이싱 스케일 외 값 (허용: 2/4/6/8/10/12/14/16/20/24/32px)

컴포넌트에서:

- 디자인 시스템 컴포넌트 파일에 `overview-`, `search-`, `provider-` 등 피처 클래스 참조
- 새 컴포넌트를 `design-system/index.ts` export 없이 추가
- `.stories.tsx` 없이 새 컴포넌트 추가
