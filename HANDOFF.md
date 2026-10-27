# HANDOFF · 交接文档

> 最后更新:阶段 0~5 全部完成后的收尾交接。配合 [README.md](README.md)(使用)与 [MEMORY.md](MEMORY.md)(长期知识)阅读。

## 1. 项目现状快照

**一句话**:中国象棋教学软件已完成规划的全部六个阶段,14 个测试文件全绿,dist 单文件可分发。

| 阶段 | 内容 | commit |
|---|---|---|
| 基线 | 单文件应用(含 5 项缺陷修复) | `0d5a003` |
| 0 | ES Modules 模块化 + node:test + esbuild 构建 | `091784f` |
| 1 | 引擎 Worker 化 + Zobrist 置换表 + 迭代加深 + 8 档棋力 | `313b0a5` |
| 2 | FEN + IndexedDB 三级存储/自动存档/刷新恢复 + PWA | `270dca6` |
| 3 | 复盘模式(逐手评分/回放/统计) + SW 网络优先修复 | `20370c2` |
| 4 框架 + 5 | 路由/学习模式/错题本/箭头层/执黑翻转/正式规则/Elo | `09ae577` |
| 4 内容 | 50 题 + 10 课(引擎验证) + 内容自检测试 | `2a47c0a` |

**验证状态**:
- 单元/集成:14 文件全绿(含 37 项内容断言;`npm test`)
- 浏览器实测已通过:对局/推演/复盘/刷新恢复/FEN 导入导出/Worker 思考期不冻结(点击 25ms 响应)/8 档选择/dist 单文件
- 学习模式端到端已实测通过(2026-10 修复后):课程四段式全程(讲解→演示自动播放→跟练识别→习题解答→完成标记)+ 题库点击/两步杀(含 Worker 应手)。执黑翻转的点击流仍未单独实测,逻辑有 layout 映射单测覆盖。

## 2. 核心架构决策(为什么是这样)

