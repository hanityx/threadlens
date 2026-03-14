/**
 * Mock API responses for demo recording.
 * These simulate a healthy Codex Mission Control instance
 * with realistic data across all dashboard views.
 */

export const MOCK_RESPONSES = {

  // ── Runtime health ──────────────────────────────────
  "/api/ts/runtime-health": {
    ok: true,
    ts: new Date().toISOString(),
    schemaVersion: "2025-06",
    data: {
      python_backend: {
        reachable: true,
        url: "http://127.0.0.1:8787",
        latency_ms: 12,
      },
      uptime_s: 86412,
      version: "0.1.0",
      node_env: "production",
    },
  },

  // ── Threads ─────────────────────────────────────────
  "/api/ts/threads": {
    ok: true,
    ts: new Date().toISOString(),
    schemaVersion: "2025-06",
    total: 8,
    data: [
      { id: "thread_abc123", title: "Refactor auth middleware", status: "idle", risk_score: 22, pinned: true, model: "o3-pro", created_at: "2026-02-26T09:12:00Z", last_active: "2026-02-28T14:33:00Z", turn_count: 47 },
      { id: "thread_def456", title: "Implement payment webhook", status: "idle", risk_score: 85, pinned: false, model: "codex-1", created_at: "2026-02-27T10:05:00Z", last_active: "2026-02-28T13:20:00Z", turn_count: 31 },
      { id: "thread_ghi789", title: "Database migration v3.2", status: "idle", risk_score: 72, pinned: true, model: "o3-pro", created_at: "2026-02-25T08:00:00Z", last_active: "2026-02-28T12:00:00Z", turn_count: 89 },
      { id: "thread_jkl012", title: "CI pipeline optimization", status: "running", risk_score: 15, pinned: false, model: "codex-1", created_at: "2026-02-28T06:30:00Z", last_active: "2026-02-28T14:45:00Z", turn_count: 12 },
      { id: "thread_mno345", title: "Fix memory leak in worker pool", status: "idle", risk_score: 91, pinned: true, model: "o3-pro", created_at: "2026-02-26T15:00:00Z", last_active: "2026-02-28T11:30:00Z", turn_count: 63 },
      { id: "thread_pqr678", title: "Add rate limiter to API gateway", status: "idle", risk_score: 38, pinned: false, model: "codex-1", created_at: "2026-02-27T14:20:00Z", last_active: "2026-02-28T10:15:00Z", turn_count: 24 },
      { id: "thread_stu901", title: "Upgrade TLS certificates", status: "idle", risk_score: 55, pinned: false, model: "o3-pro", created_at: "2026-02-28T02:00:00Z", last_active: "2026-02-28T09:00:00Z", turn_count: 8 },
      { id: "thread_vwx234", title: "Add structured logging", status: "idle", risk_score: 10, pinned: false, model: "codex-1", created_at: "2026-02-28T08:30:00Z", last_active: "2026-02-28T14:00:00Z", turn_count: 19 },
    ],
  },

  // ── Thread detail ───────────────────────────────────
  "/api/ts/threads/thread_def456": {
    ok: true,
    data: {
      id: "thread_def456",
      title: "Implement payment webhook",
      status: "idle",
      risk_score: 85,
      model: "codex-1",
      created_at: "2026-02-27T10:05:00Z",
      last_active: "2026-02-28T13:20:00Z",
      turn_count: 31,
      sandbox_status: "active",
      file_changes: [
        { path: "src/webhooks/payment.ts", op: "modified", lines_added: 142, lines_removed: 38 },
        { path: "src/webhooks/__tests__/payment.test.ts", op: "added", lines_added: 89, lines_removed: 0 },
        { path: "src/config/stripe.ts", op: "modified", lines_added: 12, lines_removed: 5 },
      ],
    },
  },

  // ── Thread transcript ───────────────────────────────
  "/api/ts/threads/thread_def456/transcript": {
    ok: true,
    data: {
      entries: [
        { role: "user", content: "Implement a Stripe payment webhook handler that validates signatures and processes charge.succeeded events.", ts: "2026-02-27T10:05:12Z" },
        { role: "assistant", content: "I'll create the webhook handler with signature verification. Let me start by setting up the endpoint and Stripe SDK integration.\n\n```typescript\nimport Stripe from 'stripe';\n\nexport async function handlePaymentWebhook(req, res) {\n  const sig = req.headers['stripe-signature'];\n  const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);\n  // ... process event\n}\n```", ts: "2026-02-27T10:05:45Z" },
        { role: "user", content: "Add idempotency checks and dead letter queue for failed processing.", ts: "2026-02-27T10:08:00Z" },
        { role: "assistant", content: "Adding idempotency via a processed_events table and DLQ integration with SQS for failed webhook processing. The handler now checks event ID before processing and queues failures for retry.", ts: "2026-02-27T10:09:30Z" },
      ],
    },
  },

  // ── Recovery ────────────────────────────────────────
  "/api/ts/recovery-center": {
    ok: true,
    ts: new Date().toISOString(),
    data: {
      summary: {
        checklist_done: 14,
        checklist_total: 16,
        backup_sets: 3,
        last_backup: "2026-02-28T06:00:00Z",
      },
      checks: [
        { name: "thread-data-integrity", status: "pass", detail: "All 8 threads verified" },
        { name: "session-backup", status: "pass", detail: "3 backup sets available" },
        { name: "config-snapshot", status: "pass", detail: "Latest: 2h ago" },
        { name: "log-rotation", status: "warn", detail: "Logs approaching 500MB" },
      ],
    },
  },

  // ── Provider matrix ─────────────────────────────────
  "/api/ts/providers/matrix": {
    ok: true,
    ts: new Date().toISOString(),
    data: {
      providers: [
        { key: "openai", label: "OpenAI", status: "active", capabilities: ["chat", "code", "cleanup"], session_count: 24, model: "o3-pro", last_seen: "2026-02-28T14:30:00Z" },
        { key: "anthropic", label: "Anthropic", status: "active", capabilities: ["chat", "code"], session_count: 18, model: "claude-opus-4", last_seen: "2026-02-28T14:28:00Z" },
        { key: "codex", label: "Codex CLI", status: "active", capabilities: ["code", "cleanup", "sandbox"], session_count: 42, model: "codex-1", last_seen: "2026-02-28T14:45:00Z" },
        { key: "local-llm", label: "Local LLM", status: "inactive", capabilities: ["chat"], session_count: 3, model: "llama-3.1-70b", last_seen: "2026-02-27T22:00:00Z" },
      ],
      summary: { total: 4, active: 3 },
    },
  },

  // ── Provider sessions ───────────────────────────────
  "/api/ts/providers/sessions": {
    ok: true,
    ts: new Date().toISOString(),
    data: {
      sessions: [
        { id: "sess_001", provider: "codex", title: "Auth middleware refactor", path: "/sessions/codex/sess_001", status: "completed", created_at: "2026-02-28T09:00:00Z", turns: 23, tokens_used: 45200 },
        { id: "sess_002", provider: "codex", title: "Payment webhook impl", path: "/sessions/codex/sess_002", status: "completed", created_at: "2026-02-28T10:15:00Z", turns: 31, tokens_used: 67800 },
        { id: "sess_003", provider: "openai", title: "CI pipeline review", path: "/sessions/openai/sess_003", status: "active", created_at: "2026-02-28T13:00:00Z", turns: 12, tokens_used: 18400 },
        { id: "sess_004", provider: "anthropic", title: "Code review: security audit", path: "/sessions/anthropic/sess_004", status: "completed", created_at: "2026-02-28T11:30:00Z", turns: 8, tokens_used: 12100 },
        { id: "sess_005", provider: "codex", title: "Database migration planning", path: "/sessions/codex/sess_005", status: "completed", created_at: "2026-02-27T22:00:00Z", turns: 45, tokens_used: 89300 },
      ],
    },
  },

  // ── Provider parser health ──────────────────────────
  "/api/ts/providers/parser-health": {
    ok: true,
    ts: new Date().toISOString(),
    data: {
      reports: [
        { provider: "codex", status: "healthy", parsed: 42, failed: 0, last_check: "2026-02-28T14:40:00Z" },
        { provider: "openai", status: "healthy", parsed: 24, failed: 1, last_check: "2026-02-28T14:38:00Z" },
        { provider: "anthropic", status: "healthy", parsed: 18, failed: 0, last_check: "2026-02-28T14:35:00Z" },
        { provider: "local-llm", status: "degraded", parsed: 3, failed: 2, last_check: "2026-02-27T22:10:00Z" },
      ],
      summary: { total: 87, failed: 3, health_pct: 96.6 },
    },
  },

  // ── Execution graph ─────────────────────────────────
  "/api/ts/execution-graph": {
    ok: true,
    ts: new Date().toISOString(),
    data: {
      nodes: [
        { id: "user-request", type: "input", label: "User Request" },
        { id: "router", type: "router", label: "Model Router" },
        { id: "codex-exec", type: "executor", label: "Codex Sandbox" },
        { id: "openai-exec", type: "executor", label: "OpenAI API" },
        { id: "anthropic-exec", type: "executor", label: "Anthropic API" },
        { id: "merge", type: "merge", label: "Response Merge" },
        { id: "safety-check", type: "guard", label: "Safety Check" },
        { id: "output", type: "output", label: "Final Output" },
      ],
      edges: [
        { from: "user-request", to: "router" },
        { from: "router", to: "codex-exec" },
        { from: "router", to: "openai-exec" },
        { from: "router", to: "anthropic-exec" },
        { from: "codex-exec", to: "merge" },
        { from: "openai-exec", to: "merge" },
        { from: "anthropic-exec", to: "merge" },
        { from: "merge", to: "safety-check" },
        { from: "safety-check", to: "output" },
      ],
      findings: [
        { severity: "info", message: "Codex sandbox isolated — no network access during execution" },
        { severity: "info", message: "All providers routed through unified safety layer" },
        { severity: "warn", message: "Local LLM bypass detected — add safety guard" },
      ],
    },
  },

  // ── Compare apps ────────────────────────────────────
  "/api/ts/compare-apps": {
    ok: true,
    data: { items: [] },
  },

  // ── Fallback for POST endpoints ─────────────────────
  "/api/ts/threads/bulk-pin": { ok: true },
  "/api/ts/threads/bulk-unpin": { ok: true },
  "/api/ts/threads/bulk-archive": { ok: true },
  "/api/ts/threads/analyze-delete": {
    ok: true,
    data: { analysis: "2 threads flagged for deletion. Total tokens: 113,000. No active sandboxes." },
  },
  "/api/ts/threads/cleanup-dry-run": {
    ok: true,
    data: { impact: [{ thread_id: "thread_def456", action: "archive", reason: "high risk score" }] },
  },
};
