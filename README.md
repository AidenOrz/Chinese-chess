# 中国象棋 · 教学软件

原生 JavaScript + ES Modules 的中国象棋教学应用：对局、教学、推演、复盘、课程与题库一体化。**运行时零依赖**，支持单文件分发与 PWA 离线使用。

## 功能

- **对局**：人机（8 档棋力，弱档会"送子"模拟初学者）/ 双人；中文记谱；走棋记录；执黑自动翻转棋盘
- **教学**：推荐走法（思路 / 风险 / 预计应手）、走子即时评价、AI 意图解释、局面诊断、非法走法人话提示
- **推演**：任意一方试走不影响正式对局；FEN 导入导出
- **复盘**：终局/进行中逐手评分标注（好棋/一般/疑问/失误+更佳着法），点击跳步回放，失误统计
- **课程**：基本杀法 / 残局 / 开局原理，讲解 → 演示 → 跟练 → 习题四段式
- **题库**：一步杀 / 两步杀 / 残局 / 战术，引擎扮演最强防守，错题自动收录
- **规则**：将帅照面/蹩马腿/塞象眼/困毙等全规则；可选"正式规则"（三次重复判和、长将判负）
- **持久化**：IndexedDB 自动存档、刷新恢复对局、存档列表、Elo 积分；PWA 可安装离线

## 常用命令

```bash
npm test     # node --test 运行全部测试（引擎/规则/FEN/复盘/内容校验）
npm run serve # 本地静态服务 http://127.0.0.1:8123/（开发用，ES Modules 需 http）
npm run build # esbuild 打包出 dist/index.html（双击即玩，含内联引擎 Worker 与课程数据）
```

- 开发：`npm run serve` 后访问 http://127.0.0.1:8123/
- 分发：把 `dist/index.html` 单个文件发给使用者即可

## 工程结构

```
js/
  engine/   规则(moves)/评估(eval)/搜索(search: αβ+迭代加深+Zobrist置换表)/
            记谱(notation)/FEN(fen)/棋力分档(levels)/引擎Worker(worker+client)
  teach/    explain.js 教学解释（纯函数）/ review.js 复盘评分
  ui/       layout 棋盘渲染(+SVG箭头层+翻转) / panels 面板 / interact 指针交互 /
            study 学习模式 / review 复盘 / lists 课程题库列表 / router hash路由
  app.js    对局/教学/推演流程状态机   state.js 全局状态   audio.js WebAudio音效
  store.js  IndexedDB → localStorage → 内存 三级持久化
data/       courses/ 与 puzzles/（JSON 内容，tests/content.test.js 引擎验证）
tests/      node:test 测试（含 DOM 打桩与内容自检）
```

## 内容格式

- 课程 `data/courses/courses.json`：`{id,title,level,intro,steps:[explain|demo|guided|quiz]}`
- 题库 `data/puzzles/puzzles.json`：`{id,category(mate1|mate2|endgame|tactic),difficulty,fen,side,solution:[[from,to]...],hint}`
- 所有内容必须通过 `node tests/content.test.js` 的引擎验证（正解可达、杀棋在最强防守下成立）

## 发布注意

- 改动资源后构建发布请更新 `sw.js` 中的 `CACHE` 版本号
- 图标由 `node scripts/gen-icons.mjs` 生成（纯 Node PNG 编码，无依赖）
