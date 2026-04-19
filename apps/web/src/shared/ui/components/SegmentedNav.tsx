import * as React from "react";

export type SegmentedNavItem = {
  id: string;
  label: React.ReactNode;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
};

type SegmentedNavProps = {
  items: SegmentedNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function SegmentedNav({
  items,
  activeId,
  onSelect,
  className,
  ariaLabel = "Segmented navigation",
}: SegmentedNavProps) {
  const cls = ["top-surface-nav", className].filter(Boolean).join(" ");
  return (
    <nav className={cls} aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === activeId}
          className={[
            "top-surface-btn",
            item.id === activeId ? "is-active" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
          onMouseDown={item.onMouseDown}
          onClick={() => onSelect(item.id)}
          onMouseEnter={item.onMouseEnter}
          onFocus={item.onFocus}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
