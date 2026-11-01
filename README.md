# JYFK Games（jyfk.lol）游戏门户

免费、原创的网页小游戏站。纯静态网站：`site/build.py` 把 `games/` 里的每个游戏生成门户页面，GitHub Actions 自动部署到 GitHub Pages。

- 线上（临时地址）：https://sansu668.github.io/jyfk-lol/
- 自定义域名：https://jyfk.lol/ （DNS 指向 GitHub 后，发布脚本会自动绑定并开启 HTTPS）
- 仓库：https://github.com/sansu668/jyfk-lol

---

## 一键发布（P1 用这个）

在任意目录运行：

```powershell
python F:\JY\sites\jyfk-lol\scripts\publish.py
```

（或双击 / 运行 `F:\JY\sites\jyfk-lol\publish.cmd`，效果相同。）

脚本按顺序做这些事，任何一步出问题都会说清楚原因：

1. **挑出已经完成的游戏**：只有 `F:\JY\plan\done\` 里有完成报告的游戏才会上线。
   判断方法：游戏 `game.json` 的 `plan` 字段（例如 `G07`）对应的 `done\G07.md` 存在，并且报告里写了这个游戏的 slug。
   如果 `plan` 对不上任何报告，只要有某个 `done\G*.md` 写了这个 slug 也算。样例 `comet-catcher` 永远上线。
   正在做的、半成品的游戏一律不暂存、不提交、不推送。
2. **逐个检查游戏**：先检查元数据，再用无头 Edge 分别以电脑（1280×800）和手机（390×844，触屏）尺寸打开游戏，点击 / 触摸 / 按键。
   出现控制台报错、从外网加载资源、文件 404、画面空白中的任何一种，这个游戏就**这次不发布**，原因会打印出来。其他游戏照常发布。
3. **构建门户并检查所有页面**：首页、每个分类、每个游戏页、搜索、关于、隐私、条款、联系、404，电脑和手机尺寸都打开一遍。门户页面有报错就整体停止，不推送。
4. **提交并推送**：只提交网站代码和通过检查的游戏。第一次运行时会自动建公开仓库并开启 GitHub Pages（Actions 模式）。
5. **等部署完成**（通常 1–3 分钟），然后下载线上的 `games.json` 和页面，确认新游戏真的上线了。
6. **检查域名**：`jyfk.lol` 的 DNS 已经指向 GitHub（185.199.108–111.153）就自动绑定域名、开启 HTTPS，并重新构建让 canonical 链接改用域名；没指向就打印"等 DNS"。
7. 结果写进 `_publish\report.md`（可以直接抄进 P1 的完成报告），截图在 `_publish\shots\`。

退出码 0 = 发布成功；1 = 有东西挡住了发布（看报告）。

常用参数：

| 命令 | 作用 |
|---|---|
| `python scripts\publish.py --dry-run` | 只做检查和本地构建，不碰 git、不推送。发布前想先看看用这个 |
| `python scripts\publish.py --no-wait` | 推送后不等 Actions 部署完成 |
| `python scripts\check_live.py` | 用无头 Edge 检查线上站点所有页面（电脑 + 手机），截图在 `_publish\live\` |
| `python scripts\check_live.py https://jyfk.lol/` | 检查绑定域名后的地址 |

需要：Python 3.10+、`playwright`（已装，使用本机 Edge）、`gh` 已登录 sansu668。Pillow 可选（用于检测空白画面）。
本地预览服务器用系统分配的随机端口，浏览器全部无头，跑完自动关闭。

> 不要在这个文件夹里手动 `git add -A`：那样会把正在做的游戏也提交上去。发布一律走 `publish.py`。

---

## 广告（Google AdSense）

在 `site.json` 里填：

```json
"adsense_client": "ca-pub-1234567890123456",
"adsense_slot": ""
```

