"""Build the static games portal into an output folder (default: _site).

    python site/build.py                          -> builds ./_site from every valid game in games/
    python site/build.py --out DIR                -> builds into DIR
    python site/build.py --allow a,b,c            -> only these game slugs (publish.py uses this)
    python site/build.py --only SLUG              -> portal with a single game
    python site/build.py --base-url URL           -> absolute URL used for canonical / sitemap / Open Graph
                                                     (GitHub Actions passes the real Pages URL here)
    python site/build.py --games-dir DIR          -> read games from another folder (tests)

Python standard library only. Pillow is optional: when installed, small WebP card thumbnails are
generated (faster on phones); otherwise the original PNG covers are used.

A game whose metadata is broken is skipped with the reason printed; the build itself never fails
because of one bad game.
"""
from __future__ import annotations

import argparse
import datetime
import html
import json
import os
import re
import shutil
import struct
import sys
import traceback
from urllib.parse import urlparse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_DIR = os.path.join(ROOT, "site")
GAMES_DIR = os.path.join(ROOT, "games")
POLICY_DATE = "2026-11-01"

CATEGORIES = {
    "arcade": ("Arcade Games", "Fast, score-chasing arcade games you can pick up in seconds. Dodge, catch, collect and chase your best score."),
    "action": ("Action Games", "Action games that test your reflexes and timing, from dodging hazards to fast reactions under pressure."),
    "puzzle": ("Puzzle Games", "Puzzle games that make you think: logic, patterns, paths and clever moves, with levels that get harder as you go."),
    "casual": ("Casual Games", "Relaxed, easy-to-learn casual games for a short break. Simple controls, satisfying feedback, no pressure."),
    "skill": ("Skill Games", "Skill games about precision and timing. Easy to learn, hard to master, and perfect for beating your own record."),
    "strategy": ("Strategy Games", "Strategy games where planning beats speed. Think ahead, manage resources and outsmart the challenge."),
    "board": ("Board Games", "Classic-style board games you can play in your browser against a computer opponent, with no setup and no pieces to lose."),
    "card": ("Card Games", "Card games and solitaire-style challenges that run right in your browser, with smooth controls on desktop and mobile."),
}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RESERVED = {"about", "privacy", "terms", "contact", "category", "assets", "games", "play", "search", "thumbs",
            "index", "404", "sitemap", "robots", "ads", "static", "kit", "site"}

e = html.escape


