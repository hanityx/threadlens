import test from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/i18n/en.js";
import { es } from "../src/i18n/es.js";
import {
  formatSearchEmptyState,
  formatSearchMeta,
  formatSearchResultSummary,
  formatSearchSnippetPager,
} from "../src/views/SearchView.js";
import { formatDateLabel } from "../src/lib/format.js";

test("SearchView copy uses localized helper text in Spanish", () => {
  assert.equal(
    formatSearchMeta(es, { searched: 12, available: 20, truncated: true }),
    "12/20 sesiones (parcial)",
  );
  assert.equal(
    formatSearchResultSummary(es, 3, 9),
    "3 sesiones · 9 coincidencias",
  );
  assert.equal(
    formatSearchEmptyState(es, "a"),
    "Introduce al menos 2 caracteres.",
  );
  assert.equal(
    formatSearchEmptyState(es, "rename"),
    "No se encontraron resultados.",
  );
  assert.equal(
    formatSearchSnippetPager(es, 2, 5),
    "snippet 2/5  n/p ←/→",
  );
});

test("SearchView copy keeps canonical English nouns in English", () => {
  assert.equal(
    formatSearchMeta(en, { searched: 12, available: 20, truncated: true }),
    "12/20 sessions (partial)",
  );
  assert.equal(
    formatSearchResultSummary(en, 3, 9),
    "3 sessions · 9 hits",
  );
  assert.equal(
    formatSearchEmptyState(en, "rename"),
    "No results found.",
  );
});

test("formatDateLabel respects the requested locale", () => {
  const value = "2026-04-02T12:34:00.000Z";
  const enLabel = formatDateLabel(value, "en");
  const jaLabel = formatDateLabel(value, "ja");
  assert.notEqual(enLabel, value);
  assert.notEqual(jaLabel, value);
  assert.notEqual(enLabel, jaLabel);
});