1. **单棋盘 + 快照隔离的"模式"架构**。推演(analysis)、复盘(review)、学习(study)都复用主棋盘,进入时各自快照,退出还原,不触碰正式对局 `moveHistory`。四种模式互斥,进入前互相退出(app.js / ui/review.js / ui/study.js),并由 `runtime.boardOwner` 标记当前占用者。学习模式的快照不止 `board/turn`,还包括 `over/resultTitle/resultDesc/noCapture/checkStreak/posCounts`——少任何一个,退出学习后正式对局都会带着学习期间的终局/判和状态。
2. **引擎纯函数化**。`js/engine/*` 不读任何全局状态:`chooseMove(board, side, opts)`;难度档位参数由 UI 层 `aiOpts()` 从 `game.difficulty` 查 `LEVELS` 表组装。这是引擎能进 Worker、能在 node:test 直测的前提。
3. **跨模块可变标量收纳在 `runtime` 对象**(`js/state.js`)。ESM 导入绑定只读、不能跨模块重赋值,所以 `teachCtx / aiEpoch / review / study` 都是 `runtime` 的字段。新增同类状态照此办理。
4. **引擎 Worker 双路**(`js/engine/client.js`):开发环境用模块 Worker(`new Worker(new URL('./worker.js', import.meta.url), {type:'module'})`);dist 由 build.mjs 把 worker 打包成 IIFE 内联为 `window.__XQ_WORKER_SRC`,运行时 Blob URL 创建(经典 Worker,file:// 也可用)。任何失败(不支持/脚本 404/超时)看门狗回退主线程同步搜索,保证可用性。
5. **存储三级降级**(IndexedDB → localStorage → 内存,`js/store.js`):Node 测试自动落内存档,可直接测存储逻辑。三仓:games(存档,含进行中 `current`)、progress(键值:stats/elo/course-*/puzzles-done)、mistakes(错题)。
6. **内容即数据 + 引擎验证**:课程/题库是纯 JSON,`tests/content.test.js` 用引擎逐题验证(杀棋必须在引擎最强防守下成立)。生成器 `scripts/gen-puzzles.mjs / gen-courses.mjs` 固定随机种子,重跑 md5 一致,可安全重生成。
7. **Service Worker 策略(v3 起统一网络优先)**:所有同源 GET 网络优先、缓存仅离线回退;SW 更新接管(activate)时会 `clients.navigate` 令已打开页面自动重载。教训两次:v1 全缓存优先发版不更新;v2 时期"资源 cache-first + 忘记 bump 版本号"导致浏览器拿到新 index.html 配旧 main.js(表现为课程/题库点击无反应,旧 JS 没有路由)。发布仍建议递增 `CACHE` 清理历史缓存。
8. **执黑翻转 = layout 层坐标映射** `(r,c)→(9-r,8-c)`(对合映射,渲染与输入逆映射同函数),不用 CSS transform——避免与拖拽/动画/棋子字面冲突。`syncFlipped()` 在 startGame/载入存档时按 `mode==='pva' && humanSide===BLACK` 设定。
9. **棋力分档的教学取向**(`js/engine/levels.js`):弱档靠 `blunderChance`(概率选损失≥150 的着法)+ 大 `randomWindow`,强档深度/时限递增。教学对手要点是"在恰当水平犯恰当的错"。
10. **教学评分口径 = 与最佳着的差距,不是绝对评估**(`js/teach/explain.js` 的 `formatGap`/`buildRecommendations.gap`)。搜索返回的 `v` 是走子方视角的**绝对**局面分,落后时必然全为负;把它当"这一步好不好"显示,会让用户看到"下什么都扣分"(实测对最强 AI 落后 10 分以上时,32 个合法着法无一为正,三个推荐全部显示 `(-17.6)`,其实它们并列最佳)。`gap = 最佳v - 该着v` 恒 ≥ 0,<50 显示"最佳"、否则"差 N 兵"。**新增任何展示分数的地方都必须用 gap,不要用 v**;判断着法好坏(如 `onHumanMoved`)同理。配套 `positionVerdict`(绝对分→人话+子力差异)与 `losingPlan`(落后时好棋的标准)。
11. **AI 调度竞态防护**:`runtime.aiEpoch` 世代计数 + `runtime.boardOwner` 棋盘归属。任何接管棋盘的模式(`startGame`/`loadArchiveGame`/`startStudy`/`enterReview`)都走 `resetAiSession()`(`aiEpoch++` + `resetWorker()` + `thinking=false`),并改写 owner;非 `formal` 期间 `applyFormalMove` 直接拒绝,过期回调也绝不落子。这是修复两轮真实 bug 后收敛的方案——第一轮(仅 aiEpoch)漏掉了学习模式入口,第二轮(仅 owner)漏掉了 thinking 复位。

## 3. 已知问题与取舍

- 推荐着法高亮仍是 rec-dot 圆圈(带序号),SVG 箭头目前只用于学习模式 explain/demo;若要统一为箭头,改 `ui/layout.js` 的 `renderHints()` 复用 `renderStudyMarks` 的箭头绘制即可(注意 clearStudyMarks 的层归属)。
- 长将判负阈值取"连续 6 次将军"(正式规则模式),三次重复按"局面+走子方"哈希计数(含初始局面);均可在 `app.js` 终局判定块调整。
- dist 单文件(file://)无 PWA/无 fetch,PWA 与课程数据 http 部署根目录才完整;dist 已内联课程数据所以功能不缺。
- 复盘评分用 depth2 全窗口逐手打分(分块 120ms/片防卡顿),超深评价可选做"损失>150 的手用 depth3 复评"。
- 教学分析(opponentThreats 等)每回合在主线程同步跑(depth2 + 1500ms 预算),极端局面可能有轻微卡顿;如需也可迁 Worker。
- `game.thinking` 是"正式对局 AI 正在思考"的全局标志,学习/复盘/推演期间恒为 false(进模式即 `resetAiSession()`)。新增接管棋盘的入口时必须调用它,否则会出现"AI 思考中"的幽灵状态锁死全部按钮。
- 复盘没有独立页面,路由跳转时会自动 `exitReview()`;学习模式则可以跨页面存活(从列表切走再进新课程时 `startStudy` 会先 `teardownStudy()`)。
- **棋盘边距由几何反推,不是固定比例**:`padFor(S) = 棋子半径 0.43S + 外缘环 6px + 字号 0.24S + 6px`。曾用 `round(S*0.72)`,净空隙只有 `0.29S`,把列号压进棋子圆盘(15px 字形被挡 11.6px);首行 9 列全有子,等于列号全部不可见。改 `S`/棋子尺寸/字号时,`tests/layout.test.js` 会逐档核对 `S=30..58` 的不变式。
- `computeLayout` 的可用宽度取 `min(innerWidth, documentElement.clientWidth)`。移动端 `innerWidth` 可能大于布局视口(缩放/滚动条),只按 `innerWidth` 算会让棋盘比视口还宽、页面横向被裁。
- 复盘卡放在侧栏首位并 `position: sticky`,同时收起教学/走棋记录/存档三张卡(`.rev-hidden`)。此前它排在 6 张卡之后,一进复盘就被顶出首屏,与左列固定的棋盘凑不到一起看。

## 4. 如何继续开发

**加题/加课**:
1. 改 `scripts/gen-puzzles.mjs`(或手写 JSON,遵守 README 内容格式)
2. `node scripts/gen-puzzles.mjs && npm test`——content.test.js 会拒收任何引擎验证不过的内容
3. `npm run build` 重新内联数据

**加功能**:按模块归属改动;UI 流程进 `app.js`/`ui/*`;引擎保持纯函数;跨模块新状态加到 `runtime`;测试跟随(风格:顶层 `ok()` 收集 + 末尾 throw,见任意现有测试)。

**测试注意**:涉及 app.js 的测试必须先 `installDomStub()` 再**动态 import**(模块顶层就访问 document)。`npm test` 用的是 `node --test "tests/*.test.js"`(引号防 shell 展开,由 Node 自身 glob 处理);**目录参数 `node --test tests/` 在 Windows 会把目录当模块名报 MODULE_NOT_FOUND**,不要改回去。

**提交约定**:中文 commit message,阶段/主题前缀;每个可验证的完整单元一个提交。

## 5. 环境

- Windows + Git Bash,Node v24(`node --test` 内置,无需装任何依赖)
- esbuild 仅构建期经 `npx -y esbuild` 使用,不进 node_modules(构建需联网拉包一次)
- 本地服务:`npm run serve`(serve.mjs,零依赖)
