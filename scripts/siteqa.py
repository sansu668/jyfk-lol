"""Shared helpers for publish.py / check.py: local server, headless Edge, game and page smoke tests.

Needs Python 3.10+ with playwright (and optionally Pillow for blank-screen detection).
"""
from __future__ import annotations

import functools
import http.server
import importlib.util
import os
import re
import sys
import threading
from urllib.parse import urlparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HQ = os.path.dirname(os.path.dirname(SITE))          # F:\JY
DONE_DIR = os.path.join(HQ, "plan", "done")
GAMES_DIR = os.path.join(SITE, "games")
AD_HOSTS = ("googlesyndication.com", "doubleclick.net", "googleadservices.com", "google.com", "gstatic.com",
            "adtrafficquality.google", "googletagservices.com", "fundingchoicesmessages.google.com")


def load_build():
    spec = importlib.util.spec_from_file_location("jy_build", os.path.join(SITE, "site", "build.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------------ local server (random free port)
class _Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
        ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
        ".html": "text/html", ".txt": "text/plain", ".wasm": "application/wasm", ".xml": "application/xml",
        ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
    }

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(folder):
    """Serve folder on 127.0.0.1 with a port chosen by the OS. Returns (server, base_url)."""
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Handler, directory=folder))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/"


def launch(p, local=True):
    args = ["--autoplay-policy=no-user-gesture-required", "--mute-audio",
            "--disable-background-timer-throttling", "--disable-renderer-backgrounding"]
    if local:
        args.append("--no-proxy-server")
    errs = []
    for kw in ({"channel": "msedge"}, {"channel": "chrome"}, {}):
        try:
            return p.chromium.launch(headless=True, args=args, **kw)
        except Exception as ex:  # noqa: BLE001
            errs.append(f"{kw or 'bundled'}: {str(ex).splitlines()[0]}")
    raise RuntimeError("no browser could be started: " + " | ".join(errs))


VIEWPORTS = (("desktop", {"width": 1280, "height": 800}, False), ("mobile", {"width": 390, "height": 844}, True))


def new_page(browser, mobile, vp):
    ctx = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    return ctx, ctx.new_page()


def _is_local(url, hosts):
    if url.startswith(("data:", "blob:", "about:", "chrome-extension:")):
        return True
    return (urlparse(url).hostname or "") in hosts


def _is_ad(url_or_text):
    return any(h in (url_or_text or "") for h in AD_HOSTS)


def _blank(path):
    try:
        from PIL import Image, ImageStat
        with Image.open(path) as im:
            return ImageStat.Stat(im.convert("L").resize((96, 96))).stddev[0] < 3
    except Exception:
        return False


def watch(page, local_hosts):
    log = {"errors": [], "external": [], "bad": []}

    def on_console(m):
        if m.type != "error":
            return
        loc = m.location if isinstance(getattr(m, "location", None), dict) else {}
        if not _is_ad(m.text) and not _is_ad(loc.get("url", "")):
            log["errors"].append(m.text[:300])

    page.on("console", on_console)
    page.on("pageerror", lambda ex: log["errors"].append(("uncaught: " + str(ex))[:300]))
    page.on("request", lambda r: log["external"].append(r.url[:200]) if local_hosts and not _is_local(r.url, local_hosts) else None)
    page.on("requestfailed", lambda r: None if _is_ad(r.url) or r.url.endswith("favicon.ico") else log["bad"].append(f"failed {r.url[:200]}"))
    page.on("response", lambda r: log["bad"].append(f"HTTP {r.status} {r.url[:200]}")
            if r.status >= 400 and not _is_ad(r.url) and not r.url.endswith("favicon.ico") else None)
    return log


def smoke_game(browser, url, shot_prefix):
    """Open a game page standalone on desktop and phone, poke it, and report problems (empty list = OK)."""
    problems = []
    for tag, vp, mobile in VIEWPORTS:
        ctx, page = new_page(browser, mobile, vp)
        log = watch(page, {"127.0.0.1", "localhost"})
        try:
            page.goto(url, wait_until="load", timeout=30000)
            page.wait_for_timeout(1500)
            cx, cy = vp["width"] // 2, int(vp["height"] * 0.55)
            if mobile:
                page.touchscreen.tap(cx, cy)
                page.wait_for_timeout(500)
                page.touchscreen.tap(cx, int(vp["height"] * 0.75))
            else:
                page.mouse.click(cx, cy)
                page.wait_for_timeout(300)
                page.keyboard.press("Space")
                page.keyboard.press("ArrowLeft")
                page.keyboard.press("ArrowRight")
            page.wait_for_timeout(1500)
            shot = f"{shot_prefix}-{tag}.png"
            os.makedirs(os.path.dirname(shot), exist_ok=True)
            page.screenshot(path=shot)
            if _blank(shot):
                problems.append(f"[{tag}] the screen stays blank")
            w = page.evaluate("document.documentElement.scrollWidth")
            if w > vp["width"] + 2:
                problems.append(f"[{tag}] page is wider than the screen ({w}px)")
        except Exception as ex:  # noqa: BLE001
            problems.append(f"[{tag}] could not open: {str(ex).splitlines()[0][:200]}")
        problems += [f"[{tag}] console error: {x}" for x in log["errors"][:5]]
        problems += [f"[{tag}] loads from the internet (not allowed): {x}" for x in sorted(set(log["external"]))[:5]]
        problems += [f"[{tag}] {x}" for x in log["bad"][:5]]
        ctx.close()
    return problems


