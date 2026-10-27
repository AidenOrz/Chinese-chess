# 中国象棋 · 教学软件

原生 JavaScript + ES Modules 的中国象棋教学应用：对局、教学、推演、复盘、课程与题库一体化。**运行时零依赖**，支持单文件分发与 PWA 离线使用。

> 交接与续开发请读 [HANDOFF.md](HANDOFF.md)；项目长期知识/踩坑记录见 [MEMORY.md](MEMORY.md)。

## 功能

- **对局**：人机（8 档棋力，弱档会"送子"模拟初学者）/ 双人；中文记谱；走棋记录；执黑自动翻转棋盘
- **教学**：推荐走法（思路 / 风险 / 预计应手）、走子即时评价、AI 意图解释、局面诊断、非法走法人话提示。评分口径是**与最佳着的差距**（"最佳" / "差 2.5 兵"）而非绝对评估——落后时同样读得懂，并额外给出子力差异与"落后局面怎么下才算好"
- **推演**：任意一方试走不影响正式对局；FEN 导入导出
- **复盘**：终局/进行中逐手评分标注（好棋/一般/疑问/失误+更佳着法），点击跳步回放，失误统计；复盘卡固定在侧栏顶部，与棋盘同屏
- **课程**（10 课）：基本杀法六式（重炮/闷宫/卧槽马/钓鱼马/铁门栓/双车错）+ 残局 2 课 + 开局原理 2 课；每课讲解（棋盘高亮+箭头）→ 演示（自动播放）→ 跟练 → 习题
- **题库**（50 题）：一步杀 20 / 两步杀 18 / 残局 7 / 战术 5；引擎扮演最强防守；错题自动收录、可重练
- **规则**：照面/蹩马腿/塞象眼/困毙等全规则；可选"正式规则"（三次重复判和、长将判负）
- **持久化**：IndexedDB 自动存档、刷新恢复对局、存档列表与着法导出、Elo 积分；PWA 可安装离线

## 快速开始

```bash
npm test      # node --test 全部测试（14 个文件：引擎/评估/教学/搜索/FEN/存储/复盘评分/流程/内容自检/学习/复盘模式/控件守卫/布局与面板/教学评分）
npm run serve # 本地静态服务 http://127.0.0.1:8123/（开发用，ES Modules 需 http）
npm run build # esbuild 打包出 dist/index.html（双击即玩，内联引擎 Worker 与全部课程数据，约 200KB）
```

- 开发：`npm run serve` 后访问 http://127.0.0.1:8123/
- 分发：把 `dist/index.html` 单个文件发给使用者即可（PWA 安装需以 http 部署根目录）

## 工程结构

```
js/
  engine/   board(坐标/编码) moves(规则) eval(评估) search(αβ+迭代加深+Zobrist置换表)
            notation(记谱) fen levels(8档棋力) worker+client(引擎Worker)
  teach/    explain.js 教学解释（纯函数）/ review.js 复盘评分
  ui/       layout(渲染+SVG箭头+翻转) panels(面板) interact(指针交互)
            study(学习模式) review(复盘) lists(课程题库列表) router(hash路由)
  app.js    对局/教学/推演流程状态机  state.js 全局状态  audio.js WebAudio音效
  store.js  IndexedDB → localStorage → 内存 三级持久化
data/       courses/ 与 puzzles/（JSON 内容）
scripts/    gen-puzzles.mjs / gen-courses.mjs（固定种子可复现生成器）/ gen-icons.mjs
tests/      node:test 测试（DOM 打桩 helpers/ + 内容自检 content.test.js）
```

## 内容格式

- 课程 `data/courses/courses.json`：`{id,title,level,intro,steps:[explain|demo|guided|quiz]}`
- 题库 `data/puzzles/puzzles.json`：`{id,category(mate1|mate2|endgame|tactic),difficulty,fen,side,solution:[[from,to]...],hint}`
- 所有内容必须通过 `node tests/content.test.js` 的引擎验证（正解合法、杀棋在引擎最强防守下成立）；新增内容后跑生成器与测试即可

## 模式互斥

对局 / 推演 / 复盘 / 学习四种模式共用同一块棋盘，同一时刻只有一种模式占用它（`runtime.boardOwner`）。非 `formal` 期间，正式落子（含延迟落地的 AI 回调）一律被 `applyFormalMove` 拒绝；进入新模式会 `resetAiSession()` 作废在途搜索。控件与路由也有对应的运行期守卫，而不只靠 `disabled`。

## 发布注意

- Service Worker 采用**统一网络优先 + 缓存回退**（v3 起）：在线永远拿到最新资源，缓存仅用于离线兜底；SW 更新接管后会自动刷新已打开的页面。发布时仍建议递增 `sw.js` 的 `CACHE` 版本号以清理历史缓存
- 图标由 `node scripts/gen-icons.mjs` 重新生成（纯 Node PNG 编码，无依赖）
