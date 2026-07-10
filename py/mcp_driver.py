from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import re
from urllib.parse import urlparse

try:
    from smssutil import mcp_execution
except Exception:
    def mcp_execution(_mode: str):
        def wrapper(fn):
            return fn
        return wrapper


def _runtime_path(name: str) -> Path | None:
    value = globals().get(name)
    if not value:
        return None
    try:
        return Path(str(value)).expanduser().resolve()
    except Exception:
        return None


def _safe_load_json(path: Path) -> dict[str, Any] | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _flatten_steps(recording: dict[str, Any] | None) -> list[dict[str, Any]]:
    steps = (recording or {}).get("steps", {})
    if not isinstance(steps, dict):
        return []

    flattened: list[dict[str, Any]] = []
    for tab_steps in steps.values():
        if not isinstance(tab_steps, list):
            continue
        for item in tab_steps:
            if isinstance(item, list):
                flattened.extend(step for step in item if isinstance(step, dict))
            elif isinstance(item, dict):
                flattened.append(item)
    return flattened


def _normalize_search(value: str) -> str:
    text = str(value or "").lower()
    text = re.sub(r"^https?://", "", text)
    text = re.sub(r"^www\\.", "", text)
    text = re.sub(r"\\.json$", "", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def _tokens(value: str) -> list[str]:
    text = str(value or "").lower()
    text = re.sub(r"^https?://", "", text)
    text = re.sub(r"^www\\.", "", text)
    text = re.sub(r"\\.json$", "", text)
    ignored = {
        "com",
        "net",
        "org",
        "edu",
        "gov",
        "www",
        "http",
        "https",
        "html",
        "json",
    }
    seen: set[str] = set()
    output: list[str] = []
    for token in re.split(r"[^a-z0-9]+", text):
        if len(token) >= 3 and token not in ignored and token not in seen:
            output.append(token)
            seen.add(token)
    return output


def _recording_search_text(file_name: str, recording: dict[str, Any] | None) -> str:
    parts = [file_name]
    meta = (recording or {}).get("meta", {})
    if isinstance(meta, dict):
        for key in ["title", "description", "intent", "id"]:
            value = meta.get(key)
            if isinstance(value, str):
                parts.append(value)

    for step in _flatten_steps(recording):
        for key in ["url", "text", "label", "description", "prompt", "selector", "role"]:
            value = step.get(key)
            if isinstance(value, str):
                parts.append(value)

    return " ".join(parts).lower()


def _first_recording_url(recording: dict[str, Any] | None) -> str:
    for step in _flatten_steps(recording):
        value = step.get("url")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _summarize_loaded_recording(
    recording: dict[str, Any] | None,
    file_name: str = "",
) -> dict[str, Any]:
    steps = _flatten_steps(recording)
    urls = [
        step.get("url").strip()
        for step in steps
        if isinstance(step.get("url"), str) and step.get("url").strip()
    ]
    typed_values = [
        step.get("text").strip()
        for step in steps
        if str(step.get("type", "")).upper() == "TYPE"
        and isinstance(step.get("text"), str)
        and step.get("text").strip()
    ]
    hosts: list[str] = []
    for url in urls:
        host = urlparse(url).hostname or ""
        host = re.sub(r"^www\\.", "", host)
        if host and host not in hosts:
            hosts.append(host)

    return {
        "fileName": file_name,
        "stepCount": len(steps),
        "firstUrl": urls[0] if urls else "",
        "hosts": hosts[:10],
        "typedTextPreview": " ".join(typed_values)[:240],
        "title": str((recording or {}).get("meta", {}).get("title", "")).strip()
        if isinstance((recording or {}).get("meta"), dict)
        else "",
        "description": str((recording or {}).get("meta", {}).get("description", "")).strip()
        if isinstance((recording or {}).get("meta"), dict)
        else "",
        "intent": str((recording or {}).get("meta", {}).get("intent", "")).strip()
        if isinstance((recording or {}).get("meta"), dict)
        else "",
    }


def _score_loaded_recording(
    file_name: str,
    recording: dict[str, Any] | None,
    recording_name_hint: str = "",
    recording_file: str = "",
) -> dict[str, Any]:
    search_text = _recording_search_text(file_name, recording)
    normalized_search = _normalize_search(search_text)
    normalized_file = _normalize_search(recording_file)
    normalized_hint = _normalize_search(recording_name_hint)
    score = 0
    reasons: list[str] = []

    if recording_file:
        if file_name.lower() == recording_file.lower():
            score += 100
            reasons.append("exact filename")
        elif normalized_file and normalized_file in normalized_search:
            score += 70
            reasons.append("filename/content contains requested file")

    if normalized_hint and normalized_hint in normalized_search:
        score += 60
        reasons.append("contains normalized hint")

    for token in _tokens(recording_name_hint):
        if token in search_text or token in normalized_search:
            score += 15
            reasons.append(f"matches {token}")

    first_url = _first_recording_url(recording)
    if first_url:
        host = urlparse(first_url).hostname or ""
        host = re.sub(r"^www\\.", "", host)
        for token in _tokens(recording_name_hint):
            if token in host:
                score += 30
                reasons.append(f"host {host}")

    return {"score": score, "reason": ", ".join(reasons[:4]) or "no match"}


def _current_project_dir() -> Path | None:
    app_root = _runtime_path("APP_ROOT")
    if not app_root:
        return None
    if len(app_root.parents) >= 3:
        return app_root.parents[2]
    return None


def _project_id_from_folder(folder: Path) -> str:
    name = folder.name
    return name.rsplit("__", 1)[1] if "__" in name else name


def _iter_project_recordings(project_id: str = "") -> list[dict[str, Any]]:
    project_dir = _current_project_dir()
    if not project_dir:
        return []

    current_project_id = _project_id_from_folder(project_dir)
    if project_id and project_id != current_project_id:
        return []

    recordings: list[dict[str, Any]] = []
    recording_dir = project_dir / "app_root" / "version" / "assets" / "recordings"
    if not recording_dir.is_dir():
        return recordings

    for path in sorted(recording_dir.glob("*.json")):
        recording = _safe_load_json(path)
        if not recording:
            continue
        recordings.append(
            {
                "source": "project",
                "projectId": current_project_id,
                "fileName": path.name,
                "absolutePath": str(path),
                "recording": recording,
            }
        )
    return recordings


def _iter_room_recordings() -> list[dict[str, Any]]:
    root = _runtime_path("ROOT")
    if not root:
        return []
    room_dir = root / "playwright"
    if not room_dir.is_dir():
        return []

    recordings: list[dict[str, Any]] = []
    for path in sorted(room_dir.glob("*.json")):
        recording = _safe_load_json(path)
        if not recording:
            continue
        recordings.append(
            {
                "source": "room",
                "fileName": path.name,
                "roomPath": f"/playwright/{path.name}",
                "absolutePath": str(path),
                "recording": recording,
            }
        )
    return recordings


@mcp_execution("ask")
def open_playwright_sockets(start_url: str, recording_name_hint: str = "") -> dict[str, Any]:
    """Open the Playwright Sockets remote browser app and record a browser task."""
    normalized_url = str(start_url or "").strip()
    if not normalized_url:
        raise ValueError("start_url is required. Ask the user for a URL before calling this tool.")

    return {
        "status": "ui_required",
        "start_url": normalized_url,
        "recording_name_hint": str(recording_name_hint or "").strip(),
        "instructions": (
            "The Playwright Sockets UI will open, start recording, and save the "
            "recording to the current Playground room when returned."
        ),
    }


@mcp_execution("ask")
def play_playwright_sockets_recording(
    recording_name_hint: str,
    recording_file: str = "",
    project_id: str = "",
    start_url: str = "",
) -> dict[str, Any]:
    """Open Playwright Sockets and play an existing browser recording."""
    normalized_hint = str(recording_name_hint or "").strip()
    normalized_file = str(recording_file or "").strip()
    if not normalized_hint and not normalized_file:
        raise ValueError(
            "recording_name_hint or recording_file is required. Ask the user which recording to play."
        )

    return {
        "status": "ui_required",
        "mode": "play_recording",
        "recording_name_hint": normalized_hint,
        "recording_file": normalized_file,
        "project_id": str(project_id or "").strip(),
        "start_url": str(start_url or "").strip(),
        "instructions": (
            "The Playwright Sockets UI will open, load the matching recording, "
            "and replay it in the remote browser."
        ),
    }


@mcp_execution("disabled")
def list_playwright_recordings(
    recording_name_hint: str = "",
    recording_file: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    """List Playwright recordings available to this app and the current room."""
    recordings = _iter_project_recordings(str(project_id or "").strip())
    recordings.extend(_iter_room_recordings())

    output: list[dict[str, Any]] = []
    for item in recordings:
        scoring = _score_loaded_recording(
            item["fileName"],
            item["recording"],
            str(recording_name_hint or "").strip(),
            str(recording_file or "").strip(),
        )
        summary = _summarize_loaded_recording(item["recording"], item["fileName"])
        output.append(
            {
                "source": item["source"],
                "projectId": item.get("projectId", ""),
                "fileName": item["fileName"],
                "roomPath": item.get("roomPath", ""),
                "score": scoring["score"],
                "reason": scoring["reason"],
                "summary": summary,
            }
        )

    output.sort(key=lambda row: row.get("score", 0), reverse=True)
    return {"count": len(output), "recordings": output}


@mcp_execution("disabled")
def resolve_playwright_recording(
    recording_name_hint: str,
    recording_file: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    """Resolve the best Playwright recording match for a natural-language hint."""
    hint = str(recording_name_hint or "").strip()
    file_name = str(recording_file or "").strip()
    if not hint and not file_name:
        raise ValueError("recording_name_hint or recording_file is required")

    recordings = _iter_project_recordings(str(project_id or "").strip())
    recordings.extend(_iter_room_recordings())

    candidates: list[dict[str, Any]] = []
    for item in recordings:
        scoring = _score_loaded_recording(item["fileName"], item["recording"], hint, file_name)
        if scoring["score"] <= 0:
            continue
        candidate = {
            "source": item["source"],
            "projectId": item.get("projectId", ""),
            "fileName": item["fileName"],
            "roomPath": item.get("roomPath", ""),
            "score": scoring["score"] + (5 if item["source"] == "project" else 0),
            "reason": scoring["reason"],
            "startUrl": _first_recording_url(item["recording"]),
            "summary": _summarize_loaded_recording(item["recording"], item["fileName"]),
        }
        candidates.append(candidate)

    candidates.sort(key=lambda row: row["score"], reverse=True)
    return {
        "selected": candidates[0] if candidates else None,
        "candidates": candidates[:20],
        "searchedProjectRecordings": len([item for item in recordings if item["source"] == "project"]),
        "searchedRoomRecordings": len([item for item in recordings if item["source"] == "room"]),
    }


@mcp_execution("disabled")
def score_recording_candidate(
    recording_name_hint: str,
    recording_file: str = "",
    file_name: str = "",
    recording_json: str = "",
) -> dict[str, Any]:
    """Score a single recording candidate against a hint and optional file name."""
    recording = json.loads(recording_json) if recording_json else None
    if recording is not None and not isinstance(recording, dict):
        raise ValueError("recording_json must decode to a JSON object")
    return _score_loaded_recording(
        str(file_name or recording_file or "").strip(),
        recording,
        str(recording_name_hint or "").strip(),
        str(recording_file or "").strip(),
    )


@mcp_execution("disabled")
def summarize_recording(
    recording_json: str = "",
    recording_path: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    """Summarize a recording from JSON content or a known recording path."""
    recording: dict[str, Any] | None = None
    file_name = ""
    if recording_json:
        parsed = json.loads(recording_json)
        if not isinstance(parsed, dict):
            raise ValueError("recording_json must decode to a JSON object")
        recording = parsed
    elif recording_path:
        path = Path(str(recording_path))
        if not path.is_absolute():
            if str(recording_path).startswith("/playwright/"):
                root = _runtime_path("ROOT")
                path = (root / str(recording_path).lstrip("/")) if root else path
            else:
                app_root = _runtime_path("APP_ROOT")
                path = (app_root / str(recording_path)) if app_root else path
        file_name = path.name
        recording = _safe_load_json(path)
    elif project_id:
        recordings = _iter_project_recordings(str(project_id).strip())
        recording = recordings[0]["recording"] if recordings else None
        file_name = recordings[0]["fileName"] if recordings else ""

    if not recording:
        raise ValueError("No recording could be loaded")
    return _summarize_loaded_recording(recording, file_name)


@mcp_execution("disabled")
def get_recording_start_url(
    recording_json: str = "",
    recording_path: str = "",
    project_id: str = "",
) -> dict[str, Any]:
    """Return the first navigation URL from a recording."""
    summary = summarize_recording(recording_json, recording_path, project_id)
    return {"startUrl": summary.get("firstUrl", "")}