# ----------------------------------------------------------------------------- helpers
def load_json(p, default=None):
    try:
        with open(p, encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception:
        return default


def words(s):
    return len(re.findall(r"[A-Za-z0-9'’-]+", s or ""))


def png_size(path):
    try:
        with open(path, "rb") as f:
            head = f.read(24)
        if head[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">II", head[16:24])
    except Exception:
        pass
    return None


def _txt(v):
    return v.strip() if isinstance(v, str) else ""


def validate_game(slug, folder):
    """Return (meta or None, errors, warnings). errors -> the game is skipped."""
    errors, warns = [], []
    if not SLUG_RE.match(slug) or len(slug) > 48 or slug in RESERVED:
        return None, [f"folder name {slug!r} is not a valid slug (lowercase letters, digits, hyphens)"], warns
    if not os.path.isfile(os.path.join(folder, "index.html")):
        errors.append("index.html is missing")
    path = os.path.join(folder, "game.json")
    if not os.path.isfile(path):
        return None, errors + ["game.json is missing"], warns
    try:
        with open(path, encoding="utf-8-sig") as f:
            meta = json.load(f)
    except Exception as ex:  # noqa: BLE001
        return None, errors + [f"game.json is not valid JSON ({ex})"], warns
    if not isinstance(meta, dict):
        return None, errors + ["game.json must be a JSON object"], warns

    if meta.get("slug") != slug:
        errors.append(f"game.json slug is {meta.get('slug')!r}, must equal the folder name {slug!r}")
    title = _txt(meta.get("title"))
    if not (2 <= len(title) <= 60):
        errors.append("title is missing or longer than 60 characters")
    short = _txt(meta.get("short"))
    if not (10 <= len(short) <= 200):
        errors.append("short (one-line pitch) is missing or too long")
    elif not (30 <= len(short) <= 110):
        warns.append(f"short should be 30-110 characters (now {len(short)})")
    desc = meta.get("description") if isinstance(meta.get("description"), str) else ""
    n = words(desc)
    if n < 80:
        errors.append(f"description has {n} English words, needs at least 80 (target 120-380)")
    elif not (120 <= n <= 380):
        warns.append(f"description should be 120-380 words (now {n})")
    if len([p for p in re.split(r"\n\s*\n", desc) if p.strip()]) < 3:
        warns.append("description should have at least 3 paragraphs")
    if meta.get("category") not in CATEGORIES:
        errors.append(f"category {meta.get('category')!r} must be one of {', '.join(CATEGORIES)}")
    if meta.get("orientation") not in ("portrait", "landscape"):
        warns.append("orientation should be portrait or landscape (using landscape)")
        meta["orientation"] = "landscape"
    tags = meta.get("tags")
    if not (isinstance(tags, list) and all(isinstance(t, str) for t in tags)):
        warns.append("tags should be a list of strings")
        meta["tags"] = []
    ctl = meta.get("controls")
    if not isinstance(ctl, dict) or not ctl:
        warns.append("controls (keyboard / mouse / touch) are missing")
        meta["controls"] = {}
    else:
        meta["controls"] = {k: v for k, v in ctl.items() if isinstance(v, str) and v.strip()}
        if not meta["controls"].get("touch"):
            warns.append("controls.touch is missing")
    for key in ("how_to_play", "tips"):
        v = meta.get(key)
        if not (isinstance(v, list) and all(isinstance(x, str) for x in v) and v):
            warns.append(f"{key} should be a non-empty list of sentences")
            meta[key] = [x for x in v if isinstance(x, str)] if isinstance(v, list) else []
    faq = meta.get("faq")
    if not (isinstance(faq, list) and faq):
        warns.append("faq should be a non-empty list")
        faq = []
    meta["faq"] = [x for x in faq if isinstance(x, dict) and _txt(x.get("q")) and _txt(x.get("a"))]
    added = str(meta.get("added") or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", added):
        warns.append("added should be a YYYY-MM-DD date")
        meta["added"] = datetime.date.today().isoformat()
    thumb = os.path.join(folder, "thumb.png")
    if not os.path.isfile(thumb):
        warns.append("thumb.png is missing (a default image is used)")
        meta["_has_thumb"] = False
    else:
        meta["_has_thumb"] = True
        sz = png_size(thumb)
        if sz != (640, 360):
            warns.append(f"thumb.png should be 640x360 PNG (now {sz})")
    if errors:
        return None, errors, warns
    meta["title"], meta["short"] = title, short
    return meta, errors, warns


def load_games(games_dir, allow=None, quiet=False):
    games = []
    if not os.path.isdir(games_dir):
        return games
    for slug in sorted(os.listdir(games_dir)):
        d = os.path.join(games_dir, slug)
        if not os.path.isdir(d) or slug.startswith((".", "_")):
            continue
        if allow is not None and slug not in allow:
            continue
        meta, errs, warns = validate_game(slug, d)
        if meta is None:
            print(f"[skip] {slug}: " + "; ".join(errs))
            continue
        if warns and not quiet:
            print(f"[warn] {slug}: " + "; ".join(warns))
        meta["_dir"] = d
        games.append(meta)
    games.sort(key=lambda g: (str(g.get("added", "")), g.get("title", "")), reverse=True)
    return games


# ----------------------------------------------------------------------------- page shell
def relativize(page_html, depth):
    prefix = "../" * depth if depth else "./"
    return re.sub(r'(\s(?:href|src|srcset|action|data-root|data-src|poster)=")/(?!/)', r"\g<1>" + prefix, page_html)


def write_file(out, rel_path, text):
    full = os.path.join(out, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def write_page(out, rel_path, page_html):
    write_file(out, rel_path, relativize(page_html, rel_path.count("/")))


class Ctx:
    """Everything the page templates need."""

    def __init__(self, cfg, base_url, games, out):
        self.cfg = cfg
        self.base = base_url.rstrip("/")
        self.base_path = urlparse(self.base).path.rstrip("/")
        self.games = games
        self.out = out
        client = _txt(cfg.get("adsense_client"))
        if client.startswith("pub-"):
            client = "ca-" + client
        self.ad_client = client if re.match(r"^ca-pub-\d{6,}$", client) else ""
        if client and not self.ad_client:
            print(f"[warn] site.json adsense_client {client!r} does not look like ca-pub-XXXXXXXX; ads disabled")
        self.ad_slot = re.sub(r"\D", "", str(cfg.get("adsense_slot") or ""))
        with open(os.path.join(SITE_DIR, "static", "style.css"), encoding="utf-8") as f:
            self.css = re.sub(r"\s*\n\s*", "", f.read())
        self.thumb_ext = {}

    def thumb(self, g):
        ext = self.thumb_ext.get(g["slug"])
        return f"/thumbs/{g['slug']}.{ext}" if ext else "/assets/og-default.png"

    def thumb_abs(self, g):
        return f"{self.base}/thumbs/{g['slug']}.png" if g.get("_has_thumb") else None

    def ad(self, where):
        """An ad unit. Empty string unless an AdSense publisher ID AND a slot ID are configured."""
        if not (self.ad_client and self.ad_slot):
            return ""
        return (f'<aside class="ad ad-{where}" aria-label="Advertisement"><span class="ad-label">Advertisement</span>'
                f'<ins class="adsbygoogle" style="display:block" data-ad-client="{e(self.ad_client)}" data-ad-slot="{e(self.ad_slot)}" '
                'data-ad-format="auto" data-full-width-responsive="true"></ins>'
                '<script>(window.adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>')


def head(c, title, desc, path, image=None, jsonld=None, noindex=False, og_type="website"):
    cfg = c.cfg
    url = c.base + path
    img = image or (c.base + "/assets/og-default.png")
    ads = ""
    if c.ad_client:
        ads = (f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={e(c.ad_client)}" '
               'crossorigin="anonymous"></script>\n')
    gsc = f'<meta name="google-site-verification" content="{e(cfg["gsc_verification"])}">\n' if _txt(cfg.get("gsc_verification")) else ""
    ld = ""
    for block in (jsonld or []):
        ld += '<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"
    robots = "noindex,follow" if noindex else "index,follow,max-image-preview:large"
    return f"""<!doctype html>
<html lang="{e(cfg.get('lang', 'en'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta name="robots" content="{robots}">
<meta name="theme-color" content="{e(cfg.get('theme_color', '#0d1226'))}">
<meta name="color-scheme" content="dark">
<meta property="og:site_name" content="{e(cfg['name'])}">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(img)}">
<meta property="og:image:width" content="{640 if image else 1200}">
<meta property="og:image:height" content="{360 if image else 630}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{e(img)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<style>{c.css}</style>
{gsc}{ads}{ld}</head>
"""


def header(c, active=None):
    links = "".join(
        f'<a href="/category/{k}/"{" class=on aria-current=page" if k == active else ""}>{e(v[0].replace(" Games", ""))}</a>'
        for k, v in CATEGORIES.items() if any(g["category"] == k for g in c.games))
    return f"""<body data-root="/">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-in">
    <a class="logo" href="/" aria-label="{e(c.cfg['name'])} home"><img src="/assets/logo.svg" alt="" width="34" height="34"><span>{e(c.cfg['name'])}</span></a>
    <form class="search" role="search" action="/search/" method="get" autocomplete="off">
      <input id="q" name="q" type="search" placeholder="Search games" aria-label="Search games" enterkeyhint="search">
      <div class="sugg" id="sugg" role="listbox" hidden></div>
    </form>
  </div>
  <nav class="wrap cats" aria-label="Categories">{links}</nav>
</header>
<main class="wrap" id="main">
"""


def footer(c):
    cats = "".join(f'<a href="/category/{k}/">{e(v[0])}</a>' for k, v in CATEGORIES.items() if any(g["category"] == k for g in c.games))
    return f"""</main>
<footer class="foot">
  <div class="wrap foot-in">
    <p><strong>{e(c.cfg['name'])}</strong> · {e(c.cfg['tagline'])}</p>
    <p class="links">{cats}</p>
    <p class="links"><a href="/about/">About</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/contact/">Contact</a></p>
    <p class="muted">© {datetime.date.today().year} {e(c.cfg['name'])}. Free games that run in your browser. No downloads, no pop-ups.</p>
  </div>
</footer>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script src="/assets/app.js" defer></script>
</body>
</html>
"""


def card(c, g, eager=False):
    cat = CATEGORIES[g["category"]][0].replace(" Games", "")
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<a class="card" href="/games/{e(g["slug"])}/">'
            f'<span class="thumb"><img src="{c.thumb(g)}" alt="{e(g["title"])}" {load} decoding="async" width="640" height="360"></span>'
            f'<span class="meta"><span class="t">{e(g["title"])}</span><span class="s">{e(g.get("short", ""))}</span>'
            f'<span class="badge">{e(cat)}</span></span></a>')


def grid(c, games, eager=0):
    return '<div class="grid">' + "".join(card(c, g, i < eager) for i, g in enumerate(games)) + "</div>"


def para(text):
    return "".join(f"<p>{e(p.strip())}</p>" for p in re.split(r"\n\s*\n", text or "") if p.strip())


def crumbs_ld(c, items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": c.base + p} for i, (n, p) in enumerate(items)]}


# ----------------------------------------------------------------------------- pages
def build_home(c):
    games, cfg = c.games, c.cfg
    used = [k for k in CATEGORIES if any(g["category"] == k for g in games)]
    desc = (f"Play {len(games)} free browser games on {cfg['name']}: original arcade, puzzle and skill games that start "
            "instantly on phone, tablet and desktop. No downloads, no sign-up, no pop-ups.")[:160]
    ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": cfg["name"], "url": c.base + "/",
           "potentialAction": {"@type": "SearchAction", "target": c.base + "/search/?q={search_term_string}",
                               "query-input": "required name=search_term_string"}},
          {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
              {"@type": "ListItem", "position": i + 1, "url": f"{c.base}/games/{g['slug']}/", "name": g["title"]}
              for i, g in enumerate(games[:50])]}]
    chips = "".join(f'<a class="chip" href="/category/{k}/">{e(CATEGORIES[k][0])}</a>' for k in used)
    pick = ""
    if games:
        g = games[0]
        pick = f"""<a class="pick" id="pick" href="/games/{e(g['slug'])}/">
    <span class="thumb"><img id="pick-img" src="{c.thumb(g)}" alt="{e(g['title'])}" fetchpriority="high" width="640" height="360"></span>
    <span class="pick-meta"><span class="pick-label">★ Today's pick</span><span class="t" id="pick-t">{e(g['title'])}</span><span class="s" id="pick-s">{e(g.get('short', ''))}</span></span>
  </a>"""
    sections = "".join(
        f'<section><h2 class="sec"><a href="/category/{k}/">{e(CATEGORIES[k][0])}</a></h2>'
        f'{grid(c, [g for g in games if g["category"] == k][:8])}</section>' for k in used)
    body = f"""
<section class="hero">
  <div class="hero-text">
    <h1>Free online games, ready in one click</h1>
    <p>{e(cfg['tagline'])} Every game is original, loads fast and works with a keyboard, a mouse or a touch screen.</p>
    <div class="chips">{chips}</div>
  </div>
  {pick}
</section>
<section class="mine" id="recent" hidden><h2 class="sec">Continue playing</h2><div class="row" data-list="recent"></div></section>
<section class="mine" id="favs" hidden><h2 class="sec">Your favorites</h2><div class="row" data-list="favs"></div></section>
<section>
  <h2 class="sec">New games</h2>
  {grid(c, games[:12], eager=4) if games else '<p class="muted">The first games are on their way.</p>'}
</section>
{c.ad("home")}
{sections}
<section class="prose about-home">
  <h2>About {e(cfg['name'])}</h2>
  <p>{e(cfg['name'])} is a growing collection of original browser games. Each game is built to load quickly, work with a keyboard, mouse or touch screen, and keep your best score on your device. There is nothing to install, no account to create and no pop-up to close.</p>
  <p>Tap the heart on any game to keep it in your favorites, and the games you played recently appear at the top of this page. Both lists are stored only in your browser.</p>
</section>
"""
    write_page(c.out, "index.html",
               head(c, f"{cfg['name']} · Free Online Games, No Download", desc, "/", jsonld=ld) + header(c) + body + footer(c))


