"""Open the LIVE portal in headless Edge at desktop and phone size and report console errors / broken pages.

    python sites/jyfk-lol/scripts/check_live.py                      -> checks https://sansu668.github.io/jyfk-lol/
    python sites/jyfk-lol/scripts/check_live.py https://jyfk.lol/    -> checks another address

Pages checked: home, every category that has games, every game page, search, about, privacy, terms,
contact and a missing page (404). Screenshots go to _publish/live/. Exit code 0 = no problems.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import siteqa  # noqa: E402
from publish import http_get  # noqa: E402


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "https://sansu668.github.io/jyfk-lol/").rstrip("/") + "/"
    st, body = http_get(f"{base}games.json?v={int(time.time())}")
    games = json.loads(body.decode("utf-8")) if st == 200 else []
    cats = sorted({g["category"] for g in games})
    paths = ["/", *[f"/category/{c}/" for c in cats], *[f"/games/{g['slug']}/" for g in games],
             "/search/?q=star", "/about/", "/privacy/", "/terms/", "/contact/", "/this-page-does-not-exist/"]
    shots = os.path.join(siteqa.SITE, "_publish", "live")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = siteqa.launch(p, local=False)
        try:
            bad = siteqa.check_pages(browser, base, paths, shots, full={"/", *(f"/games/{g['slug']}/" for g in games[:1])},
                                     local=False, expect_404={"/this-page-does-not-exist/"})
        finally:
            browser.close()
    print(f"live site {base}: {len(games)} games, {len(paths)} pages x 2 screen sizes")
    for path, probs in bad.items():
        print(f"  {path}: " + " | ".join(probs[:4]))
    print("result: " + ("OK, no problems" if not bad else f"{len(bad)} page(s) with problems"))
    print(f"screenshots: {shots}")
    sys.exit(0 if not bad else 1)


if __name__ == "__main__":
    main()
