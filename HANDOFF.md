# HANDOFF · 交接文档

> 最后更新:阶段 0~5 全部完成后的收尾交接。配合 [README.md](README.md)(使用)与 [MEMORY.md](MEMORY.md)(长期知识)阅读。

## 1. 项目现状快照

**一句话**:中国象棋教学软件已完成规划的全部六个阶段,10 个提交,9 个测试文件全绿,dist 单文件可分发。

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
- 单元/集成:9 文件全绿(含 37 项内容断言;`npm test`)
- 浏览器实测已通过:对局/推演/复盘/刷新恢复/FEN 导入导出/Worker 思考期不冻结(点击 25ms 响应)/8 档选择/dist 单文件
- **未完成项**:学习模式(课程四段式)与执黑翻转的浏览器端到端点击流未实测(当时浏览器面板反复掉线);其逻辑有测试覆盖且与已实测模块同构。接手后建议:`npm run serve` → 课程页点完一课 → 执黑开一局确认翻转。

## 2. 核心架构决策(为什么是这样)

1. **单棋盘 + 快照隔离的"模式"架构**。推演(analysis)、复盘(review)、学习(study)都复用主棋盘,进入时各自快照 `game.board/turn`,退出还原,不触碰正式对局 `moveHistory`。四种模式互斥,进入前互相退出(app.js / ui/review.js / ui/study.js)。
2. **引擎纯函数化**。`js/engine/*` 不读任何全局状态:`chooseMove(board, side, opts)`;难度档位参数由 UI 层 `aiOpts()` 从 `game.difficulty` 查 `LEVELS` 表组装。这是引擎能进 Worker、能在 node:test 直测的前提。
3. **跨模块可变标量收纳在 `runtime` 对象**(`js/state.js`)。ESM 导入绑定只读、不能跨模块重赋值,所以 `teachCtx / aiEpoch / review / study` 都是 `runtime` 的字段。新增同类状态照此办理。
4. **引擎 Worker 双路**(`js/engine/client.js`):开发环境用模块 Worker(`new Worker(new URL('./worker.js', import.meta.url), {type:'module'})`);dist 由 build.mjs 把 worker 打包成 IIFE 内联为 `window.__XQ_WORKER_SRC`,运行时 Blob URL 创建(经典 Worker,file:// 也可用)。任何失败(不支持/脚本 404/超时)看门狗回退主线程同步搜索,保证可用性。
5. **存储三级降级**(IndexedDB → localStorage → 内存,`js/store.js`):Node 测试自动落内存档,可直接测存储逻辑。三仓:games(存档,含进行中 `current`)、progress(键值:stats/elo/course-*/puzzles-done)、mistakes(错题)。
6. **内容即数据 + 引擎验证**:课程/题库是纯 JSON,`tests/content.test.js` 用引擎逐题验证(杀棋必须在引擎最强防守下成立)。生成器 `scripts/gen-puzzles.mjs / gen-courses.mjs` 固定随机种子,重跑 md5 一致,可安全重生成。
7. **Service Worker 策略**:导航请求网络优先(保证更新及时)+ 静态资源缓存优先(离线)。教训:v1 曾全缓存优先,导致发版后用户一直看到旧页面。**发布必改 `CACHE` 版本号**。
8. **执黑翻转 = layout 层坐标映射** `(r,c)→(9-r,8-c)`(对合映射,渲染与输入逆映射同函数),不用 CSS transform——避免与拖拽/动画/棋子字面冲突。`syncFlipped()` 在 startGame/载入存档时按 `mode==='pva' && humanSide===BLACK` 设定。
9. **棋力分档的教学取向**(`js/engine/levels.js`):弱档靠 `blunderChance`(概率选损失≥150 的着法)+ 大 `randomWindow`,强档深度/时限递增。教学对手要点是"在恰当水平犯恰当的错"。
10. **AI 调度竞态防护**:`runtime.aiEpoch` 世代计数,`startGame` 时 `aiEpoch++` 并 `resetWorker()`,过期回调直接丢弃。这是修复过的真实 bug(420ms 延时窗口内重开会导致 AI 在新对局错序落子)。

## 3. 已知问题与取舍

- 推荐着法高亮仍是 rec-dot 圆圈(带序号),SVG 箭头目前只用于学习模式 explain/demo;若要统一为箭头,改 `ui/layout.js` 的 `renderHints()` 复用 `renderStudyMarks` 的箭头绘制即可(注意 clearStudyMarks 的层归属)。
- 长将判负阈值取"连续 6 次将军"(正式规则模式),三次重复按"局面+走子方"哈希计数(含初始局面);均可在 `app.js` 终局判定块调整。
- dist 单文件(file://)无 PWA/无 fetch,PWA 与课程数据 http 部署根目录才完整;dist 已内联课程数据所以功能不缺。
- 复盘评分用 depth2 全窗口逐手打分(分块 120ms/片防卡顿),超深评价可选做"损失>150 的手用 depth3 复评"。
- 教学分析(opponentThreats 等)每回合在主线程同步跑(depth2 + 1500ms 预算),极端局面可能有轻微卡顿;如需也可迁 Worker。

## 4. 如何继续开发

**加题/加课**:
1. 改 `scripts/gen-puzzles.mjs`(或手写 JSON,遵守 README 内容格式)
2. `node scripts/gen-puzzles.mjs && npm test`——content.test.js 会拒收任何引擎验证不过的内容
3. `npm run build` 重新内联数据

**加功能**:按模块归属改动;UI 流程进 `app.js`/`ui/*`;引擎保持纯函数;跨模块新状态加到 `runtime`;测试跟随(风格:顶层 `ok()` 收集 + 末尾 throw,见任意现有测试)。

**测试注意**:涉及 app.js 的测试必须先 `installDomStub()` 再**动态 import**(模块顶层就访问 document);`node --test tests/*.test.js` 用通配符(目录参数在 Windows 解析有问题)。

**提交约定**:中文 commit message,阶段/主题前缀;每个可验证的完整单元一个提交。

## 5. 环境

- Windows + Git Bash,Node v24(`node --test` 内置,无需装任何依赖)
- esbuild 仅构建期经 `npx -y esbuild` 使用,不进 node_modules(构建需联网拉包一次)
- 本地服务:`npm run serve`(serve.mjs,零依赖)