def build_category(c, cat):
    name, blurb = CATEGORIES[cat]
    items = [g for g in c.games if g["category"] == cat]
    ld = [crumbs_ld(c, [("Home", "/"), (name, f"/category/{cat}/")])]
    if items:
        ld.append({"@context": "https://schema.org", "@type": "CollectionPage", "name": name, "url": f"{c.base}/category/{cat}/",
                   "mainEntity": {"@type": "ItemList", "itemListElement": [
                       {"@type": "ListItem", "position": i + 1, "url": f"{c.base}/games/{g['slug']}/", "name": g["title"]}
                       for i, g in enumerate(items)]}})
    count = f"{len(items)} free {name.lower()}" if len(items) != 1 else f"1 free {name.lower()[:-1]}"
    body = f"""
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>{e(name)}</span></nav>
<section class="hero small"><h1>{e(name)}</h1><p>{e(blurb)} {e(count[0].upper() + count[1:])} to play right now.</p></section>
{grid(c, items, eager=4) if items else '<p class="muted">New games in this category are coming soon.</p>'}
{c.ad("list") if items else ''}
"""
    desc = f"Play {count} online at {c.cfg['name']}. {blurb}"
    if len(desc) > 160:
        desc = desc[:157].rsplit(" ", 1)[0] + "…"
    write_page(c.out, f"category/{cat}/index.html",
               head(c, f"{name} · Play Free Online | {c.cfg['name']}", desc, f"/category/{cat}/", jsonld=ld, noindex=not items)
               + header(c, cat) + body + footer(c))


