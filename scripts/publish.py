"""One-command publisher for the jyfk.lol games portal (repeatable, safe to run any time).

    python sites/jyfk-lol/scripts/publish.py             check -> build -> commit -> push -> wait for deploy -> verify live -> domain
    python sites/jyfk-lol/scripts/publish.py --dry-run   only check and build locally (no git, no push)
    python sites/jyfk-lol/scripts/publish.py --no-wait   push but do not wait for GitHub Actions

What it does, in order:
  1. Picks the games that are finished: a game folder goes online only when plan/done/ has its task
     report (the report must mention the slug). comet-catcher (the sample) is always included.
     Unfinished games are never staged, committed or pushed.
  2. Checks every finished game: metadata, then opens it in headless Edge at desktop and phone size,
     clicks/taps/keys, and fails it on console errors, internet requests, broken files or a blank screen.
     A failing game is left out of this release (the reason is printed); the rest still ship.
  3. Builds the portal with exactly those games and opens every page (home, categories, each game page,
     search, about, privacy, terms, contact, 404) at both sizes. Any portal error stops the release.
  4. Commits only site code + the passing games, pushes to github.com/sansu668/jyfk-lol
     (creates the public repo and turns on GitHub Pages with Actions the first time).
  5. Waits for the Actions deploy, then downloads the live games.json and pages to confirm the new games
     are online.
  6. Checks DNS of the custom domain. If it already points to GitHub Pages, binds it and turns on HTTPS.
  7. Writes a summary to _publish/report.md (screenshots in _publish/shots/).
Exit code 0 = published (or dry run passed), 1 = something blocked the release.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import siteqa  # noqa: E402
from siteqa import SITE  # noqa: E402

OWNER = "sansu668"
REPO = "jyfk-lol"
FULL = f"{OWNER}/{REPO}"
GH_PAGES_URL = f"https://{OWNER}.github.io/{REPO}/"
GITHUB_IPS = {"185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"}
SITE_PATHS = [".github", "site", "kit", "scripts", "site.json", "README.md", ".gitignore", "publish.cmd"]
PROXY = "http://127.0.0.1:18080"
OUT = os.path.join(SITE, "_publish")
LINES = []


def say(msg=""):
    print(msg, flush=True)
    LINES.append(msg)


def run(cmd, check=True, input_text=None, timeout=300):
    r = subprocess.run(cmd, cwd=SITE, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       input=input_text, stdin=None if input_text is not None else subprocess.DEVNULL, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{(r.stdout + r.stderr).strip()[:1500]}")
    return r


def git(*args, check=True, timeout=300):
    ident = ["-c", f"user.name={OWNER}", "-c", f"user.email=233425916+{OWNER}@users.noreply.github.com",
             "-c", "core.autocrlf=false", "-c", "core.quotepath=false"]
    return run(["git", *ident, *args], check=check, timeout=timeout)


def git_net(*args):
    """git command that talks to GitHub: uses the gh login for credentials, retries through the local proxy."""
    cred = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
    last = None
    for extra in ([], ["-c", f"http.proxy={PROXY}"]):
        r = git(*cred, *extra, *args, check=False, timeout=600)
        if r.returncode == 0:
            return r
        last = r
        time.sleep(3)
    raise RuntimeError(f"git {' '.join(args)} failed:\n{(last.stdout + last.stderr).strip()[:1500]}")


def gh_api(method, path, body=None, check=True):
    cmd = ["gh", "api", "-X", method, path, "-H", "Accept: application/vnd.github+json"]
    if body is not None:
        cmd += ["--input", "-"]
    for attempt in range(3):
        r = run(cmd, check=False, input_text=json.dumps(body) if body is not None else None, timeout=120)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout) if r.stdout.strip() else {}
            except json.JSONDecodeError:
                return {}
        err = (r.stdout + r.stderr)
        if "HTTP 404" in err or "Not Found" in err:
            if check:
                raise LookupError(err.strip()[:500])
            return None
        if attempt == 2:
            if check:
                raise RuntimeError(f"gh api {method} {path}: {err.strip()[:500]}")
            return None
        time.sleep(4)


def http_get(url, timeout=25):
    last = None
    for proxy in (None, PROXY):
        try:
            handler = urllib.request.ProxyHandler({} if proxy is None else {"http": proxy, "https": proxy})
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 jyfk-publish", "Cache-Control": "no-cache"})
            with urllib.request.build_opener(handler).open(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as ex:
            return ex.code, b""
        except Exception as ex:  # noqa: BLE001
            last = ex
    raise RuntimeError(f"cannot reach {url}: {last}")


# ------------------------------------------------------------------------------------------ steps
def select_and_check(args):
    build = siteqa.load_build()
    allowed, waiting = siteqa.finished_games(args.games_dir, args.done_dir)
    say("## 1. Which games are finished")
    for slug, why in allowed.items():
        say(f"- {slug}: finished ({why})")
    for slug, why in waiting.items():
        say(f"- {slug}: NOT published, {why}")

    say("\n## 2. Game checks (metadata + desktop/phone smoke test)")
    passed, failed = [], {}
    meta_ok = []
    for slug in allowed:
        meta, errs, warns = build.validate_game(slug, os.path.join(args.games_dir, slug))
        if meta is None:
            failed[slug] = "metadata: " + "; ".join(errs)
        else:
            meta_ok.append(slug)
            if warns:
                say(f"- {slug}: metadata warnings: " + "; ".join(warns))
    if meta_ok:
        from playwright.sync_api import sync_playwright
        httpd, base = siteqa.serve(args.games_dir)
        try:
            with sync_playwright() as p:
                browser = siteqa.launch(p, local=True)
                try:
                    for slug in meta_ok:
                        probs = siteqa.smoke_game(browser, f"{base}{slug}/index.html", os.path.join(OUT, "shots", "games", slug))
                        if probs:
                            failed[slug] = " | ".join(probs[:6])
                        else:
                            passed.append(slug)
                finally:
                    browser.close()
        finally:
            httpd.shutdown()
            httpd.server_close()
    for slug in passed:
        say(f"- {slug}: OK")
    for slug, why in failed.items():
        say(f"- {slug}: FAILED, left out of this release -> {why}")
    return passed, failed, waiting


def build_and_check_portal(args, passed):
    say("\n## 3. Portal build + page checks")
    out = os.path.join(SITE, "_site")
    r = run([sys.executable, os.path.join(SITE, "site", "build.py"), "--out", out, "--allow", ",".join(passed),
             "--games-dir", args.games_dir], check=False)
    for line in (r.stdout + r.stderr).strip().splitlines():
        say("    " + line)
    if r.returncode != 0:
        raise RuntimeError("portal build failed")
    built = [g["slug"] for g in json.load(open(os.path.join(out, "games.json"), encoding="utf-8"))]
    missing = [s for s in passed if s not in built]
    if missing:
        raise RuntimeError(f"build skipped games that passed the checks: {missing}")
    cats = sorted({g["category"] for g in json.load(open(os.path.join(out, "games.json"), encoding="utf-8"))})
    paths = ["/", *[f"/category/{c}/" for c in cats], *[f"/games/{s}/" for s in built],
             "/search/?q=a", "/about/", "/privacy/", "/terms/", "/contact/", "/404.html"]
    from playwright.sync_api import sync_playwright
    httpd, base = siteqa.serve(out)
    try:
        with sync_playwright() as p:
            browser = siteqa.launch(p, local=True)
            try:
                bad = siteqa.check_pages(browser, base, paths, os.path.join(OUT, "shots", "portal"),
                                         full={"/", f"/games/{built[0]}/"} if built else {"/"})
            finally:
                browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()
    if bad:
        for path, probs in bad.items():
            say(f"- {path}: " + " | ".join(probs[:4]))
        raise RuntimeError("portal pages have errors (see above); nothing was pushed")
    say(f"- {len(paths)} pages x 2 screen sizes: no errors")
    return built


def commit(passed):
    say("\n## 4. Commit")
    if not os.path.isdir(os.path.join(SITE, ".git")):
        git("init", "-b", "main")
    has_head = git("rev-parse", "--verify", "-q", "HEAD", check=False).returncode == 0
    before = set(git("ls-tree", "-r", "--name-only", "HEAD", "--", "games").stdout.split()) if has_head else set()
    existing = [p for p in SITE_PATHS if os.path.exists(os.path.join(SITE, p))]
    git("add", "-A", "--", *existing)
    for slug in passed:
        git("add", "-A", "--", f"games/{slug}")
    staged = git("diff", "--cached", "--name-only").stdout.split()
    stray = sorted({p.split("/")[1] for p in staged if p.startswith("games/") and p.count("/") >= 2} - set(passed))
    for slug in stray:  # never let an unfinished/failed game slip in
        git("reset", "-q", "--", f"games/{slug}")
    tracked = set(git("ls-files", "games").stdout.split())
    online_games = sorted({p.split("/")[1] for p in tracked if p.count("/") >= 2} | set(passed))
    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        say("- nothing new to commit")
        return False, online_games
    new = [s for s in passed if not any(p.startswith(f"games/{s}/") for p in before)]
    msg = f"publish: {len(online_games)} games" + (f" (new: {', '.join(new)})" if new else "")
    git("commit", "-q", "-m", msg)
    say(f"- committed: {msg}")
    return True, online_games


def push_and_pages():
    say("\n## 5. Push + GitHub Pages")
    if gh_api("GET", f"repos/{FULL}", check=False) is None:
        say(f"- creating public repo {FULL}")
        run(["gh", "repo", "create", FULL, "--public", "--description", "JYFK Games: free original browser games (jyfk.lol)",
             "--homepage", "https://jyfk.lol"], timeout=120)
        time.sleep(3)
    if git("remote", "get-url", "origin", check=False).returncode != 0:
        git("remote", "add", "origin", f"https://github.com/{FULL}.git")
    git_net("push", "-u", "origin", "main")
    sha = git("rev-parse", "HEAD").stdout.strip()
    say(f"- pushed {sha[:10]} to https://github.com/{FULL}")
    pages = gh_api("GET", f"repos/{FULL}/pages", check=False)
    newly = False
    if pages is None:
        gh_api("POST", f"repos/{FULL}/pages", {"build_type": "workflow"})
        say("- GitHub Pages turned on (source: GitHub Actions)")
        newly = True
    elif pages.get("build_type") != "workflow":
        gh_api("PUT", f"repos/{FULL}/pages", {"build_type": "workflow"})
        say("- GitHub Pages switched to GitHub Actions")
        newly = True
    return sha, newly


def wait_deploy(sha, newly):
    say("\n## 6. Deploy")
    deadline = time.time() + 15 * 60
    rerun_done = False
    run_id = None
    while time.time() < deadline:
        runs = gh_api("GET", f"repos/{FULL}/actions/runs?head_sha={sha}&per_page=10", check=False) or {}
        items = [r for r in runs.get("workflow_runs", []) if r.get("path", "").endswith("pages.yml")]
        if not items:
            time.sleep(10)
            continue
        rr = max(items, key=lambda r: r.get("run_number", 0))
        run_id = rr["id"]
        if rr.get("status") != "completed":
            time.sleep(10)
            continue
        if rr.get("conclusion") == "success":
            say(f"- Actions run {rr.get('html_url')} succeeded")
            return True
        if not rerun_done:  # usually the very first run, which started before Pages was switched on
            say(f"- Actions run {rr.get('html_url')} ended with '{rr.get('conclusion')}', running it again")
            gh_api("POST", f"repos/{FULL}/actions/runs/{run_id}/rerun", {}, check=False)
            rerun_done = True
            time.sleep(15)
            continue
        say(f"- Actions run {rr.get('html_url')} failed again ({rr.get('conclusion')}). Open the link to see the log.")
        return False
    say("- timed out waiting for the deploy (15 min)")
    return False


def live_url():
    pages = gh_api("GET", f"repos/{FULL}/pages", check=False) or {}
    url = pages.get("html_url") or GH_PAGES_URL
    return url if url.endswith("/") else url + "/"


def verify_live(slugs):
    say("\n## 7. Live check")
    base = live_url()
    stamp = int(time.time())
    deadline = time.time() + 8 * 60
    online = []
    while time.time() < deadline:
        try:
            st, body = http_get(f"{base}games.json?v={stamp}")
            online = [g["slug"] for g in json.loads(body.decode("utf-8"))] if st == 200 else []
        except Exception:  # noqa: BLE001
            online = []
        if online and all(s in online for s in slugs):
            break
        time.sleep(15)
    missing = [s for s in slugs if s not in online]
    bad = []
    for path in ["", *[f"games/{s}/" for s in slugs], *[f"play/{s}/" for s in slugs]]:
        try:
            st, _ = http_get(f"{base}{path}?v={stamp}")
        except Exception as ex:  # noqa: BLE001
            st = str(ex)
        if st != 200:
            bad.append(f"{base}{path} -> {st}")
    say(f"- live site: {base}  ({len(online)} games online)")
    if missing:
        say(f"- NOT online yet: {', '.join(missing)}")
    for b in bad:
        say(f"- page problem: {b}")
    return base, online, not missing and not bad


def resolve_a(host):
    ips = set()
    try:
        ips = {a[4][0] for a in socket.getaddrinfo(host, 443, socket.AF_INET)}
    except Exception:
        pass
    try:  # cross-check with public DNS (the local resolver can be stale or rewritten)
        st, body = http_get(f"https://dns.google/resolve?name={host}&type=A", timeout=15)
        if st == 200:
            pub = {a["data"] for a in json.loads(body).get("Answer", []) if a.get("type") == 1}
            if pub:
                ips = pub
    except Exception:
        pass
    return ips


def domain_step(domain):
    say("\n## 8. Custom domain")
    ips = resolve_a(domain)
    pages = gh_api("GET", f"repos/{FULL}/pages", check=False) or {}
    if not ips or not ips <= GITHUB_IPS:
        say(f"- {domain} points to {', '.join(sorted(ips)) or 'nothing'}, not to GitHub Pages yet -> waiting for DNS "
            f"(site stays on {GH_PAGES_URL})")
        return "waiting for DNS"
    rebuild = False
    if (pages.get("cname") or "").lower() != domain:
        gh_api("PUT", f"repos/{FULL}/pages", {"cname": domain, "build_type": "workflow"})
        say(f"- bound custom domain {domain}")
        rebuild = True
        time.sleep(10)
        pages = gh_api("GET", f"repos/{FULL}/pages", check=False) or {}
    if pages.get("https_enforced"):
        status = f"https://{domain}/ live with HTTPS"
    else:
        try:
            gh_api("PUT", f"repos/{FULL}/pages", {"https_enforced": True})
            status = f"https://{domain}/ bound, HTTPS enforced"
        except Exception:  # noqa: BLE001
            cert = (pages.get("https_certificate") or {}).get("state", "pending")
            status = f"{domain} bound; HTTPS certificate is still being issued ({cert}); the next publish turns HTTPS on"
    say(f"- {status}")
    if rebuild:  # rebuild so canonical / sitemap URLs use the domain
        gh_api("POST", f"repos/{FULL}/actions/workflows/pages.yml/dispatches", {"ref": "main"}, check=False)
        say("- started a rebuild so canonical links and the sitemap use the domain")
    return status


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="check and build only; no git, no push")
    ap.add_argument("--no-wait", action="store_true", help="do not wait for the GitHub Actions deploy")
    ap.add_argument("--games-dir", default=siteqa.GAMES_DIR, help=argparse.SUPPRESS)
    ap.add_argument("--done-dir", default=siteqa.DONE_DIR, help=argparse.SUPPRESS)
    args = ap.parse_args()
    if not args.dry_run and (os.path.abspath(args.games_dir) != os.path.abspath(siteqa.GAMES_DIR)):
        sys.exit("--games-dir is only for --dry-run tests")
    if os.path.isdir(OUT):
        shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    started = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    say(f"# jyfk.lol publish {started}{' (dry run)' if args.dry_run else ''}\n")
    ok = False
    try:
        cfg = json.load(open(os.path.join(SITE, "site.json"), encoding="utf-8-sig"))
        if cfg.get("adsense_client"):
            say(f"AdSense publisher ID set ({cfg['adsense_client']}): ads script + ads.txt are generated.\n")
        passed, failed, waiting = select_and_check(args)
        if not passed:
            raise RuntimeError("no game passed the checks; nothing to publish")
        built = build_and_check_portal(args, passed)
        if args.dry_run:
            say(f"\nDry run passed. {len(built)} games would be online: {', '.join(built)}")
            ok = True
            return
        if run(["gh", "auth", "status"], check=False).returncode != 0:
            raise RuntimeError("gh is not logged in (run: gh auth login)")
        changed, online_games = commit(passed)
        sha, newly = push_and_pages()
        deployed = True
        if not args.no_wait:
            deployed = wait_deploy(sha, newly)
        base, online, live_ok = (live_url(), [], True) if args.no_wait else verify_live(online_games)
        domain = domain_step(cfg.get("domain") or "jyfk.lol")
        say("\n## Summary")
        say(f"- live site: {base}")
        say(f"- games online: {len(online) if online else len(online_games)} ({', '.join(online or online_games)})")
        if failed:
            say("- left out (failed checks): " + "; ".join(f"{s} ({w[:160]})" for s, w in failed.items()))
        if waiting:
            say("- not finished yet: " + ", ".join(waiting))
        say(f"- domain: {domain}")
        ok = deployed and live_ok
        if not ok:
            say("- WARNING: deploy or live check did not fully succeed (see above)")
    except Exception as ex:  # noqa: BLE001
        say(f"\nSTOPPED: {ex}")
    finally:
        with open(os.path.join(OUT, "report.md"), "w", encoding="utf-8") as f:
            f.write("\n".join(LINES) + "\n")
        print(f"\nreport: {os.path.join(OUT, 'report.md')}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
