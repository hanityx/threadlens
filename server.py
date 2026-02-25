#!/usr/bin/env python3
import glob
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

HOME = pathlib.Path.home()
CODEX_DIR = HOME / ".codex"
CHAT_DIR = HOME / "Library" / "Application Support" / "com.openai.chat"
LABS_DIR = HOME / "Labs"
OVERVIEW_DIR = LABS_DIR / "codex-overview"
MAPPING_FILE = OVERVIEW_DIR / "unmapped_title_mapping.json"
ROADMAP_STATE_FILE = OVERVIEW_DIR / "roadmap_state.json"
ROADMAP_LOG_FILE = OVERVIEW_DIR / "roadmap_checkins.jsonl"
ALERT_RULES_FILE = OVERVIEW_DIR / "alert_rules.json"
ALERT_STATE_FILE = OVERVIEW_DIR / "alert_state.json"
ALERT_EVENTS_FILE = OVERVIEW_DIR / "alert_events.jsonl"
RECOVERY_CHECKLIST_FILE = OVERVIEW_DIR / "w4_checklist.json"
RECOVERY_PLAN_DIR = OVERVIEW_DIR / "recovery_plans"
BACKUP_ROOT = CODEX_DIR / "local_cleanup_backups"
OVERVIEW_CACHE = {
    "ts": 0.0,
    "data": None,
}
OBSERVABILITY_CACHE = {
    "ts": 0.0,
    "data": None,
}
SERVER_START_TS = time.time()
LOOP_CONTROL_SPECS = {
    "openclaw_agi": {
        "label": "OpenClaw AGI",
        "controller": OVERVIEW_DIR / "daemon" / "supervised" / "openclaw_agi_control.sh",
    },
    "dashboard_autopilot": {
        "label": "Dashboard Autopilot",
        "controller": OVERVIEW_DIR / "daemon" / "supervised" / "autodashboard_control.sh",
    },
}
LOOP_ALLOWED_ACTIONS = {
    "start",
    "stop",
    "restart",
    "run2",
    "status",
    "watch-start",
    "watch-stop",
    "watch-status",
}


def safe_read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def load_unmapped_mapping():
    data = safe_read_json(MAPPING_FILE)
    if isinstance(data, dict):
        return {str(k): str(v) for k, v in data.items() if k and v}
    return {}


def clean_title_text(text, max_len=90):
    if not text:
        return ""
    t = str(text).replace("\n", " ").strip()
    # Drop mojibake replacement char to keep recovered titles readable.
    t = t.replace("�", " ")
    # Remove prompt/meta noise blocks that often pollute recovered first-user text.
    t = re.sub(r"<INSTRUCTIONS>.*?</INSTRUCTIONS>", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"<environment_context>.*?</environment_context>", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"<permissions instructions>.*?</permissions instructions>", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"#\s*AGENTS\.md instructions for.*", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"#\s*Context from my IDE setup:.*", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"##\s*Active file:.*", " ", t, flags=re.IGNORECASE)
    t = re.sub(r"##\s*Open tabs:.*", " ", t, flags=re.IGNORECASE)
    # Normalize spacing then trim leftover delimiter punctuation on both ends.
    t = re.sub(r"\s+", " ", t).strip()
    t = t.strip(" -_|")
    if len(t) > max_len:
        t = t[: max_len - 1].rstrip() + "…"
    return t


def list_dirs(path):
    if not path.exists():
        return []
    out = []
    for p in path.iterdir():
        if p.is_dir():
            out.append(p)
    return out


def list_thread_ids_from_conv_dir(conv_dir):
    if not conv_dir.exists():
        return []
    return [p.stem for p in conv_dir.glob("*.data")]