def build_game(c, g):
    slug = g["slug"]
    cat_name = CATEGORIES[g["category"]][0]
    title = f"{g['title']} · Play Free Online | {c.cfg['name']}"
    if len(title) > 65:
        title = f"{g['title']} · Free Online Game"
    desc = g.get("short", "").rstrip(".") + ". Play free in your browser on desktop and mobile, no download."
    if len(desc) > 160:
        desc = desc[:157].rsplit(" ", 1)[0] + "…"
    thumb_abs = c.thumb_abs(g)
    labels = {"keyboard": "Keyboard", "mouse": "Mouse", "touch": "Touch"}
    ctl_rows = "".join(f"<tr><th>{e(labels.get(k, k.capitalize()))}</th><td>{e(v)}</td></tr>" for k, v in g["controls"].items())
    steps = "".join(f"<li>{e(s)}</li>" for s in g.get("how_to_play", []))
    tips = "".join(f"<li>{e(s)}</li>" for s in g.get("tips", []))
    faq = "".join(f"<details><summary>{e(q['q'])}</summary><p>{e(q['a'])}</p></details>" for q in g["faq"])
    same = [x for x in c.games if x["slug"] != slug and x["category"] == g["category"]]
    other = [x for x in c.games if x["slug"] != slug and x["category"] != g["category"]]
    related = (same + other)[:8]
    vg = {"@context": "https://schema.org", "@type": "VideoGame", "name": g["title"], "url": f"{c.base}/games/{slug}/",
          "description": g.get("short", ""), "genre": cat_name.replace(" Games", ""), "gamePlatform": ["Web browser"],
          "applicationCategory": "Game", "operatingSystem": "Any", "playMode": "SinglePlayer", "inLanguage": "en",
          "isAccessibleForFree": True, "datePublished": g.get("added"),
          "keywords": ", ".join(g.get("tags", [])),
          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD", "availability": "https://schema.org/InStock"},
          "publisher": {"@type": "Organization", "name": c.cfg["name"], "url": c.base + "/"}}
    if thumb_abs:
        vg["image"] = thumb_abs
    ld = [vg, crumbs_ld(c, [("Home", "/"), (cat_name, f"/category/{g['category']}/"), (g["title"], f"/games/{slug}/")])]
    orient = "portrait" if g.get("orientation") == "portrait" else "landscape"
    tags = "".join(f"<span>#{e(t)}</span>" for t in g.get("tags", []))
    body = f"""
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/category/{g['category']}/">{e(cat_name)}</a> › <span>{e(g['title'])}</span></nav>
<article class="game" id="game" data-slug="{e(slug)}" data-orient="{orient}">
  <h1>{e(g['title'])}</h1>
  <div class="stage {orient}">
    <div class="frame" id="frame">
      <iframe id="gameframe" src="/play/{e(slug)}/" title="{e(g['title'])}" allow="fullscreen; autoplay; gamepad" allowfullscreen></iframe>
      <button class="fs-exit" id="fsexit" type="button" aria-label="Exit full screen" hidden>✕</button>
    </div>
    <div class="stage-bar">
      <button class="btn" id="fsbtn" type="button">⛶ Full screen</button>
      <button class="btn ghost" id="favbtn" type="button" aria-pressed="false"><span class="heart">♡</span> <span class="lbl">Favorite</span></button>
      <button class="btn ghost" id="sharebtn" type="button">↗ Share</button>
      <a class="btn ghost" href="/play/{e(slug)}/" target="_blank" rel="noopener">Open in new tab</a>
    </div>
  </div>
  <p class="lead">{e(g.get('short', ''))}</p>
  <div class="cols">
    <section class="prose">
      <h2>About {e(g['title'])}</h2>
      {para(g.get('description', ''))}
      {f'<h2>How to play</h2><ol>{steps}</ol>' if steps else ''}
      {f'<h2>Tips</h2><ul>{tips}</ul>' if tips else ''}
    </section>
    <aside class="side">
      {f'<h2>Controls</h2><table class="ctl">{ctl_rows}</table>' if ctl_rows else ''}
      <p class="info"><span>Category</span><a href="/category/{g['category']}/">{e(cat_name)}</a></p>
      <p class="info"><span>Screen</span>{'Portrait (phone friendly)' if orient == 'portrait' else 'Landscape'}</p>
      <p class="info"><span>Added</span><time datetime="{e(g.get('added', ''))}">{e(g.get('added', ''))}</time></p>
      {f'<p class="tags">{tags}</p>' if tags else ''}
    </aside>
  </div>
  {f'<section class="prose faq"><h2>FAQ</h2>{faq}</section>' if faq else ''}
</article>
{c.ad("game")}
{('<section><h2 class="sec">More games you might like</h2>' + grid(c, related) + '</section>') if related else ''}
"""
    write_page(c.out, f"games/{slug}/index.html", head(c, title, desc, f"/games/{slug}/", image=thumb_abs, jsonld=ld)
               + header(c, g["category"]) + body + footer(c))


