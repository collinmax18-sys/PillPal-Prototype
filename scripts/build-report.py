"""Render docs/report/P4-Report.html to PDF with headless Chrome/Edge.

usage: python scripts/build-report.py <repo-url> <out.pdf> [member name ...]
With no member names the cover says "see D2L submission" (used for the public repo copy).
"""
import html
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "report" / "P4-Report.html"
BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]


def main() -> None:
    repo_url, out = sys.argv[1], Path(sys.argv[2]).resolve()
    members = sys.argv[3:]
    team = "".join(f"<p>{html.escape(m)}</p>" for m in members) or "<p>(member names on the D2L submission)</p>"
    page = SRC.read_text(encoding="utf-8").replace("{{TEAM}}", team).replace("{{REPO_URL}}", html.escape(repo_url))
    # write next to the source so relative screenshot paths resolve
    fd, tmp = tempfile.mkstemp(suffix=".html", dir=SRC.parent)
    os.close(fd)
    Path(tmp).write_text(page, encoding="utf-8")
    try:
        browser = next(b for b in BROWSERS if b and Path(b).exists())
        subprocess.run(
            [browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files",
             f"--print-to-pdf={out}", Path(tmp).as_uri()],
            check=True, capture_output=True, timeout=120,
        )
    finally:
        os.remove(tmp)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
