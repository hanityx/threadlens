import type { Locale } from "../i18n";
import { LOCALE_LABELS, LOCALE_SHORT_LABELS } from "../i18n/locales";

type LocalePickerProps = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  label: string;
  compact?: boolean;
  id?: string;
  className?: string;
};

export function LocalePicker({
  locale,
  setLocale,
  label,
  compact = false,
  id,
  className,
}: LocalePickerProps) {
  const pickerClassName = [
    "locale-picker",
    compact ? "is-compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <details className={pickerClassName}>
      <summary
        id={id}
        className="locale-picker-trigger"
        aria-label={`${label}: ${LOCALE_LABELS[locale]}`}
      >
        <span className="locale-picker-value">
          {compact ? LOCALE_SHORT_LABELS[locale] : LOCALE_LABELS[locale]}
        </span>
        <span className="locale-picker-caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="locale-picker-menu" role="listbox" aria-label={label}>
        {Object.entries(LOCALE_LABELS).map(([value, localeLabel]) => {
          const isActive = value === locale;
          return (
            <button
              key={value}
              type="button"
              role="option"
              className={`locale-picker-option ${isActive ? "is-active" : ""}`}
              aria-selected={isActive}
              onClick={(event) => {
                setLocale(value as Locale);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              <span className="locale-picker-option-code">
                {LOCALE_SHORT_LABELS[value as Locale]}
              </span>
              <span className="locale-picker-option-label">{localeLabel}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