def copy_game(c, g):
    """Playable copy under /play/<slug>/ plus thumbnails under /thumbs/."""
    slug = g["slug"]
    dst = os.path.join(c.out, "play", slug)
    shutil.copytree(g["_dir"], dst, ignore=shutil.ignore_patterns(
        "_qa", "_*", ".*", "*.tmp", "*.bak", "*.md", "node_modules", "Thumbs.db", "desktop.ini"))
    idx = os.path.join(dst, "index.html")
    try:
        with open(idx, encoding="utf-8", errors="replace") as f:
            src = f.read()
        if not re.search(r'<meta[^>]+name=["\']robots["\']', src, re.I):
            src = re.sub(r"(<head[^>]*>)", r'\1\n<meta name="robots" content="noindex">', src, count=1, flags=re.I)
            with open(idx, "w", encoding="utf-8", newline="\n") as f:
                f.write(src)
    except Exception:
        pass
    if g.get("_has_thumb"):
        tdir = os.path.join(c.out, "thumbs")
        os.makedirs(tdir, exist_ok=True)
        png = os.path.join(g["_dir"], "thumb.png")
        shutil.copyfile(png, os.path.join(tdir, f"{slug}.png"))
        c.thumb_ext[slug] = "png"
        try:
            from PIL import Image  # optional
            with Image.open(png) as im:
                im = im.convert("RGB")
                im.thumbnail((480, 270))
                im.save(os.path.join(tdir, f"{slug}.webp"), "WEBP", quality=80, method=5)
            c.thumb_ext[slug] = "webp"
        except Exception:
            pass