def check_pages(browser, base, paths, shots_dir=None, full=(), local=True, expect_404=()):
    """Open portal pages on desktop and phone. Returns {path: [problems]} for pages with problems."""
    host = urlparse(base).hostname
    out = {}
    for tag, vp, mobile in VIEWPORTS:
        ctx, page = new_page(browser, mobile, vp)
        for path in paths:
            log = watch(page, {host} if local else None)
            probs = []
            try:
                resp = page.goto(base + path.lstrip("/"), wait_until="load", timeout=45000)
                status = resp.status if resp else 0
                if path in expect_404:
                    if status not in (200, 404):
                        probs.append(f"HTTP {status}")
                    log["bad"] = [b for b in log["bad"] if "404" not in b]
                    log["errors"] = [x for x in log["errors"] if "404" not in x]
                elif status != 200:
                    probs.append(f"HTTP {status}")
                page.wait_for_timeout(900 if local else 1500)
                if path.startswith("/games/"):
                    ok = page.evaluate("""() => { const f = document.getElementById('gameframe');
                        try { return !!(f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.childElementCount); }
                        catch (e) { return false; } }""")
                    if not ok:
                        probs.append("embedded game did not load")
                w = page.evaluate("document.documentElement.scrollWidth")
                if w > vp["width"] + 2:
                    probs.append(f"page is wider than the screen ({w}px)")
                if shots_dir:
                    name = re.sub(r"[^a-z0-9]+", "_", path.strip("/").lower()) or "home"
                    os.makedirs(shots_dir, exist_ok=True)
                    page.screenshot(path=os.path.join(shots_dir, f"{name}-{tag}.png"), full_page=path in full)
            except Exception as ex:  # noqa: BLE001
                probs.append(f"could not open: {str(ex).splitlines()[0][:200]}")
            probs += [f"console error: {x}" for x in log["errors"][:5]]
            if local:
                probs += [f"loads from the internet: {x}" for x in sorted(set(log["external"]))[:5]]
            probs += log["bad"][:5]
            if probs:
                out.setdefault(path, []).extend(f"[{tag}] {p}" for p in probs)
            # fresh page per path so listeners never pile up
            page.close()
            page = ctx.new_page()
        ctx.close()
    return out


# ------------------------------------------------------------------ which games are finished
def _norm_plan(s):
    m = re.match(r"^\s*([A-Za-z]+)\s*0*(\d+)\s*$", str(s or ""))
    return f"{m.group(1).upper()}{int(m.group(2)):02d}" if m else str(s or "").strip().upper()


def finished_games(games_dir=GAMES_DIR, done_dir=DONE_DIR, always=("comet-catcher",)):
    """Decide which game folders may go online.

    A game qualifies when its own task report plan/done/<plan>.md exists and mentions the slug
    (plan comes from game.json). If game.json names no report that exists, any G*.md report that
    mentions the slug counts. The sample game comet-catcher is always allowed.
    Returns (allowed: {slug: reason}, waiting: {slug: reason}).
    """
    reports = {}
    if os.path.isdir(done_dir):
        for f in os.listdir(done_dir):
            if f.lower().endswith(".md") and not f.startswith("_"):
                try:
                    reports[_norm_plan(f[:-3])] = open(os.path.join(done_dir, f), encoding="utf-8", errors="replace").read().lower()
                except Exception:
                    pass
    allowed, waiting = {}, {}
    if not os.path.isdir(games_dir):
        return allowed, waiting
    for slug in sorted(os.listdir(games_dir)):
        d = os.path.join(games_dir, slug)
        if not os.path.isdir(d) or slug.startswith((".", "_")):
            continue
        if slug in always:
            allowed[slug] = "sample game (always published)"
            continue
        pat = re.compile(r"(?<![a-z0-9-])" + re.escape(slug) + r"(?![a-z0-9-])")
        plan = ""
        try:
            import json
            plan = _norm_plan(json.load(open(os.path.join(d, "game.json"), encoding="utf-8-sig")).get("plan"))
        except Exception:
            pass
        if plan and plan in reports:
            if pat.search(reports[plan]):
                allowed[slug] = f"done/{plan}.md"
            else:
                waiting[slug] = f"done/{plan}.md exists but does not mention '{slug}'"
            continue
        hits = [k for k, txt in reports.items() if k.startswith("G") and pat.search(txt)]
        if hits:
            allowed[slug] = f"done/{hits[0]}.md"
        else:
            waiting[slug] = f"no finished report yet (game.json plan = {plan or '?'})"
    return allowed, waiting