def first_user_text_from_session_jsonl(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if obj.get("type") != "response_item":
                    continue
                payload = obj.get("payload", {})
                if payload.get("type") != "message" or payload.get("role") != "user":
                    continue
                for c in payload.get("content", []):
                    if c.get("type") == "input_text":
                        txt = (c.get("text") or "").strip()
                        if txt:
                            cleaned = clean_title_text(txt, 90)
                            if cleaned:
                                return cleaned
    except Exception:
        return ""
    return ""


def extract_session_id_from_rollout_name(name):
    # rollout-YYYY-...-<uuid>.jsonl -> keep trailing 5 UUID groups
    stem = name.replace(".jsonl", "")
    parts = stem.split("-")
    if len(parts) >= 8:
        return "-".join(parts[-5:])
    return ""


def decode_uuidv7_time(thread_id):
    try:
        tid = thread_id.replace("-", "")
        if len(tid) < 12:
            return ""
        ms = int(tid[:12], 16)
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return ""


def build_history_index():
    # history.jsonl keeps many user prompts keyed by session_id.
    # We keep first message per session as inferred title fallback.
    out = {}
    p = CODEX_DIR / "history.jsonl"
    if not p.exists():
        return out
    try:
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                sid = obj.get("session_id", "")
                txt = clean_title_text(obj.get("text") or "", 90)
                if sid and txt and sid not in out:
                    out[sid] = txt
    except Exception:
        return out
    return out


def build_session_index():
    out = {}
    roots = [CODEX_DIR / "sessions", CODEX_DIR / "archived_sessions"]
    files = []
    for r in roots:
        if r.exists():
            files.extend(glob.glob(str(r / "**/*.jsonl"), recursive=True))

    for path in files:
        name = pathlib.Path(path).name
        if "rollout-" not in name:
            continue

        sid = extract_session_id_from_rollout_name(name)
        if not sid:
            continue

        meta = {
            "id": sid,
            "cwd": "",
            "timestamp": "",
            "first_user_text": "",
            "source": "sessions",
            "file_path": path,
        }

        try:
            with open(path, "r", encoding="utf-8") as f:
                first = f.readline().strip()
                if first:
                    obj = json.loads(first)
                    if obj.get("type") == "session_meta":
                        payload = obj.get("payload", {})
                        meta["id"] = payload.get("id", sid)
                        meta["cwd"] = payload.get("cwd", "")
                        meta["timestamp"] = payload.get("timestamp", "")
        except Exception:
            pass

        meta["first_user_text"] = first_user_text_from_session_jsonl(path)
        if "/archived_sessions/" in path:
            meta["source"] = "archived_sessions"

        prev = out.get(meta["id"])
        if not prev:
            out[meta["id"]] = meta
        else:
            prev_score = int(bool(prev.get("cwd"))) + int(bool(prev.get("first_user_text")))
            cur_score = int(bool(meta.get("cwd"))) + int(bool(meta.get("first_user_text")))
            if cur_score > prev_score:
                out[meta["id"]] = meta

    return out


def build_session_metrics(session_index):
    metrics = {}
    for tid, meta in session_index.items():
        path = meta.get("file_path", "")
        if not path:
            continue
        p = pathlib.Path(path)
        if not p.exists():
            continue
        line_count = 0
        tool_calls = 0
        user_msgs = 0
        assistant_msgs = 0
        try:
            with p.open("r", encoding="utf-8") as f:
                for line in f:
                    line_count += 1
                    s = line.strip()
                    if not s:
                        continue
                    try:
                        obj = json.loads(s)
                    except Exception:
                        continue
                    if obj.get("type") == "response_item":
                        payload = obj.get("payload", {})
                        ptype = payload.get("type")
                        if ptype == "function_call":
                            tool_calls += 1
                        if ptype == "message":
                            role = payload.get("role")
                            if role == "user":
                                user_msgs += 1
                            elif role == "assistant":
                                assistant_msgs += 1
        except Exception:
            continue
        metrics[tid] = {
            "line_count": line_count,
            "tool_calls": tool_calls,
            "user_msgs": user_msgs,
            "assistant_msgs": assistant_msgs,
            "bytes": p.stat().st_size,
        }
    return metrics


def get_state():
    state = safe_read_json(CODEX_DIR / ".codex-global-state.json")
    thread_titles_blob = state.get("thread-titles", {})
    titles = thread_titles_blob.get("titles", {}) if isinstance(thread_titles_blob, dict) else {}
    order = thread_titles_blob.get("order", []) if isinstance(thread_titles_blob, dict) else []
    pinned = state.get("pinned-thread-ids", []) or []
    workspaces = state.get("electron-saved-workspace-roots", []) or []
    active = state.get("active-workspace-roots", []) or []
    labels = state.get("electron-workspace-root-labels", {}) or {}
    return {
        "titles": titles,
        "order": order,
        "pinned": pinned,
        "workspaces": workspaces,
        "active": active,
        "labels": labels,
    }


def collect_overview(include_threads=True):
    st = get_state()
    session_index = build_session_index()
    session_metrics = build_session_metrics(session_index)
    history_index = build_history_index()
    manual_map = load_unmapped_mapping()

    conv_dirs = [d for d in list_dirs(CHAT_DIR) if d.name.startswith("conversations-v3-")]
    all_local_thread_ids = set()
    conv_index = {}
    thread_local_paths = {}
    thread_local_mtime = {}
    for d in conv_dirs:
        ids = list_thread_ids_from_conv_dir(d)
        conv_index[d.name] = len(ids)
        for tid in ids:
            all_local_thread_ids.add(tid)
            p = d / f"{tid}.data"
            thread_local_paths.setdefault(tid, []).append(str(p))
            try:
                mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()
                if tid not in thread_local_mtime or mtime > thread_local_mtime[tid]:
                    thread_local_mtime[tid] = mtime
            except Exception:
                pass

    project_dirs = [d for d in list_dirs(CHAT_DIR) if d.name.startswith("project-g-p-")]
    project_refs = {}
    project_summaries = []
    for pd in project_dirs:
        thread_count = 0
        cwd_count = {}
        for cd in pd.glob("conversations-v3-*"):
            ids = list_thread_ids_from_conv_dir(cd)
            thread_count += len(ids)
            for tid in ids:
                project_refs.setdefault(tid, set()).add(pd.name)
                cwd = session_index.get(tid, {}).get("cwd", "")
                if cwd:
                    cwd_count[cwd] = cwd_count.get(cwd, 0) + 1

        top_cwds = sorted(cwd_count.items(), key=lambda x: (-x[1], x[0]))[:3]
        project_summaries.append(
            {
                "project_bucket": pd.name,
                "thread_count": thread_count,
                "path": str(pd),
                "likely_workspaces": [{"cwd": c, "count": n} for c, n in top_cwds],
            }
        )

    all_ids = set(st["titles"].keys())
    all_ids.update(st["order"])
    all_ids.update(st["pinned"])
    all_ids.update(all_local_thread_ids)
    all_ids.update(session_index.keys())

    order_index = {tid: i for i, tid in enumerate(st["order"])}
    threads = []
    pinned_set = set(st["pinned"])

    for tid in all_ids:
        meta = session_index.get(tid, {})
        sm = session_metrics.get(tid, {})
        state_title = st["titles"].get(tid, "")
        history_title = history_index.get(tid, "")
        inferred_time = meta.get("timestamp") or thread_local_mtime.get(tid) or decode_uuidv7_time(tid)
        activity_time = meta.get("timestamp") or inferred_time or ""
        activity_status = "unknown"
        activity_age_min = None
        if activity_time:
            try:
                ts = str(activity_time)
                if ts.endswith("Z"):
                    ts = ts[:-1] + "+00:00"
                dt = datetime.fromisoformat(ts)
                age_sec = max(0.0, time.time() - dt.timestamp())
                activity_age_min = int(age_sec // 60)
                if age_sec <= 300:
                    activity_status = "running"
                elif age_sec <= 3600:
                    activity_status = "warm"
                elif age_sec <= 86400:
                    activity_status = "recent"
                else:
                    activity_status = "stale"
            except Exception:
                activity_status = "unknown"

        if state_title:
            title = state_title
            title_source = "global-state"
        elif meta.get("first_user_text"):
            title = f"{meta.get('first_user_text')} (세션로그 복원)"
            title_source = "session-log"
        elif history_title:
            title = f"{history_title} (history 복원)"
            title_source = "history-log"
        elif tid in manual_map:
            title = manual_map[tid]
            title_source = "manual-map"
        elif tid in all_local_thread_ids:
            buckets = sorted(list(project_refs.get(tid, set())))
            bucket_hint = buckets[0] if buckets else "unlinked"
            when = inferred_time[:19].replace("T", " ") if inferred_time else "time-unknown"
            title = f"[추정] local-cache thread ({bucket_hint}, {when})"
            title_source = "local-cache-inferred"
        else:
            when = inferred_time[:19].replace("T", " ") if inferred_time else "time-unknown"
            title = f"[복구매핑] meta-only {tid[:8]} ({when})"
            title_source = "meta-fallback"

        threads.append(
            {
                "id": tid,
                "title": title,
                "title_source": title_source,
                "pinned": tid in pinned_set,
                "in_order": tid in order_index,
                "order_index": order_index.get(tid, 999999),
                "has_local_data": tid in all_local_thread_ids,
                "project_buckets": sorted(list(project_refs.get(tid, set()))),
                "cwd": meta.get("cwd", ""),
                "timestamp": meta.get("timestamp", ""),
                "has_session_log": tid in session_index,
                "session_source": meta.get("source", ""),
                "history_text": history_title,
                "local_cache_paths": thread_local_paths.get(tid, []),
                "inferred_time": inferred_time,
                "session_line_count": sm.get("line_count", 0),
                "session_tool_calls": sm.get("tool_calls", 0),
                "session_bytes": sm.get("bytes", 0),
                "last_activity": activity_time,
                "activity_status": activity_status,
                "activity_age_min": activity_age_min,
            }
        )

    # Context pressure scoring per thread
    for t in threads:
        cache_bytes = 0
        for p in t.get("local_cache_paths", []):
            try:
                cache_bytes += pathlib.Path(p).stat().st_size
            except Exception:
                pass
        line_count = t.get("session_line_count", 0)
        tool_calls = t.get("session_tool_calls", 0)
        session_mb = (t.get("session_bytes", 0) / (1024 * 1024))
        cache_mb = (cache_bytes / (1024 * 1024))
        score = (
            min(30.0, (line_count / 120.0) * 30.0)
            + min(30.0, (tool_calls / 25.0) * 30.0)
            + min(20.0, (session_mb / 2.0) * 20.0)
            + min(20.0, (cache_mb / 6.0) * 20.0)
        )
        t["cache_bytes"] = cache_bytes
        t["context_score"] = int(round(min(100.0, score)))

    # Title duplication map for risk heuristics
    norm_title_counts = {}
    for t in threads:
        k = (t.get("title", "") or "").strip().lower()
        if not k:
            continue
        norm_title_counts[k] = norm_title_counts.get(k, 0) + 1

    # Ops risk scoring per thread
    now = datetime.now(timezone.utc)
    for t in threads:
        tags = []
        risk = 0
        source = t.get("title_source", "")
        context_score = t.get("context_score", 0)
        is_internal = source != "global-state"
        if is_internal:
            tags.append("internal")
            risk += 18
        if context_score >= 85:
            tags.append("ctx-critical")
            risk += 40
        elif context_score >= 70:
            tags.append("ctx-high")
            risk += 28
        elif context_score >= 50:
            tags.append("ctx-medium")
            risk += 12

        inferred = t.get("inferred_time") or t.get("timestamp")
        age_days = None
        if inferred:
            try:
                dt = datetime.fromisoformat(str(inferred).replace("Z", "+00:00"))
                age_days = (now - dt).days
            except Exception:
                age_days = None
        t["age_days"] = age_days
        if age_days is not None and age_days >= 30:
            tags.append("stale")
            risk += 10 if is_internal else 4

        if is_internal and t.get("has_local_data") and not t.get("in_order") and not t.get("pinned"):
            tags.append("orphan-candidate")
            risk += 24

        if not (t.get("cwd") or "").strip():
            tags.append("no-cwd")
            risk += 8

        norm_title = (t.get("title", "") or "").strip().lower()
        if norm_title and norm_title_counts.get(norm_title, 0) >= 3:
            tags.append("duplicate-title")
            risk += 6

        risk = int(min(100, max(0, risk)))
        if risk >= 70:
            level = "high"
        elif risk >= 40:
            level = "medium"
        else:
            level = "low"
        t["risk_score"] = risk
        t["risk_level"] = level
        t["risk_tags"] = tags

    # GUI visibility/connection heuristics
    active_roots = [str(x).rstrip("/") for x in (st.get("active", []) or []) if str(x).strip()]
    for t in threads:
        is_gui = (t.get("title_source") == "global-state")
        cwd = (t.get("cwd") or "").strip()
        has_runtime_link = bool(t.get("has_session_log") or t.get("has_local_data"))
        matches_active_workspace = False
        if cwd and active_roots:
            for root in active_roots:
                if cwd == root or cwd.startswith(root + "/"):
                    matches_active_workspace = True
                    break
        t["is_gui_thread"] = is_gui
        t["gui_has_runtime_link"] = has_runtime_link
        t["matches_active_workspace"] = matches_active_workspace
        t["gui_hidden_candidate"] = bool(
            is_gui and (not has_runtime_link or (cwd and not matches_active_workspace))
        )

    threads.sort(key=lambda x: (x["order_index"], x["title"].lower(), x["id"]))

    # Bottleneck aggregation by working directory
    ctx_groups = {}
    for t in threads:
        key = t.get("cwd") or "(unknown)"
        g = ctx_groups.setdefault(
            key,
            {
                "cwd": key,
                "thread_count": 0,
                "total_score": 0,
                "max_score": 0,
                "total_tool_calls": 0,
                "total_lines": 0,
                "high_risk_count": 0,
                "internal_count": 0,
                "orphan_count": 0,
            },
        )
        g["thread_count"] += 1
        g["total_score"] += t.get("context_score", 0)
        g["max_score"] = max(g["max_score"], t.get("context_score", 0))
        g["total_tool_calls"] += t.get("session_tool_calls", 0)
        g["total_lines"] += t.get("session_line_count", 0)
        if t.get("risk_level") == "high":
            g["high_risk_count"] += 1
        if t.get("title_source") != "global-state":
            g["internal_count"] += 1
        if "orphan-candidate" in (t.get("risk_tags") or []):
            g["orphan_count"] += 1
    context_bottlenecks = []
    for g in ctx_groups.values():
        avg = g["total_score"] / max(1, g["thread_count"])
        context_bottlenecks.append(
            {
                "cwd": g["cwd"],
                "thread_count": g["thread_count"],
                "avg_score": round(avg, 1),
                "max_score": g["max_score"],
                "total_tool_calls": g["total_tool_calls"],
                "total_lines": g["total_lines"],
                "high_risk_count": g["high_risk_count"],
                "internal_count": g["internal_count"],
                "orphan_count": g["orphan_count"],
            }
        )
    context_bottlenecks.sort(key=lambda x: (-x["avg_score"], -x["thread_count"], x["cwd"]))

    workspace_rows = []
    for path in st["workspaces"]:
        p = pathlib.Path(path)
        workspace_rows.append(
            {
                "path": path,
                "exists": p.exists(),
                "active": path in st["active"],
                "label": st["labels"].get(path, ""),
            }
        )

    labs_projects = []
    if LABS_DIR.exists():
        for p in sorted(list_dirs(LABS_DIR), key=lambda x: x.name.lower()):
            labs_projects.append(
                {
                    "name": p.name,
                    "path": str(p),
                    "is_git": (p / ".git").exists(),
                }
            )

    risk_summary = {
        "high": sum(1 for t in threads if t.get("risk_level") == "high"),
        "medium": sum(1 for t in threads if t.get("risk_level") == "medium"),
        "low": sum(1 for t in threads if t.get("risk_level") == "low"),
        "internal_total": sum(1 for t in threads if t.get("title_source") != "global-state"),
        "orphan_candidates": sum(1 for t in threads if "orphan-candidate" in (t.get("risk_tags") or [])),
        "stale_total": sum(1 for t in threads if "stale" in (t.get("risk_tags") or [])),
        "ctx_high_total": sum(1 for t in threads if t.get("context_score", 0) >= 70),
    }

    recommendations = []
    if risk_summary["orphan_candidates"] > 0:
        recommendations.append(
            {
                "id": "cleanup_orphans",
                "label": "고아 후보 정리",
                "description": f"orphan-candidate 태그 스레드 {risk_summary['orphan_candidates']}개를 미리보기 후 정리하세요.",
                "filters": {"scope": "internal", "minRisk": 40},
            }
        )
    if risk_summary["ctx_high_total"] > 0:
        recommendations.append(
            {
                "id": "reduce_context_pressure",
                "label": "고컨텍스트 병목 완화",
                "description": f"context score 70 이상 {risk_summary['ctx_high_total']}개. 분할/요약으로 컨텍스트 압력을 낮추세요.",
                "filters": {"scope": "all", "minCtx": 70, "sort": "ctx_desc"},
            }
        )
    if risk_summary["internal_total"] > 0:
        recommendations.append(
            {
                "id": "internal_artifacts_review",
                "label": "내부 아티팩트 점검",
                "description": f"UI 비노출 내부 스레드 {risk_summary['internal_total']}개를 검토해 보존/삭제를 분리하세요.",
                "filters": {"scope": "internal", "sort": "risk_desc"},
            }
        )

    gui_threads = [t for t in threads if t.get("is_gui_thread")]
    sync_status = {
        "share_mode": "partial",
        "gui_sidebar_threads": len(gui_threads),
        "terminal_session_threads": sum(1 for t in threads if t.get("has_session_log")),
        "linked_gui_terminal_threads": sum(
            1
            for t in threads
            if t.get("is_gui_thread") and t.get("has_session_log")
        ),
        "internal_only_threads": sum(1 for t in threads if not t.get("is_gui_thread")),
        "gui_meta_only_threads": sum(
            1 for t in gui_threads if (not t.get("has_session_log")) and (not t.get("has_local_data"))
        ),
        "gui_unknown_cwd_threads": sum(1 for t in gui_threads if not (t.get("cwd") or "").strip()),
        "gui_active_workspace_matched": sum(1 for t in gui_threads if t.get("matches_active_workspace")),
        "gui_hidden_candidate_threads": sum(1 for t in gui_threads if t.get("gui_hidden_candidate")),
        "note": "GUI 사이드바 스레드와 터미널 세션 로그는 저장 구조가 달라 완전 동기화가 아니라 부분 연결입니다.",
    }

    result = {
        "summary": {
            "thread_total": len(threads),
            "thread_with_local_data": sum(1 for t in threads if t["has_local_data"]),
            "thread_pinned": sum(1 for t in threads if t["pinned"]),
            "thread_with_session_log": sum(1 for t in threads if t["has_session_log"]),
            "workspace_total": len(workspace_rows),
            "workspace_active": sum(1 for w in workspace_rows if w["active"]),
            "labs_project_total": len(labs_projects),
            "project_bucket_total": len(project_summaries),
            "high_context_threads": sum(1 for t in threads if t.get("context_score", 0) >= 70),
            "high_risk_threads": risk_summary["high"],
        },
        "workspaces": workspace_rows,
        "project_buckets": sorted(project_summaries, key=lambda x: x["project_bucket"]),
        "labs_projects": labs_projects,
        "paths": {
            "codex_global_state": str(CODEX_DIR / ".codex-global-state.json"),
            "chat_root": str(CHAT_DIR),
            "labs_root": str(LABS_DIR),
            "codex_sessions_root": str(CODEX_DIR / "sessions"),
            "codex_archived_sessions_root": str(CODEX_DIR / "archived_sessions"),
        },
        "conv_index": conv_index,
        "context_bottlenecks": context_bottlenecks[:40],
        "risk_summary": risk_summary,
        "recommendations": recommendations,
        "sync_status": sync_status,
    }
    if include_threads:
        result["threads"] = threads
    return result


def get_overview_cached(include_threads=True, ttl_sec=8.0, force_refresh=False):
    now = time.time()
    if (
        not force_refresh
        and OVERVIEW_CACHE["data"] is not None
        and (now - OVERVIEW_CACHE["ts"] < ttl_sec)
    ):
        data = OVERVIEW_CACHE["data"]
    else:
        data = collect_overview(include_threads=True)
        OVERVIEW_CACHE["data"] = data
        OVERVIEW_CACHE["ts"] = now
    if include_threads:
        return data
    out = dict(data)
    out.pop("threads", None)
    return out


def iso_utc(ts):
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return ""


def scan_path_stats(path, recursive=True, file_pattern="*"):
    p = pathlib.Path(path)
    out = {
        "path": str(p),
        "exists": p.exists(),
        "file_count": 0,
        "dir_count": 0,
        "total_bytes": 0,
        "latest_mtime": "",
    }
    if not out["exists"]:
        return out
    if p.is_file():
        try:
            st = p.stat()
            out["file_count"] = 1
            out["total_bytes"] = int(st.st_size)
            out["latest_mtime"] = iso_utc(st.st_mtime)
        except Exception:
            pass
        return out

    latest_ts = 0.0
    try:
        iterator = p.rglob(file_pattern) if recursive else p.glob(file_pattern)
        for item in iterator:
            try:
                if item.is_dir():
                    out["dir_count"] += 1
                    continue
                if not item.is_file():
                    continue
                st = item.stat()
                out["file_count"] += 1
                out["total_bytes"] += int(st.st_size)
                if st.st_mtime > latest_ts:
                    latest_ts = st.st_mtime
            except Exception:
                continue
    except Exception:
        return out
    out["latest_mtime"] = iso_utc(latest_ts) if latest_ts else ""
    return out


def quick_file_count(path, pattern="*", recursive=False):
    p = pathlib.Path(path)
    if not p.exists() or not p.is_dir():
        return 0
    try:
        iterator = p.rglob(pattern) if recursive else p.glob(pattern)
        return sum(1 for x in iterator if x.is_file())
    except Exception:
        return 0


def read_head_lines(path, max_lines=5, max_chars=260):
    lines = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                txt = raw.rstrip("\r\n")
                txt = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", txt)
                if len(txt) > max_chars:
                    txt = txt[: max_chars - 1] + "…"
                lines.append(txt)
                if len(lines) >= max_lines:
                    break
    except Exception:
        return []
    return lines


def get_data_source_inventory():
    codex_root = scan_path_stats(CODEX_DIR, recursive=True)
    chat_root = scan_path_stats(CHAT_DIR, recursive=True)
    sessions = scan_path_stats(CODEX_DIR / "sessions", recursive=True, file_pattern="*.jsonl")
    archived = scan_path_stats(CODEX_DIR / "archived_sessions", recursive=True, file_pattern="*.jsonl")

    history_path = CODEX_DIR / "history.jsonl"
    global_state_path = CODEX_DIR / ".codex-global-state.json"
    history = scan_path_stats(history_path, recursive=False)
    global_state = scan_path_stats(global_state_path, recursive=False)

    return {
        "generated_at": iso_utc(time.time()),
        "sources": {
            "codex_root": codex_root,
            "chat_root": chat_root,
            "sessions": sessions,
            "archived_sessions": archived,
            "history": {
                "path": str(history_path),
                "present": history_path.exists(),
                "size_bytes": history.get("total_bytes", 0),
                "mtime": history.get("latest_mtime", ""),
            },
            "global_state": {
                "path": str(global_state_path),
                "present": global_state_path.exists(),
                "size_bytes": global_state.get("total_bytes", 0),
                "mtime": global_state.get("latest_mtime", ""),
            },
        },
    }


def get_runtime_health():
    now = time.time()
    cache_ts = float(OVERVIEW_CACHE.get("ts") or 0.0)
    cache_data = OVERVIEW_CACHE.get("data")
    cache_warm = cache_data is not None
    cache_age = (now - cache_ts) if cache_ts > 0 else None
    thread_total = None
    if isinstance(cache_data, dict):
        summary = cache_data.get("summary", {})
        if isinstance(summary, dict):
            thread_total = summary.get("thread_total")

    roots = {
        "codex_root": CODEX_DIR.exists(),
        "chat_root": CHAT_DIR.exists(),
        "sessions_root": (CODEX_DIR / "sessions").exists(),
        "archived_sessions_root": (CODEX_DIR / "archived_sessions").exists(),
        "history_file": (CODEX_DIR / "history.jsonl").exists(),
        "global_state_file": (CODEX_DIR / ".codex-global-state.json").exists(),
    }
    quick_counts = {
        "chat_conversation_dirs": len([d for d in list_dirs(CHAT_DIR) if d.name.startswith("conversations-v3-")]),
        "chat_project_dirs": len([d for d in list_dirs(CHAT_DIR) if d.name.startswith("project-g-p-")]),
        "sessions_jsonl_files": quick_file_count(CODEX_DIR / "sessions", "*.jsonl", recursive=True),
        "archived_sessions_jsonl_files": quick_file_count(CODEX_DIR / "archived_sessions", "*.jsonl", recursive=True),
        "codex_top_level_files": quick_file_count(CODEX_DIR, "*"),
    }
    uptime = max(0.0, now - SERVER_START_TS)
    hours = int(uptime // 3600)
    minutes = int((uptime % 3600) // 60)
    seconds = int(uptime % 60)
    uptime_human = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return {
        "generated_at": iso_utc(now),
        "uptime_sec": round(uptime, 3),
        "uptime_human": uptime_human,
        "uptime_min": round(uptime / 60.0, 2),
        "cache_warm": cache_warm,
        "cache_age_sec": round(cache_age, 3) if cache_age is not None else None,
        "thread_total": thread_total,
        "roots": roots,
        "quick_counts": quick_counts,
    }


def get_compare_apps_status():
    codexia_app = pathlib.Path("/Applications/Codexia.app")
    codexia_running = bool(_run_cmd_text(["pgrep", "-fl", "Codexia.app/Contents/MacOS/codexia"], timeout=4).strip())

    ccmanager_bin = shutil.which("ccmanager")
    if not ccmanager_bin:
        fallback = HOME / ".npm-global" / "bin" / "ccmanager"
        if fallback.exists():
            ccmanager_bin = str(fallback)
    ccmanager_running = bool(_run_cmd_text(["pgrep", "-fl", "ccmanager"], timeout=4).strip())
    tmux_ls = _run_cmd_text(["tmux", "ls"], timeout=4)
    ccmanager_tmux = any(line.startswith("ccmanager-app:") for line in (tmux_ls or "").splitlines())

    overview_listener = _run_cmd_text(["lsof", "-nP", "-iTCP:8787", "-sTCP:LISTEN"], timeout=4)
    overview_running = bool(overview_listener.strip())

    apps = [
        {
            "id": "codexia",
            "name": "Codexia",
            "installed": codexia_app.exists(),
            "running": codexia_running,
            "location": str(codexia_app),
            "start_cmd": "open -a Codexia",
            "watch_cmd": "",
            "notes": "Codex 앱 대체 GUI 클라이언트",
        },
        {
            "id": "ccmanager",
            "name": "CCManager",
            "installed": bool(ccmanager_bin),
            "running": ccmanager_running,
            "location": ccmanager_bin or "(not found)",
            "start_cmd": "export PATH=/user-root/developer/.npm-global/bin:$PATH; ccmanager",
            "watch_cmd": "tmux attach -t ccmanager-app",
            "notes": "tmux 기반 워크트리/세션 매니저",
            "tmux_session_ready": ccmanager_tmux,
        },
        {
            "id": "codex-overview",
            "name": "Codex Mission Control",
            "installed": OVERVIEW_DIR.exists(),
            "running": overview_running,
            "location": str(OVERVIEW_DIR / "server.py"),
            "start_cmd": "tmux new-session -d -s codex-overview-server \"cd /user-root/developer/workspace-root/codex-overview && python3 server.py\"",
            "watch_cmd": "tmux attach -t codex-overview-server",
            "notes": "현재 로컬 관제 대시보드",
        },
    ]
    summary = {
        "total": len(apps),
        "installed_total": sum(1 for a in apps if a.get("installed")),
        "running_total": sum(1 for a in apps if a.get("running")),
    }
    return {
        "generated_at": iso_utc(time.time()),
        "summary": summary,
        "apps": apps,
    }


def default_roadmap_state():
    return [
        {
            "week_id": "W1",
            "title": "기반 관측/안전장치",
            "status": "done",
            "progress": 100,
            "focus": "스레드/리스크 관측, 삭제 영향 분석, 안전 정리 기반 완성",
            "done": [
                "로컬 스레드/세션/버킷 통합 인벤토리",
                "리스크/병목 점수화 + 필터/정렬",
                "삭제 영향 분석 + 포렌식 패널",
            ],
            "next": [
                "체크인 로그 자동화",
            ],
        },
        {
            "week_id": "W2",
            "title": "스레드 UX 운영화",
            "status": "in_progress",
            "progress": 91,
            "focus": "오늘 처리 큐, 핀/아카이브/리줌, 토큰 기반 2단계 정리 UX 고도화",
            "done": [
                "오늘 처리 큐(HighRisk/Ctx/Orphan)",
                "Pin/Unpin/Local Archive/Resume 복사",
                "정리 실행 토큰(DEL-*) 검증",
                "오늘 큐 -> 정리 미리보기 원클릭",
                "대량 스레드 렌더 최적화(청크 렌더/이벤트 위임)",
            ],
            "next": [
                "실사용 피드백 기반 UX 미세조정",
            ],
        },
        {
            "week_id": "W3",
            "title": "감독 에이전트/운영 자동화",
            "status": "in_progress",
            "progress": 62,
            "focus": "루프 감시/경보를 최소 운영형으로 유지",
            "done": [
                "AGI Loop/Observatory 패널 기본 구성",
                "체크인 자동 스케줄(30분 토글)",
                "Alert Hooks 기준치/쿨다운/이벤트로그/즉시평가 API",
            ],
            "next": [
                "임계값만 주기 점검(최소 유지)",
            ],
        },
        {
            "week_id": "W4",
            "title": "제품화/배포 품질",
            "status": "in_progress",
            "progress": 36,
            "focus": "복구/운영 안정성 중심 최소 제품화",
            "done": [
                "비교앱(Codexia/CCManager) 상태 보드",
                "Recovery Drill 패널/백업세트 점검/복구 프리뷰 스크립트",
            ],
            "next": [
                "운영 가이드/런북",
                "회복 시나리오 테스트",
            ],
        },
    ]


def load_roadmap_state():
    data = safe_read_json(ROADMAP_STATE_FILE)
    if isinstance(data, dict) and isinstance(data.get("weeks"), list):
        return data.get("weeks", [])
    if isinstance(data, list):
        return data
    weeks = default_roadmap_state()
    ROADMAP_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    ROADMAP_STATE_FILE.write_text(json.dumps({"weeks": weeks}, ensure_ascii=False, indent=2), encoding="utf-8")
    return weeks


def read_roadmap_checkins(limit=80):
    out = []
    p = ROADMAP_LOG_FILE
    if not p.exists() or not p.is_file():
        return out
    try:
        with p.open("r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                try:
                    out.append(json.loads(s))
                except Exception:
                    continue
    except Exception:
        return []
    if limit > 0:
        return out[-limit:]
    return out


def append_roadmap_checkin(note="", actor="codex"):
    overview = get_overview_cached(include_threads=False)
    summary = overview.get("summary", {}) if isinstance(overview, dict) else {}
    risk = overview.get("risk_summary", {}) if isinstance(overview, dict) else {}
    runtime = get_runtime_health()
    apps = get_compare_apps_status()
    app_summary = apps.get("summary", {}) if isinstance(apps, dict) else {}
    high_risk = int(summary.get("high_risk_threads") or 0)
    ctx_high = int(risk.get("ctx_high_total") or 0)
    orphan = int(risk.get("orphan_candidates") or 0)
    lightweight_health_score = max(0, 100 - min(75, (high_risk * 4) + (ctx_high // 4) + (orphan // 3)))
    entry = {
        "ts": iso_utc(time.time()),
        "actor": str(actor or "codex"),
        "note": clean_title_text(note or "", 280),
        "snapshot": {
            "threads": int(summary.get("thread_total") or 0),
            "high_risk": high_risk,
            "ctx_high": ctx_high,
            "orphan": orphan,
            "health_score": lightweight_health_score,
            "running_apps": int(app_summary.get("running_total") or 0),
            "uptime_min": float(runtime.get("uptime_min") or 0.0),
        },
    }
    ROADMAP_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with ROADMAP_LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def get_roadmap_status():
    weeks = load_roadmap_state()
    checkins = read_roadmap_checkins(limit=80)
    status_counts = {"done": 0, "in_progress": 0, "planned": 0, "blocked": 0}
    for w in weeks:
        st = str(w.get("status") or "planned")
        if st not in status_counts:
            st = "planned"
        status_counts[st] += 1
    remaining = [w.get("week_id", "") for w in weeks if str(w.get("status") or "") != "done"]
    return {
        "generated_at": iso_utc(time.time()),
        "status_counts": status_counts,
        "remaining_tracks": remaining,
        "weeks": weeks,
        "checkins": checkins,
    }


def default_alert_hooks_config():
    return {
        "desktop_notify": False,
        "rules": [
            {
                "id": "high_risk_threads",
                "label": "High Risk Threads",
                "metric": "high_risk_threads",
                "op": "ge",
                "threshold": 8,
                "severity": "high",
                "cooldown_min": 20,
                "enabled": True,
                "description": "High risk 스레드가 임계값 이상이면 경보",
            },
            {
                "id": "orphan_candidates",
                "label": "Orphan Candidates",
                "metric": "orphan_candidates",
                "op": "ge",
                "threshold": 50,
                "severity": "medium",
                "cooldown_min": 30,
                "enabled": True,
                "description": "고아 후보가 과도하게 늘어나면 경보",
            },
            {
                "id": "health_score_low",
                "label": "Health Score Low",
                "metric": "health_score",
                "op": "le",
                "threshold": 70,
                "severity": "high",
                "cooldown_min": 15,
                "enabled": True,
                "description": "시스템 헬스 점수가 임계치 이하로 하락",
            },
            {
                "id": "loop_attention",
                "label": "Loop Attention",
                "metric": "loop_attention_total",
                "op": "ge",
                "threshold": 1,
                "severity": "medium",
                "cooldown_min": 15,
                "enabled": True,
                "description": "주의가 필요한 감독 루프 존재",
            },
            {
                "id": "mcp_duplicate_groups",
                "label": "MCP Duplicate Groups",
                "metric": "mcp_duplicate_groups",
                "op": "ge",
                "threshold": 1,
                "severity": "medium",
                "cooldown_min": 30,
                "enabled": True,
                "description": "중복 실행 MCP 그룹 감지",
            },
        ],
    }


def load_alert_hooks_config():
    data = safe_read_json(ALERT_RULES_FILE)
    if isinstance(data, dict) and isinstance(data.get("rules"), list):
        return data
    cfg = default_alert_hooks_config()
    ALERT_RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
    ALERT_RULES_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return cfg


def save_alert_hooks_config(cfg):
    ALERT_RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
    ALERT_RULES_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def load_alert_hooks_state():
    data = safe_read_json(ALERT_STATE_FILE)
    if isinstance(data, dict):
        return data
    return {"last_fired_at": {}, "last_values": {}}


def save_alert_hooks_state(state):
    ALERT_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    ALERT_STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def read_alert_events(limit=120):
    out = []
    p = ALERT_EVENTS_FILE
    if not p.exists() or not p.is_file():
        return out
    try:
        with p.open("r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                try:
                    out.append(json.loads(s))
                except Exception:
                    continue
    except Exception:
        return []
    if limit > 0:
        return out[-limit:]
    return out


def append_alert_event(event):
    ALERT_EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with ALERT_EVENTS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def _parse_iso_dt(text):
    s = str(text or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _rule_compare(op, value, threshold):
    try:
        v = float(value)
        t = float(threshold)
    except Exception:
        return False
    opx = str(op or "ge").lower().strip()
    if opx == "ge":
        return v >= t
    if opx == "gt":
        return v > t
    if opx == "le":
        return v <= t
    if opx == "lt":
        return v < t
    if opx == "eq":
        return v == t
    return False


def _notify_desktop(title, message):
    # Best-effort macOS notification; failures should never break request flow.
    t = str(title or "Codex Alert").replace('"', "'")
    m = str(message or "").replace('"', "'")
    try:
        subprocess.run(
            ["osascript", "-e", f'display notification "{m}" with title "{t}"'],
            capture_output=True,
            text=True,
            timeout=4,
        )
    except Exception:
        pass


def collect_alert_hook_metrics(force_refresh=False):
    overview = get_overview_cached(include_threads=False, force_refresh=force_refresh)
    health = get_health_check(force_refresh=force_refresh)
    observ = get_codex_observatory(force_refresh=force_refresh)
    summary = overview.get("summary", {}) if isinstance(overview, dict) else {}
    risk = overview.get("risk_summary", {}) if isinstance(overview, dict) else {}
    health_summary = health.get("summary", {}) if isinstance(health, dict) else {}
    obs_summary = observ.get("summary", {}) if isinstance(observ, dict) else {}
    mcp_groups = observ.get("process_groups", []) if isinstance(observ, dict) else []
    heavy_mcp = [
        g
        for g in mcp_groups
        if isinstance(g, dict)
        and str(g.get("signature", "")).startswith("omx-mcp:")
        and int(g.get("count", 0) or 0) >= 4
    ]
    class_counts = obs_summary.get("class_counts", {}) if isinstance(obs_summary, dict) else {}
    return {
        "thread_total": int(summary.get("thread_total") or 0),
        "high_risk_threads": int(summary.get("high_risk_threads") or 0),
        "ctx_high_total": int(risk.get("ctx_high_total") or 0),
        "orphan_candidates": int(risk.get("orphan_candidates") or 0),
        "health_score": int(health.get("score") or 0),
        "health_fail": int(health_summary.get("fail") or 0),
        "health_warn": int(health_summary.get("warn") or 0),
        "loop_attention_total": int(obs_summary.get("loop_attention_total") or 0),
        "process_total": int(obs_summary.get("process_total") or 0),
        "mcp_duplicate_groups": len(heavy_mcp),
        "codex_main_missing": 1 if int(class_counts.get("codex-desktop-main", 0) or 0) == 0 else 0,
    }


def evaluate_alert_hooks(force_refresh=False, emit_events=True):
    cfg = load_alert_hooks_config()
    state = load_alert_hooks_state()
    if not isinstance(state, dict):
        state = {"last_fired_at": {}, "last_values": {}}
    last_fired = state.get("last_fired_at", {})
    if not isinstance(last_fired, dict):
        last_fired = {}
    last_values = state.get("last_values", {})
    if not isinstance(last_values, dict):
        last_values = {}

    metrics = collect_alert_hook_metrics(force_refresh=force_refresh)
    rules = cfg.get("rules", []) if isinstance(cfg, dict) else []
    now = datetime.now(timezone.utc)
    active_alerts = []
    emitted = []
    state_changed = False
    desktop_notify = bool(cfg.get("desktop_notify", False)) if isinstance(cfg, dict) else False

    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if not bool(rule.get("enabled", True)):
            continue
        rid = str(rule.get("id", "")).strip()
        metric_key = str(rule.get("metric", "")).strip()
        if not rid or not metric_key:
            continue
        value = metrics.get(metric_key, 0)
        threshold = rule.get("threshold", 0)
        op = rule.get("op", "ge")
        triggered = _rule_compare(op, value, threshold)
        last_values[rid] = value
        if not triggered:
            continue

        alert_obj = {
            "rule_id": rid,
            "label": rule.get("label", rid),
            "severity": rule.get("severity", "medium"),
            "metric": metric_key,
            "op": op,
            "value": value,
            "threshold": threshold,
            "description": rule.get("description", ""),
        }
        active_alerts.append(alert_obj)

        if not emit_events:
            continue
        cooldown_min = max(1, int(rule.get("cooldown_min", 15) or 15))
        prev = _parse_iso_dt(last_fired.get(rid, ""))
        in_cooldown = False
        if prev is not None:
            in_cooldown = (now - prev).total_seconds() < (cooldown_min * 60)
        if in_cooldown:
            continue

        event = {
            "ts": iso_utc(time.time()),
            "rule_id": rid,
            "label": rule.get("label", rid),
            "severity": rule.get("severity", "medium"),
            "metric": metric_key,
            "op": op,
            "value": value,
            "threshold": threshold,
            "message": f"{rule.get('label', rid)}: {value} {op} {threshold}",
        }
        emitted.append(event)
        append_alert_event(event)
        last_fired[rid] = event["ts"]
        state_changed = True
        if desktop_notify:
            _notify_desktop("Codex Alert", event["message"])

    if last_values != state.get("last_values", {}):
        state_changed = True
    state["last_fired_at"] = last_fired
    state["last_values"] = last_values
    if state_changed:
        save_alert_hooks_state(state)

    return {
        "generated_at": iso_utc(time.time()),
        "config": cfg,
        "metrics": metrics,
        "active_alerts": active_alerts,
        "emitted_events": emitted,
        "recent_events": read_alert_events(limit=120),
        "state": {
            "last_fired_at": last_fired,
            "last_values": last_values,
        },
    }


def update_alert_hooks_config(desktop_notify=None):
    cfg = load_alert_hooks_config()
    if desktop_notify is not None:
        cfg["desktop_notify"] = bool(desktop_notify)
    save_alert_hooks_config(cfg)
    return cfg


def update_alert_rule(rule_id, enabled=None, threshold=None, cooldown_min=None):
    rid = str(rule_id or "").strip()
    if not rid:
        return {"ok": False, "error": "rule_id is required"}
    cfg = load_alert_hooks_config()
    rules = cfg.get("rules", [])
    updated = False
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if str(rule.get("id", "")).strip() != rid:
            continue
        if enabled is not None:
            rule["enabled"] = bool(enabled)
            updated = True
        if threshold is not None:
            try:
                rule["threshold"] = float(threshold)
                updated = True
            except Exception:
                pass
        if cooldown_min is not None:
            try:
                cm = int(cooldown_min)
                if cm > 0:
                    rule["cooldown_min"] = cm
                    updated = True
            except Exception:
                pass
        break
    if not updated:
        return {"ok": False, "error": "rule not found or no valid changes"}
    cfg["rules"] = rules
    save_alert_hooks_config(cfg)
    return {"ok": True, "config": cfg}


def default_recovery_checklist():
    return [
        {"id": "backup_exists", "label": "최신 백업 세트 존재 확인", "done": False},
        {"id": "dry_run_ok", "label": "정리 dry-run 결과 확인", "done": False},
        {"id": "token_verified", "label": "실행 토큰 검증", "done": False},
        {"id": "drill_run", "label": "복구 드릴 실행/검토", "done": False},
        {"id": "post_verify", "label": "실행 후 상태 검증", "done": False},
    ]


def load_recovery_checklist():
    data = safe_read_json(RECOVERY_CHECKLIST_FILE)
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return data.get("items", [])
    items = default_recovery_checklist()
    RECOVERY_CHECKLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    RECOVERY_CHECKLIST_FILE.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    return items


def save_recovery_checklist(items):
    RECOVERY_CHECKLIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    RECOVERY_CHECKLIST_FILE.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")


def update_recovery_checklist_item(item_id, done):
    iid = str(item_id or "").strip()
    if not iid:
        return {"ok": False, "error": "item_id is required"}
    items = load_recovery_checklist()
    changed = False
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("id", "")).strip() != iid:
            continue
        item["done"] = bool(done)
        changed = True
        break
    if not changed:
        return {"ok": False, "error": "checklist item not found"}
    save_recovery_checklist(items)
    return {"ok": True, "items": items}


def _walk_files_stats(root: pathlib.Path, sample_limit=120):
    file_count = 0
    total_bytes = 0
    latest_mtime = 0.0
    samples = []
    if not root.exists() or not root.is_dir():
        return {"file_count": 0, "total_bytes": 0, "latest_mtime": "", "sample_files": []}
    for base, _, files in os.walk(root):
        for fn in files:
            p = pathlib.Path(base) / fn
            try:
                st = p.stat()
            except Exception:
                continue
            file_count += 1
            total_bytes += int(st.st_size)
            if st.st_mtime > latest_mtime:
                latest_mtime = st.st_mtime
            if len(samples) < sample_limit:
                samples.append(str(p))
    return {
        "file_count": file_count,
        "total_bytes": total_bytes,
        "latest_mtime": iso_utc(latest_mtime) if latest_mtime else "",
        "sample_files": samples,
    }


def scan_backup_sets(limit=20):
    root = BACKUP_ROOT
    if not root.exists() or not root.is_dir():
        return []
    dirs = [d for d in list_dirs(root) if d.is_dir()]
    dirs.sort(key=lambda p: p.name, reverse=True)
    out = []
    for d in dirs[: max(1, int(limit))]:
        st = _walk_files_stats(d, sample_limit=20)
        out.append(
            {
                "backup_id": d.name,
                "path": str(d),
                "file_count": int(st.get("file_count", 0)),
                "total_bytes": int(st.get("total_bytes", 0)),
                "latest_mtime": st.get("latest_mtime", ""),
                "sample_files": st.get("sample_files", []),
            }
        )
    return out


def build_restore_plan(backup_dir, max_files=400):
    root = pathlib.Path(backup_dir)
    if not root.exists() or not root.is_dir():
        return {"ok": False, "error": f"backup dir not found: {backup_dir}"}
    rows = []
    for base, _, files in os.walk(root):
        for fn in files:
            src = pathlib.Path(base) / fn
            rel = src.relative_to(root)
            dst = pathlib.Path("/") / rel
            rows.append({"src": str(src), "dst": str(dst), "rel": str(rel)})
            if len(rows) >= max_files:
                break
        if len(rows) >= max_files:
            break
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    RECOVERY_PLAN_DIR.mkdir(parents=True, exist_ok=True)
    plan_path = RECOVERY_PLAN_DIR / f"restore-plan-{ts}.sh"
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        f"# generated_at={iso_utc(time.time())}",
        f"# backup_dir={root}",
        "# dry-run style restore preview script (manual review required)",
        "",
    ]
    for r in rows:
        src_q = r["src"].replace('"', '\\"')
        dst_q = r["dst"].replace('"', '\\"')
        parent_q = str(pathlib.Path(r["dst"]).parent).replace('"', '\\"')
        lines.append(f'mkdir -p "{parent_q}"')
        lines.append(f'cp -f "{src_q}" "{dst_q}"')
    plan_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        plan_path.chmod(0o700)
    except Exception:
        pass
    return {
        "ok": True,
        "plan_path": str(plan_path),
        "item_count": len(rows),
        "items": rows,
    }


def run_recovery_drill():
    backups = scan_backup_sets(limit=20)
    if not backups:
        return {
            "ok": False,
            "error": "no backups found",
            "backup_total": 0,
            "drill": {},
            "checklist": load_recovery_checklist(),
        }
    latest = backups[0]
    plan = build_restore_plan(latest.get("path", ""), max_files=400)
    items = plan.get("items", []) if isinstance(plan, dict) else []
    dst_exists = 0
    dst_missing_parent = 0
    for r in items:
        dst = pathlib.Path(r.get("dst", ""))
        if dst.exists():
            dst_exists += 1
        elif not dst.parent.exists():
            dst_missing_parent += 1
    return {
        "ok": bool(plan.get("ok")),
        "backup_total": len(backups),
        "latest_backup": latest,
        "drill": {
            "restore_item_count": len(items),
            "dest_exists_count": dst_exists,
            "dest_missing_parent_count": dst_missing_parent,
            "plan_path": plan.get("plan_path", ""),
            "preview_items": items[:40],
        },
        "checklist": load_recovery_checklist(),
        "error": plan.get("error", ""),
    }


def get_recovery_center_data():
    backups = scan_backup_sets(limit=20)
    checklist = load_recovery_checklist()
    done = sum(1 for x in checklist if isinstance(x, dict) and x.get("done"))
    return {
        "generated_at": iso_utc(time.time()),
        "backup_root": str(BACKUP_ROOT),
        "plan_root": str(RECOVERY_PLAN_DIR),
        "backup_sets": backups,
        "backup_total": len(backups),
        "checklist": checklist,
        "checklist_done": done,
        "checklist_total": len(checklist),
    }


def get_health_check(force_refresh=False):
    overview = get_overview_cached(include_threads=False, force_refresh=force_refresh)
    summary = overview.get("summary", {}) if isinstance(overview, dict) else {}
    risk = overview.get("risk_summary", {}) if isinstance(overview, dict) else {}
    runtime = get_runtime_health()
    observ = get_codex_observatory(force_refresh=force_refresh)
    source_inv = get_data_source_inventory()
    source_map = source_inv.get("sources", {}) if isinstance(source_inv, dict) else {}

    checks = []

    def add_check(check_id, label, status, detail, value=None):
        checks.append(
            {
                "id": check_id,
                "label": label,
                "status": status,
                "detail": detail,
                "value": value,
            }
        )

    roots = runtime.get("roots", {}) if isinstance(runtime, dict) else {}
    missing_roots = [k for k, ok in roots.items() if not ok]
    if missing_roots:
        add_check(
            "roots",
            "Core Paths",
            "fail",
            f"필수 경로 누락: {', '.join(missing_roots)}",
            len(missing_roots),
        )
    else:
        add_check("roots", "Core Paths", "pass", "핵심 경로 정상", 0)

    total_threads = int(summary.get("thread_total") or 0)
    high_risk = int(summary.get("high_risk_threads") or 0)
    stale_total = int(risk.get("stale_total") or 0)
    if total_threads <= 0:
        add_check("thread-scan", "Thread Scan", "fail", "스레드 수집 결과가 비어 있음", total_threads)
    else:
        add_check("thread-scan", "Thread Scan", "pass", f"스레드 {total_threads}개 추적 중", total_threads)

    high_ratio = (high_risk / total_threads) if total_threads else 0.0
    if high_ratio >= 0.35:
        add_check("risk-load", "Risk Load", "fail", f"high risk 비율 {high_ratio:.0%}", high_risk)
    elif high_ratio >= 0.18:
        add_check("risk-load", "Risk Load", "warn", f"high risk 비율 {high_ratio:.0%}", high_risk)
    else:
        add_check("risk-load", "Risk Load", "pass", f"high risk 비율 {high_ratio:.0%}", high_risk)

    stale_ratio = (stale_total / total_threads) if total_threads else 0.0
    if stale_ratio >= 0.25:
        add_check("stale-load", "Staleness", "warn", f"stale 비율 {stale_ratio:.0%}", stale_total)
    else:
        add_check("stale-load", "Staleness", "pass", f"stale 비율 {stale_ratio:.0%}", stale_total)

    cache_warm = bool(runtime.get("cache_warm"))
    cache_age_sec = runtime.get("cache_age_sec")
    if not cache_warm:
        add_check("cache", "Overview Cache", "warn", "캐시가 비어 있어 첫 렌더 지연 가능", cache_age_sec)
    elif isinstance(cache_age_sec, (int, float)) and cache_age_sec > 35:
        add_check("cache", "Overview Cache", "warn", f"cache age {cache_age_sec:.1f}s", cache_age_sec)
    else:
        age_text = f"{cache_age_sec:.1f}s" if isinstance(cache_age_sec, (int, float)) else "-"
        add_check("cache", "Overview Cache", "pass", f"cache age {age_text}", cache_age_sec)

    quick = runtime.get("quick_counts", {}) if isinstance(runtime, dict) else {}
    sessions_count = int(quick.get("sessions_jsonl_files") or 0)
    archived_count = int(quick.get("archived_sessions_jsonl_files") or 0)
    if sessions_count <= 0 and archived_count <= 0:
        add_check("session-logs", "Session Logs", "warn", "sessions/archived_sessions 로그 없음", 0)
    else:
        add_check(
            "session-logs",
            "Session Logs",
            "pass",
            f"sessions {sessions_count}, archived {archived_count}",
            sessions_count + archived_count,
        )

    obs_summary = observ.get("summary", {}) if isinstance(observ, dict) else {}
    loop_attention = int(obs_summary.get("loop_attention_total") or 0)
    loop_total = int(obs_summary.get("loop_total") or 0)
    if loop_attention > 0:
        add_check("loops", "Agent Loops", "warn", f"attention {loop_attention}/{max(loop_total, 1)}", loop_attention)
    else:
        add_check("loops", "Agent Loops", "pass", f"attention {loop_attention}/{max(loop_total, 1)}", loop_attention)

    process_total = int(obs_summary.get("process_total") or 0)
    if process_total <= 0:
        add_check("observatory", "Runtime Observatory", "warn", "관련 프로세스가 감지되지 않음", process_total)
    else:
        add_check("observatory", "Runtime Observatory", "pass", f"관련 프로세스 {process_total}개", process_total)

    source_failures = []
    if isinstance(source_map, dict):
        for name, info in source_map.items():
            if not isinstance(info, dict):
                continue
            exists = info.get("exists", info.get("present", True))
            if not exists:
                source_failures.append(name)
    if source_failures:
        add_check("sources", "Data Sources", "warn", f"누락 소스: {', '.join(source_failures)}", len(source_failures))
    else:
        add_check("sources", "Data Sources", "pass", "핵심 소스 존재", 0)

    status_count = {"pass": 0, "warn": 0, "fail": 0}
    for c in checks:
        st = str(c.get("status") or "warn").lower()
        if st not in status_count:
            st = "warn"
        status_count[st] += 1

    score = max(0, 100 - (status_count["warn"] * 8) - (status_count["fail"] * 24))
    return {
        "generated_at": iso_utc(time.time()),
        "score": score,
        "summary": status_count,
        "checks": checks,
    }


def _run_cmd_text(args, timeout=8):
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.stdout or ""
    except Exception:
        return ""


def _safe_int(text, default=0):
    try:
        return int(str(text).strip())
    except Exception:
        return default


def _safe_float(text, default=0.0):
    try:
        return float(str(text).strip())
    except Exception:
        return default


def _clip_text(text, max_len=220):
    t = str(text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _is_codex_related_command(cmd_lc):
    if not cmd_lc:
        return False
    keywords = (
        "codex",
        "openai.chat-helper",
        "openclaw",
        "oh-my-codex",
        "session_injector",
        "autodashboard",
        "supervised_loop",
        "codex-overview",
        "conductor",
        "tmux",
    )
    if not any(k in cmd_lc for k in keywords):
        return False
    noise = (
        "ps -axo",
        "rg -i codex",
        "rg -i \"codex",
        "launchctl list",
        "curl -s http://127.0.0.1:8787",
        "lsof -nP -iTCP",
        "tmux list-panes -a",
    )
    return not any(n in cmd_lc for n in noise)


def _classify_codex_process(command):
    cmd = str(command or "")
    lc = cmd.lower()
    if "/applications/codex.app/contents/macos/codex" in lc:
        return "codex-desktop-main"
    if "codex helper (renderer)" in lc:
        return "codex-desktop-renderer"
    if "codex helper --type=gpu-process" in lc:
        return "codex-desktop-gpu"
    if "codex helper --type=utility" in lc:
        return "codex-desktop-utility"
    if "codex app-server" in lc and "vscode/extensions/openai.chatgpt" in lc:
        return "vscode-codex-app-server"
    if "codex app-server" in lc:
        return "codex-app-server"
    if "oh-my-codex/dist/mcp/" in lc:
        return "omx-mcp"
    if "openai.chat-helper" in lc:
        return "openai-chat-helper"
    if "autodashboard" in lc or "openclaw" in lc or "supervised_loop" in lc or "session_injector" in lc:
        return "automation-loop"
    if "codex-overview/server.py" in lc:
        return "overview-server"
    if "tmux" in lc:
        return "tmux"
    if "conductor" in lc:
        return "conductor"
    return "codex-related"


def _process_signature(proc_class, command):
    cmd = str(command or "").strip()
    lc = cmd.lower()
    if proc_class == "omx-mcp":
        m = re.search(r"/mcp/([^/\s]+)$", lc)
        if m:
            return f"omx-mcp:{m.group(1)}"
        return "omx-mcp:unknown"
    if proc_class.startswith("codex-desktop"):
        m = re.search(r"--type=([a-z\-]+)", lc)
        if m:
            return f"codex-helper:{m.group(1)}"
        return proc_class
    if proc_class in ("codex-app-server", "vscode-codex-app-server"):
        if "vscode/extensions/openai.chatgpt" in lc:
            return "codex-app-server:vscode"
        return "codex-app-server:desktop"
    if proc_class == "automation-loop":
        for key in ("openclaw_agi_control.sh", "autodashboard_control.sh", "supervised_loop.sh", "session_injector.sh"):
            if key in lc:
                return f"automation:{key}"
    token = cmd.split()[0] if cmd else proc_class
    return f"{proc_class}:{os.path.basename(token)}"


def _collect_codex_processes():
    out = _run_cmd_text(["ps", "-axo", "pid=,ppid=,%cpu=,%mem=,state=,etime=,command="], timeout=10)
    rows = []
    for raw in out.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split(None, 6)
        if len(parts) < 7:
            continue
        pid = _safe_int(parts[0], 0)
        ppid = _safe_int(parts[1], 0)
        cpu = _safe_float(parts[2], 0.0)
        mem = _safe_float(parts[3], 0.0)
        state = parts[4]
        etime = parts[5]
        command = parts[6].strip()
        lc = command.lower()
        if not _is_codex_related_command(lc):
            continue
        cls = _classify_codex_process(command)
        rows.append(
            {
                "pid": pid,
                "ppid": ppid,
                "cpu": round(cpu, 2),
                "mem": round(mem, 2),
                "state": state,
                "etime": etime,
                "process_class": cls,
                "signature": _process_signature(cls, command),
                "command": _clip_text(command, 700),
                "command_clip": _clip_text(command, 240),
            }
        )
    rows.sort(key=lambda x: (-x.get("cpu", 0.0), -x.get("mem", 0.0), x.get("pid", 0)))

    grouped = {}
    for r in rows:
        key = r.get("signature") or "unknown"
        g = grouped.get(key)
        if not g:
            g = {
                "signature": key,
                "process_class": r.get("process_class"),
                "count": 0,
                "cpu_total": 0.0,
                "mem_total": 0.0,
                "max_etime": "",
                "sample_command": r.get("command_clip", ""),
            }
            grouped[key] = g
        g["count"] += 1
        g["cpu_total"] = round(g["cpu_total"] + float(r.get("cpu", 0.0)), 2)
        g["mem_total"] = round(g["mem_total"] + float(r.get("mem", 0.0)), 2)
        if not g["max_etime"]:
            g["max_etime"] = r.get("etime", "")
    groups = list(grouped.values())
    groups.sort(key=lambda x: (-x.get("count", 0), -x.get("cpu_total", 0.0), x.get("signature", "")))
    return rows, groups


def _collect_tmux_snapshot():
    sessions = []
    panes = []
    s_out = _run_cmd_text(["tmux", "ls"], timeout=4)
    for raw in s_out.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^([^:]+):\s+([0-9]+)\s+windows?\s+\((.*)\)$", line)
        if m:
            name = m.group(1).strip()
            sessions.append(
                {
                    "session": name,
                    "windows": _safe_int(m.group(2), 0),
                    "meta": m.group(3).strip(),
                    "related": bool(re.search(r"(codex|openclaw|autopilot|overview|omx)", name, flags=re.IGNORECASE)),
                }
            )
            continue
        sessions.append({"session": line, "windows": 0, "meta": "", "related": False})

    p_out = _run_cmd_text(
        ["tmux", "list-panes", "-a", "-F", "#S|#I.#P|#{pane_active}|#{pane_pid}|#{pane_current_command}|#{pane_current_path}"],
        timeout=4,
    )
    for raw in p_out.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split("|", 5)
        if len(parts) < 6:
            continue
        session = parts[0].strip()
        panes.append(
            {
                "session": session,
                "pane": parts[1].strip(),
                "active": parts[2].strip() == "1",
                "pid": _safe_int(parts[3], 0),
                "command": parts[4].strip(),
                "path": parts[5].strip(),
                "related": bool(re.search(r"(codex|openclaw|autopilot|overview|omx)", session, flags=re.IGNORECASE)),
            }
        )
    panes.sort(key=lambda x: (x.get("session", ""), x.get("pane", "")))
    sessions.sort(key=lambda x: x.get("session", ""))
    return {"sessions": sessions, "panes": panes}


def _collect_launch_services():
    out = _run_cmd_text(["launchctl", "list"], timeout=6)
    rows = []
    for raw in out.splitlines():
        line = raw.strip()
        if not line or line.startswith("PID"):
            continue
        parts = re.split(r"\s+", line, maxsplit=2)
        if len(parts) < 3:
            continue
        pid_txt, status_txt, label = parts
        ll = label.lower()
        if not re.search(r"(codex|openai|openclaw|chat-helper|conductor|omx)", ll):
            continue
        rows.append(
            {
                "label": label,
                "pid": None if pid_txt == "-" else _safe_int(pid_txt, 0),
                "status": status_txt,
            }
        )
    rows.sort(key=lambda x: x.get("label", ""))
    return rows


def _collect_listeners(related_pids):
    out = _run_cmd_text(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], timeout=6)
    rows = []
    for idx, raw in enumerate(out.splitlines()):
        line = raw.strip()
        if not line:
            continue
        if idx == 0 and line.lower().startswith("command"):
            continue
        parts = line.split()
        if len(parts) < 9:
            continue
        command = parts[0]
        pid = _safe_int(parts[1], 0)
        name = parts[-1]
        cl = command.lower()
        if pid not in related_pids and not re.search(r"(codex|python|node|tmux|openai)", cl) and "127.0.0.1:8787" not in name:
            continue
        rows.append({"command": command, "pid": pid, "listen": name})
    rows.sort(key=lambda x: (x.get("command", ""), x.get("pid", 0)))
    return rows


def get_codex_observatory(force_refresh=False, ttl_sec=5.0):
    now = time.time()
    if (
        (not force_refresh)
        and OBSERVABILITY_CACHE.get("data") is not None
        and (now - float(OBSERVABILITY_CACHE.get("ts") or 0.0)) < ttl_sec
    ):
        return OBSERVABILITY_CACHE.get("data")

    processes, process_groups = _collect_codex_processes()
    class_counts = {}
    for p in processes:
        c = p.get("process_class", "unknown")
        class_counts[c] = class_counts.get(c, 0) + 1

    tmux_data = _collect_tmux_snapshot()
    launch_services = _collect_launch_services()
    related_pids = {int(p.get("pid", 0)) for p in processes if int(p.get("pid", 0)) > 0}
    listeners = _collect_listeners(related_pids)

    loops = get_agent_loops_status()
    loop_rows = loops.get("rows", []) if isinstance(loops, dict) else []
    loops_attention = [x for x in loop_rows if isinstance(x, dict) and x.get("has_attention")]
    loops_running = [x for x in loop_rows if isinstance(x, dict) and x.get("running")]

    mcp_groups = [g for g in process_groups if str(g.get("signature", "")).startswith("omx-mcp:")]
    alerts = []
    if class_counts.get("codex-desktop-main", 0) == 0:
        alerts.append("Codex 데스크탑 메인 프로세스가 보이지 않습니다.")
    if len(loops_attention) > 0:
        alerts.append(f"주의가 필요한 루프 {len(loops_attention)}개가 있습니다.")
    heavy_mcp = [g for g in mcp_groups if int(g.get("count", 0)) >= 4]
    if heavy_mcp:
        alerts.append(f"중복 실행된 OMX MCP 그룹 {len(heavy_mcp)}개가 감지되었습니다. (정리 필요 가능성)")

    data = {
        "generated_at": iso_utc(now),
        "summary": {
            "process_total": len(processes),
            "process_group_total": len(process_groups),
            "class_counts": class_counts,
            "mcp_group_total": len(mcp_groups),
            "tmux_session_total": len(tmux_data.get("sessions", [])),
            "tmux_related_session_total": sum(1 for s in tmux_data.get("sessions", []) if s.get("related")),
            "tmux_pane_total": len(tmux_data.get("panes", [])),
            "launch_service_total": len(launch_services),
            "listener_total": len(listeners),
            "loop_total": len(loop_rows),
            "loop_running_total": len(loops_running),
            "loop_attention_total": len(loops_attention),
        },
        "alerts": alerts,
        "process_groups": process_groups[:120],
        "processes": processes[:260],
        "tmux": tmux_data,
        "launch_services": launch_services[:200],
        "listeners": listeners[:200],
        "loops_digest": [
            {
                "loop_id": x.get("loop_id"),
                "label": x.get("label"),
                "running": x.get("running"),
                "has_attention": x.get("has_attention"),
                "staleness": x.get("staleness"),
                "phase": x.get("phase"),
                "rid": x.get("rid"),
                "updated_at": x.get("updated_at"),
            }
            for x in loop_rows
            if isinstance(x, dict)
        ],
    }
    OBSERVABILITY_CACHE["ts"] = now
    OBSERVABILITY_CACHE["data"] = data
    return data


def _read_text_file(path, max_chars=100000):
    p = pathlib.Path(path)
    if not p.exists() or not p.is_file():
        return ""
    try:
        with p.open("r", encoding="utf-8") as f:
            return f.read(max_chars)
    except Exception:
        return ""


def _tail_lines(path, max_lines=12):
    p = pathlib.Path(path)
    if not p.exists() or not p.is_file():
        return []
    dq = deque(maxlen=max_lines)
    try:
        with p.open("r", encoding="utf-8") as f:
            for line in f:
                dq.append(line.rstrip("\r\n"))
    except Exception:
        return []
    return list(dq)


def _parse_kv_lines(text):
    out = {}
    for raw in (text or "").splitlines():
        line = raw.strip()
        m = re.match(r"^([A-Za-z0-9_]+)=(.*)$", line)
        if not m:
            continue
        out[m.group(1)] = m.group(2).strip()
    return out


def _loop_action_timeout(action):
    if action == "run2":
        return 600
    if action in ("status", "watch-status"):
        return 25
    return 45


def _run_loop_control(loop_id, action):
    spec = LOOP_CONTROL_SPECS.get(loop_id)
    if not spec:
        return {"ok": False, "error": f"unknown loop_id: {loop_id}"}
    controller = pathlib.Path(spec.get("controller", ""))
    if not controller.exists():
        return {
            "ok": False,
            "error": f"controller not found: {controller}",
            "controller": str(controller),
        }
    if action not in LOOP_ALLOWED_ACTIONS:
        return {"ok": False, "error": f"unsupported action: {action}"}
    try:
        proc = subprocess.run(
            [str(controller), action],
            cwd=str(OVERVIEW_DIR),
            capture_output=True,
            text=True,
            timeout=_loop_action_timeout(action),
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout or "",
            "stderr": proc.stderr or "",
            "controller": str(controller),
            "action": action,
        }
    except subprocess.TimeoutExpired as e:
        return {
            "ok": False,
            "error": "timeout",
            "stdout": (e.stdout or ""),
            "stderr": (e.stderr or ""),
            "controller": str(controller),
            "action": action,
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "controller": str(controller),
            "action": action,
        }


def _classify_staleness(age_sec):
    if age_sec is None:
        return "unknown"
    if age_sec <= 180:
        return "fresh"
    if age_sec <= 900:
        return "aging"
    return "stale"


def _read_loop_state(state_dir):
    p = pathlib.Path(state_dir) if state_dir else pathlib.Path("")
    if not p.exists() or not p.is_dir():
        return {
            "current_status": {},
            "loop_state_line": "",
            "history_tail": [],
            "history_age_sec": None,
            "summary_kv": {},
            "summary_text": "",
        }

    current_status_text = _read_text_file(p / "current_status.txt", 4000)
    loop_state_line = ""
    loop_state_lines = _tail_lines(p / "loop_state.txt", max_lines=1)
    if loop_state_lines:
        loop_state_line = loop_state_lines[0]
    history_tail = _tail_lines(p / "cycle_history.tsv", max_lines=10)
    summary_text = _read_text_file(p / "latest_summary.txt", 12000)

    history_age_sec = None
    try:
        hist = p / "cycle_history.tsv"
        if hist.exists():
            history_age_sec = int(max(0, time.time() - hist.stat().st_mtime))
    except Exception:
        history_age_sec = None

    return {
        "current_status": _parse_kv_lines(current_status_text),
        "loop_state_line": loop_state_line,
        "history_tail": history_tail,
        "history_age_sec": history_age_sec,
        "summary_kv": _parse_kv_lines(summary_text),
        "summary_text": summary_text,
    }


def get_agent_loop_snapshot(loop_id):
    spec = LOOP_CONTROL_SPECS.get(loop_id)
    if not spec:
        return {"loop_id": loop_id, "ok": False, "error": "unknown loop"}

    status_res = _run_loop_control(loop_id, "status")
    watch_res = _run_loop_control(loop_id, "watch-status")
    status_kv = _parse_kv_lines(status_res.get("stdout", ""))
    state_dir = status_kv.get("state_dir", "")
    state = _read_loop_state(state_dir)

    current_status = state.get("current_status", {})
    summary_kv = state.get("summary_kv", {})
    history_age_sec = state.get("history_age_sec")
    staleness = _classify_staleness(history_age_sec)
    running = (status_kv.get("running", "").lower() == "yes")
    watchdog_running = bool(watch_res.get("ok"))

    rid = (
        current_status.get("rid")
        or summary_kv.get("RID")
        or status_kv.get("RID")
        or ""
    )
    phase = current_status.get("phase") or ("running" if running else "idle")
    verdict = summary_kv.get("VERDICT", "")
    instruction = summary_kv.get("INSTRUCTION", "") or summary_kv.get("FOLLOWUP", "")

    has_attention = False
    attention_reasons = []
    if not running:
        has_attention = True
        attention_reasons.append("loop-stopped")
    if staleness == "stale":
        has_attention = True
        attention_reasons.append("history-stale")
    if status_res.get("ok") is False:
        has_attention = True
        attention_reasons.append("status-error")
    if watch_res.get("ok") is False:
        has_attention = True
        attention_reasons.append("watchdog-off")

    return {
        "loop_id": loop_id,
        "label": spec.get("label", loop_id),
        "controller": str(spec.get("controller")),
        "live_session": status_kv.get("live_session", ""),
        "running": running,
        "watchdog_running": watchdog_running,
        "phase": phase,
        "rid": rid,
        "verdict": verdict,
        "instruction": instruction,
        "history_age_sec": history_age_sec,
        "staleness": staleness,
        "has_attention": has_attention,
        "attention_reasons": attention_reasons,
        "current_status": current_status,
        "loop_state_line": state.get("loop_state_line", ""),
        "history_tail": state.get("history_tail", []),
        "summary_kv": summary_kv,
        "status_raw": status_res.get("stdout", "")[:6000],
        "status_error": status_res.get("error") or status_res.get("stderr", "")[:600],
        "watchdog_error": watch_res.get("error") or watch_res.get("stderr", "")[:600],
        "updated_at": iso_utc(time.time()),
    }


def get_agent_loops_status():
    rows = []
    for loop_id in LOOP_CONTROL_SPECS.keys():
        rows.append(get_agent_loop_snapshot(loop_id))
    return {
        "generated_at": iso_utc(time.time()),
        "count": len(rows),
        "rows": rows,
    }


def run_agent_loop_action(loop_id, action):
    res = _run_loop_control(loop_id, action)
    snapshot = get_agent_loop_snapshot(loop_id)
    return {
        "generated_at": iso_utc(time.time()),
        "ok": bool(res.get("ok")),
        "loop_id": loop_id,
        "action": action,
        "result": res,
        "loop": snapshot,
    }


def get_thread_forensics(thread_ids: list):
    ids = []
    seen = set()
    for tid in (thread_ids or []):
        sid = str(tid).strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        ids.append(sid)

    if not ids:
        return {"generated_at": iso_utc(time.time()), "count": 0, "reports": []}

    overview = get_overview_cached(include_threads=True)
    threads_by_id = {t.get("id"): t for t in (overview.get("threads") or []) if isinstance(t, dict)}
    impact_data = analyze_delete_impact(ids)
    impact_by_id = {r.get("id"): r for r in impact_data.get("reports", []) if isinstance(r, dict)}
    artifacts = find_thread_artifacts(ids)

    artifacts_by_id = {}
    for a in artifacts:
        tid = a.get("thread_id")
        if not tid:
            continue
        artifacts_by_id.setdefault(tid, []).append(a)

    reports = []
    for tid in ids:
        t = threads_by_id.get(tid, {})
        impact = impact_by_id.get(tid, {})
        tid_artifacts = artifacts_by_id.get(tid, [])

        by_kind = {}
        for a in tid_artifacts:
            k = a.get("kind", "unknown")
            by_kind[k] = by_kind.get(k, 0) + 1

        evidence = {"kind": "", "path": "", "lines": []}
        for k in ("session-log", "archived-session-log"):
            hit = next((a for a in tid_artifacts if a.get("kind") == k), None)
            if hit:
                evidence = {
                    "kind": hit.get("kind", ""),
                    "path": hit.get("path", ""),
                    "lines": read_head_lines(hit.get("path", ""), max_lines=5),
                }
                break

        reports.append(
            {
                "id": tid,
                "overview_found": bool(t),
                "title": t.get("title", ""),
                "title_source": t.get("title_source", ""),
                "cwd": t.get("cwd", ""),
                "impact": impact,
                "artifact_count": len(tid_artifacts),
                "artifact_count_by_kind": by_kind,
                "artifact_paths_preview": [a.get("path", "") for a in tid_artifacts[:8]],
                "evidence_preview": evidence,
                "summary": impact.get("summary", "분석 요약 없음"),
            }
        )

    return {
        "generated_at": iso_utc(time.time()),
        "count": len(ids),
        "artifacts_total": len(artifacts),
        "reports": reports,
    }


def filter_threads(
    threads,
    q="",
    only_pinned=False,
    only_no_project=False,
    only_no_local=False,
    source="",
    scope="all",
    min_risk=0,
    min_ctx=0,
    sort_mode="order",
):
    q = (q or "").strip().lower()
    out = []
    for t in threads:
        if q:
            hay = " ".join(
                [
                    t.get("title", ""),
                    t.get("id", ""),
                    t.get("cwd", ""),
                    " ".join(t.get("risk_tags", []) or []),
                ]
            ).lower()
            if q not in hay:
                continue
        if only_pinned and not t.get("pinned"):
            continue
        if only_no_project and t.get("project_buckets"):
            continue
        if only_no_local and t.get("has_local_data"):
            continue
        if source and t.get("title_source", "") != source:
            continue
        ts = t.get("title_source", "")
        if scope == "ui" and ts != "global-state":
            continue
        if scope == "internal" and ts == "global-state":
            continue
        if scope == "gui_hidden" and not t.get("gui_hidden_candidate"):
            continue
        if scope == "gui_linked" and not (t.get("is_gui_thread") and t.get("has_session_log")):
            continue
        if int(t.get("risk_score", 0) or 0) < int(min_risk):
            continue
        if int(t.get("context_score", 0) or 0) < int(min_ctx):
            continue
        out.append(t)
    if sort_mode == "ctx_desc":
        out.sort(
            key=lambda x: (
                -int(x.get("context_score", 0) or 0),
                -int(x.get("risk_score", 0) or 0),
                int(x.get("order_index", 999999) or 999999),
                x.get("title", "").lower(),
                x.get("id", ""),
            )
        )
    elif sort_mode == "risk_desc":
        out.sort(
            key=lambda x: (
                -int(x.get("risk_score", 0) or 0),
                -int(x.get("context_score", 0) or 0),
                int(x.get("order_index", 999999) or 999999),
                x.get("title", "").lower(),
                x.get("id", ""),
            )
        )
    elif sort_mode == "recent_desc":
        out.sort(
            key=lambda x: (
                x.get("inferred_time", "") or "",
                x.get("timestamp", "") or "",
                x.get("id", ""),
            ),
            reverse=True,
        )
    return out


def analyze_delete_impact(thread_ids):
    overview = get_overview_cached(include_threads=True)
    state = get_state()
    threads_by_id = {t["id"]: t for t in overview["threads"]}
    order = state.get("order", []) if isinstance(state, dict) else []
    titles = state.get("titles", {}) if isinstance(state, dict) else {}
    pinned = set(state.get("pinned", [])) if isinstance(state, dict) else set()

    # Bucket current counts
    bucket_counts = {}
    for b in overview["project_buckets"]:
        bucket_counts[b["project_bucket"]] = b["thread_count"]

    reports = []
    for tid in thread_ids:
        t = threads_by_id.get(tid)
        if not t:
            reports.append(
                {
                    "id": tid,
                    "exists": False,
                    "risk_level": "unknown",
                    "risk_score": 0,
                    "summary": "현재 인덱스에서 찾지 못함",
                    "parents": [],
                    "impacts": [],
                }
            )
            continue

        parents = []
        impacts = []
        score = 0

        if tid in titles:
            parents.append("global-state:thread-titles")
            impacts.append("사이드바 제목 메타에서 제거됨")
            score += 1
        if tid in pinned:
            parents.append("global-state:pinned-thread-ids")
            impacts.append("Pinned 목록에서 제거됨")
            score += 2
        if tid in order:
            parents.append("global-state:thread-order")
            impacts.append("사이드바 정렬(order)에서 제거됨")
            score += 1
        if t.get("has_local_data"):
            parents.append("com.openai.chat:conversations-v3-*")
            impacts.append("로컬 대화 캐시 파일(.data) 제거 대상")
            score += 1
        if t.get("has_session_log"):
            parents.append(".codex:sessions/archived_sessions")
            impacts.append("세션 로그와 분리 저장이라 별도 정리 안 하면 로그는 남음")
            score += 1
        if t.get("project_buckets"):
            for b in t["project_buckets"]:
                parents.append(f"project-bucket:{b}")
                cnt = bucket_counts.get(b, 0)
                if cnt <= 1:
                    impacts.append(f"{b} 버킷이 비게 될 수 있음")
                    score += 2
                else:
                    impacts.append(f"{b} 버킷의 스레드 수 감소")
                    score += 1
        if t.get("cwd"):
            parents.append(f"workspace:{t['cwd']}")

        if score >= 6:
            level = "high"
        elif score >= 3:
            level = "medium"
        else:
            level = "low"

        reports.append(
            {
                "id": tid,
                "exists": True,
                "title": t.get("title", ""),
                "risk_level": level,
                "risk_score": score,
                "summary": " / ".join(impacts) if impacts else "영향 거의 없음",
                "parents": sorted(set(parents)),
                "impacts": impacts,
            }
        )

    return {
        "count": len(thread_ids),
        "reports": reports,
    }


def find_thread_artifacts(thread_ids):
    ids = {str(x).strip() for x in thread_ids if str(x).strip()}
    artifacts = []
    if not ids:
        return artifacts

    # Chat cache files
    for d in list_dirs(CHAT_DIR):
        if d.name.startswith("conversations-v3-"):
            for tid in ids:
                p = d / f"{tid}.data"
                if p.exists():
                    artifacts.append({"kind": "chat-cache", "thread_id": tid, "path": str(p)})
        if d.name.startswith("project-g-p-"):
            for cd in d.glob("conversations-v3-*"):
                for tid in ids:
                    p = cd / f"{tid}.data"
                    if p.exists():
                        artifacts.append({"kind": "project-cache", "thread_id": tid, "path": str(p)})

    # Session logs
    for tid in ids:
        for p in (CODEX_DIR / "sessions").glob("**/*.jsonl"):
            name = p.name
            if tid in name:
                artifacts.append({"kind": "session-log", "thread_id": tid, "path": str(p)})
        for p in (CODEX_DIR / "archived_sessions").glob("*.jsonl"):
            name = p.name
            if tid in name:
                artifacts.append({"kind": "archived-session-log", "thread_id": tid, "path": str(p)})

    return artifacts


def clean_global_state_refs(thread_ids, dry_run=True):
    ids = {str(x).strip() for x in thread_ids if str(x).strip()}
    path = CODEX_DIR / ".codex-global-state.json"
    state = safe_read_json(path)
    before = json.dumps(state, ensure_ascii=False)
    changed = False
    removed = {"titles": 0, "order": 0, "pinned": 0}

    blob = state.get("thread-titles", {})
    if isinstance(blob, dict):
        titles = blob.get("titles", {})
        if isinstance(titles, dict):
            for tid in list(titles.keys()):
                if tid in ids:
                    titles.pop(tid, None)
                    removed["titles"] += 1
                    changed = True
            blob["titles"] = titles
        order = blob.get("order", [])
        if isinstance(order, list):
            new_order = [x for x in order if str(x) not in ids]
            removed["order"] = len(order) - len(new_order)
            if len(new_order) != len(order):
                changed = True
            blob["order"] = new_order
        state["thread-titles"] = blob

    pinned = state.get("pinned-thread-ids", [])
    if isinstance(pinned, list):
        new_pinned = [x for x in pinned if str(x) not in ids]
        removed["pinned"] = len(pinned) - len(new_pinned)
        if len(new_pinned) != len(pinned):
            changed = True
        state["pinned-thread-ids"] = new_pinned

    after = json.dumps(state, ensure_ascii=False)
    if changed and not dry_run:
        path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "changed": changed,
        "removed": removed,
        "path": str(path),
        "before_size": len(before),
        "after_size": len(after),
    }


def rename_thread_title(thread_id, new_title):
    tid = str(thread_id).strip()
    title = clean_title_text(new_title or "", 140)
    if not tid:
        return {"ok": False, "error": "thread id is empty"}
    if not title:
        return {"ok": False, "error": "new title is empty after cleaning"}

    path = CODEX_DIR / ".codex-global-state.json"
    state = safe_read_json(path)
    blob = state.get("thread-titles")
    if not isinstance(blob, dict):
        blob = {}
    titles = blob.get("titles")
    if not isinstance(titles, dict):
        titles = {}
    titles[tid] = title
    blob["titles"] = titles
    if "order" not in blob or not isinstance(blob.get("order"), list):
        blob["order"] = []
    state["thread-titles"] = blob
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    OVERVIEW_CACHE["ts"] = 0.0
    OVERVIEW_CACHE["data"] = None
    return {"ok": True, "thread_id": tid, "title": title, "path": str(path)}


def set_thread_pinned(thread_ids, pinned=True):
    ids = []
    for x in thread_ids or []:
        tid = str(x).strip()
        if tid and tid not in ids:
            ids.append(tid)
    if not ids:
        return {"ok": False, "error": "no thread ids provided"}

    path = CODEX_DIR / ".codex-global-state.json"
    state = safe_read_json(path)
    before = state.get("pinned-thread-ids", [])
    if not isinstance(before, list):
        before = []
    before_ids = [str(x).strip() for x in before if str(x).strip()]

    if pinned:
        out = list(before_ids)
        seen = set(out)
        for tid in ids:
            if tid not in seen:
                out.append(tid)
                seen.add(tid)
    else:
        target = set(ids)
        out = [tid for tid in before_ids if tid not in target]

    state["pinned-thread-ids"] = out
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    OVERVIEW_CACHE["ts"] = 0.0
    OVERVIEW_CACHE["data"] = None
    return {
        "ok": True,
        "pinned": bool(pinned),
        "requested_ids": ids,
        "total_pinned": len(out),
        "path": str(path),
    }


def archive_threads_local(thread_ids):
    ids = []
    for x in thread_ids or []:
        tid = str(x).strip()
        if tid and tid not in ids:
            ids.append(tid)
    if not ids:
        return {"ok": False, "error": "no thread ids provided"}
    state_result = clean_global_state_refs(ids, dry_run=False)
    OVERVIEW_CACHE["ts"] = 0.0
    OVERVIEW_CACHE["data"] = None
    return {
        "ok": True,
        "mode": "local-hide",
        "requested_ids": ids,
        "state_result": state_result,
    }


def get_thread_resume_commands(thread_ids):
    ids = []
    for x in thread_ids or []:
        tid = str(x).strip()
        if tid and tid not in ids:
            ids.append(tid)
    if not ids:
        return {"ok": False, "error": "no thread ids provided"}
    commands = [f"codex resume {tid}" for tid in ids]
    return {
        "ok": True,
        "count": len(commands),
        "commands": commands,
        "text": "\n".join(commands),
    }


def backup_paths(paths):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = BACKUP_ROOT / stamp
    backup_dir.mkdir(parents=True, exist_ok=True)
    copied = []
    for p in paths:
        src = pathlib.Path(p)
        if not src.exists() or not src.is_file():
            continue
        rel = str(src).lstrip("/")
        dst = backup_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied.append(str(dst))
    return {"backup_dir": str(backup_dir), "copied_count": len(copied)}


def build_cleanup_confirm_token(thread_ids, target_paths, options):
    ids = sorted({str(x).strip() for x in (thread_ids or []) if str(x).strip()})
    paths = sorted({str(x).strip() for x in (target_paths or []) if str(x).strip()})
    normalized_opts = {
        "delete_cache": bool(options.get("delete_cache", True)),
        "delete_session_logs": bool(options.get("delete_session_logs", True)),
        "clean_state_refs": bool(options.get("clean_state_refs", True)),
    }
    payload = {
        "ids": ids,
        "paths": paths,
        "options": normalized_opts,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12].upper()
    return f"DEL-{digest}"


def execute_local_cleanup(thread_ids, options, dry_run=True, confirm_token=""):
    artifacts = find_thread_artifacts(thread_ids)
    ids = [str(x).strip() for x in thread_ids if str(x).strip()]
    delete_cache = bool(options.get("delete_cache", True))
    delete_session_logs = bool(options.get("delete_session_logs", True))
    clean_state = bool(options.get("clean_state_refs", True))

    target_artifacts = []
    for a in artifacts:
        if a["kind"] in ("chat-cache", "project-cache") and delete_cache:
            target_artifacts.append(a)
        if a["kind"] in ("session-log", "archived-session-log") and delete_session_logs:
            target_artifacts.append(a)

    target_paths = sorted({a["path"] for a in target_artifacts})
    state_preview = clean_global_state_refs(ids, dry_run=True) if clean_state else {"changed": False, "removed": {}}
    confirm_expected = build_cleanup_confirm_token(ids, target_paths, options)

    backup_info = {"backup_dir": "", "copied_count": 0}
    if dry_run:
        return {
            "ok": True,
            "mode": "dry-run",
            "requested_ids": len(ids),
            "target_file_count": len(target_paths),
            "state_result": state_preview,
            "backup": backup_info,
            "targets": target_artifacts,
            "confirm_token_expected": confirm_expected,
            "confirm_help": "정리 실행 전에 위 토큰을 입력해야 합니다.",
        }

    if str(confirm_token or "").strip() != confirm_expected:
        return {
            "ok": False,
            "mode": "execute",
            "error": "confirmation token mismatch",
            "requested_ids": len(ids),
            "target_file_count": len(target_paths),
            "state_result": state_preview,
            "targets": target_artifacts,
            "confirm_token_expected": confirm_expected,
            "confirm_help": "미리보기에서 받은 토큰을 입력한 뒤 다시 실행하세요.",
        }

    if not dry_run:
        backup_targets = list(target_paths)
        if clean_state and state_preview.get("changed"):
            backup_targets.append(state_preview.get("path"))
        backup_info = backup_paths(backup_targets)

        deleted = 0
        failed = []
        for p in target_paths:
            try:
                pathlib.Path(p).unlink(missing_ok=True)
                deleted += 1
            except Exception as e:
                failed.append({"path": p, "error": str(e)})
        state_exec = clean_global_state_refs(ids, dry_run=False) if clean_state else {"changed": False, "removed": {}}
        result = {
            "ok": True,
            "mode": "execute",
            "requested_ids": len(ids),
            "target_file_count": len(target_paths),
            "deleted_file_count": deleted,
            "failed": failed,
            "state_result": state_exec,
            "backup": backup_info,
            "targets": target_artifacts,
            "confirm_token_expected": confirm_expected,
        }
        OVERVIEW_CACHE["ts"] = 0.0
        OVERVIEW_CACHE["data"] = None
        return result


HTML = r'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Codex Local Overview</title>
  <style>
    :root {
      --font-ui: "SUIT Variable", "Pretendard Variable", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      --font-head: "MaruBuri", "Noto Serif KR", "Times New Roman", serif;
      --font-mono: "JetBrains Mono", "D2Coding", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --bg: #0b0f14;
      --bg-soft: #121923;
      --surface: #131d2a;
      --surface-2: #192637;
      --ink: #eaf1ff;
      --muted: #a9b8cc;
      --line: #243246;
      --accent: #3dd6c6;
      --accent-2: #6ea8ff;
      --warn: #f5b74f;
      --danger: #f36a6a;
      --ok: #31c48d;
      --focus: #8ab4ff;
      --radius-s: 8px;
      --radius-m: 12px;
      --radius-l: 16px;
      --shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      font-family: var(--font-ui);
      background:
        radial-gradient(1200px 700px at 8% -15%, #19304f 0%, var(--bg) 52%),
        radial-gradient(900px 500px at 110% 12%, #132b3d 0%, transparent 62%),
        linear-gradient(180deg, #0a1018 0%, #0b121a 100%);
      color: var(--ink);
      letter-spacing: 0.01em;
    }
    .wrap { max-width: 1580px; margin: 0 auto; padding: 16px 18px 28px; }
    .ops-shell { display: grid; gap: 14px; }
    h1 { margin: 0; font-size: 22px; font-family: var(--font-head); letter-spacing: 0.015em; }
    h3 { margin: 0 0 10px; font-size: 14px; letter-spacing: 0.03em; text-transform: uppercase; color: #c8d8f1; }
    .sub { color: var(--muted); margin-bottom: 10px; font-size: 12px; line-height: 1.45; }
    .top-sub { margin: 2px 0 0; font-size: 12px; }
    .ops-topbar {
      position: sticky;
      top: 0;
      z-index: 15;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid rgba(110, 168, 255, 0.2);
      border-radius: var(--radius-l);
      background: rgba(16, 25, 38, 0.88);
      backdrop-filter: blur(10px);
      box-shadow: var(--shadow);
    }
    .top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .mission-nav {
      position: sticky;
      top: 78px;
      z-index: 14;
      border-color: rgba(61, 214, 198, 0.3);
      background: rgba(10, 18, 30, 0.9);
      backdrop-filter: blur(10px);
    }
    .tab-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .tab-btn {
      border-radius: 999px;
      padding: 7px 12px;
      border: 1px solid rgba(110, 168, 255, 0.28);
      background: rgba(14, 29, 48, 0.8);
    }
    .tab-btn.is-active {
      border-color: rgba(61, 214, 198, 0.56);
      background: rgba(61, 214, 198, 0.2);
      color: #c8fff7;
    }
    .command-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 10px;
    }
    .command-box {
      border: 1px solid rgba(110, 168, 255, 0.16);
      border-radius: 12px;
      background: rgba(9, 16, 27, 0.72);
      padding: 10px;
    }
    .tab-pane { display: none; }
    body[data-tab="overview"] .tab-overview { display: block; }
    body[data-tab="triage"] .tab-triage { display: block; }
    body[data-tab="storage"] .tab-storage { display: block; }
    body[data-tab="operations"] .tab-operations { display: block; }
    body[data-tab="overview"] #cards.tab-overview { display: grid; }
    .ops-main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
    .ops-main.tab-pane { display: none; }
    body[data-tab="triage"] .ops-main.tab-triage { display: grid; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 2px; }
    .card {
      background: linear-gradient(180deg, rgba(25, 38, 55, 0.98), rgba(19, 29, 42, 0.98));
      border: 1px solid rgba(110, 168, 255, 0.16);
      border-radius: 14px;
      padding: 12px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .v { font-size: 22px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .panel {
      background: linear-gradient(180deg, rgba(19, 29, 42, 0.98), rgba(14, 22, 34, 0.98));
      border: 1px solid rgba(110, 168, 255, 0.16);
      border-radius: var(--radius-l);
      padding: 14px;
      margin-bottom: 14px;
      box-shadow: var(--shadow);
    }
    .panel p { margin: 6px 0; font-size: 13px; line-height: 1.45; }
    .ops-filters {
      position: sticky;
      top: 88px;
      z-index: 12;
      border-color: rgba(61, 214, 198, 0.24);
      background: rgba(17, 27, 40, 0.92);
      backdrop-filter: blur(8px);
    }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    .filter-row { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
    .filter-row > * { flex-shrink: 0; }
    .action-bar { justify-content: flex-end; }
    input[type="text"], select {
      border: 1px solid rgba(110, 168, 255, 0.18);
      border-radius: var(--radius-s);
      padding: 8px 10px;
      min-width: 120px;
      background: #0d1521;
      color: var(--ink);
      font-size: 13px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    input[type="text"] { min-width: 230px; }
    input[type="text"]:focus, select:focus, button:focus {
      outline: none;
      border-color: var(--focus);
      box-shadow: 0 0 0 2px rgba(138, 180, 255, 0.2);
    }
    #search { width: 240px; transition: width 0.2s ease; }
    #search:focus { width: min(420px, 60vw); }
    button {
      border: 1px solid rgba(110, 168, 255, 0.2);
      background: #122034;
      color: var(--ink);
      border-radius: var(--radius-s);
      padding: 8px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      transition: transform 0.12s ease, background 0.15s ease, border-color 0.15s ease;
    }
    button:hover { background: #17283f; border-color: rgba(110, 168, 255, 0.32); }
    button:active { transform: translateY(1px); }
    button.primary { background: var(--accent); color: #042224; border-color: rgba(61, 214, 198, 0.6); }
    button.secondary { background: var(--accent-2); color: #051631; border-color: rgba(110, 168, 255, 0.7); }
    button.ghost { background: transparent; border-color: rgba(110, 168, 255, 0.2); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid rgba(110, 168, 255, 0.14); text-align: left; padding: 8px 7px; vertical-align: top; }
    th {
      background: rgba(12, 20, 32, 0.95);
      position: sticky;
      top: 0;
      z-index: 3;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      color: #b7cae8;
    }
    .table-scroll {
      max-height: 460px;
      overflow: auto;
      border: 1px solid rgba(110, 168, 255, 0.18);
      border-radius: var(--radius-m);
      background: rgba(10, 17, 28, 0.62);
    }
    .table-wrap { max-height: 620px; }
    .table-scroll.has-scroll-left { box-shadow: inset 8px 0 10px -8px rgba(7, 145, 174, 0.45); }
    .table-scroll.has-scroll-right { box-shadow: inset -8px 0 10px -8px rgba(7, 145, 174, 0.45); }
    .mono { font-family: var(--font-mono); font-size: 12px; font-variant-numeric: tabular-nums; }
    .tag {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid rgba(110, 168, 255, 0.2);
      margin-right: 4px;
      margin-bottom: 4px;
      background: rgba(18, 33, 53, 0.9);
      color: #d2def0;
      font-size: 11px;
    }
    .tag.high { background: rgba(243, 106, 106, 0.14); border-color: rgba(243, 106, 106, 0.42); color: #ffc1c1; }
    .tag.medium { background: rgba(245, 183, 79, 0.14); border-color: rgba(245, 183, 79, 0.42); color: #ffe3a8; }
    .tag.low { background: rgba(49, 196, 141, 0.14); border-color: rgba(49, 196, 141, 0.42); color: #b6f6de; }
    .rec-list { display: grid; gap: 8px; }
    .rec-item { border: 1px solid rgba(110, 168, 255, 0.18); border-radius: 12px; padding: 10px; background: rgba(10, 18, 29, 0.74); }
    .warn { color: var(--warn); font-weight: 700; }
    code { color: #8ad9ff; }
    .clip { display: inline-block; max-width: 420px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
    .runtime-card { border-color: rgba(110, 168, 255, 0.26); background: linear-gradient(180deg, rgba(18, 33, 53, 0.98), rgba(13, 23, 35, 0.98)); }
    .runtime-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .runtime-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
    .runtime-metric { border: 1px solid rgba(110, 168, 255, 0.16); border-radius: 12px; background: rgba(10, 19, 30, 0.74); padding: 10px; }
    .runtime-metric .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .runtime-metric .value { margin-top: 4px; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .runtime-metric .meta { margin-top: 4px; font-size: 11px; color: #9fb3cf; }
    .ops-ob-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .ops-alert { color: #ffe2ad; border: 1px dashed rgba(245, 183, 79, 0.42); padding: 8px 10px; border-radius: 10px; margin-bottom: 8px; background: rgba(245, 183, 79, 0.08); }
    .ops-ok { color: #b6f6de; border: 1px dashed rgba(49, 196, 141, 0.42); padding: 8px 10px; border-radius: 10px; margin-bottom: 8px; background: rgba(49, 196, 141, 0.08); }
    .cmd-clip { max-width: 620px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom; }
    .tiny-note { font-size: 11px; color: #8ea5c6; }
    .status-pill {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid rgba(110, 168, 255, 0.25);
      background: rgba(14, 29, 48, 0.88);
      font-size: 11px;
    }
    .status-pill.ok { color: #9bf5cf; border-color: rgba(49, 196, 141, 0.45); background: rgba(49, 196, 141, 0.14); }
    .status-pill.warn { color: #ffe7b8; border-color: rgba(245, 183, 79, 0.45); background: rgba(245, 183, 79, 0.14); }
    .status-pill.bad { color: #ffc6c6; border-color: rgba(243, 106, 106, 0.45); background: rgba(243, 106, 106, 0.14); }
    .status-pill.pass { color: #b6f6de; border-color: rgba(49, 196, 141, 0.45); background: rgba(49, 196, 141, 0.14); }
    .status-pill.fail { color: #ffc6c6; border-color: rgba(243, 106, 106, 0.45); background: rgba(243, 106, 106, 0.14); }
    .health-table td:nth-child(3) { width: 58%; }
    .hot-queue-table td:nth-child(1), .hot-queue-table td:nth-child(2), .hot-queue-table td:nth-child(3) {
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono);
    }
    .forensics-grid { display: grid; gap: 6px; }
    .evidence-list { margin: 0; padding-left: 16px; color: #cfdae8; }
    .evidence-list li { margin: 2px 0; }
    tr.row-selected, tr.thread-row.row-selected { background: rgba(110, 168, 255, 0.12); }
    tr.thread-row.row-active { outline: 1px solid rgba(61, 214, 198, 0.7); outline-offset: -1px; }
    tr.thread-row { cursor: pointer; }
    tr.thread-row:hover { background: rgba(110, 168, 255, 0.08); }
    .empty-msg { color: var(--muted); font-size: 13px; padding: 10px 4px; }
    .loop-dock { border-color: rgba(61, 214, 198, 0.3); }
    .loop-quickstart { margin-bottom: 10px; border-style: dashed; }
    .loop-chip { border-radius: 999px; padding: 3px 10px; border: 1px solid rgba(110, 168, 255, 0.25); background: rgba(14, 29, 48, 0.88); cursor: pointer; }
    .loop-chip.active { background: rgba(110, 168, 255, 0.2); border-color: rgba(110, 168, 255, 0.5); color: #d8e9ff; }
    .loop-table td { vertical-align: middle; }
    .loop-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .status-dot.running { background: #31c48d; box-shadow: 0 0 0 3px rgba(49, 196, 141, 0.2); }
    .status-dot.stopped { background: #f36a6a; box-shadow: 0 0 0 3px rgba(243, 106, 106, 0.2); }
    .stale-fresh { color: #9bf5cf; }
    .stale-aging { color: #ffe3a8; }
    .stale-stale { color: #ffc6c6; animation: pulseWarn 1.6s infinite; }
    .stale-unknown { color: #9aaac0; }
    .ops-table-panel { margin-bottom: 0; }
    #threadTableWrap { max-height: 640px; }
    #threadTable th:nth-child(1), #threadTable td:nth-child(1),
    #threadTable th:nth-child(2), #threadTable td:nth-child(2) {
      position: sticky;
      left: 0;
      z-index: 2;
      background: rgba(12, 20, 32, 0.97);
    }
    #threadTable th:nth-child(2), #threadTable td:nth-child(2) { left: 58px; }
    #threadTable td:nth-child(5), #threadTable td:nth-child(6), #threadTable td:nth-child(13) {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: var(--font-mono);
    }
    .thread-cards { display: none; gap: 8px; }
    .thread-card {
      border: 1px solid rgba(110, 168, 255, 0.2);
      border-radius: 12px;
      padding: 10px;
      background: rgba(10, 18, 29, 0.74);
    }
    .thread-card h4 { margin: 0 0 6px; font-size: 13px; }
    .thread-card .meta { color: var(--muted); font-size: 11px; margin-bottom: 4px; }
    .ops-sidepanel { max-height: 760px; overflow: auto; }
    .ops-sidepanel .inspector-block { border: 1px solid rgba(110, 168, 255, 0.16); border-radius: 10px; padding: 8px; margin-bottom: 8px; background: rgba(8, 15, 24, 0.7); }
    .ops-sidepanel h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: 0.03em; text-transform: uppercase; color: #bdd0eb; }
    .ops-sidepanel .mono { word-break: break-word; }
    .filter-chip { border-radius: 999px; padding: 5px 10px; border: 1px solid rgba(110, 168, 255, 0.2); background: rgba(14, 29, 48, 0.88); }
    .filter-chip.is-active { border-color: rgba(61, 214, 198, 0.52); background: rgba(61, 214, 198, 0.16); color: #b6f6ee; }
    .quick-filter-modal {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 30;
      background: rgba(4, 9, 16, 0.6);
    }
    .quick-filter-modal.open { display: flex; }
    .quick-filter-box {
      width: min(620px, 92vw);
      border: 1px solid rgba(110, 168, 255, 0.3);
      border-radius: 14px;
      background: rgba(14, 24, 37, 0.98);
      padding: 14px;
      box-shadow: var(--shadow);
    }
    .quick-filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .quick-filter-grid button { text-align: left; padding: 10px; }
    body.is-compact .table-scroll { max-height: 520px; }
    body.is-compact th, body.is-compact td { padding-top: 5px; padding-bottom: 5px; }
    body.is-cards #threadTableWrap { display: none; }
    body.is-cards .thread-cards { display: grid; }
    .desktop-only { display: inline-flex; }
    @keyframes pulseWarn {
      0% { opacity: 1; }
      50% { opacity: 0.45; }
      100% { opacity: 1; }
    }
    @media (max-width: 1200px) {
      .ops-main { grid-template-columns: 1fr; }
      .ops-sidepanel { max-height: none; }
      .ops-ob-grid { grid-template-columns: 1fr; }
      .command-grid { grid-template-columns: 1fr; }
      #threadTable th:nth-child(1), #threadTable td:nth-child(1),
      #threadTable th:nth-child(2), #threadTable td:nth-child(2) { position: static; left: auto; }
    }
    @media (max-width: 860px) {
      .wrap { padding: 12px; }
      .ops-topbar { top: 0; padding: 10px; }
      .mission-nav { top: 72px; }
      .top-actions { width: 100%; }
      .desktop-only { display: none; }
      .filter-row { flex-wrap: wrap; }
      #search { width: min(100%, 420px); }
      body:not(.is-cards) #threadTableWrap { display: none; }
      body:not(.is-cards) .thread-cards { display: grid; }
    }
  </style>
</head>
<body>
<div class="wrap ops-shell" id="appShell">
  <div class="ops-topbar">
    <div>
      <h1>Codex 로컬 Mission Control</h1>
      <div class="sub top-sub">스레드/프로젝트를 한눈에 보고 리스크, 병목, 정리 대상을 빠르게 조작할 수 있습니다.</div>
    </div>
    <div class="top-actions">
      <button id="topRefresh" class="primary">전체 새로고침</button>
      <button id="topCommand" class="ghost desktop-only">Quick Filter (Ctrl/Cmd+K)</button>
      <span id="topLastRefresh" class="status-pill mono">last refresh --:--:--</span>
    </div>
  </div>

  <div class="panel mission-nav">
    <div class="tab-nav" id="mainTabs">
      <button class="tab-btn is-active" data-tab="overview">Overview</button>
      <button class="tab-btn" data-tab="triage">Triage</button>
      <button class="tab-btn" data-tab="storage">Storage & Risk</button>
      <button class="tab-btn" data-tab="operations">Operations</button>
    </div>
    <div class="row action-bar">
      <label>자동 새로고침
        <select id="globalAutoRefresh">
          <option value="0">OFF</option>
          <option value="15000">15s</option>
          <option value="30000">30s</option>
          <option value="60000">60s</option>
        </select>
      </label>
      <button id="downloadSnapshot" class="secondary">상태 스냅샷 저장</button>
      <span id="globalRefreshStatus" class="status-pill mono">auto off</span>
    </div>
  </div>

  <div class="panel runtime-card tab-pane tab-overview" id="commandCenterPanel">
    <div class="runtime-head">
      <h3>Command Center</h3>
      <span id="commandCenterStamp" class="mono">로딩 대기</span>
    </div>
    <div id="overviewBadges" class="runtime-grid">
      <div class="runtime-metric">
        <div class="label">Overview</div>
        <div class="value">--</div>
        <div class="meta">초기 로딩 중</div>
      </div>
    </div>
    <div class="command-grid" style="margin-top:10px;">
      <div class="command-box">
        <div class="tiny-note">Hot Queue (현재 페이지 기준 우선순위)</div>
        <div class="row" style="margin-top:6px;">
          <button id="todaySelectHighRisk">오늘 처리: High Risk 20</button>
          <button id="todaySelectCtxHot">오늘 처리: Ctx Hot 20</button>
          <button id="todaySelectOrphans">오늘 처리: Orphan 20</button>
          <button id="todayQueueDryRun">오늘 큐 정리 미리보기</button>
          <button id="todayClearSelection" class="ghost">선택 비우기</button>
        </div>
        <div id="todayQueueStatus" class="tiny-note mono">오늘 처리 큐 대기</div>
        <div class="table-scroll" style="max-height:200px; margin-top:6px;">
          <table class="hot-queue-table">
            <thead><tr><th>risk</th><th>ctx</th><th>age(d)</th><th>title</th><th>id</th></tr></thead>
            <tbody id="hotQueueBody"></tbody>
          </table>
        </div>
      </div>
      <div class="command-box">
        <div class="tiny-note">Health Radar</div>
        <div id="healthSummaryMini" class="sub">health-check 로딩 중...</div>
      </div>
    </div>
  </div>

  <div class="panel runtime-card tab-pane tab-overview">
    <div class="runtime-head">
      <h3>Runtime Health</h3>
      <span id="runtimeHealthStamp" class="mono">로딩 대기</span>
    </div>
    <div id="runtimeHealth" class="runtime-grid">
      <div class="runtime-metric">
        <div class="label">System</div>
        <div class="value">--</div>
        <div class="meta">초기 로딩 중</div>
      </div>
    </div>
  </div>

  <div class="panel runtime-card tab-pane tab-operations">
    <div class="runtime-head">
      <h3>Codex Runtime Observatory</h3>
      <span id="opsStamp" class="mono">관제 로딩 대기</span>
    </div>
    <div id="opsSummary" class="runtime-grid">
      <div class="runtime-metric">
        <div class="label">Codex Processes</div>
        <div class="value">--</div>
        <div class="meta">초기 로딩 중</div>
      </div>
    </div>
    <div id="opsAlertBox" class="sub">관제 데이터 로딩 중...</div>
    <div class="row">
      <button id="opsRefresh">관제 새로고침</button>
      <label><input id="opsShowAllProc" type="checkbox" /> 프로세스 전체 표시</label>
      <span id="opsProcessStatus" class="mono tiny-note"></span>
    </div>
    <div class="ops-ob-grid">
      <div>
        <div class="tiny-note">Process Groups (중복/누적 확인)</div>
        <div class="table-scroll" style="max-height:220px; margin-top:6px;">
          <table>
            <thead><tr><th>signature</th><th>class</th><th>count</th><th>cpu%</th><th>mem%</th><th>sample</th></tr></thead>
            <tbody id="opsGroupBody"></tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="tiny-note">Live Processes (실행 중)</div>
        <div class="table-scroll" style="max-height:220px; margin-top:6px;">
          <table>
            <thead><tr><th>pid</th><th>class</th><th>cpu%</th><th>mem%</th><th>state</th><th>etime</th><th>command</th></tr></thead>
            <tbody id="opsProcBody"></tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="tiny-note">tmux Sessions / Panes (감독 루프 포함)</div>
        <div class="table-scroll" style="max-height:220px; margin-top:6px;">
          <table>
            <thead><tr><th>session</th><th>windows</th><th>related</th><th>pane</th><th>pid</th><th>cmd</th><th>path</th></tr></thead>
            <tbody id="opsTmuxBody"></tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="tiny-note">Launch Services / Listen Ports</div>
        <div class="table-scroll" style="max-height:220px; margin-top:6px;">
          <table>
            <thead><tr><th>type</th><th>label/command</th><th>pid</th><th>status/listen</th></tr></thead>
            <tbody id="opsSvcBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div class="panel tab-pane tab-operations">
    <div class="runtime-head">
      <h3>System Health Check</h3>
      <span id="healthCheckStamp" class="mono">health-check 로딩 대기</span>
    </div>
    <div id="healthSummary" class="sub">로딩 중...</div>
    <div class="table-scroll" style="max-height:240px;">
      <table class="health-table">
        <thead><tr><th>Check</th><th>Status</th><th>Detail</th><th>Value</th></tr></thead>
        <tbody id="healthCheckBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-operations">
    <div class="runtime-head">
      <h3>Compare Apps Lab</h3>
      <span id="compareAppsStamp" class="mono">비교앱 상태 로딩 대기</span>
    </div>
    <div id="compareAppsSummary" class="sub">Codexia / CCManager / Mission Control 실행 상태를 확인합니다.</div>
    <div class="table-scroll" style="max-height:260px;">
      <table>
        <thead><tr><th>App</th><th>Installed</th><th>Running</th><th>Location</th><th>Quick Action</th></tr></thead>
        <tbody id="compareAppsBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-operations">
    <div class="runtime-head">
      <h3>Alert Hooks</h3>
      <span id="alertHooksStamp" class="mono">alert hooks 로딩 대기</span>
    </div>
    <div id="alertHooksSummary" class="sub">임계값 규칙 기반 경고와 이벤트 로그를 관리합니다.</div>
    <div class="row">
      <label><input id="alertDesktopNotify" type="checkbox" /> macOS 데스크탑 알림</label>
      <button id="alertEvaluateNow" class="primary">지금 평가/경고 발생</button>
      <button id="alertHooksRefresh" class="ghost">상태 새로고침</button>
      <span id="alertHooksStatus" class="mono tiny-note"></span>
    </div>
    <div class="table-scroll" style="max-height:220px;">
      <table>
        <thead><tr><th>Rule</th><th>Enabled</th><th>Threshold</th><th>Metric</th><th>Cooldown</th><th>Action</th></tr></thead>
        <tbody id="alertRuleBody"></tbody>
      </table>
    </div>
    <div class="table-scroll" style="max-height:160px; margin-top:8px;">
      <table>
        <thead><tr><th>Active Alerts</th><th>Value</th><th>Threshold</th><th>Severity</th></tr></thead>
        <tbody id="alertActiveBody"></tbody>
      </table>
    </div>
    <div class="table-scroll" style="max-height:180px; margin-top:8px;">
      <table>
        <thead><tr><th>Timestamp</th><th>Rule</th><th>Severity</th><th>Message</th></tr></thead>
        <tbody id="alertEventBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-operations">
    <div class="runtime-head">
      <h3>W4 Recovery Drill</h3>
      <span id="recoveryStamp" class="mono">recovery 로딩 대기</span>
    </div>
    <div id="recoverySummary" class="sub">백업 세트/복구 계획/체크리스트를 점검합니다.</div>
    <div class="row">
      <button id="recoveryRefresh" class="ghost">상태 갱신</button>
      <button id="recoveryRunDrill" class="primary">복구 드릴 실행</button>
      <span id="recoveryStatus" class="mono tiny-note"></span>
    </div>
    <div class="table-scroll" style="max-height:200px;">
      <table>
        <thead><tr><th>Backup ID</th><th>Files</th><th>Size</th><th>Updated</th><th>Path</th></tr></thead>
        <tbody id="recoveryBackupBody"></tbody>
      </table>
    </div>
    <div class="table-scroll" style="max-height:180px; margin-top:8px;">
      <table>
        <thead><tr><th>Checklist</th><th>Done</th></tr></thead>
        <tbody id="recoveryChecklistBody"></tbody>
      </table>
    </div>
    <div class="table-scroll" style="max-height:180px; margin-top:8px;">
      <table>
        <thead><tr><th>Restore Preview src</th><th>dst</th></tr></thead>
        <tbody id="recoveryPreviewBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel loop-dock tab-pane tab-operations">
    <div class="runtime-head">
      <h3>AGI Loop Control</h3>
      <span id="loopControlStamp" class="mono">loop status loading...</span>
    </div>
    <div id="loopQuickStart" class="rec-item loop-quickstart">
      <strong>Operator Quick Start</strong>
      <div class="sub">1) 항상 `status` 확인 후 `start/restart`를 누르세요.</div>
      <div class="sub">2) `stale`는 멈춤 의심 신호입니다. `restart` 또는 `watch-start`를 먼저 실행하세요.</div>
      <div class="sub">3) `Watch Live`로 tmux에 붙어 프롬프트/응답을 즉시 확인하세요.</div>
      <button id="dismissQuickStart">다시 보지 않기</button>
    </div>
    <div class="row">
      <label>선택 루프
        <select id="loopSelect"></select>
      </label>
      <button id="loopActionStart" class="primary">Start</button>
      <button id="loopActionStop">Stop</button>
      <button id="loopActionRestart">Restart</button>
      <button id="loopActionRun2">Run2</button>
      <button id="loopActionWatchStart">Watch Start</button>
      <button id="loopActionWatchStop">Watch Stop</button>
      <label><input id="loopAutoRefresh" type="checkbox" checked /> 10초 자동 새로고침</label>
      <span id="selectedLoopPill" class="tag mono">selected: -</span>
      <span id="loopActionStatus" class="mono"></span>
    </div>
    <div class="row">
      <button class="loop-chip active" data-loop-filter="all">All</button>
      <button class="loop-chip" data-loop-filter="active">Active</button>
      <button class="loop-chip" data-loop-filter="attention">Needs Attention</button>
      <button id="openLoopTmux">Watch Live (tmux)</button>
    </div>
    <div class="table-scroll" style="max-height:280px;">
      <table class="loop-table">
        <thead>
          <tr>
            <th>Loop</th>
            <th>Status</th>
            <th>Watchdog</th>
            <th>Phase</th>
            <th>RID</th>
            <th>Verdict</th>
            <th>Staleness</th>
            <th>Last Update</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="loopBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-overview">
    <h3>쉽게 보는 설명</h3>
    <p><span class="tag">Project Bucket</span> Codex 앱 내부에서 프로젝트 대화를 묶는 저장소 그룹 ID입니다. 일반 폴더명이 아니라 내부 키(`project-g-p-*`)입니다.</p>
    <p><span class="tag">global-state</span> 사이드바 제목 메타에서 직접 읽은 제목입니다.</p>
    <p><span class="tag">manual-map</span> 로컬 캐시 메타를 기반으로 제가 강제 매핑해 고정 저장한 제목입니다.</p>
    <p><span class="tag">session-log</span> 제목 메타가 없어서 세션 로그 첫 사용자 메시지로 복원한 제목입니다.</p>
    <p><span class="tag">history-log</span> <code>~/.codex/history.jsonl</code>에서 세션 첫 문장을 복원한 제목입니다.</p>
    <p><span class="tag">local-cache-inferred</span> 대화 캐시 파일 메타(버킷/시간)로 유추한 제목입니다.</p>
  </div>

  <div class="panel tab-pane tab-overview">
    <h3>Codex 구조 한눈에 보기</h3>
    <p><span class="tag">Thread(대화방)</span> 네가 사이드바에서 보는 대화 단위. 제목/정렬/핀은 <code>~/.codex/.codex-global-state.json</code>에서 관리.</p>
    <p><span class="tag">Session(실행기록)</span> Codex가 실제로 작업한 실행 로그 단위. <code>~/.codex/sessions/rollout-*.jsonl</code>.</p>
    <p><span class="tag">Project Bucket</span> 프로젝트별 로컬 연결 캐시 묶음. <code>~/Library/Application Support/com.openai.chat/project-g-p-*</code>.</p>
    <p><span class="tag">Chat Cache(.data)</span> 앱 렌더링/동기화용 내부 캐시. 사람이 읽기 어렵고, 정리는 꼭 미리보기 후 실행.</p>
  </div>

  <div id="cards" class="cards tab-pane tab-overview"></div>

  <div class="panel tab-pane tab-overview">
    <div class="runtime-head">
      <h3>Data Source Inventory</h3>
      <span id="dataSourceStatus" class="sub">로딩 중...</span>
    </div>
    <div class="table-scroll" style="max-height:260px;">
      <table>
        <thead><tr><th>Source</th><th>Status</th><th>Records</th><th>Updated</th><th>Notes</th></tr></thead>
        <tbody id="dataSourceBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-overview">
    <h3>운영 리스크 요약</h3>
    <div id="riskSummary" class="sub">로딩 중...</div>
    <div id="recommendBody" class="rec-list"></div>
  </div>

  <div class="panel tab-pane tab-overview">
    <div class="runtime-head">
      <h3>실행 로드맵 (1~4주 트랙)</h3>
      <span id="roadmapStamp" class="mono">로드맵 로딩 대기</span>
    </div>
    <div id="roadmapSummary" class="sub">진행 현황 로딩 중...</div>
    <div class="row">
      <input id="roadmapNote" type="text" placeholder="이번 체크인 메모 (예: 큐->미리보기 배치 자동화 착수)" />
      <button id="roadmapCheckin">지금 체크인 기록</button>
      <button id="roadmapRefresh" class="ghost">로드맵 갱신</button>
      <label><input id="roadmapAutoCheckin" type="checkbox" checked /> 30분 자동 체크인</label>
      <span id="roadmapCheckinStatus" class="mono tiny-note"></span>
    </div>
    <div class="table-scroll" style="max-height:260px;">
      <table>
        <thead><tr><th>Week</th><th>Status</th><th>Progress</th><th>Focus</th><th>Done</th><th>Next</th></tr></thead>
        <tbody id="roadmapBody"></tbody>
      </table>
    </div>
    <div class="table-scroll" style="max-height:180px; margin-top:8px;">
      <table>
        <thead><tr><th>Timestamp</th><th>Actor</th><th>Snapshot</th><th>Note</th></tr></thead>
        <tbody id="roadmapLogBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-overview">
    <h3>GUI ↔ Terminal 공유 상태</h3>
    <div id="syncStatus" class="sub">로딩 중...</div>
    <div class="sub">필터 프리셋 버튼은 상단 `Threads Control Rail`에서 바로 실행할 수 있습니다.</div>
  </div>

  <div class="panel ops-filters tab-pane tab-triage">
    <div class="runtime-head">
      <h3>Threads Control Rail</h3>
      <span id="activeFilterCount" class="status-pill mono">filters 0</span>
    </div>
    <div class="row filter-row">
      <input id="search" type="text" placeholder="스레드 제목/ID/작업경로 검색" />
      <label><input id="onlyPinned" type="checkbox" /> pinned만</label>
      <label><input id="onlyNoProject" type="checkbox" /> 프로젝트 미연결만</label>
      <label><input id="onlyNoLocal" type="checkbox" /> 로컬 데이터 없는 것만</label>
      <label>범위
        <select id="scopeFilter">
          <option value="all">전체</option>
          <option value="ui">UI 스레드만</option>
          <option value="internal">내부 아티팩트만</option>
          <option value="gui_hidden">GUI 숨김 후보만</option>
          <option value="gui_linked">GUI+세션 연결만</option>
        </select>
      </label>
      <label>소스
        <select id="sourceFilter">
          <option value="">전체</option>
          <option value="global-state">UI 대화(global-state)</option>
          <option value="session-log">session-log</option>
          <option value="history-log">history-log</option>
          <option value="manual-map">manual-map</option>
          <option value="meta-fallback">meta-fallback</option>
          <option value="local-cache-inferred">local-cache-inferred</option>
        </select>
      </label>
      <label>정렬
        <select id="sortFilter">
          <option value="order">UI 순서</option>
          <option value="risk_desc">Risk 높은순</option>
          <option value="ctx_desc">Ctx 높은순</option>
          <option value="recent_desc">최근순</option>
        </select>
      </label>
      <label>최소 Risk
        <select id="minRisk">
          <option value="0">0</option>
          <option value="20">20</option>
          <option value="40">40</option>
          <option value="60">60</option>
          <option value="80">80</option>
        </select>
      </label>
      <label>최소 Ctx
        <select id="minCtx">
          <option value="0">0</option>
          <option value="30">30</option>
          <option value="50">50</option>
          <option value="70">70</option>
          <option value="85">85</option>
        </select>
      </label>
      <button id="toggleCompact" class="ghost filter-chip">Compact</button>
      <button id="toggleCards" class="ghost filter-chip">Card View</button>
      <button id="openQuickFilter" class="ghost filter-chip">Quick Filter</button>
    </div>
    <div class="row action-bar">
      <button id="refreshBtn">새로고침</button>
      <button id="presetUiOnly">UI 대화만</button>
      <button id="presetInternalOnly">내부 아티팩트만</button>
      <button id="presetReset">필터 초기화</button>
      <button id="presetTerminalSessions">터미널 세션 위주 보기</button>
      <button id="presetLinkedOnly">GUI+터미널 연결만 보기</button>
      <button id="presetGuiHidden">GUI 숨김 후보만 보기</button>
      <button id="selectVisible">현재 보이는 항목 선택</button>
      <button id="clearSel">선택 해제</button>
      <button id="copyIds" class="primary">선택 ID 복사</button>
      <button id="pinSelected">Pin</button>
      <button id="unpinSelected">Unpin</button>
      <button id="archiveLocalSelected">로컬 아카이브(숨김)</button>
      <button id="copyResumeCmd">Resume 명령 복사</button>
      <button id="downloadJson" class="secondary">선택 JSON 저장</button>
      <button id="analyzeDelete">삭제 영향 분석</button>
      <span id="threadActionStatus" class="mono tiny-note"></span>
    </div>
  </div>

  <div class="ops-main tab-pane tab-triage">
    <div class="panel ops-table-panel">
      <div class="row">
        <input id="renameInput" type="text" placeholder="선택 1개 스레드의 새 제목 입력" />
        <button id="renameThread">선택 1개 제목 변경</button>
        <span id="renameStatus" class="mono"></span>
      </div>
      <div class="row">
        <span id="selCount" class="warn">선택 0개</span>
        <label>페이지 크기
          <select id="pageSize">
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </label>
        <button id="prevPage">이전</button>
        <button id="nextPage">다음</button>
        <span id="pageInfo" class="mono"></span>
        <span id="threadRenderStatus" class="mono tiny-note"></span>
      </div>
      <div id="threadTableWrap" class="table-scroll table-wrap">
        <table id="threadTable" class="ops-table">
          <thead>
            <tr>
              <th>선택</th>
              <th>제목</th>
              <th>ID</th>
              <th>제목소스</th>
              <th>Risk</th>
              <th>Ctx</th>
              <th>태그</th>
              <th>Pinned</th>
              <th>로컬데이터</th>
              <th>세션로그</th>
              <th>상태</th>
              <th>Last Activity</th>
              <th>Age(d)</th>
              <th>추정 작업경로</th>
              <th>프로젝트 연결</th>
            </tr>
          </thead>
          <tbody id="threadBody"></tbody>
        </table>
      </div>
      <div id="threadCards" class="thread-cards"></div>
    </div>

    <aside id="threadInspectorPanel" class="panel ops-sidepanel">
      <div class="runtime-head">
        <h3>Thread Inspector</h3>
        <button id="clearInspector" class="ghost">닫기</button>
      </div>
      <div id="threadInspectorEmpty" class="sub">테이블에서 행을 클릭하면 스레드 상세/리스크/경로를 빠르게 확인할 수 있습니다.</div>
      <div id="threadInspector"></div>
    </aside>
  </div>

  <div class="panel tab-pane tab-triage">
    <h3>삭제 영향 분석(선택 항목)</h3>
    <div id="impactSummary" class="sub">선택 후 '삭제 영향 분석'을 누르세요.</div>
    <div class="table-scroll" style="max-height:280px;">
      <table>
        <thead><tr><th>ID</th><th>Risk</th><th>요약</th><th>부모 연결</th></tr></thead>
        <tbody id="impactBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-triage">
    <h3>Thread Forensics (선택 연동)</h3>
    <div id="forensicsSummary" class="sub">선택된 스레드의 부모/아티팩트/리스크 증거를 자동으로 불러옵니다.</div>
    <div class="table-scroll" style="max-height:320px;">
      <table>
        <thead><tr><th>Thread</th><th>Risk</th><th>Parents</th><th>Artifacts</th><th>Quick Evidence</th></tr></thead>
        <tbody id="forensicsBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-triage">
    <h3>로컬 정리 실행(선택 항목)</h3>
    <div class="row">
      <label><input id="optDeleteCache" type="checkbox" checked /> 캐시 파일 삭제(com.openai.chat)</label>
      <label><input id="optDeleteSessionLogs" type="checkbox" checked /> 세션 로그 삭제(~/.codex/sessions, archived_sessions)</label>
      <label><input id="optCleanStateRefs" type="checkbox" checked /> 사이드바 메타 참조 정리(.codex-global-state.json)</label>
    </div>
    <div class="row">
      <label style="min-width: 220px;">실행 토큰
        <input id="cleanupConfirmToken" type="text" placeholder="미리보기 토큰(DEL-...)" />
      </label>
      <button id="copyCleanupToken" class="ghost">토큰 복사</button>
      <span id="cleanupExpectedToken" class="mono tiny-note">expected: -</span>
    </div>
    <div class="row">
      <button id="dryRunCleanup">정리 미리보기</button>
      <button id="executeCleanup" class="secondary">정리 실행(백업 후)</button>
    </div>
    <div id="cleanupSummary" class="sub">선택 후 미리보기를 먼저 실행하세요.</div>
    <div class="table-scroll" style="max-height:220px;">
      <table>
        <thead><tr><th>kind</th><th>thread id</th><th>path</th></tr></thead>
        <tbody id="cleanupBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-storage">
    <h3>Workspace Roots (.codex state)</h3>
    <div class="table-scroll" style="max-height:220px;">
      <table>
        <thead><tr><th>Path</th><th>Active</th><th>Exists</th><th>Label</th></tr></thead>
        <tbody id="workspaceBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-storage">
    <h3>Codex Project Buckets (com.openai.chat)</h3>
    <div class="table-scroll" style="max-height:260px;">
      <table>
        <thead><tr><th>Bucket</th><th>Thread Count</th><th>Likely Workspaces</th><th>Path</th></tr></thead>
        <tbody id="bucketBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-storage">
    <h3>컨텍스트 병목 (cwd 기준)</h3>
    <div class="sub">avg_score가 높을수록 컨텍스트/로그 부하가 큰 작업경로입니다.</div>
    <div class="table-scroll" style="max-height:260px;">
      <table>
        <thead><tr><th>cwd</th><th>threads</th><th>avg</th><th>max</th><th>high risk</th><th>internal</th><th>orphan</th><th>tool calls</th><th>lines</th></tr></thead>
        <tbody id="ctxBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel tab-pane tab-storage">
    <h3>Labs Projects</h3>
    <div class="table-scroll" style="max-height:260px;">
      <table>
        <thead><tr><th>Name</th><th>Git</th><th>Path</th></tr></thead>
        <tbody id="labsBody"></tbody>
      </table>
    </div>
  </div>

  <div class="panel mono tab-pane tab-storage" id="paths"></div>
</div>

<div id="quickFilterModal" class="quick-filter-modal">
  <div class="quick-filter-box">
    <div class="runtime-head">
      <h3>Quick Filter</h3>
      <button id="quickFilterClose" class="ghost">닫기 (Esc)</button>
    </div>
    <div class="sub">빠른 프리셋으로 필터를 전환합니다. `Ctrl/Cmd+K`로 열 수 있습니다.</div>
    <div class="quick-filter-grid">
      <button id="quickPresetUi">UI 스레드 집중</button>
      <button id="quickPresetInternal">내부 아티팩트 점검</button>
      <button id="quickPresetTerminal">터미널 세션 위주</button>
      <button id="quickPresetLinked">GUI+터미널 연결 점검</button>
      <button id="quickPresetHidden">GUI 숨김 후보</button>
      <button id="quickPresetReset">필터 초기화</button>
    </div>
  </div>
</div>

<script>
let DATA = null;
let DATA_SOURCES = [];
let COMPARE_APPS = {};
let ROADMAP_DATA = {};
let ALERT_HOOKS = {};
let RECOVERY_DATA = {};
let CURRENT_ROWS = [];
let TOTAL = 0;
let OFFSET = 0;
let LIMIT = 50;
const selected = new Set();
let FORENSICS_TIMER = null;
let FORENSICS_REQ_SEQ = 0;
let LOOP_ROWS = [];
let LOOP_FILTER = 'all';
let LOOP_AUTO_TIMER = null;
const LOOP_AUTO_MS = 10000;
let ROADMAP_AUTO_CHECKIN = true;
let ROADMAP_AUTO_TIMER = null;
const ROADMAP_AUTO_MS = 30 * 60 * 1000;
let OBS_DATA = null;
let HEALTH_DATA = null;
let OBS_SHOW_ALL = false;
let ACTIVE_THREAD_ID = '';
let ACTIVE_ROW_INDEX = -1;
let ACTIVE_TAB = 'overview';
let GLOBAL_AUTO_MS = 0;
let GLOBAL_AUTO_TIMER = null;
let IS_COMPACT = false;
let FORCE_CARD_MODE = false;
let CLEANUP_CONFIRM_EXPECTED = '';
let THREAD_RENDER_TOKEN = 0;
const THREAD_CHUNK_THRESHOLD = 120;
const THREAD_CHUNK_SIZE = 48;
const UI_PREFS_KEY = 'codex.overview.ui.v2';
const TAB_IDS = ['overview', 'triage', 'storage', 'operations'];

function el(id){ return document.getElementById(id); }
function esc(s){
  const m = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return String(s || '').replace(/[&<>"']/g, ch => m[ch]);
}

function fmtNum(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ko-KR');
}

function fmtBytes(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let x = n;
  let idx = 0;
  while (x >= 1024 && idx < units.length - 1) {
    x /= 1024;
    idx += 1;
  }
  const d = idx <= 1 ? 0 : 1;
  return `${x.toFixed(d)} ${units[idx]}`;
}

function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

function normalizeTabName(v) {
  const tab = String(v || '').toLowerCase();
  return TAB_IDS.includes(tab) ? tab : 'overview';
}

function setActiveTab(tab, syncHash=true) {
  ACTIVE_TAB = normalizeTabName(tab);
  document.body.setAttribute('data-tab', ACTIVE_TAB);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === ACTIVE_TAB;
    btn.classList.toggle('is-active', isActive);
  });
  if (syncHash && location.hash !== `#${ACTIVE_TAB}`) {
    history.replaceState(null, '', `#${ACTIVE_TAB}`);
  }
  saveUiPrefs();
}

function getAutoRefreshLabel(ms) {
  if (!ms) return 'auto off';
  return `auto ${Math.round(ms / 1000)}s`;
}

function renderGlobalRefreshStatus() {
  const pill = el('globalRefreshStatus');
  if (!pill) return;
  pill.textContent = getAutoRefreshLabel(GLOBAL_AUTO_MS);
}

function setGlobalAutoRefresh(ms) {
  const value = Number(ms || 0);
  GLOBAL_AUTO_MS = Number.isFinite(value) && value > 0 ? value : 0;
  if (GLOBAL_AUTO_TIMER) {
    clearInterval(GLOBAL_AUTO_TIMER);
    GLOBAL_AUTO_TIMER = null;
  }
  if (GLOBAL_AUTO_MS > 0) {
    GLOBAL_AUTO_TIMER = setInterval(() => {
      loadData();
    }, GLOBAL_AUTO_MS);
  }
  renderGlobalRefreshStatus();
  saveUiPrefs();
}

function applyVisualModes() {
  document.body.classList.toggle('is-compact', !!IS_COMPACT);
  document.body.classList.toggle('is-cards', !!FORCE_CARD_MODE);
  const compactBtn = el('toggleCompact');
  const cardBtn = el('toggleCards');
  if (compactBtn) compactBtn.classList.toggle('is-active', !!IS_COMPACT);
  if (cardBtn) cardBtn.classList.toggle('is-active', !!FORCE_CARD_MODE);
}

function saveUiPrefs() {
  const payload = {
    compact: !!IS_COMPACT,
    cards: !!FORCE_CARD_MODE,
    obsShowAll: !!OBS_SHOW_ALL,
    roadmapAutoCheckin: !!ROADMAP_AUTO_CHECKIN,
    activeTab: ACTIVE_TAB,
    globalAutoMs: GLOBAL_AUTO_MS,
    filters: {
      q: el('search') ? el('search').value : '',
      onlyPinned: !!(el('onlyPinned') && el('onlyPinned').checked),
      onlyNoProject: !!(el('onlyNoProject') && el('onlyNoProject').checked),
      onlyNoLocal: !!(el('onlyNoLocal') && el('onlyNoLocal').checked),
      scope: el('scopeFilter') ? el('scopeFilter').value : 'all',
      source: el('sourceFilter') ? el('sourceFilter').value : '',
      sort: el('sortFilter') ? el('sortFilter').value : 'order',
      minRisk: el('minRisk') ? el('minRisk').value : '0',
      minCtx: el('minCtx') ? el('minCtx').value : '0',
      pageSize: el('pageSize') ? el('pageSize').value : '50',
    },
  };
  safeLocalSet(UI_PREFS_KEY, JSON.stringify(payload));
}

function loadUiPrefs() {
  const raw = safeLocalGet(UI_PREFS_KEY);
  if (!raw) return;
  try {
    const prefs = JSON.parse(raw);
    if (!prefs || typeof prefs !== 'object') return;
    IS_COMPACT = !!prefs.compact;
    FORCE_CARD_MODE = !!prefs.cards;
    OBS_SHOW_ALL = !!prefs.obsShowAll;
    ROADMAP_AUTO_CHECKIN = prefs.roadmapAutoCheckin !== false;
    ACTIVE_TAB = normalizeTabName(prefs.activeTab || 'overview');
    const autoMs = Number(prefs.globalAutoMs || 0);
    GLOBAL_AUTO_MS = Number.isFinite(autoMs) && autoMs > 0 ? autoMs : 0;
    const f = prefs.filters || {};
    if (el('search') && typeof f.q === 'string') el('search').value = f.q;
    if (el('onlyPinned')) el('onlyPinned').checked = !!f.onlyPinned;
    if (el('onlyNoProject')) el('onlyNoProject').checked = !!f.onlyNoProject;
    if (el('onlyNoLocal')) el('onlyNoLocal').checked = !!f.onlyNoLocal;
    if (el('scopeFilter') && typeof f.scope === 'string') el('scopeFilter').value = f.scope;
    if (el('sourceFilter') && typeof f.source === 'string') el('sourceFilter').value = f.source;
    if (el('sortFilter') && typeof f.sort === 'string') el('sortFilter').value = f.sort;
    if (el('minRisk') && typeof f.minRisk === 'string') el('minRisk').value = f.minRisk;
    if (el('minCtx') && typeof f.minCtx === 'string') el('minCtx').value = f.minCtx;
    if (el('pageSize') && typeof f.pageSize === 'string') el('pageSize').value = f.pageSize;
  } catch (_) {
    return;
  }
  const obsChk = el('opsShowAllProc');
  if (obsChk) obsChk.checked = OBS_SHOW_ALL;
  const autoSel = el('globalAutoRefresh');
  if (autoSel) autoSel.value = String(GLOBAL_AUTO_MS || 0);
  const roadmapAuto = el('roadmapAutoCheckin');
  if (roadmapAuto) roadmapAuto.checked = !!ROADMAP_AUTO_CHECKIN;
}

function updateFilterBadge() {
  const badge = el('activeFilterCount');
  if (!badge) return;
  let count = 0;
  const q = el('search') ? el('search').value.trim() : '';
  if (q) count += 1;
  if (el('onlyPinned') && el('onlyPinned').checked) count += 1;
  if (el('onlyNoProject') && el('onlyNoProject').checked) count += 1;
  if (el('onlyNoLocal') && el('onlyNoLocal').checked) count += 1;
  if (el('scopeFilter') && el('scopeFilter').value !== 'all') count += 1;
  if (el('sourceFilter') && el('sourceFilter').value) count += 1;
  if (el('sortFilter') && el('sortFilter').value !== 'order') count += 1;
  if (el('minRisk') && el('minRisk').value !== '0') count += 1;
  if (el('minCtx') && el('minCtx').value !== '0') count += 1;
  badge.textContent = `filters ${count}`;
}

function setCompactMode(enabled) {
  IS_COMPACT = !!enabled;
  applyVisualModes();
  saveUiPrefs();
}

function setCardMode(enabled) {
  FORCE_CARD_MODE = !!enabled;
  applyVisualModes();
  saveUiPrefs();
}

function openQuickFilterModal() {
  const modal = el('quickFilterModal');
  if (!modal) return;
  modal.classList.add('open');
}

function closeQuickFilterModal() {
  const modal = el('quickFilterModal');
  if (!modal) return;
  modal.classList.remove('open');
}

function setupScrollShadow(id) {
  const wrap = el(id);
  if (!wrap) return;
  const sync = () => {
    const hasLeft = wrap.scrollLeft > 0;
    const hasRight = wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1;
    wrap.classList.toggle('has-scroll-left', hasLeft);
    wrap.classList.toggle('has-scroll-right', hasRight);
  };
  if (wrap.dataset.shadowBound !== '1') {
    wrap.addEventListener('scroll', sync);
    wrap.dataset.shadowBound = '1';
  }
  sync();
}

function findCurrentThreadById(id) {
  return CURRENT_ROWS.find(t => t.id === id) || null;
}

function renderThreadInspector(thread) {
  const panel = el('threadInspector');
  const empty = el('threadInspectorEmpty');
  if (!panel || !empty) return;
  if (!thread) {
    ACTIVE_THREAD_ID = '';
    panel.innerHTML = '';
    empty.style.display = '';
    return;
  }
  ACTIVE_THREAD_ID = thread.id;
  empty.style.display = 'none';
  panel.innerHTML = `
    <div class="inspector-block">
      <h4>Title</h4>
      <div>${esc(thread.title || '-')}</div>
    </div>
    <div class="inspector-block">
      <h4>Identity</h4>
      <div class="mono">${esc(thread.id || '-')}</div>
      <div class="sub">source: ${esc(thread.title_source || '-')}</div>
    </div>
    <div class="inspector-block">
      <h4>Risk</h4>
      <span class="tag ${esc(thread.risk_level || 'low')}">${esc(String(thread.risk_level || 'low'))} (${esc(String(thread.risk_score || 0))})</span>
      <span class="tag mono">ctx ${esc(String(thread.context_score || 0))}</span>
      <div>${(thread.risk_tags || []).map(x => `<span class="tag mono">${esc(x)}</span>`).join('') || '<span class="sub">태그 없음</span>'}</div>
    </div>
    <div class="inspector-block">
      <h4>Workspace</h4>
      <div class="mono">${esc(thread.cwd || '-')}</div>
      <div>${thread.project_buckets && thread.project_buckets.length ? thread.project_buckets.map(x => `<span class="tag mono">${esc(x)}</span>`).join('') : '<span class="sub">project bucket 미연결</span>'}</div>
    </div>
    <div class="inspector-block">
      <h4>Signals</h4>
      <div class="sub">pinned: ${thread.pinned ? 'Y' : 'N'} · local: ${thread.has_local_data ? 'Y' : 'N'} · session: ${thread.has_session_log ? 'Y' : 'N'} · age(d): ${thread.age_days == null ? '-' : esc(String(thread.age_days))}</div>
    </div>
  `;
}

function normalizeDataSourceRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.sources)) return payload.sources;
  if (payload.sources && typeof payload.sources === 'object') {
    return Object.entries(payload.sources).map(([name, info]) => ({
      name,
      status: info && info.exists === false ? 'missing' : 'ok',
      records: (info && (info.file_count ?? info.records ?? info.count)) ?? '-',
      updated_at: (info && (info.latest_mtime || info.mtime || info.updated_at)) || '-',
      note: (info && (info.path || info.present === false ? 'not present' : '')) || '',
      ...info,
    }));
  }
  if (Array.isArray(payload.data_sources)) return payload.data_sources;
  return [];
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (!s) return '';
  if (s.includes('ok') || s.includes('healthy') || s.includes('up')) return 'ok';
  if (s.includes('warn') || s.includes('stale') || s.includes('degraded')) return 'warn';
  if (s.includes('error') || s.includes('fail') || s.includes('down') || s.includes('broken')) return 'bad';
  return '';
}

function toList(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return [v];
}

function summarizeEvidence(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  return item.text || item.summary || item.snippet || item.path || item.id || '';
}

function summarizeArtifact(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const kind = item.kind || item.type || 'artifact';
  const label = item.path || item.file || item.id || item.name || '';
  return label ? `${kind}: ${label}` : String(kind);
}

function summarizeParent(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  return item.parent_id || item.thread_id || item.id || '';
}

function normalizeForensicsRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.reports)) return payload.reports;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.threads)) return payload.threads;
  return [];
}

function normalizeLoopRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.loops)) return payload.loops;
  return [];
}

function formatAgeSec(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return '-';
  if (n < 60) return `${Math.floor(n)}s`;
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}m ${s}s`;
}

function stalenessClass(staleness) {
  const s = String(staleness || 'unknown').toLowerCase();
  if (s === 'fresh') return 'stale-fresh';
  if (s === 'aging') return 'stale-aging';
  if (s === 'stale') return 'stale-stale';
  return 'stale-unknown';
}

function threadStatusTagClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'running' || s === 'warm') return 'low';
  if (s === 'recent') return 'medium';
  if (s === 'stale') return 'high';
  return '';
}

function loopNeedsAttention(row) {
  if (!row) return false;
  return !!row.has_attention || row.staleness === 'stale' || !row.running;
}

function setLoopAutoRefresh(enabled) {
  if (LOOP_AUTO_TIMER) {
    clearInterval(LOOP_AUTO_TIMER);
    LOOP_AUTO_TIMER = null;
  }
  if (!enabled) return;
  LOOP_AUTO_TIMER = setInterval(() => {
    loadLoops();
  }, LOOP_AUTO_MS);
}

function setRoadmapAutoCheckin(enabled) {
  ROADMAP_AUTO_CHECKIN = !!enabled;
  saveUiPrefs();
  if (ROADMAP_AUTO_TIMER) {
    clearInterval(ROADMAP_AUTO_TIMER);
    ROADMAP_AUTO_TIMER = null;
  }
  if (!ROADMAP_AUTO_CHECKIN) return;
  ROADMAP_AUTO_TIMER = setInterval(() => {
    runRoadmapCheckin('auto-checkin heartbeat', true);
    fetch('/api/alert-hooks/evaluate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ force_refresh: true }),
    }).then(r => r.json()).then(payload => {
      if (payload && payload.ok && payload.data) {
        ALERT_HOOKS = payload.data;
        renderAlertHooks();
      }
    }).catch(() => null);
  }, ROADMAP_AUTO_MS);
}

async function loadData() {
  const [overviewRes, dataSourcesRes, runtimeHealthRes, observatoryRes, healthRes, compareAppsRes, roadmapRes, alertHooksRes, recoveryRes] = await Promise.all([
    fetch('/api/overview?include_threads=0&refresh=1'),
    fetch('/api/data-sources').catch(() => null),
    fetch('/api/runtime-health').catch(() => null),
    fetch('/api/codex-observatory?refresh=1').catch(() => null),
    fetch('/api/health-check?refresh=1').catch(() => null),
    fetch('/api/compare-apps').catch(() => null),
    fetch('/api/roadmap-status').catch(() => null),
    fetch('/api/alert-hooks').catch(() => null),
    fetch('/api/recovery-center').catch(() => null),
  ]);
  DATA = await overviewRes.json();
  if (dataSourcesRes && dataSourcesRes.ok) {
    try {
      const dsData = await dataSourcesRes.json();
      DATA_SOURCES = normalizeDataSourceRows(dsData);
      DATA.data_sources_error = '';
    } catch (_) {
      DATA_SOURCES = [];
      DATA.data_sources_error = 'data-sources parse failed';
    }
  } else {
    DATA_SOURCES = [];
    DATA.data_sources_error = 'data-sources fetch failed';
  }
  if (runtimeHealthRes && runtimeHealthRes.ok) {
    try {
      DATA.runtime_health = await runtimeHealthRes.json();
      DATA.runtime_health_error = '';
    } catch (_) {
      DATA.runtime_health = {};
      DATA.runtime_health_error = 'runtime-health parse failed';
    }
  } else {
    DATA.runtime_health = {};
    DATA.runtime_health_error = 'runtime-health fetch failed';
  }
  if (observatoryRes && observatoryRes.ok) {
    try {
      OBS_DATA = await observatoryRes.json();
      DATA.codex_observatory_error = '';
    } catch (_) {
      OBS_DATA = {};
      DATA.codex_observatory_error = 'codex-observatory parse failed';
    }
  } else {
    OBS_DATA = {};
    DATA.codex_observatory_error = 'codex-observatory fetch failed';
  }
  if (healthRes && healthRes.ok) {
    try {
      HEALTH_DATA = await healthRes.json();
      DATA.health_check_error = '';
    } catch (_) {
      HEALTH_DATA = {};
      DATA.health_check_error = 'health-check parse failed';
    }
  } else {
    HEALTH_DATA = {};
    DATA.health_check_error = 'health-check fetch failed';
  }
  if (compareAppsRes && compareAppsRes.ok) {
    try {
      COMPARE_APPS = await compareAppsRes.json();
      DATA.compare_apps_error = '';
    } catch (_) {
      COMPARE_APPS = {};
      DATA.compare_apps_error = 'compare-apps parse failed';
    }
  } else {
    COMPARE_APPS = {};
    DATA.compare_apps_error = 'compare-apps fetch failed';
  }
  if (roadmapRes && roadmapRes.ok) {
    try {
      ROADMAP_DATA = await roadmapRes.json();
      DATA.roadmap_error = '';
    } catch (_) {
      ROADMAP_DATA = {};
      DATA.roadmap_error = 'roadmap parse failed';
    }
  } else {
    ROADMAP_DATA = {};
    DATA.roadmap_error = 'roadmap fetch failed';
  }
  if (alertHooksRes && alertHooksRes.ok) {
    try {
      ALERT_HOOKS = await alertHooksRes.json();
      DATA.alert_hooks_error = '';
    } catch (_) {
      ALERT_HOOKS = {};
      DATA.alert_hooks_error = 'alert-hooks parse failed';
    }
  } else {
    ALERT_HOOKS = {};
    DATA.alert_hooks_error = 'alert-hooks fetch failed';
  }
  if (recoveryRes && recoveryRes.ok) {
    try {
      RECOVERY_DATA = await recoveryRes.json();
      DATA.recovery_error = '';
    } catch (_) {
      RECOVERY_DATA = {};
      DATA.recovery_error = 'recovery parse failed';
    }
  } else {
    RECOVERY_DATA = {};
    DATA.recovery_error = 'recovery fetch failed';
  }
  renderStaticPanels();
  await loadLoops();
  await loadThreads(true);
}

async function loadCodexObservatory(forceRefresh=true) {
  const statusEl = el('opsProcessStatus');
  if (statusEl) statusEl.textContent = '관제 데이터 갱신 중...';
  try {
    const res = await fetch('/api/codex-observatory?refresh=' + (forceRefresh ? '1' : '0'));
    const payload = await res.json();
    OBS_DATA = payload || {};
    DATA.codex_observatory_error = '';
    renderCodexObservatory();
    if (statusEl) statusEl.textContent = `갱신 완료 ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;
  } catch (err) {
    if (statusEl) statusEl.textContent = `관제 갱신 실패: ${err.message || err}`;
    DATA.codex_observatory_error = 'codex-observatory fetch failed';
    renderCodexObservatory();
  }
}

function renderCards() {
  const s = DATA.summary;
  const rs = DATA.risk_summary || {};
  const cards = [
    ['Threads', s.thread_total],
    ['Threads(Local)', s.thread_with_local_data],
    ['Threads(SessionLog)', s.thread_with_session_log],
    ['High Context(>=70)', s.high_context_threads],
    ['High Risk', s.high_risk_threads],
    ['Orphan Candidates', rs.orphan_candidates || 0],
    ['Pinned', s.thread_pinned],
    ['Workspace', s.workspace_total],
    ['Workspace(Active)', s.workspace_active],
    ['Project Buckets', s.project_bucket_total],
    ['Labs Projects', s.labs_project_total],
  ];
  el('cards').innerHTML = cards.map(([k,v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

function renderRuntimeHealth() {
  const s = (DATA && DATA.summary) || {};
  const rs = (DATA && DATA.risk_summary) || {};
  const rh = (DATA && DATA.runtime_health) || {};
  const uptimeMin = Number(rh.uptime_min || 0);
  const uptimeHuman = String(rh.uptime_human || '-');
  const healthy = DATA_SOURCES.filter(src => {
    const st = String(src.status || src.health || src.state || '');
    const c = statusClass(st);
    return c === 'ok' || (!st && !src.error);
  }).length;
  const bad = DATA_SOURCES.filter(src => {
    const st = String(src.status || src.health || src.state || '');
    return statusClass(st) === 'bad' || !!src.error;
  }).length;
  const metrics = [
    { label: 'Tracked Threads', value: fmtNum(s.thread_total || 0), meta: `Pinned ${fmtNum(s.thread_pinned || 0)} · uptime_min ${uptimeMin.toFixed(2)} · uptime ${uptimeHuman}` },
    { label: 'High Risk Threads', value: fmtNum(s.high_risk_threads || 0), meta: `Stale ${fmtNum(rs.stale_total || 0)}` },
    { label: 'Data Sources', value: `${fmtNum(healthy)}/${fmtNum(DATA_SOURCES.length)}`, meta: `문제 소스 ${fmtNum(bad)}` },
    { label: 'Forensics Target', value: fmtNum(selected.size), meta: '선택 스레드 자동 추적' },
  ];
  el('runtimeHealth').innerHTML = metrics.map(m => `
    <div class="runtime-metric">
      <div class="label">${esc(m.label)}</div>
      <div class="value">${esc(String(m.value))}</div>
      <div class="meta">${esc(m.meta)}</div>
    </div>
  `).join('');
  const err = DATA.runtime_health_error ? ` · runtime[E_FETCH]: ${DATA.runtime_health_error}` : '';
  const stamp = `last refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}${err}`;
  el('runtimeHealthStamp').textContent = stamp;
  const topStamp = el('topLastRefresh');
  if (topStamp) topStamp.textContent = stamp;
}

function renderCommandCenter() {
  const s = (DATA && DATA.summary) || {};
  const rs = (DATA && DATA.risk_summary) || {};
  const hs = (HEALTH_DATA && HEALTH_DATA.summary) || {};
  const score = Number((HEALTH_DATA && HEALTH_DATA.score) || 0);
  const metrics = [
    { label: 'Open Threads', value: fmtNum(s.thread_total || 0), meta: `Pinned ${fmtNum(s.thread_pinned || 0)}` },
    { label: 'Critical Threads', value: fmtNum(s.high_risk_threads || 0), meta: `orphan ${fmtNum(rs.orphan_candidates || 0)}` },
    { label: 'Stale Threads', value: fmtNum(rs.stale_total || 0), meta: `ctx>=70 ${fmtNum(rs.ctx_high_total || 0)}` },
    { label: 'Health Score', value: fmtNum(score), meta: `pass ${fmtNum(hs.pass || 0)} · warn ${fmtNum(hs.warn || 0)} · fail ${fmtNum(hs.fail || 0)}` },
  ];
  const badgeEl = el('overviewBadges');
  if (badgeEl) {
    badgeEl.innerHTML = metrics.map(m => `
      <div class="runtime-metric">
        <div class="label">${esc(m.label)}</div>
        <div class="value">${esc(String(m.value))}</div>
        <div class="meta">${esc(m.meta)}</div>
      </div>
    `).join('');
  }

  const hotRows = [...CURRENT_ROWS]
    .sort((a, b) => {
      const ra = Number(a.risk_score || 0);
      const rb = Number(b.risk_score || 0);
      if (rb !== ra) return rb - ra;
      const ca = Number(a.context_score || 0);
      const cb = Number(b.context_score || 0);
      return cb - ca;
    })
    .slice(0, 10);
  const hotBody = el('hotQueueBody');
  if (hotBody) {
    hotBody.innerHTML = hotRows.length ? hotRows.map(t => `
      <tr>
        <td>${esc(String(t.risk_score || 0))}</td>
        <td>${esc(String(t.context_score || 0))}</td>
        <td>${t.age_days == null ? '-' : esc(String(t.age_days))}</td>
        <td><span class="clip" title="${esc(t.title || '')}">${esc(t.title || '-')}</span></td>
        <td class="mono">${esc(t.id || '-')}</td>
      </tr>
    `).join('') : '<tr><td colspan="5"><div class="empty-msg">Triage 탭의 현재 결과가 비어 있습니다.</div></td></tr>';
  }
  const mini = el('healthSummaryMini');
  if (mini) {
    mini.innerHTML = `
      <span class="tag low">pass ${fmtNum(hs.pass || 0)}</span>
      <span class="tag medium">warn ${fmtNum(hs.warn || 0)}</span>
      <span class="tag high">fail ${fmtNum(hs.fail || 0)}</span>
      <span class="tag mono">score ${fmtNum(score)}</span>
    `;
  }
  const stamp = el('commandCenterStamp');
  if (stamp) stamp.textContent = `command refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;
}

function renderHealthChecks() {
  const summary = (HEALTH_DATA && HEALTH_DATA.summary) || {};
  const checks = (HEALTH_DATA && Array.isArray(HEALTH_DATA.checks)) ? HEALTH_DATA.checks : [];
  const score = Number((HEALTH_DATA && HEALTH_DATA.score) || 0);
  const summaryEl = el('healthSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="tag low">pass ${fmtNum(summary.pass || 0)}</span>
      <span class="tag medium">warn ${fmtNum(summary.warn || 0)}</span>
      <span class="tag high">fail ${fmtNum(summary.fail || 0)}</span>
      <span class="tag mono">score ${fmtNum(score)}</span>
    `;
  }
  const body = el('healthCheckBody');
  if (body) {
    body.innerHTML = checks.length ? checks.map(c => `
      <tr>
        <td>${esc(c.label || c.id || '-')}</td>
        <td><span class="status-pill ${esc(String(c.status || 'warn'))}">${esc(String(c.status || 'warn'))}</span></td>
        <td>${esc(c.detail || '-')}</td>
        <td class="mono">${esc(String(c.value == null ? '-' : c.value))}</td>
      </tr>
    `).join('') : '<tr><td colspan="4"><div class="empty-msg">health-check 데이터가 없습니다.</div></td></tr>';
  }
  const err = DATA && DATA.health_check_error ? ` · health[E_FETCH]: ${DATA.health_check_error}` : '';
  const stamp = el('healthCheckStamp');
  if (stamp) stamp.textContent = `health refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}${err}`;
}

function renderCodexObservatory() {
  const data = OBS_DATA || {};
  const summary = data.summary || {};
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  const groups = Array.isArray(data.process_groups) ? data.process_groups : [];
  const processes = Array.isArray(data.processes) ? data.processes : [];
  const tmuxSessions = ((data.tmux || {}).sessions || []);
  const tmuxPanes = ((data.tmux || {}).panes || []);
  const launchRows = Array.isArray(data.launch_services) ? data.launch_services : [];
  const listenerRows = Array.isArray(data.listeners) ? data.listeners : [];
  const loopsDigest = Array.isArray(data.loops_digest) ? data.loops_digest : [];

  const metrics = [
    { label: 'Related Processes', value: fmtNum(summary.process_total || 0), meta: `groups ${fmtNum(summary.process_group_total || 0)} · listeners ${fmtNum(summary.listener_total || 0)}` },
    { label: 'OMX MCP Groups', value: fmtNum(summary.mcp_group_total || 0), meta: `class omx-mcp ${fmtNum((summary.class_counts || {})['omx-mcp'] || 0)}` },
    { label: 'tmux Monitor', value: `${fmtNum(summary.tmux_related_session_total || 0)}/${fmtNum(summary.tmux_session_total || 0)}`, meta: `panes ${fmtNum(summary.tmux_pane_total || 0)}` },
    { label: 'Agent Loops', value: `${fmtNum(summary.loop_running_total || 0)}/${fmtNum(summary.loop_total || 0)}`, meta: `attention ${fmtNum(summary.loop_attention_total || 0)}` },
    { label: 'Launch Services', value: fmtNum(summary.launch_service_total || 0), meta: 'launchctl matching labels' },
  ];
  el('opsSummary').innerHTML = metrics.map(m => `
    <div class="runtime-metric">
      <div class="label">${esc(m.label)}</div>
      <div class="value">${esc(String(m.value))}</div>
      <div class="meta">${esc(m.meta)}</div>
    </div>
  `).join('');

  const dataErr = (DATA && DATA.codex_observatory_error) ? DATA.codex_observatory_error : '';
  const errorText = dataErr ? ` · obs[E_FETCH]: ${dataErr}` : '';
  el('opsStamp').textContent = `obs refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}${errorText}`;
  if (alerts.length) {
    el('opsAlertBox').innerHTML = alerts.map(x => `<div class="ops-alert">${esc(x)}</div>`).join('');
  } else {
    el('opsAlertBox').innerHTML = '<div class="ops-ok">현재 감지된 즉시 경고는 없습니다.</div>';
  }

  const groupRows = groups.slice(0, 80);
  el('opsGroupBody').innerHTML = groupRows.length ? groupRows.map(g => `
    <tr>
      <td class="mono">${esc(g.signature || '-')}</td>
      <td><span class="tag mono">${esc(g.process_class || '-')}</span></td>
      <td>${esc(String(g.count || 0))}</td>
      <td>${esc(String(g.cpu_total || 0))}</td>
      <td>${esc(String(g.mem_total || 0))}</td>
      <td><span class="cmd-clip mono" title="${esc(g.sample_command || '')}">${esc(g.sample_command || '')}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="6"><div class="empty-msg">관련 프로세스 그룹 없음</div></td></tr>';

  const procRows = OBS_SHOW_ALL ? processes : processes.slice(0, 120);
  el('opsProcBody').innerHTML = procRows.length ? procRows.map(p => `
    <tr>
      <td class="mono">${esc(String(p.pid || 0))}</td>
      <td><span class="tag mono">${esc(p.process_class || '-')}</span></td>
      <td>${esc(String(p.cpu || 0))}</td>
      <td>${esc(String(p.mem || 0))}</td>
      <td>${esc(p.state || '-')}</td>
      <td class="mono">${esc(p.etime || '-')}</td>
      <td><span class="cmd-clip mono" title="${esc(p.command || '')}">${esc(p.command_clip || p.command || '')}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="7"><div class="empty-msg">관련 프로세스 없음</div></td></tr>';
  const hiddenCount = Math.max(0, processes.length - procRows.length);
  el('opsProcessStatus').textContent = OBS_SHOW_ALL ? `전체 ${processes.length}개 표시` : `상위 ${procRows.length}개 표시${hiddenCount ? ` · 숨김 ${hiddenCount}개` : ''}`;

  const tmuxRows = [];
  const paneBySession = {};
  tmuxPanes.forEach(p => {
    const s = p.session || '-';
    if (!paneBySession[s]) paneBySession[s] = [];
    paneBySession[s].push(p);
  });
  tmuxSessions.forEach(s => {
    const panes = paneBySession[s.session] || [];
    if (!panes.length) {
      tmuxRows.push(`
        <tr>
          <td class="mono">${esc(s.session || '-')}</td>
          <td>${esc(String(s.windows || 0))}</td>
          <td>${s.related ? 'Y' : ''}</td>
          <td class="mono">-</td>
          <td class="mono">-</td>
          <td>-</td>
          <td class="mono">-</td>
        </tr>
      `);
      return;
    }
    panes.forEach((p, idx) => {
      tmuxRows.push(`
        <tr>
          <td class="mono">${idx === 0 ? esc(s.session || '-') : ''}</td>
          <td>${idx === 0 ? esc(String(s.windows || 0)) : ''}</td>
          <td>${idx === 0 ? (s.related ? 'Y' : '') : ''}</td>
          <td class="mono">${esc(p.pane || '-')}</td>
          <td class="mono">${esc(String(p.pid || 0))}</td>
          <td>${esc(p.command || '-')}</td>
          <td class="mono">${esc(p.path || '-')}</td>
        </tr>
      `);
    });
  });
  el('opsTmuxBody').innerHTML = tmuxRows.length ? tmuxRows.join('') : '<tr><td colspan="7"><div class="empty-msg">tmux 정보 없음</div></td></tr>';

  const svcRows = [];
  launchRows.forEach(s => {
    svcRows.push(`
      <tr>
        <td><span class="tag">launchctl</span></td>
        <td class="mono">${esc(s.label || '-')}</td>
        <td class="mono">${s.pid == null ? '-' : esc(String(s.pid))}</td>
        <td class="mono">${esc(s.status || '-')}</td>
      </tr>
    `);
  });
  listenerRows.slice(0, 80).forEach(s => {
    svcRows.push(`
      <tr>
        <td><span class="tag">listen</span></td>
        <td class="mono">${esc(s.command || '-')}</td>
        <td class="mono">${esc(String(s.pid || 0))}</td>
        <td class="mono">${esc(s.listen || '-')}</td>
      </tr>
    `);
  });
  loopsDigest.forEach(l => {
    svcRows.push(`
      <tr>
        <td><span class="tag ${l.has_attention ? 'medium' : 'low'}">loop</span></td>
        <td>${esc(l.label || l.loop_id || '-')}</td>
        <td>${esc(l.running ? 'running' : 'stopped')}</td>
        <td class="mono">${esc((l.phase || '-') + ' · ' + (l.staleness || '-'))}</td>
      </tr>
    `);
  });
  el('opsSvcBody').innerHTML = svcRows.length ? svcRows.join('') : '<tr><td colspan="4"><div class="empty-msg">서비스/리스너 정보 없음</div></td></tr>';
}

function renderDataSources() {
  const rows = DATA_SOURCES || [];
  if (!rows.length) {
    const err = DATA.data_sources_error ? ` · data_sources[E_FETCH]: ${DATA.data_sources_error}` : '';
    el('dataSourceStatus').textContent = `데이터 소스 응답 없음${err}`;
    el('dataSourceBody').innerHTML = '<tr><td colspan="5"><div class="empty-msg">/api/data-sources 응답이 비어 있습니다.</div></td></tr>';
    return;
  }
  const healthy = rows.filter(src => {
    const st = String(src.status || src.health || src.state || '');
    return statusClass(st) === 'ok' || (!st && !src.error);
  }).length;
  el('dataSourceStatus').textContent = `${healthy}/${rows.length} healthy`;
  el('dataSourceBody').innerHTML = rows.map(src => {
    const name = src.name || src.source || src.id || src.key || '-';
    const status = src.status || src.health || src.state || (src.error ? 'error' : 'unknown');
    const records = src.records ?? src.count ?? src.thread_count ?? src.row_count ?? '-';
    const updated = src.updated_at || src.ts || src.last_scan || src.last_seen || '-';
    const note = src.note || src.path || src.error || src.detail || '';
    return `
      <tr>
        <td class="mono">${esc(String(name))}</td>
        <td><span class="status-pill ${statusClass(status)}">${esc(String(status))}</span></td>
        <td>${esc(String(records))}</td>
        <td class="mono">${esc(String(updated))}</td>
        <td class="mono">${esc(String(note))}</td>
      </tr>
    `;
  }).join('');
}

function renderCompareApps() {
  const payload = COMPARE_APPS || {};
  const summary = payload.summary || {};
  const apps = Array.isArray(payload.apps) ? payload.apps : [];
  const status = el('compareAppsSummary');
  const body = el('compareAppsBody');
  const stamp = el('compareAppsStamp');
  if (!status || !body || !stamp) return;

  const err = DATA && DATA.compare_apps_error ? ` · compare[E_FETCH]: ${DATA.compare_apps_error}` : '';
  const installed = Number(summary.installed_total || 0);
  const running = Number(summary.running_total || 0);
  const total = Number(summary.total || apps.length || 0);
  status.textContent = `installed ${installed}/${total} · running ${running}/${total}${err}`;
  stamp.textContent = `apps refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;

  if (!apps.length) {
    body.innerHTML = '<tr><td colspan="5"><div class="empty-msg">비교앱 상태 데이터를 불러오지 못했습니다.</div></td></tr>';
    return;
  }

  body.innerHTML = apps.map(a => {
    const installedText = a.installed ? 'Y' : 'N';
    const runningText = a.running ? 'Y' : 'N';
    const primaryCmd = String(a.start_cmd || '').trim();
    const watchCmd = String(a.watch_cmd || '').trim();
    const quick = [primaryCmd, watchCmd].filter(Boolean).join(' && ');
    return `
      <tr>
        <td>
          <div><strong>${esc(a.name || a.id || '-')}</strong></div>
          <div class="sub">${esc(a.notes || '')}</div>
        </td>
        <td><span class="tag ${a.installed ? 'low' : 'high'}">${installedText}</span></td>
        <td><span class="tag ${a.running ? 'low' : 'medium'}">${runningText}</span></td>
        <td class="mono">${esc(a.location || '-')}</td>
        <td>
          ${primaryCmd ? `<button class="copy-cmd-btn" data-cmd="${esc(primaryCmd)}">Start 복사</button>` : ''}
          ${watchCmd ? `<button class="copy-cmd-btn" data-cmd="${esc(watchCmd)}">Watch 복사</button>` : ''}
          ${quick ? `<div class="mono tiny-note">${esc(quick)}</div>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  body.querySelectorAll('.copy-cmd-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cmd = btn.getAttribute('data-cmd') || '';
      if (!cmd) return;
      try {
        await navigator.clipboard.writeText(cmd);
        setThreadActionStatus(`명령 복사됨: ${cmd}`);
      } catch (_) {
        setThreadActionStatus(`클립보드 실패, 수동 실행: ${cmd}`);
      }
    });
  });
}

async function updateAlertDesktopNotify(enabled) {
  const statusEl = el('alertHooksStatus');
  if (statusEl) statusEl.textContent = '알림 설정 저장 중...';
  try {
    const res = await fetch('/api/alert-hooks/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ desktop_notify: !!enabled }),
    });
    const payload = await res.json();
    if (!payload.ok) {
      if (statusEl) statusEl.textContent = `실패: ${payload.error || 'unknown'}`;
      return;
    }
    ALERT_HOOKS = payload.data || {};
    if (statusEl) statusEl.textContent = `저장 완료 (${enabled ? 'ON' : 'OFF'})`;
    renderAlertHooks();
  } catch (err) {
    if (statusEl) statusEl.textContent = `오류: ${err.message || err}`;
  }
}

async function saveAlertRule(ruleId) {
  const statusEl = el('alertHooksStatus');
  const enabledEl = el(`alertRuleEnabled_${ruleId}`);
  const thresholdEl = el(`alertRuleThreshold_${ruleId}`);
  const cooldownEl = el(`alertRuleCooldown_${ruleId}`);
  if (!enabledEl || !thresholdEl || !cooldownEl) return;
  if (statusEl) statusEl.textContent = `${ruleId} 저장 중...`;
  try {
    const res = await fetch('/api/alert-hooks/rule', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        rule_id: ruleId,
        enabled: !!enabledEl.checked,
        threshold: Number(thresholdEl.value || 0),
        cooldown_min: Number(cooldownEl.value || 15),
      }),
    });
    const payload = await res.json();
    if (!payload.ok) {
      if (statusEl) statusEl.textContent = `실패: ${payload.error || 'unknown'}`;
      return;
    }
    ALERT_HOOKS = payload.data || {};
    if (statusEl) statusEl.textContent = `${ruleId} 저장 완료`;
    renderAlertHooks();
  } catch (err) {
    if (statusEl) statusEl.textContent = `오류: ${err.message || err}`;
  }
}

async function evaluateAlertHooksNow() {
  const statusEl = el('alertHooksStatus');
  if (statusEl) statusEl.textContent = '규칙 평가 중...';
  try {
    const res = await fetch('/api/alert-hooks/evaluate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ force_refresh: true }),
    });
    const payload = await res.json();
    if (!payload.ok) {
      if (statusEl) statusEl.textContent = `실패: ${payload.error || 'unknown'}`;
      return;
    }
    ALERT_HOOKS = payload.data || {};
    const emitted = Array.isArray((ALERT_HOOKS || {}).emitted_events) ? ALERT_HOOKS.emitted_events.length : 0;
    if (statusEl) statusEl.textContent = `평가 완료 · emitted ${emitted}`;
    renderAlertHooks();
  } catch (err) {
    if (statusEl) statusEl.textContent = `오류: ${err.message || err}`;
  }
}

function renderAlertHooks() {
  const payload = ALERT_HOOKS || {};
  const cfg = payload.config || {};
  const metrics = payload.metrics || {};
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  const active = Array.isArray(payload.active_alerts) ? payload.active_alerts : [];
  const events = Array.isArray(payload.recent_events) ? payload.recent_events : [];
  const summaryEl = el('alertHooksSummary');
  const ruleBody = el('alertRuleBody');
  const activeBody = el('alertActiveBody');
  const eventBody = el('alertEventBody');
  const stampEl = el('alertHooksStamp');
  const notifyChk = el('alertDesktopNotify');
  if (!summaryEl || !ruleBody || !activeBody || !eventBody || !stampEl) return;

  if (notifyChk) notifyChk.checked = !!cfg.desktop_notify;
  const err = DATA && DATA.alert_hooks_error ? ` · alert_hooks[E_FETCH]: ${DATA.alert_hooks_error}` : '';
  summaryEl.textContent = `rules ${rules.length} · active ${active.length} · events ${events.length} · HS ${metrics.health_score ?? '-'} · highRisk ${metrics.high_risk_threads ?? '-'} · loopAttention ${metrics.loop_attention_total ?? '-'}${err}`;
  stampEl.textContent = `alert refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;

  ruleBody.innerHTML = rules.length ? rules.map(r => {
    const rid = String(r.id || '');
    return `
      <tr>
        <td>
          <div><strong>${esc(r.label || rid)}</strong></div>
          <div class="sub">${esc(r.description || '')}</div>
        </td>
        <td><input id="alertRuleEnabled_${esc(rid)}" type="checkbox" ${r.enabled ? 'checked' : ''} /></td>
        <td><input id="alertRuleThreshold_${esc(rid)}" type="number" step="1" value="${esc(String(r.threshold ?? 0))}" style="width:88px;" /></td>
        <td class="mono">${esc(String(r.metric || '-'))} ${esc(String(r.op || 'ge'))}</td>
        <td><input id="alertRuleCooldown_${esc(rid)}" type="number" step="1" min="1" value="${esc(String(r.cooldown_min ?? 15))}" style="width:72px;" /></td>
        <td><button class="alert-rule-save" data-rule-id="${esc(rid)}">저장</button></td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6"><div class="empty-msg">알림 규칙이 없습니다.</div></td></tr>';

  activeBody.innerHTML = active.length ? active.map(a => `
    <tr>
      <td>${esc(a.label || a.rule_id || '-')}</td>
      <td class="mono">${esc(String(a.value ?? '-'))}</td>
      <td class="mono">${esc(String(a.threshold ?? '-'))} (${esc(String(a.op || ''))})</td>
      <td><span class="tag ${esc(String(a.severity || 'medium'))}">${esc(String(a.severity || 'medium'))}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="4"><div class="empty-msg">현재 활성 경고 없음</div></td></tr>';

  const recent = events.slice(-40).reverse();
  eventBody.innerHTML = recent.length ? recent.map(e => `
    <tr>
      <td class="mono">${esc(String((e.ts || '').replace('T', ' ').slice(0, 19) || '-'))}</td>
      <td>${esc(e.label || e.rule_id || '-')}</td>
      <td><span class="tag ${esc(String(e.severity || 'medium'))}">${esc(String(e.severity || 'medium'))}</span></td>
      <td>${esc(e.message || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="4"><div class="empty-msg">이벤트 로그 없음</div></td></tr>';

  ruleBody.querySelectorAll('.alert-rule-save').forEach(btn => {
    btn.addEventListener('click', () => saveAlertRule(btn.getAttribute('data-rule-id') || ''));
  });
}

async function runRecoveryDrill() {
  const statusEl = el('recoveryStatus');
  if (statusEl) statusEl.textContent = '복구 드릴 실행 중...';
  try {
    const res = await fetch('/api/recovery-drill', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({}),
    });
    const payload = await res.json();
    if (!payload.ok) {
      if (statusEl) statusEl.textContent = `실패: ${payload.error || 'unknown'}`;
      return;
    }
    RECOVERY_DATA = payload.data || RECOVERY_DATA;
    if (statusEl) statusEl.textContent = `드릴 완료 · 복구항목 ${fmtNum((payload.drill || {}).restore_item_count || 0)}개`;
    renderRecoveryCenter();
  } catch (err) {
    if (statusEl) statusEl.textContent = `오류: ${err.message || err}`;
  }
}

async function updateRecoveryChecklist(itemId, done) {
  const statusEl = el('recoveryStatus');
  try {
    const res = await fetch('/api/recovery-checklist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ item_id: itemId, done: !!done }),
    });
    const payload = await res.json();
    if (!payload.ok) {
      if (statusEl) statusEl.textContent = `체크리스트 실패: ${payload.error || 'unknown'}`;
      return;
    }
    RECOVERY_DATA = payload.data || RECOVERY_DATA;
    if (statusEl) statusEl.textContent = `체크리스트 저장: ${itemId}`;
    renderRecoveryCenter();
  } catch (err) {
    if (statusEl) statusEl.textContent = `체크리스트 오류: ${err.message || err}`;
  }
}

function renderRecoveryCenter() {
  const payload = RECOVERY_DATA || {};
  const backups = Array.isArray(payload.backup_sets) ? payload.backup_sets : [];
  const checklist = Array.isArray(payload.checklist) ? payload.checklist : [];
  const drill = payload.drill || {};
  const summaryEl = el('recoverySummary');
  const backupBody = el('recoveryBackupBody');
  const checklistBody = el('recoveryChecklistBody');
  const previewBody = el('recoveryPreviewBody');
  const stampEl = el('recoveryStamp');
  if (!summaryEl || !backupBody || !checklistBody || !previewBody || !stampEl) return;

  const done = Number(payload.checklist_done || 0);
  const total = Number(payload.checklist_total || checklist.length || 0);
  const err = DATA && DATA.recovery_error ? ` · recovery[E_FETCH]: ${DATA.recovery_error}` : '';
  summaryEl.textContent = `backup sets ${fmtNum(payload.backup_total || backups.length)} · checklist ${done}/${total} · drill items ${fmtNum(drill.restore_item_count || 0)}${err}`;
  stampEl.textContent = `recovery refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;

  backupBody.innerHTML = backups.length ? backups.map(b => `
    <tr>
      <td class="mono">${esc(b.backup_id || '-')}</td>
      <td>${fmtNum(b.file_count || 0)}</td>
      <td class="mono">${esc(fmtBytes(b.total_bytes || 0))}</td>
      <td class="mono">${esc(String((b.latest_mtime || '').replace('T', ' ').slice(0, 19) || '-'))}</td>
      <td class="mono">${esc(b.path || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="5"><div class="empty-msg">백업 세트가 없습니다.</div></td></tr>';

  checklistBody.innerHTML = checklist.length ? checklist.map(item => `
    <tr>
      <td>${esc(item.label || item.id || '-')}</td>
      <td><input class="recovery-check-item" data-item-id="${esc(item.id || '')}" type="checkbox" ${item.done ? 'checked' : ''} /></td>
    </tr>
  `).join('') : '<tr><td colspan="2"><div class="empty-msg">체크리스트가 없습니다.</div></td></tr>';

  checklistBody.querySelectorAll('.recovery-check-item').forEach(chk => {
    chk.addEventListener('change', () => {
      const itemId = chk.getAttribute('data-item-id') || '';
      if (!itemId) return;
      updateRecoveryChecklist(itemId, chk.checked);
    });
  });

  const preview = Array.isArray(drill.preview_items) ? drill.preview_items.slice(0, 40) : [];
  previewBody.innerHTML = preview.length ? preview.map(x => `
    <tr>
      <td class="mono">${esc(x.src || '-')}</td>
      <td class="mono">${esc(x.dst || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="2"><div class="empty-msg">복구 드릴 실행 후 미리보기가 표시됩니다.</div></td></tr>';
}

function roadmapStatusTagClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'done') return 'low';
  if (s === 'in_progress') return 'medium';
  if (s === 'blocked') return 'high';
  return '';
}

function renderRoadmap() {
  const payload = ROADMAP_DATA || {};
  const counts = payload.status_counts || {};
  const weeks = Array.isArray(payload.weeks) ? payload.weeks : [];
  const logs = Array.isArray(payload.checkins) ? payload.checkins : [];
  const summaryEl = el('roadmapSummary');
  const bodyEl = el('roadmapBody');
  const logEl = el('roadmapLogBody');
  const stampEl = el('roadmapStamp');
  if (!summaryEl || !bodyEl || !logEl || !stampEl) return;

  const remaining = Array.isArray(payload.remaining_tracks) ? payload.remaining_tracks : [];
  const err = DATA && DATA.roadmap_error ? ` · roadmap[E_FETCH]: ${DATA.roadmap_error}` : '';
  summaryEl.textContent = `done ${fmtNum(counts.done || 0)} · in_progress ${fmtNum(counts.in_progress || 0)} · planned ${fmtNum(counts.planned || 0)} · remaining ${remaining.join(', ') || '-'}${err}`;
  stampEl.textContent = `roadmap refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;

  bodyEl.innerHTML = weeks.length ? weeks.map(w => {
    const done = toList(w.done).slice(0, 3).map(x => `<span class="tag mono">${esc(String(x))}</span>`).join('');
    const next = toList(w.next).slice(0, 3).map(x => `<span class="tag mono">${esc(String(x))}</span>`).join('');
    return `
      <tr>
        <td><strong>${esc(w.week_id || '-')}</strong><div class="sub">${esc(w.title || '')}</div></td>
        <td><span class="tag ${roadmapStatusTagClass(w.status)}">${esc(String(w.status || 'planned'))}</span></td>
        <td class="mono">${esc(String(w.progress == null ? '-' : w.progress + '%'))}</td>
        <td>${esc(w.focus || '-')}</td>
        <td>${done || '<span class="sub">-</span>'}</td>
        <td>${next || '<span class="sub">-</span>'}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6"><div class="empty-msg">로드맵 데이터 없음</div></td></tr>';

  const recentLogs = logs.slice(-30).reverse();
  logEl.innerHTML = recentLogs.length ? recentLogs.map(x => {
    const snap = x.snapshot || {};
    const snapText = `T:${snap.threads ?? '-'} H:${snap.high_risk ?? '-'} Ctx:${snap.ctx_high ?? '-'} Or:${snap.orphan ?? '-'} HS:${snap.health_score ?? '-'} Apps:${snap.running_apps ?? '-'}`;
    return `
      <tr>
        <td class="mono">${esc(String((x.ts || '').replace('T', ' ').slice(0, 19) || '-'))}</td>
        <td>${esc(x.actor || '-')}</td>
        <td class="mono">${esc(snapText)}</td>
        <td>${esc(x.note || '-')}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="4"><div class="empty-msg">체크인 로그 없음</div></td></tr>';
}

async function runRoadmapCheckin(forcedNote='', silent=false) {
  const statusEl = el('roadmapCheckinStatus');
  const noteEl = el('roadmapNote');
  const inputNote = (noteEl && noteEl.value ? noteEl.value : '').trim();
  const note = String(forcedNote || inputNote || '').trim();
  if (statusEl && !silent) statusEl.textContent = '체크인 기록 중...';
  try {
    const res = await fetch('/api/roadmap-checkin', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ note, actor: 'codex' }),
    });
    const payload = await res.json();
    if (!payload.ok) {
      if (statusEl && !silent) statusEl.textContent = `실패: ${payload.error || 'unknown'}`;
      return;
    }
    ROADMAP_DATA = payload.roadmap || {};
    if (statusEl && !silent) statusEl.textContent = '체크인 저장 완료';
    if (noteEl && !forcedNote) noteEl.value = '';
    renderRoadmap();
  } catch (err) {
    if (statusEl && !silent) statusEl.textContent = `오류: ${err.message || err}`;
  }
}

function renderLoopControls() {
  const select = el('loopSelect');
  const body = el('loopBody');
  if (!select || !body) return;

  const prevSelected = select.value;
  const rows = Array.isArray(LOOP_ROWS) ? LOOP_ROWS : [];
  select.innerHTML = rows.map(r => `<option value="${esc(r.loop_id)}">${esc(r.label || r.loop_id)}</option>`).join('');
  if (prevSelected && rows.some(r => r.loop_id === prevSelected)) {
    select.value = prevSelected;
  }
  if (!select.value && rows.length) {
    select.value = rows[0].loop_id;
  }

  const filtered = rows.filter(r => {
    if (LOOP_FILTER === 'active') return !!r.running;
    if (LOOP_FILTER === 'attention') return loopNeedsAttention(r);
    return true;
  });

  body.innerHTML = filtered.map(r => `
    <tr>
      <td><span class="mono">${esc(r.label || r.loop_id || '-')}</span></td>
      <td>
        <span class="status-dot ${r.running ? 'running' : 'stopped'}"></span>
        ${r.running ? 'running' : 'stopped'}
      </td>
      <td>${r.watchdog_running ? 'on' : 'off'}</td>
      <td><span class="tag mono">${esc(r.phase || '-')}</span></td>
      <td class="mono">${esc(r.rid || '-')}</td>
      <td><span class="tag ${esc((String(r.verdict || '').toLowerCase() === 'pass') ? 'low' : 'medium')}">${esc(r.verdict || '-')}</span></td>
      <td><span class="${stalenessClass(r.staleness)}">${esc(r.staleness || 'unknown')}</span> (${formatAgeSec(r.history_age_sec)})</td>
      <td class="mono">${esc(r.updated_at || '-')}</td>
      <td>
        <div class="loop-actions">
          <button class="loop-row-action" data-loop-id="${esc(r.loop_id)}" data-action="status">status</button>
          <button class="loop-row-action" data-loop-id="${esc(r.loop_id)}" data-action="restart">restart</button>
          <button class="loop-row-action" data-loop-id="${esc(r.loop_id)}" data-action="watch-start">watch on</button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.loop-row-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const loopId = btn.getAttribute('data-loop-id');
      const action = btn.getAttribute('data-action');
      runLoopAction(loopId, action);
    });
  });

  const selectedLabel = rows.find(r => r.loop_id === select.value)?.label || select.value || '-';
  el('selectedLoopPill').textContent = `selected: ${selectedLabel}`;
  el('loopControlStamp').textContent = `loop refresh ${new Date().toLocaleTimeString('ko-KR', { hour12: false })}`;
}

async function loadLoops() {
  try {
    const res = await fetch('/api/agent-loops');
    const payload = await res.json();
    LOOP_ROWS = normalizeLoopRows(payload);
    renderLoopControls();
  } catch (err) {
    LOOP_ROWS = [];
    if (el('loopActionStatus')) {
      el('loopActionStatus').textContent = `loop load failed: ${err.message || err}`;
    }
    renderLoopControls();
  }
}

async function runLoopAction(loopId, action) {
  if (!loopId || !action) return;
  const statusEl = el('loopActionStatus');
  if (statusEl) statusEl.textContent = `${loopId} · ${action} 실행 중...`;
  try {
    const res = await fetch('/api/agent-loops/action', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ loop_id: loopId, action }),
    });
    const payload = await res.json();
    const ok = !!payload.ok;
    const rc = payload.result && (payload.result.returncode ?? '-');
    if (statusEl) {
      statusEl.textContent = ok
        ? `${loopId} · ${action} 완료 (rc=${rc})`
        : `${loopId} · ${action} 실패 (rc=${rc})`;
    }
    await loadLoops();
    if (action !== 'status' && action !== 'watch-status') {
      setTimeout(() => loadData(), 1200);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `${loopId} · ${action} 오류: ${err.message || err}`;
  }
}

function getFilters() {
  return {
    q: el('search').value.trim(),
    onlyPinned: el('onlyPinned').checked ? '1' : '0',
    onlyNoProject: el('onlyNoProject').checked ? '1' : '0',
    onlyNoLocal: el('onlyNoLocal').checked ? '1' : '0',
    source: el('sourceFilter').value || '',
    scope: el('scopeFilter').value || 'all',
    sort: el('sortFilter').value || 'order',
    minRisk: el('minRisk').value || '0',
    minCtx: el('minCtx').value || '0',
  };
}

async function loadThreads(resetOffset=false) {
  if (resetOffset) OFFSET = 0;
  LIMIT = Number(el('pageSize').value || '50');
  const f = getFilters();
  updateFilterBadge();
  saveUiPrefs();
  const qs = new URLSearchParams({
    offset: String(OFFSET),
    limit: String(LIMIT),
    q: f.q,
    onlyPinned: f.onlyPinned,
    onlyNoProject: f.onlyNoProject,
    onlyNoLocal: f.onlyNoLocal,
    source: f.source,
    scope: f.scope,
    sort: f.sort,
    minRisk: f.minRisk,
    minCtx: f.minCtx,
  });
  const res = await fetch('/api/threads?' + qs.toString());
  const data = await res.json();
  CURRENT_ROWS = data.rows || [];
  TOTAL = data.total || 0;
  OFFSET = data.offset || 0;
  renderThreads();
  renderPageInfo();
}

function renderPageInfo() {
  const from = TOTAL === 0 ? 0 : OFFSET + 1;
  const to = Math.min(OFFSET + LIMIT, TOTAL);
  const page = TOTAL === 0 ? 1 : Math.floor(OFFSET / LIMIT) + 1;
  const pages = TOTAL === 0 ? 1 : Math.ceil(TOTAL / LIMIT);
  el('pageInfo').textContent = `${from}-${to} / ${TOTAL} (page ${page}/${pages})`;
  el('prevPage').disabled = OFFSET <= 0;
  el('nextPage').disabled = OFFSET + LIMIT >= TOTAL;
}

function setThreadRenderStatus(text) {
  const x = el('threadRenderStatus');
  if (x) x.textContent = text || '';
}

function threadRowHtml(t, idx) {
  return `
    <tr class="thread-row ${selected.has(t.id) ? 'row-selected' : ''} ${idx === ACTIVE_ROW_INDEX ? 'row-active' : ''}" data-thread-id="${esc(t.id)}" data-row-index="${idx}">
      <td><input type="checkbox" data-id="${esc(t.id)}" ${selected.has(t.id) ? 'checked' : ''} /></td>
      <td><span class="clip" title="${esc(t.title)}">${esc(t.title)}</span></td>
      <td class="mono">${esc(t.id)}</td>
      <td><span class="tag mono">${esc(t.title_source)}</span></td>
      <td><span class="tag ${esc(t.risk_level || 'low')}">${esc((t.risk_level || 'low') + ' (' + String(t.risk_score || 0) + ')')}</span></td>
      <td><span class="tag mono">${esc(String(t.context_score || 0))}</span></td>
      <td>${(t.risk_tags || []).map(x => `<span class="tag mono">${esc(x)}</span>`).join('')}</td>
      <td>${t.pinned ? 'Y' : ''}</td>
      <td>${t.has_local_data ? 'Y' : ''}</td>
      <td>${t.has_session_log ? 'Y' : ''}</td>
      <td><span class="tag ${threadStatusTagClass(t.activity_status)}">${esc(t.activity_status || '-')}</span></td>
      <td class="mono">${esc((t.last_activity || '').replace('T', ' ').slice(0, 19) || '-')}</td>
      <td>${t.age_days == null ? '' : esc(String(t.age_days))}</td>
      <td class="mono">${esc(t.cwd || '')}</td>
      <td>${t.project_buckets.length ? t.project_buckets.map(b => `<span class="tag mono">${esc(b)}</span>`).join('') : '<span class="warn">미연결</span>'}</td>
    </tr>
  `;
}

function bindThreadBodyEvents() {
  const body = el('threadBody');
  if (!body || body.dataset.bound === '1') return;
  body.dataset.bound = '1';

  body.addEventListener('change', (e) => {
    const target = e.target;
    if (!target || target.tagName.toLowerCase() !== 'input') return;
    if (target.getAttribute('type') !== 'checkbox') return;
    const id = target.getAttribute('data-id') || '';
    if (!id) return;
    if (target.checked) selected.add(id); else selected.delete(id);
    const row = target.closest('tr.thread-row');
    if (row) row.classList.toggle('row-selected', !!target.checked);
    updateSel();
    e.stopPropagation();
  });

  body.addEventListener('click', (e) => {
    const raw = e.target;
    const target = raw && raw.nodeType === 1 ? raw : (raw && raw.parentElement ? raw.parentElement : null);
    if (!target || !target.closest) return;
    if (target.closest('input,button,a')) return;
    const row = target.closest('tr.thread-row');
    if (!row) return;
    const id = row.getAttribute('data-thread-id') || '';
    const idx = Number(row.getAttribute('data-row-index') || '-1');
    if (Number.isFinite(idx) && idx >= 0) ACTIVE_ROW_INDEX = idx;
    renderThreadInspector(findCurrentThreadById(id));
    renderThreads();
  });
}

function renderThreads() {
  if (CURRENT_ROWS.length === 0) {
    ACTIVE_ROW_INDEX = -1;
  } else if (ACTIVE_ROW_INDEX >= CURRENT_ROWS.length) {
    ACTIVE_ROW_INDEX = CURRENT_ROWS.length - 1;
  }
  if (ACTIVE_THREAD_ID) {
    const idx = CURRENT_ROWS.findIndex(t => t.id === ACTIVE_THREAD_ID);
    if (idx >= 0) ACTIVE_ROW_INDEX = idx;
  }

  renderThreadCards();
  const body = el('threadBody');
  if (!body) return;
  bindThreadBodyEvents();

  const rows = CURRENT_ROWS || [];
  const token = ++THREAD_RENDER_TOKEN;
  if (rows.length > THREAD_CHUNK_THRESHOLD) {
    body.innerHTML = '';
    let cursor = 0;
    setThreadRenderStatus(`table render ${cursor}/${rows.length}`);
    const step = () => {
      if (token !== THREAD_RENDER_TOKEN) return;
      const end = Math.min(cursor + THREAD_CHUNK_SIZE, rows.length);
      let html = '';
      for (let i = cursor; i < end; i += 1) {
        html += threadRowHtml(rows[i], i);
      }
      body.insertAdjacentHTML('beforeend', html);
      cursor = end;
      setThreadRenderStatus(`table render ${cursor}/${rows.length}`);
      if (cursor < rows.length) {
        window.requestAnimationFrame(step);
      } else {
        setupScrollShadow('threadTableWrap');
      }
    };
    window.requestAnimationFrame(step);
  } else {
    body.innerHTML = rows.map((t, idx) => threadRowHtml(t, idx)).join('');
    setThreadRenderStatus(`table render ${rows.length}/${rows.length}`);
    setupScrollShadow('threadTableWrap');
  }

  if (ACTIVE_THREAD_ID) {
    renderThreadInspector(findCurrentThreadById(ACTIVE_THREAD_ID));
  }

  renderCommandCenter();
  updateSel();
}

function renderThreadCards() {
  const box = el('threadCards');
  if (!box) return;
  box.innerHTML = CURRENT_ROWS.map(t => `
    <div class="thread-card" data-thread-id="${esc(t.id)}">
      <h4>${esc(t.title || '-')}</h4>
      <div class="meta mono">${esc(t.id)} · ${esc(t.title_source || '-')}</div>
      <div>
        <span class="tag ${esc(t.risk_level || 'low')}">risk ${esc(String(t.risk_score || 0))}</span>
        <span class="tag mono">ctx ${esc(String(t.context_score || 0))}</span>
        <span class="tag ${threadStatusTagClass(t.activity_status)}">${esc(t.activity_status || '-')}</span>
        ${t.pinned ? '<span class="tag">pinned</span>' : ''}
        ${t.has_session_log ? '<span class="tag">session</span>' : ''}
      </div>
      <div class="meta">cwd: ${esc(t.cwd || '-')}</div>
    </div>
  `).join('');
  box.querySelectorAll('.thread-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-thread-id');
      renderThreadInspector(findCurrentThreadById(id));
    });
  });
}

function renderWorkspaces() {
  el('workspaceBody').innerHTML = DATA.workspaces.map(w => `
    <tr>
      <td class="mono">${esc(w.path)}</td>
      <td>${w.active ? 'Y' : ''}</td>
      <td>${w.exists ? 'Y' : 'N'}</td>
      <td>${esc(w.label || '')}</td>
    </tr>
  `).join('');
}

function renderBuckets() {
  el('bucketBody').innerHTML = DATA.project_buckets.map(b => `
    <tr>
      <td class="mono">${esc(b.project_bucket)}</td>
      <td>${b.thread_count}</td>
      <td>${(b.likely_workspaces || []).map(x => `<span class="tag mono">${esc(x.cwd)} (${x.count})</span>`).join('')}</td>
      <td class="mono">${esc(b.path)}</td>
    </tr>
  `).join('');
}

function renderLabs() {
  el('labsBody').innerHTML = DATA.labs_projects.map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td>${p.is_git ? 'Y' : ''}</td>
      <td class="mono">${esc(p.path)}</td>
    </tr>
  `).join('');
}

function renderContextBottlenecks() {
  const rows = DATA.context_bottlenecks || [];
  el('ctxBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${esc(r.cwd)}</td>
      <td>${r.thread_count}</td>
      <td>${r.avg_score}</td>
      <td>${r.max_score}</td>
      <td>${r.high_risk_count || 0}</td>
      <td>${r.internal_count || 0}</td>
      <td>${r.orphan_count || 0}</td>
      <td>${r.total_tool_calls}</td>
      <td>${r.total_lines}</td>
    </tr>
  `).join('');
}

function renderRiskSummary() {
  const rs = DATA.risk_summary || {};
  el('riskSummary').innerHTML = `
    <span class="tag high">high: ${rs.high || 0}</span>
    <span class="tag medium">medium: ${rs.medium || 0}</span>
    <span class="tag low">low: ${rs.low || 0}</span>
    <span class="tag">internal: ${rs.internal_total || 0}</span>
    <span class="tag">orphan: ${rs.orphan_candidates || 0}</span>
    <span class="tag">stale: ${rs.stale_total || 0}</span>
    <span class="tag">ctx>=70: ${rs.ctx_high_total || 0}</span>
  `;
  const recs = DATA.recommendations || [];
  if (!recs.length) {
    el('recommendBody').innerHTML = '<div class="sub">현재 즉시 액션 추천 없음</div>';
    return;
  }
  el('recommendBody').innerHTML = recs.map(r => `
    <div class="rec-item">
      <div><strong>${esc(r.label || r.id || 'action')}</strong></div>
      <div class="sub">${esc(r.description || '')}</div>
      <button data-rec="${esc(r.id || '')}" class="apply-rec">이 필터 적용</button>
    </div>
  `).join('');
  el('recommendBody').querySelectorAll('.apply-rec').forEach(btn => {
    btn.addEventListener('click', () => applyRecommendation(btn.getAttribute('data-rec')));
  });
}

function renderSyncStatus() {
  const s = DATA.sync_status || {};
  const modeLabel = s.share_mode === 'partial' ? '부분 공유(완전 동기화 아님)' : String(s.share_mode || '-');
  el('syncStatus').innerHTML = `
    <span class="tag">${esc(modeLabel)}</span>
    <span class="tag">GUI 저장 제목(전체): ${esc(String(s.gui_sidebar_threads || 0))}</span>
    <span class="tag">Terminal 세션: ${esc(String(s.terminal_session_threads || 0))}</span>
    <span class="tag">연결 추정: ${esc(String(s.linked_gui_terminal_threads || 0))}</span>
    <span class="tag">내부 전용: ${esc(String(s.internal_only_threads || 0))}</span>
    <span class="tag">GUI meta-only: ${esc(String(s.gui_meta_only_threads || 0))}</span>
    <span class="tag">GUI unknown cwd: ${esc(String(s.gui_unknown_cwd_threads || 0))}</span>
    <span class="tag">active workspace 일치: ${esc(String(s.gui_active_workspace_matched || 0))}</span>
    <span class="tag">GUI 숨김 후보: ${esc(String(s.gui_hidden_candidate_threads || 0))}</span>
    <div style="margin-top:8px;">${esc(s.note || '')}</div>
    <div style="margin-top:4px;">'GUI 저장 제목(전체)'는 현재 프로젝트 화면에서 보이는 수가 아니라, 로컬 global-state에 남아있는 누적 제목 개수입니다.</div>
  `;
}

function applyRecommendation(id) {
  const recs = DATA.recommendations || [];
  const rec = recs.find(x => (x.id || '') === id);
  if (!rec || !rec.filters) return;
  const f = rec.filters;
  if (f.scope && el('scopeFilter')) el('scopeFilter').value = f.scope;
  if (f.sort && el('sortFilter')) el('sortFilter').value = f.sort;
  if (f.minRisk != null && el('minRisk')) el('minRisk').value = String(f.minRisk);
  if (f.minCtx != null && el('minCtx')) el('minCtx').value = String(f.minCtx);
  if (f.source != null && el('sourceFilter')) el('sourceFilter').value = String(f.source);
  setActiveTab('triage');
  loadThreads(true);
}

function updateSel() {
  el('selCount').textContent = `선택 ${selected.size}개`;
  renderRuntimeHealth();
  scheduleForensicsLoad();
}

function downloadSelection() {
  const payload = {
    selected_thread_ids: Array.from(selected),
    count: selected.size,
    exported_at: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'codex-selected-threads.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copySelection() {
  const text = Array.from(selected).join('\n');
  await navigator.clipboard.writeText(text);
}

function getActionTargetIds() {
  const picked = Array.from(selected);
  if (picked.length) return picked;
  if (ACTIVE_ROW_INDEX >= 0 && ACTIVE_ROW_INDEX < CURRENT_ROWS.length) {
    return [CURRENT_ROWS[ACTIVE_ROW_INDEX].id];
  }
  if (ACTIVE_THREAD_ID) {
    return [ACTIVE_THREAD_ID];
  }
  return [];
}

function setThreadActionStatus(text) {
  const elx = el('threadActionStatus');
  if (elx) elx.textContent = text || '';
}

function setTodayQueueStatus(text) {
  const elx = el('todayQueueStatus');
  if (elx) elx.textContent = text || '';
}

function selectCurrentRowsByPredicate(predicate, label, limit=20) {
  const rows = Array.isArray(CURRENT_ROWS) ? CURRENT_ROWS : [];
  const picked = [];
  for (const t of rows) {
    if (!predicate(t)) continue;
    picked.push(t.id);
    if (picked.length >= limit) break;
  }
  selected.clear();
  picked.forEach(id => selected.add(id));
  if (picked.length) {
    ACTIVE_THREAD_ID = picked[0];
    const idx = rows.findIndex(t => t.id === picked[0]);
    ACTIVE_ROW_INDEX = idx >= 0 ? idx : ACTIVE_ROW_INDEX;
    renderThreadInspector(findCurrentThreadById(picked[0]));
  }
  renderThreads();
  const msg = picked.length
    ? `${label}: ${picked.length}개 선택됨`
    : `${label}: 조건에 맞는 스레드가 없습니다.`;
  setTodayQueueStatus(msg);
  setThreadActionStatus(msg);
}

function runTodayQueueSelection(mode) {
  if (mode === 'high-risk') {
    selectCurrentRowsByPredicate(t => Number(t.risk_score || 0) >= 70, 'High Risk 큐', 20);
    return;
  }
  if (mode === 'ctx-hot') {
    selectCurrentRowsByPredicate(t => Number(t.context_score || 0) >= 70, 'Ctx Hot 큐', 20);
    return;
  }
  if (mode === 'orphans') {
    selectCurrentRowsByPredicate(t => Array.isArray(t.risk_tags) && t.risk_tags.includes('orphan-candidate'), 'Orphan 큐', 20);
    return;
  }
  selected.clear();
  ACTIVE_THREAD_ID = '';
  ACTIVE_ROW_INDEX = -1;
  renderThreads();
  setTodayQueueStatus('오늘 처리 큐 선택이 초기화되었습니다.');
  setThreadActionStatus('선택 초기화');
}

async function runTodayQueueDryRun() {
  if (!selected.size) {
    runTodayQueueSelection('high-risk');
  }
  if (!selected.size) {
    setTodayQueueStatus('정리 미리보기 대상이 없습니다.');
    return;
  }
  setActiveTab('triage');
  await runCleanup(true);
  setTodayQueueStatus(`오늘 큐 정리 미리보기 완료 (${selected.size}개)`);
  setThreadActionStatus(`오늘 큐 정리 미리보기 완료 (${selected.size}개)`);
}

async function runThreadPin(pinned=true) {
  const ids = getActionTargetIds();
  if (!ids.length) {
    setThreadActionStatus('대상 스레드를 먼저 선택하세요.');
    return;
  }
  setThreadActionStatus(`${pinned ? 'pin' : 'unpin'} 처리 중...`);
  const res = await fetch('/api/thread-pin', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ ids, pinned }),
  });
  const data = await res.json();
  if (!data.ok) {
    setThreadActionStatus(`실패: ${data.error || 'unknown'}`);
    return;
  }
  setThreadActionStatus(`${pinned ? 'pin' : 'unpin'} 완료 (${ids.length}개)`);
  await loadData();
}

async function runThreadArchiveLocal() {
  const ids = getActionTargetIds();
  if (!ids.length) {
    setThreadActionStatus('대상 스레드를 먼저 선택하세요.');
    return;
  }
  const ok = window.confirm(`선택 스레드 ${ids.length}개를 로컬 사이드바에서 숨김(archive) 처리할까요? 파일 삭제는 하지 않습니다.`);
  if (!ok) return;
  setThreadActionStatus('로컬 아카이브 처리 중...');
  const res = await fetch('/api/thread-archive-local', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!data.ok) {
    setThreadActionStatus(`실패: ${data.error || 'unknown'}`);
    return;
  }
  const removed = (data.state_result && data.state_result.removed) || {};
  setThreadActionStatus(`로컬 아카이브 완료: titles ${removed.titles || 0}, order ${removed.order || 0}, pinned ${removed.pinned || 0}`);
  selected.clear();
  ACTIVE_THREAD_ID = '';
  ACTIVE_ROW_INDEX = -1;
  await loadData();
}

async function copyResumeCommands() {
  const ids = getActionTargetIds();
  if (!ids.length) {
    setThreadActionStatus('대상 스레드를 먼저 선택하세요.');
    return;
  }
  const res = await fetch('/api/thread-resume-command', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!data.ok) {
    setThreadActionStatus(`실패: ${data.error || 'unknown'}`);
    return;
  }
  try {
    await navigator.clipboard.writeText(data.text || '');
    setThreadActionStatus(`resume 명령 ${ids.length}개 복사됨`);
  } catch (_) {
    setThreadActionStatus('클립보드 복사 실패: /api/thread-resume-command 응답을 확인하세요.');
  }
}

function downloadSnapshot() {
  const payload = {
    exported_at: new Date().toISOString(),
    active_tab: ACTIVE_TAB,
    global_auto_refresh_ms: GLOBAL_AUTO_MS,
    filters: getFilters(),
    selected_thread_ids: Array.from(selected),
    pagination: { offset: OFFSET, limit: LIMIT, total: TOTAL },
    overview_summary: (DATA && DATA.summary) || {},
    risk_summary: (DATA && DATA.risk_summary) || {},
    health: HEALTH_DATA || {},
    observatory_summary: (OBS_DATA && OBS_DATA.summary) || {},
    loops: LOOP_ROWS || [],
    visible_rows: CURRENT_ROWS || [],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `codex-overview-snapshot-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function runDeleteImpactAnalysis() {
  const ids = Array.from(selected);
  if (!ids.length) {
    el('impactSummary').textContent = '선택된 스레드가 없습니다.';
    el('impactBody').innerHTML = '';
    return;
  }
  const res = await fetch('/api/analyze-delete', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ids})
  });
  const data = await res.json();
  const rows = data.reports || [];
  el('impactSummary').textContent = `분석 완료: ${rows.length}개`;
  el('impactBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${esc(r.id)}</td>
      <td><span class="tag">${esc(r.risk_level)} (${esc(String(r.risk_score))})</span></td>
      <td>${esc(r.summary || '')}</td>
      <td>${(r.parents || []).map(p => `<span class="tag mono">${esc(p)}</span>`).join('')}</td>
    </tr>
  `).join('');
}

function renderForensicsRows(rows) {
  if (!rows.length) {
    el('forensicsBody').innerHTML = '<tr><td colspan="5"><div class="empty-msg">선택 스레드 포렌식 결과가 없습니다.</div></td></tr>';
    return;
  }
  el('forensicsBody').innerHTML = rows.map(r => {
    const id = r.id || r.thread_id || '-';
    const riskLevel = r.risk_level || 'low';
    const riskScore = r.risk_score ?? r.risk ?? 0;
    const parents = toList(r.parents).map(summarizeParent).filter(Boolean);
    const artifacts = toList(r.artifacts).map(summarizeArtifact).filter(Boolean);
    const evidence = toList(r.quick_evidence || r.evidence || r.signals).map(summarizeEvidence).filter(Boolean).slice(0, 5);
    return `
      <tr>
        <td class="mono">${esc(String(id))}</td>
        <td><span class="tag ${esc(String(riskLevel))}">${esc(String(riskLevel))} (${esc(String(riskScore))})</span></td>
        <td>${parents.length ? parents.map(x => `<span class="tag mono">${esc(x)}</span>`).join('') : '<span class="sub">-</span>'}</td>
        <td>${artifacts.length ? artifacts.map(x => `<span class="tag mono">${esc(x)}</span>`).join('') : '<span class="sub">-</span>'}</td>
        <td>
          ${evidence.length ? `<ul class="evidence-list">${evidence.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="sub">-</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

async function loadThreadForensics() {
  const ids = Array.from(selected);
  if (!ids.length) {
    el('forensicsSummary').textContent = '선택된 스레드가 없습니다. 체크박스를 선택하면 포렌식을 자동 조회합니다.';
    el('forensicsBody').innerHTML = '<tr><td colspan="5"><div class="empty-msg">선택 대기 중</div></td></tr>';
    return;
  }
  const reqId = ++FORENSICS_REQ_SEQ;
  el('forensicsSummary').textContent = `포렌식 로딩 중... (${ids.length}개)`;
  try {
    const res = await fetch('/api/thread-forensics', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ ids }),
    });
    const payload = await res.json();
    if (reqId !== FORENSICS_REQ_SEQ) return;
    const rows = normalizeForensicsRows(payload);
    const count = rows.length;
    const high = rows.filter(r => {
      const level = String(r.risk_level || '').toLowerCase();
      const score = Number(r.risk_score || r.risk || 0);
      return level === 'high' || score >= 70;
    }).length;
    el('forensicsSummary').textContent = `포렌식 완료: ${count}개 스레드, high risk ${high}개`;
    renderForensicsRows(rows);
  } catch (err) {
    if (reqId !== FORENSICS_REQ_SEQ) return;
    el('forensicsSummary').textContent = `포렌식 조회 실패: ${err.message || err}`;
    el('forensicsBody').innerHTML = '<tr><td colspan="5"><div class="empty-msg">/api/thread-forensics 응답을 확인하세요.</div></td></tr>';
  }
}

function scheduleForensicsLoad() {
  if (FORENSICS_TIMER) clearTimeout(FORENSICS_TIMER);
  FORENSICS_TIMER = setTimeout(loadThreadForensics, 120);
}

function cleanupOptions() {
  return {
    delete_cache: el('optDeleteCache').checked,
    delete_session_logs: el('optDeleteSessionLogs').checked,
    clean_state_refs: el('optCleanStateRefs').checked,
  };
}

function renderCleanupResult(data) {
  const ok = data.ok !== false;
  const mode = data.mode || '';
  const tgt = data.target_file_count || 0;
  const deleted = data.deleted_file_count || 0;
  const backupDir = (data.backup && data.backup.backup_dir) ? data.backup.backup_dir : '-';
  const removed = (data.state_result && data.state_result.removed) ? data.state_result.removed : {};
  const token = data.confirm_token_expected || '';
  CLEANUP_CONFIRM_EXPECTED = token;
  const tokenEl = el('cleanupExpectedToken');
  if (tokenEl) tokenEl.textContent = token ? `expected: ${token}` : 'expected: -';
  const removedText = `titles:${removed.titles||0}, order:${removed.order||0}, pinned:${removed.pinned||0}`;
  if (!ok) {
    el('cleanupSummary').textContent = `실패: ${data.error || 'unknown'}${token ? ` · expected ${token}` : ''}`;
  } else if (mode === 'execute') {
    el('cleanupSummary').textContent = `실행 완료: 파일 ${deleted}/${tgt} 삭제, state 정리(${removedText}), backup=${backupDir}`;
  } else {
    el('cleanupSummary').textContent = `미리보기: 대상 파일 ${tgt}개, state 정리 예정(${removedText}) · 실행 토큰 ${token || '-'}`;
  }
  el('cleanupBody').innerHTML = (data.targets || []).slice(0, 500).map(x => `
    <tr>
      <td><span class="tag mono">${esc(x.kind)}</span></td>
      <td class="mono">${esc(x.thread_id)}</td>
      <td class="mono">${esc(x.path)}</td>
    </tr>
  `).join('');
}

async function runCleanup(dryRun=true) {
  const ids = Array.from(selected);
  if (!ids.length) {
    el('cleanupSummary').textContent = '선택된 스레드가 없습니다.';
    el('cleanupBody').innerHTML = '';
    return;
  }
  const payload = { ids, dry_run: dryRun, options: cleanupOptions() };
  if (!dryRun) {
    const typed = (el('cleanupConfirmToken').value || '').trim();
    if (!typed) {
      el('cleanupSummary').textContent = '실행 토큰을 입력하세요. 먼저 미리보기 실행 후 expected 토큰을 입력해야 합니다.';
      return;
    }
    payload.confirm_token = typed;
  }
  const res = await fetch('/api/local-cleanup', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  renderCleanupResult(data);
}

async function copyCleanupToken() {
  if (!CLEANUP_CONFIRM_EXPECTED) {
    el('cleanupSummary').textContent = '복사할 토큰이 없습니다. 먼저 정리 미리보기를 실행하세요.';
    return;
  }
  try {
    await navigator.clipboard.writeText(CLEANUP_CONFIRM_EXPECTED);
    const input = el('cleanupConfirmToken');
    if (input) input.value = CLEANUP_CONFIRM_EXPECTED;
    el('cleanupSummary').textContent = `실행 토큰 복사됨: ${CLEANUP_CONFIRM_EXPECTED}`;
  } catch (_) {
    el('cleanupSummary').textContent = `클립보드 실패. 수동 입력: ${CLEANUP_CONFIRM_EXPECTED}`;
  }
}

async function renameSelectedThread() {
  const ids = Array.from(selected);
  const title = el('renameInput').value.trim();
  if (ids.length !== 1) {
    el('renameStatus').textContent = '선택은 1개만 가능합니다.';
    return;
  }
  if (!title) {
    el('renameStatus').textContent = '새 제목을 입력하세요.';
    return;
  }
  const payload = { id: ids[0], title };
  const res = await fetch('/api/rename-thread', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    el('renameStatus').textContent = '제목 변경 완료';
    await loadData();
  } else {
    el('renameStatus').textContent = '실패: ' + (data.error || 'unknown');
  }
}

function renderStaticPanels() {
  renderCommandCenter();
  renderRuntimeHealth();
  renderHealthChecks();
  renderCodexObservatory();
  renderCompareApps();
  renderAlertHooks();
  renderRecoveryCenter();
  renderRoadmap();
  renderCards();
  renderDataSources();
  renderRiskSummary();
  renderSyncStatus();
  renderWorkspaces();
  renderBuckets();
  renderContextBottlenecks();
  renderLabs();
  const p = DATA.paths;
  el('paths').innerHTML = `
    <div>codex_global_state: ${esc(p.codex_global_state)}</div>
    <div>chat_root: ${esc(p.chat_root)}</div>
    <div>labs_root: ${esc(p.labs_root)}</div>
    <div>codex_sessions_root: ${esc(p.codex_sessions_root)}</div>
    <div>codex_archived_sessions_root: ${esc(p.codex_archived_sessions_root)}</div>
  `;
}

let searchTimer = null;

window.addEventListener('DOMContentLoaded', () => {
  loadUiPrefs();
  const hashTab = normalizeTabName((location.hash || '').replace('#', ''));
  if (location.hash) ACTIVE_TAB = hashTab;
  applyVisualModes();
  setActiveTab(ACTIVE_TAB, true);
  updateFilterBadge();
  renderGlobalRefreshStatus();
  const autoSel = el('globalAutoRefresh');
  if (autoSel) {
    autoSel.value = String(GLOBAL_AUTO_MS || 0);
    autoSel.addEventListener('change', () => {
      setGlobalAutoRefresh(Number(autoSel.value || 0));
    });
  }
  setGlobalAutoRefresh(GLOBAL_AUTO_MS);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.getAttribute('data-tab') || 'overview'));
  });
  window.addEventListener('hashchange', () => {
    const next = normalizeTabName((location.hash || '').replace('#', ''));
    setActiveTab(next, false);
  });
  const refreshAll = () => loadData();
  el('refreshBtn').addEventListener('click', refreshAll);
  const topRefresh = el('topRefresh');
  if (topRefresh) topRefresh.addEventListener('click', refreshAll);
  const opsRefresh = el('opsRefresh');
  if (opsRefresh) opsRefresh.addEventListener('click', () => loadCodexObservatory(true));
  const opsShowAllChk = el('opsShowAllProc');
  if (opsShowAllChk) {
    opsShowAllChk.checked = OBS_SHOW_ALL;
    opsShowAllChk.addEventListener('change', () => {
      OBS_SHOW_ALL = !!opsShowAllChk.checked;
      saveUiPrefs();
      renderCodexObservatory();
    });
  }
  const topCommand = el('topCommand');
  if (topCommand) topCommand.addEventListener('click', openQuickFilterModal);
  const openQuickFilter = el('openQuickFilter');
  if (openQuickFilter) openQuickFilter.addEventListener('click', openQuickFilterModal);
  const quickClose = el('quickFilterClose');
  if (quickClose) quickClose.addEventListener('click', closeQuickFilterModal);
  const quickModal = el('quickFilterModal');
  if (quickModal) {
    quickModal.addEventListener('click', (e) => {
      if (e.target === quickModal) closeQuickFilterModal();
    });
  }
  const compactBtn = el('toggleCompact');
  if (compactBtn) compactBtn.addEventListener('click', () => setCompactMode(!IS_COMPACT));
  const cardBtn = el('toggleCards');
  if (cardBtn) cardBtn.addEventListener('click', () => setCardMode(!FORCE_CARD_MODE));
  const clearInspector = el('clearInspector');
  if (clearInspector) clearInspector.addEventListener('click', () => renderThreadInspector(null));
  const quickPresetMap = {
    quickPresetUi: 'presetUiOnly',
    quickPresetInternal: 'presetInternalOnly',
    quickPresetTerminal: 'presetTerminalSessions',
    quickPresetLinked: 'presetLinkedOnly',
    quickPresetHidden: 'presetGuiHidden',
    quickPresetReset: 'presetReset',
  };
  Object.entries(quickPresetMap).forEach(([quickId, targetId]) => {
    const btn = el(quickId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const target = el(targetId);
      if (target) target.click();
      closeQuickFilterModal();
    });
  });
  window.addEventListener('keydown', (e) => {
    const tag = String((e.target && e.target.tagName) || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    const modalOpen = !!(quickModal && quickModal.classList.contains('open'));
    const isCmdK = (e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'k';
    if (isCmdK) {
      e.preventDefault();
      openQuickFilterModal();
      return;
    }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '1') setActiveTab('overview');
      if (e.key === '2') setActiveTab('triage');
      if (e.key === '3') setActiveTab('storage');
      if (e.key === '4') setActiveTab('operations');
    }
    if (!typing && !modalOpen && ACTIVE_TAB === 'triage' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const key = String(e.key || '').toLowerCase();
      if (key === 'j' || key === 'k') {
        if (!CURRENT_ROWS.length) return;
        e.preventDefault();
        const step = key === 'j' ? 1 : -1;
        let next = ACTIVE_ROW_INDEX;
        if (next < 0) {
          next = step > 0 ? 0 : CURRENT_ROWS.length - 1;
        } else {
          next = Math.max(0, Math.min(CURRENT_ROWS.length - 1, next + step));
        }
        ACTIVE_ROW_INDEX = next;
        const target = CURRENT_ROWS[next];
        if (target) {
          ACTIVE_THREAD_ID = target.id;
          renderThreadInspector(target);
          renderThreads();
          const rowEl = document.querySelector(`#threadBody tr.thread-row[data-row-index="${next}"]`);
          if (rowEl && rowEl.scrollIntoView) rowEl.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        const target = getActionTargetIds();
        if (!target.length) return;
        const row = CURRENT_ROWS.find(x => x.id === target[0]);
        runThreadPin(!(row && row.pinned));
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        runThreadArchiveLocal();
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        copyResumeCommands();
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        if (ACTIVE_ROW_INDEX >= 0 && ACTIVE_ROW_INDEX < CURRENT_ROWS.length) {
          const tid = CURRENT_ROWS[ACTIVE_ROW_INDEX].id;
          if (selected.has(tid)) selected.delete(tid);
          else selected.add(tid);
          renderThreads();
        }
        return;
      }
    }
    if (e.key === 'Escape') {
      closeQuickFilterModal();
    }
  });
  const dismissBtn = el('dismissQuickStart');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const card = el('loopQuickStart');
      if (card) card.style.display = 'none';
      try { localStorage.setItem('codex.quickstart.hidden', '1'); } catch (_) {}
    });
  }
  try {
    if (localStorage.getItem('codex.quickstart.hidden') === '1') {
      const card = el('loopQuickStart');
      if (card) card.style.display = 'none';
    }
  } catch (_) {}
  const loopSelect = el('loopSelect');
  if (loopSelect) {
    loopSelect.addEventListener('change', () => {
      const selected = LOOP_ROWS.find(x => x.loop_id === loopSelect.value);
      el('selectedLoopPill').textContent = `selected: ${selected ? selected.label : (loopSelect.value || '-')}`;
    });
  }
  const topActions = [
    ['loopActionStart', 'start'],
    ['loopActionStop', 'stop'],
    ['loopActionRestart', 'restart'],
    ['loopActionRun2', 'run2'],
    ['loopActionWatchStart', 'watch-start'],
    ['loopActionWatchStop', 'watch-stop'],
  ];
  topActions.forEach(([id, action]) => {
    const btn = el(id);
    if (!btn) return;
    btn.addEventListener('click', () => runLoopAction(el('loopSelect').value, action));
  });
  const openTmuxBtn = el('openLoopTmux');
  if (openTmuxBtn) {
    openTmuxBtn.addEventListener('click', async () => {
      const loopId = (el('loopSelect') && el('loopSelect').value) || '';
      const row = LOOP_ROWS.find(x => x.loop_id === loopId);
      const session = (row && row.live_session) || '';
      const cmd = session ? `tmux attach -t ${session}` : 'tmux ls';
      try {
        await navigator.clipboard.writeText(cmd);
        el('loopActionStatus').textContent = `복사됨: ${cmd}`;
      } catch (_) {
        el('loopActionStatus').textContent = `직접 실행: ${cmd}`;
      }
    });
  }
  document.querySelectorAll('.loop-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      LOOP_FILTER = btn.getAttribute('data-loop-filter') || 'all';
      document.querySelectorAll('.loop-chip').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      renderLoopControls();
    });
  });
  const autoRefreshChk = el('loopAutoRefresh');
  if (autoRefreshChk) {
    autoRefreshChk.addEventListener('change', () => setLoopAutoRefresh(autoRefreshChk.checked));
    setLoopAutoRefresh(autoRefreshChk.checked);
  }
  const roadmapAutoChk = el('roadmapAutoCheckin');
  if (roadmapAutoChk) {
    roadmapAutoChk.checked = !!ROADMAP_AUTO_CHECKIN;
    roadmapAutoChk.addEventListener('change', () => setRoadmapAutoCheckin(roadmapAutoChk.checked));
    setRoadmapAutoCheckin(roadmapAutoChk.checked);
  } else {
    setRoadmapAutoCheckin(ROADMAP_AUTO_CHECKIN);
  }
  el('selectVisible').addEventListener('click', () => { CURRENT_ROWS.forEach(t => selected.add(t.id)); renderThreads(); });
  el('clearSel').addEventListener('click', () => { selected.clear(); renderThreads(); });
  el('copyIds').addEventListener('click', copySelection);
  const todayHigh = el('todaySelectHighRisk');
  if (todayHigh) todayHigh.addEventListener('click', () => runTodayQueueSelection('high-risk'));
  const todayCtx = el('todaySelectCtxHot');
  if (todayCtx) todayCtx.addEventListener('click', () => runTodayQueueSelection('ctx-hot'));
  const todayOrphans = el('todaySelectOrphans');
  if (todayOrphans) todayOrphans.addEventListener('click', () => runTodayQueueSelection('orphans'));
  const todayQueueDryRun = el('todayQueueDryRun');
  if (todayQueueDryRun) todayQueueDryRun.addEventListener('click', runTodayQueueDryRun);
  const todayClear = el('todayClearSelection');
  if (todayClear) todayClear.addEventListener('click', () => runTodayQueueSelection('clear'));
  const pinBtn = el('pinSelected');
  if (pinBtn) pinBtn.addEventListener('click', () => runThreadPin(true));
  const unpinBtn = el('unpinSelected');
  if (unpinBtn) unpinBtn.addEventListener('click', () => runThreadPin(false));
  const archiveBtn = el('archiveLocalSelected');
  if (archiveBtn) archiveBtn.addEventListener('click', runThreadArchiveLocal);
  const resumeBtn = el('copyResumeCmd');
  if (resumeBtn) resumeBtn.addEventListener('click', copyResumeCommands);
  el('downloadJson').addEventListener('click', downloadSelection);
  const snapshotBtn = el('downloadSnapshot');
  if (snapshotBtn) snapshotBtn.addEventListener('click', downloadSnapshot);
  el('analyzeDelete').addEventListener('click', runDeleteImpactAnalysis);
  el('renameThread').addEventListener('click', renameSelectedThread);
  el('dryRunCleanup').addEventListener('click', () => runCleanup(true));
  el('executeCleanup').addEventListener('click', () => runCleanup(false));
  const copyTokenBtn = el('copyCleanupToken');
  if (copyTokenBtn) copyTokenBtn.addEventListener('click', copyCleanupToken);
  const roadmapCheckinBtn = el('roadmapCheckin');
  if (roadmapCheckinBtn) roadmapCheckinBtn.addEventListener('click', runRoadmapCheckin);
  const roadmapRefreshBtn = el('roadmapRefresh');
  if (roadmapRefreshBtn) roadmapRefreshBtn.addEventListener('click', loadData);
  const alertEvalBtn = el('alertEvaluateNow');
  if (alertEvalBtn) alertEvalBtn.addEventListener('click', evaluateAlertHooksNow);
  const alertRefreshBtn = el('alertHooksRefresh');
  if (alertRefreshBtn) alertRefreshBtn.addEventListener('click', loadData);
  const alertDesktopChk = el('alertDesktopNotify');
  if (alertDesktopChk) {
    alertDesktopChk.addEventListener('change', () => updateAlertDesktopNotify(alertDesktopChk.checked));
  }
  const recoveryRefreshBtn = el('recoveryRefresh');
  if (recoveryRefreshBtn) recoveryRefreshBtn.addEventListener('click', loadData);
  const recoveryDrillBtn = el('recoveryRunDrill');
  if (recoveryDrillBtn) recoveryDrillBtn.addEventListener('click', runRecoveryDrill);
  el('pageSize').addEventListener('change', () => loadThreads(true));
  el('prevPage').addEventListener('click', () => { OFFSET = Math.max(0, OFFSET - LIMIT); loadThreads(false); });
  el('nextPage').addEventListener('click', () => { OFFSET = OFFSET + LIMIT; loadThreads(false); });
  ['onlyPinned','onlyNoProject','onlyNoLocal'].forEach(id => {
    el(id).addEventListener('change', () => loadThreads(true));
  });
  ['sourceFilter','scopeFilter','sortFilter','minRisk','minCtx'].forEach(id => {
    el(id).addEventListener('change', () => loadThreads(true));
  });
  el('presetUiOnly').addEventListener('click', () => {
    el('scopeFilter').value = 'ui';
    el('sourceFilter').value = 'global-state';
    el('sortFilter').value = 'order';
    el('minRisk').value = '0';
    el('minCtx').value = '0';
    el('onlyPinned').checked = false;
    el('onlyNoProject').checked = false;
    el('onlyNoLocal').checked = false;
    el('search').value = '';
    loadThreads(true);
  });
  el('presetInternalOnly').addEventListener('click', () => {
    el('scopeFilter').value = 'internal';
    el('sourceFilter').value = '';
    el('sortFilter').value = 'risk_desc';
    el('minRisk').value = '20';
    el('minCtx').value = '0';
    el('onlyPinned').checked = false;
    el('onlyNoProject').checked = false;
    el('onlyNoLocal').checked = false;
    el('search').value = '';
    loadThreads(true);
  });
  el('presetReset').addEventListener('click', () => {
    el('scopeFilter').value = 'all';
    el('sourceFilter').value = '';
    el('sortFilter').value = 'order';
    el('minRisk').value = '0';
    el('minCtx').value = '0';
    el('onlyPinned').checked = false;
    el('onlyNoProject').checked = false;
    el('onlyNoLocal').checked = false;
    el('search').value = '';
    loadThreads(true);
  });
  el('presetTerminalSessions').addEventListener('click', () => {
    el('scopeFilter').value = 'internal';
    el('sourceFilter').value = 'session-log';
    el('sortFilter').value = 'ctx_desc';
    el('minRisk').value = '0';
    el('minCtx').value = '30';
    el('onlyPinned').checked = false;
    el('onlyNoProject').checked = false;
    el('onlyNoLocal').checked = false;
    el('search').value = '';
    loadThreads(true);
  });
  el('presetLinkedOnly').addEventListener('click', () => {
    el('scopeFilter').value = 'gui_linked';
    el('sourceFilter').value = 'global-state';
    el('sortFilter').value = 'ctx_desc';
    el('minRisk').value = '0';
    el('minCtx').value = '30';
    el('onlyPinned').checked = false;
    el('onlyNoProject').checked = false;
    el('onlyNoLocal').checked = false;
    el('search').value = '';
    loadThreads(true);
  });
  el('presetGuiHidden').addEventListener('click', () => {
    el('scopeFilter').value = 'gui_hidden';
    el('sourceFilter').value = 'global-state';
    el('sortFilter').value = 'recent_desc';
    el('minRisk').value = '0';
    el('minCtx').value = '0';
    el('onlyPinned').checked = false;
    el('onlyNoProject').checked = false;
    el('onlyNoLocal').checked = false;
    el('search').value = '';
    loadThreads(true);
  });
  el('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadThreads(true), 200);
  });
  loadData();
});
</script>
</body>
</html>
'''


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = urlparse(self.path)
        q = parse_qs(p.query or "")
        if p.path == "/":
            self._send(200, "text/html; charset=utf-8", HTML.encode("utf-8"))
            return
        if p.path == "/favicon.ico":
            self._send(204, "image/x-icon", b"")
            return
        if p.path == "/api/overview":
            include_threads = (q.get("include_threads", ["0"])[0] == "1")
            force_refresh = (q.get("refresh", ["0"])[0] == "1")
            data = get_overview_cached(include_threads=include_threads, force_refresh=force_refresh)
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/threads":
            data = get_overview_cached(include_threads=True)
            threads = data.get("threads", [])
            try:
                offset = int(q.get("offset", ["0"])[0] or 0)
            except Exception:
                offset = 0
            try:
                limit = int(q.get("limit", ["50"])[0] or 50)
            except Exception:
                limit = 50
            limit = min(max(limit, 1), 500)
            query = q.get("q", [""])[0]
            source = q.get("source", [""])[0]
            scope = q.get("scope", ["all"])[0]
            sort_mode = q.get("sort", ["order"])[0]
            try:
                min_risk = int(q.get("minRisk", ["0"])[0] or 0)
            except Exception:
                min_risk = 0
            try:
                min_ctx = int(q.get("minCtx", ["0"])[0] or 0)
            except Exception:
                min_ctx = 0
            min_risk = min(max(min_risk, 0), 100)
            min_ctx = min(max(min_ctx, 0), 100)
            only_pinned = (q.get("onlyPinned", ["0"])[0] == "1")
            only_no_project = (q.get("onlyNoProject", ["0"])[0] == "1")
            only_no_local = (q.get("onlyNoLocal", ["0"])[0] == "1")
            filtered = filter_threads(
                threads,
                q=query,
                only_pinned=only_pinned,
                only_no_project=only_no_project,
                only_no_local=only_no_local,
                source=source,
                scope=scope,
                min_risk=min_risk,
                min_ctx=min_ctx,
                sort_mode=sort_mode,
            )
            total = len(filtered)
            start = min(max(offset, 0), total)
            end = min(start + limit, total)
            payload = {
                "total": total,
                "offset": start,
                "limit": limit,
                "rows": filtered[start:end],
            }
            self._send(200, "application/json; charset=utf-8", json.dumps(payload, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/unmapped-map":
            data = get_overview_cached(include_threads=True)
            rows = [
                {
                    "id": t["id"],
                    "title": t["title"],
                    "title_source": t["title_source"],
                    "cwd": t.get("cwd", ""),
                    "project_buckets": t.get("project_buckets", []),
                    "inferred_time": t.get("inferred_time", ""),
                }
                for t in data["threads"]
                if t["title_source"] in ("manual-map", "local-cache-inferred", "history-log", "session-log")
            ]
            self._send(200, "application/json; charset=utf-8", json.dumps({"count": len(rows), "rows": rows}, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/data-sources":
            data = get_data_source_inventory()
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/runtime-health":
            data = get_runtime_health()
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/compare-apps":
            data = get_compare_apps_status()
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/roadmap-status":
            data = get_roadmap_status()
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/alert-hooks":
            force_refresh = (q.get("refresh", ["0"])[0] == "1")
            data = evaluate_alert_hooks(force_refresh=force_refresh, emit_events=False)
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/recovery-center":
            data = get_recovery_center_data()
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/health-check":
            force_refresh = (q.get("refresh", ["0"])[0] == "1")
            data = get_health_check(force_refresh=force_refresh)
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/codex-observatory":
            force_refresh = (q.get("refresh", ["0"])[0] == "1")
            data = get_codex_observatory(force_refresh=force_refresh)
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        if p.path == "/api/agent-loops":
            data = get_agent_loops_status()
            self._send(200, "application/json; charset=utf-8", json.dumps(data, ensure_ascii=False).encode("utf-8"))
            return
        self._send(404, "text/plain; charset=utf-8", b"Not Found")

    def do_POST(self):
        p = urlparse(self.path)
        if p.path == "/api/agent-loops/action":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                loop_id = str(body.get("loop_id", "")).strip()
                action = str(body.get("action", "")).strip()
                if not loop_id:
                    raise ValueError("loop_id is required")
                if not action:
                    raise ValueError("action is required")
                data = run_agent_loop_action(loop_id, action)
                status = 200 if data.get("ok") else 400
                self._send(
                    status,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/thread-pin":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                ids = body.get("ids", [])
                if not isinstance(ids, list):
                    ids = []
                pinned = bool(body.get("pinned", True))
                data = set_thread_pinned(ids, pinned=pinned)
                status = 200 if data.get("ok") else 400
                self._send(
                    status,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/thread-archive-local":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                ids = body.get("ids", [])
                if not isinstance(ids, list):
                    ids = []
                data = archive_threads_local(ids)
                status = 200 if data.get("ok") else 400
                self._send(
                    status,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/thread-resume-command":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                ids = body.get("ids", [])
                if not isinstance(ids, list):
                    ids = []
                data = get_thread_resume_commands(ids)
                status = 200 if data.get("ok") else 400
                self._send(
                    status,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/analyze-delete":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                ids = body.get("ids", [])
                if not isinstance(ids, list):
                    ids = []
                ids = [str(x) for x in ids if str(x).strip()]
                data = analyze_delete_impact(ids)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/local-cleanup":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                ids = body.get("ids", [])
                if not isinstance(ids, list):
                    ids = []
                ids = [str(x) for x in ids if str(x).strip()]
                dry_run = bool(body.get("dry_run", True))
                options = body.get("options", {})
                if not isinstance(options, dict):
                    options = {}
                confirm_token = str(body.get("confirm_token", "") or "").strip()
                data = execute_local_cleanup(ids, options=options, dry_run=dry_run, confirm_token=confirm_token)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/roadmap-checkin":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                note = body.get("note", "")
                actor = body.get("actor", "codex")
                entry = append_roadmap_checkin(note=note, actor=actor)
                status = get_roadmap_status()
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": True, "entry": entry, "roadmap": status}, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/alert-hooks/evaluate":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                force_refresh = bool(body.get("force_refresh", True))
                data = evaluate_alert_hooks(force_refresh=force_refresh, emit_events=True)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": True, "data": data}, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/alert-hooks/config":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                cfg = update_alert_hooks_config(desktop_notify=body.get("desktop_notify"))
                data = evaluate_alert_hooks(force_refresh=False, emit_events=False)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": True, "config": cfg, "data": data}, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/alert-hooks/rule":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                result = update_alert_rule(
                    rule_id=body.get("rule_id"),
                    enabled=body.get("enabled"),
                    threshold=body.get("threshold"),
                    cooldown_min=body.get("cooldown_min"),
                )
                if not result.get("ok"):
                    self._send(
                        400,
                        "application/json; charset=utf-8",
                        json.dumps(result, ensure_ascii=False).encode("utf-8"),
                    )
                    return
                data = evaluate_alert_hooks(force_refresh=False, emit_events=False)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": True, "data": data}, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/recovery-drill":
            try:
                data = run_recovery_drill()
                status = 200 if data.get("ok") else 400
                center = get_recovery_center_data()
                center["drill"] = data.get("drill", {})
                self._send(
                    status,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": bool(data.get("ok")), "data": center, "drill": data.get("drill", {}), "error": data.get("error", "")}, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/recovery-checklist":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                item_id = body.get("item_id", "")
                done = bool(body.get("done", False))
                result = update_recovery_checklist_item(item_id, done)
                if not result.get("ok"):
                    self._send(
                        400,
                        "application/json; charset=utf-8",
                        json.dumps(result, ensure_ascii=False).encode("utf-8"),
                    )
                    return
                data = get_recovery_center_data()
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": True, "data": data}, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/rename-thread":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                tid = body.get("id", "")
                title = body.get("title", "")
                data = rename_thread_title(tid, title)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"ok": False, "error": str(e)}).encode("utf-8"),
                )
                return
        if p.path == "/api/thread-forensics":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length) if length > 0 else b"{}"
                body = json.loads(raw.decode("utf-8"))
                ids = body.get("ids")
                if ids is None:
                    ids = body.get("thread_ids", [])
                if not isinstance(ids, list):
                    ids = []
                data = get_thread_forensics(ids)
                self._send(
                    200,
                    "application/json; charset=utf-8",
                    json.dumps(data, ensure_ascii=False).encode("utf-8"),
                )
                return
            except Exception as e:
                self._send(
                    400,
                    "application/json; charset=utf-8",
                    json.dumps({"error": str(e)}).encode("utf-8"),
                )
                return
        self._send(404, "text/plain; charset=utf-8", b"Not Found")

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8787"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Codex overview server running at http://127.0.0.1:{port}")
    server.serve_forever()