- `adsense_client` 填上发布商 ID 后：每个页面自动加载 AdSense 脚本，并生成 `ads.txt`（`google.com, pub-…, DIRECT, f08c47fec0942fa0`）。也可以只写 `pub-…`，会自动补成 `ca-pub-…`。
- `adsense_slot` 可选：填一个"展示广告"单元的 ID 后，固定广告位才会出现，位置是首页"New games"下面、分类列表下面、游戏页整篇介绍和 FAQ 之后。广告位永远不会贴着游戏区域。
  只填 `adsense_client`、不填 slot 时，只启用 AdSense 后台的"自动广告"。建议在 AdSense 后台把自动广告的"锚定广告 / 全屏广告"关掉，保持站点没有弹窗。
- 两个字段都留空时，页面上没有任何广告代码、广告位或 `ads.txt`。
- `ads.txt` 必须放在域名根目录才有效，所以要等 `jyfk.lol` 绑定后才会被 Google 认到。

改完 `site.json` 后运行一次 `publish.py` 即可。

---

## 目录

```
games/<slug>/        每个游戏一个文件夹（由各个游戏任务制作，约定见 F:\JY\plan\01-项目规则.md）
  index.html         直接打开就能玩，所有资源在本地
  game.json          英文元数据（slug、plan、title、short、description、category、tags、orientation、controls、how_to_play、tips、faq、added）
  thumb.png          640×360 封面
kit/jy-kit.js        游戏站自带的轻量引擎（游戏可选用）
site/build.py        门户生成器（只用 Python 标准库；装了 Pillow 会额外生成 WebP 小缩略图）
site/static/         样式、脚本、图标
site.json            站点名称、域名、AdSense、Search Console 验证码
scripts/publish.py   一键发布
scripts/check_live.py 线上检查
scripts/siteqa.py    发布和检查共用的测试工具
.github/workflows/pages.yml  推送到 main 后自动构建并部署到 GitHub Pages
```

`_site/`、`_publish/`、`_preview/`、`_qa/` 是生成的文件，不进仓库。

## 本地预览

```powershell
python F:\JY\sites\jyfk-lol\site\build.py                 # 用 games\ 里所有合格的游戏构建到 _site\
python F:\JY\sites\jyfk-lol\scripts\publish.py --dry-run  # 只用已完成的游戏构建，并自动检查 + 截图
```

`_site\` 可以用任意静态服务器打开，例如 `python -m http.server 0 -d F:\JY\sites\jyfk-lol\_site`（端口 0 = 系统分配）。

## 门户生成规则

- **自动收录**：`games\` 里每个文件夹都会被检查。元数据不合格的游戏会被跳过并打印原因（例如 `[skip] xxx: category 'TODO' must be one of …`），整个站照常构建。
  会跳过的情况：没有 `index.html` 或 `game.json`、JSON 写错、`slug` 和文件夹名不一致、缺 title / short、description 少于 80 个英文单词、category 不在 8 个分类里。
  只打印提醒、照常收录的情况：description 不在 120–380 词或不足 3 段、缺 thumb.png（用默认图）、tags / controls / how_to_play / tips / faq 缺项、封面尺寸不是 640×360。
- **页面**：首页（今日推荐、继续玩、我的收藏、新游戏、各分类）、分类页、游戏页（内嵌游戏、全屏、收藏、分享、在新标签打开、介绍、玩法、操作、技巧、FAQ、相关游戏）、搜索页、关于、隐私政策、使用条款、联系方式、404。
- **SEO**：每页独立的 title / description / canonical，Open Graph 和 Twitter 卡片，结构化数据（WebSite + SearchAction、ItemList、CollectionPage、VideoGame、BreadcrumbList），自动生成 `sitemap.xml` 和 `robots.txt`。
  canonical 和 sitemap 用的是部署时 GitHub Pages 的真实地址：绑定域名前是 `https://sansu668.github.io/jyfk-lol/…`，绑定后自动变成 `https://jyfk.lol/…`。
- **速度**：CSS 内联（没有阻塞渲染的请求），脚本 `defer`，卡片缩略图转成 480×270 的 WebP（样例从 95 KB 降到 7 KB）并懒加载，不用任何外部字体或 CDN。
- **游戏本体**：复制到 `/play/<slug>/` 由 iframe 内嵌；如果游戏的 `index.html` 没写 robots，会自动补 `noindex`，避免和游戏页抢排名。