def build_search(c):
    body = """
<section class="hero small"><h1>Search games</h1>
<form class="search big" action="/search/" method="get" role="search" autocomplete="off">
<input id="q2" name="q" type="search" placeholder="Type a game name, a category or a word like “space”" aria-label="Search games" enterkeyhint="search">
</form></section>
<p class="muted" id="sres-info"></p>
<div class="grid" id="sres"></div>
<noscript><p class="muted">Search needs JavaScript. You can also browse the categories above.</p></noscript>
"""
    write_page(c.out, "search/index.html",
               head(c, f"Search games | {c.cfg['name']}", f"Search all free browser games on {c.cfg['name']} by name, category or tag.",
                    "/search/", noindex=True) + header(c) + body + footer(c))


STATIC_PAGES = {
    "about": ("About", "Who makes {name}, what kind of games you will find here and how the site works.", """
<p>{name} is an independent collection of free browser games. Every game on the site is original: the ideas, the names and the artwork are made for this site, and each one is built to start instantly on phones, tablets and computers.</p>
<h2>What makes it different</h2>
<ul>
<li><strong>No pop-ups.</strong> No sign-up walls, no install prompts and no full-screen interruptions between games.</li>
<li><strong>Fast.</strong> Pages are small static files and every game loads from this site with no third-party game servers.</li>
<li><strong>Yours.</strong> Favorites and recently played games are kept in your own browser, so you can pick up where you left off without an account.</li>
</ul>
<h2>How the games work</h2>
<p>Every game works with a keyboard and mouse or a touch screen, pauses when you switch tabs, and saves your progress or best score on your device. New games are added regularly.</p>
<p>If you find a bug or have an idea for a game, please use the <a href="/contact/">contact page</a>.</p>"""),
    "privacy": ("Privacy Policy", "How {name} handles data: local storage on your device, Google AdSense advertising cookies, hosting logs and your choices.", """
<p>Last updated: {date}</p>
<p>This policy explains what information {name} ({domain}) handles when you visit the site. We do not ask you to create an account and we do not collect your name, email address or other contact details through the games.</p>
<h2>Information stored on your device</h2>
<p>The site and its games save small pieces of data in your browser's local storage: best scores, game progress, sound settings, your favorite games and the list of games you played recently. This data stays on your device and is not sent to us. You can remove it at any time by clearing your browser's site data.</p>
<h2>Cookies and advertising</h2>
<p>This site may show ads served by Google AdSense. Google, as a third-party vendor, uses cookies to serve ads on this site. Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to this site and/or other sites on the Internet.</p>
<p>You can opt out of personalised advertising by visiting <a href="https://adssettings.google.com" rel="nofollow noopener">Google Ads Settings</a>. You can also opt out of some third-party vendors' use of cookies for personalised advertising at <a href="https://www.aboutads.info/choices/" rel="nofollow noopener">www.aboutads.info</a>. Learn more in <a href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener">How Google uses information from sites or apps that use its services</a>.</p>
<p>Visitors in the European Economic Area, the United Kingdom and Switzerland are asked for consent through a Google-certified consent message before personalised ads are shown. When no consent is given, only non-personalised ads, which still use cookies for frequency capping and fraud prevention, may be shown.</p>
<p>You can block or delete cookies in your browser settings. The games keep working without cookies.</p>
<h2>Hosting and logs</h2>
<p>The site is hosted on GitHub Pages. Like most web hosts, GitHub may record technical information such as IP addresses in server logs for security purposes. See the <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="nofollow noopener">GitHub Privacy Statement</a>.</p>
<h2>Children</h2>
<p>The games are suitable for a general audience. We do not knowingly collect personal information from anyone, including children under 13.</p>
<h2>Changes</h2>
<p>If this policy changes, the new version will be posted on this page with a new date.</p>
<h2>Contact</h2>
<p>Questions about this policy can be sent through the <a href="/contact/">contact page</a>.</p>"""),
    "terms": ("Terms of Use", "The terms that apply when you play games on {name}: free personal use, no warranty and fair use of the site.", """
<p>Last updated: {date}</p>
<p>By using {name} ({domain}) you agree to these terms. If you do not agree, please do not use the site.</p>
<h2>Use of the games</h2>
<p>The games are provided free of charge for personal entertainment. You may link to any page of the site. Please do not copy, reupload, frame on another site or redistribute the games or their code without permission.</p>
<h2>Acceptable use</h2>
<p>Do not try to disrupt the site, overload it with automated requests or use it for anything unlawful.</p>
<h2>Advertising</h2>
<p>The site may display ads from third parties such as Google. Those ads are governed by the advertisers' own terms. See the <a href="/privacy/">privacy policy</a> for how advertising cookies are used.</p>
<h2>No warranty</h2>
<p>The site and games are provided "as is" without warranties of any kind. Saved scores and progress live in your browser and can be lost if browser data is cleared. We are not liable for any loss or damage arising from the use of the site.</p>
<h2>Changes</h2>
<p>We may update these terms, add or remove games, or change the site at any time. The date at the top shows the latest version.</p>
<h2>Contact</h2>
<p>Questions about these terms can be sent through the <a href="/contact/">contact page</a>.</p>"""),
    "contact": ("Contact", "Report a bug, suggest a game or ask a question about {name}.", """
<p>Found a bug, have a suggestion, or want to report a problem with a game? We would like to hear about it.</p>
<h2>How to reach us</h2>
<p>Open an issue on the site's public GitHub page. Please include the game name, what happened, and your device and browser.</p>
<p><a class="btn" href="{repo}/issues" rel="noopener">Contact us on GitHub</a></p>
<p>We read every message, although we cannot reply to all of them. For privacy questions, please mention "privacy" in the title.</p>"""),
}


