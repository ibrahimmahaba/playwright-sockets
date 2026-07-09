from typing import Any

try:
    from smssutil import mcp_execution
except Exception:
    def mcp_execution(_mode: str):
        def wrapper(fn):
            return fn
        return wrapper


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