def build_static(c):
    cfg = c.cfg
    fmt = dict(name=e(cfg["name"]), domain=e(cfg.get("domain", "")), date=POLICY_DATE, repo=e(cfg.get("repo_url", "")))
    for slug, (title, desc, body) in STATIC_PAGES.items():
        page = (head(c, f"{title} | {cfg['name']}", desc.format(name=cfg["name"]), f"/{slug}/",
                     jsonld=[crumbs_ld(c, [("Home", "/"), (title, f"/{slug}/")])])
                + header(c) + f'<article class="prose page"><h1>{e(title)}</h1>{body.format(**fmt)}</article>' + footer(c))
        write_page(c.out, f"{slug}/index.html", page)
    # 404 can be served at any depth, so it uses absolute links that include the Pages base path.
    picks = grid(c, c.games[:4]) if c.games else ""
    nf = (head(c, f"Page not found | {cfg['name']}", "This page does not exist. Find a free game to play instead.", "/404.html", noindex=True)
          + header(c) + '<article class="prose page"><h1>Page not found</h1><p>This page does not exist or was moved. '
          '<a href="/">Go to the home page</a> or try one of these games.</p></article>' + picks + footer(c))
    bp = c.base_path
    nf = re.sub(r'(\s(?:href|src|srcset|action|data-root)=")/(?!/)', r"\g<1>" + bp + "/", nf)
    write_file(c.out, "404.html", nf)


def build_meta_files(c):
    base, games = c.base, c.games
    today = datetime.date.today().isoformat()
    urls = [("/", today)] + [(f"/category/{k}/", today) for k in CATEGORIES if any(g["category"] == k for g in games)]
    urls += [(f"/games/{g['slug']}/", g.get("added", today)) for g in games]
    urls += [(f"/{p}/", POLICY_DATE) for p in ("about", "privacy", "terms", "contact")]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, mod in urls:
        sm.append(f"<url><loc>{e(base + path)}</loc><lastmod>{e(str(mod))}</lastmod></url>")
    sm.append("</urlset>")
    write_file(c.out, "sitemap.xml", "\n".join(sm) + "\n")
    write_file(c.out, "robots.txt", f"User-agent: *\nAllow: /\nDisallow: /search/\n\nSitemap: {base}/sitemap.xml\n")
    write_file(c.out, ".nojekyll", "")
    if c.ad_client:
        write_file(c.out, "ads.txt", f"google.com, {c.ad_client[3:]}, DIRECT, f08c47fec0942fa0\n")
    index = [{"slug": g["slug"], "title": g["title"], "short": g.get("short", ""), "category": g["category"],
              "cat": CATEGORIES[g["category"]][0].replace(" Games", ""), "tags": g.get("tags", []),
              "thumb": c.thumb(g).lstrip("/"), "added": g.get("added", "")} for g in games]
    write_file(c.out, "games.json", json.dumps(index, ensure_ascii=False, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "_site"))
    ap.add_argument("--only", default=None)
    ap.add_argument("--allow", default=None, help="comma separated slugs to include")
    ap.add_argument("--base-url", default=None)
    ap.add_argument("--games-dir", default=GAMES_DIR)
    ap.add_argument("--config", default=os.path.join(ROOT, "site.json"), help="site settings file (default site.json)")
    args = ap.parse_args()
    cfg = load_json(args.config, {})
    for k, v in (("name", "JYFK Games"), ("tagline", "Free browser games."), ("base_url", "https://jyfk.lol"), ("lang", "en")):
        cfg.setdefault(k, v)
    base_url = (args.base_url or "").strip() or cfg["base_url"]
    out = os.path.abspath(args.out)
    allow = None
    if args.only:
        allow = {args.only}
    elif args.allow is not None:
        allow = {s.strip() for s in args.allow.split(",") if s.strip()}
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    shutil.copytree(os.path.join(SITE_DIR, "static"), os.path.join(out, "assets"))
    shutil.copyfile(os.path.join(SITE_DIR, "static", "logo.svg"), os.path.join(out, "favicon.svg"))

    games = load_games(os.path.abspath(args.games_dir), allow)
    c = Ctx(cfg, base_url, [], out)
    ok = []
    for g in games:
        try:
            copy_game(c, g)
            ok.append(g)
        except Exception as ex:  # noqa: BLE001
            print(f"[skip] {g['slug']}: could not copy files ({ex})")
            shutil.rmtree(os.path.join(out, "play", g["slug"]), ignore_errors=True)
    c.games = ok
    final = []
    for g in ok:
        try:
            build_game(c, g)
            final.append(g)
        except Exception:  # noqa: BLE001
            print(f"[skip] {g['slug']}: page build failed\n{traceback.format_exc(limit=2)}")
            shutil.rmtree(os.path.join(out, "play", g["slug"]), ignore_errors=True)
            shutil.rmtree(os.path.join(out, "games", g["slug"]), ignore_errors=True)
    if len(final) != len(ok):  # rebuild so related-game grids never link to a skipped game
        c.games = final
        for g in final:
            build_game(c, g)
    build_home(c)
    for k in CATEGORIES:
        build_category(c, k)
    build_search(c)
    build_static(c)
    build_meta_files(c)
    print(f"[build] {len(final)} games -> {out}  (base url {c.base})")
    print("[build] games: " + (", ".join(g["slug"] for g in final) or "none"))


if __name__ == "__main__":
    main()
