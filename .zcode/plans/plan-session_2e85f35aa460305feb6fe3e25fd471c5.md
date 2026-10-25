# 中国象棋教学软件 · 工程组织与功能演进计划

## 已确认决策
- 执行前先 git init 建仓:基线提交当前两文件,之后每阶段结束提交一次(用户明确要求)
- 技术栈不变:原生 JS + ES Modules + 浏览器原生 API,**运行时零依赖**
- 分发:开发用模块源码,esbuild(npx,仅构建期)打包出 dist/index.html 保留"双击即玩"
- 内容规模:精华版(约 10 课 + 50 题,由我编写并经引擎自动验证)
- 云同步:暂不纳入(单设备 PWA + IndexedDB)

## 准备步骤(任何代码改动之前)
1. `git init` + .gitignore(dist/、node_modules/、*.log)
2. 提交当前基线(index.html + _engine_test.js,含已完成的全部修复)

## 目标结构
```
Chinese-chess/
├── index.html            # 壳:DOM 骨架 + 引用 css/main.css + <script type="module" src="js/main.js">
├── css/main.css
├── js/
│   ├── engine/           # board.js moves.js eval.js search.js notation.js fen.js levels.js worker.js index.js
│   ├── teach/            # explain.js review.js
│   ├── ui/               # layout.js panels.js interact.js router.js course.js puzzle.js
│   ├── audio.js store.js app.js main.js
├── data/
│   ├── courses/*.json    # 课程(讲解+演示+跟练+习题 四段式)
│   └── puzzles/*.json    # 题库(一步杀/两步杀/残局/战术)
├── tests/*.test.js       # node:test 直接 import 模块
├── manifest.json sw.js icons/
├── package.json          # 仅 scripts + devDependency esbuild
└── build.mjs / serve.mjs # 构建与本地静态服务(serve 为零依赖 node 脚本)
```

## 阶段 0 — 模块化重构(行为不变,测试护航)
1. 按上表把 index.html 内联 JS 平移为模块(代码逐段搬移,不改逻辑):engine(规则/搜索/评估/记谱)、teach/explain(理由/风险/威胁/开局库/诊断)、ui(渲染/交互)、audio、app(game/analysis 状态机与流程)、main(启动+控件绑定);CSS 抽到 css/main.css
2. 引擎纯化:aiChooseMove(side) 现读全局 game.board/game.difficulty → 改为 chooseMove(board, side, opts);UI 层适配。教学分析函数同理去全局化
3. 测试迁移:tests/ 下用 node:test 直接 import,现有 54 条断言全部逐条搬迁;删除 _engine_test.js 的 eval 提取方案
4. engine 模块头部加 // @ts-check + JSDoc 核心类型(Piece/Side/Board/Move)
5. package.json:scripts { build, test, serve };写 serve.mjs(零依赖静态服务);esbuild 打包验证 dist/index.html 可双击运行
- 验收:node --test 全绿(断言数 ≥54);浏览器冒烟(对局/推演/教学三模式 + dist 单文件);git 提交

## 阶段 1 — 引擎 Worker 化 + 棰力分档
1. js/engine/worker.js:协议 {id,type:'search',board,turn,level} → {id,move,score,nodes};{type:'cancel'};主线程 app.js 改 postMessage,aiEpoch 竞态防护保留
2. search.js 增强:Zobrist 哈希 + 置换表 + 迭代加深(时间预算内逐层加深)
3. js/engine/levels.js:8 档参数表 {depth, useQ, timeMs, randomWindow, blunderChance, blunderFilter}——L1 会送子/漏守、L8 最强;难度 UI 改为 8 档选择
- 验收:Zobrist/TT 单测;各档返回合法走法单测;浏览器实测思考期间 UI 不冻结;git 提交

## 阶段 2 — FEN + 存档 + PWA
1. js/engine/fen.js:象棋 FEN 编解码 + 局面合法性校验;推演面板加"复制 FEN / 粘贴局面"入口
2. js/store.js:IndexedDB 封装(games / progress / mistakes 三仓)+ localStorage 降级
3. 对局存档:每步落子自动保存,启动恢复进行中对局;存档列表(载入/删除/导出中文着法串+坐标串)
4. PWA:manifest + Service Worker(app shell 缓存,data JSON 纳入离线);SVG 生成图标
- 验收:FEN 往返单测(初始/随机/边界局面);刷新恢复实测;经 http 访问可安装;git 提交

## 阶段 3 — 复盘报告 + 回放
1. js/teach/review.js:终局后逐手浅评(引擎 exact 模式 depth2 评分差),损失超阈值的手深评一次;标注 好!/一般/?/失误??,失误手附更优着法 + 对方最强应手
2. 复盘界面:棋盘回放控件(|< < > >|),着法列表点击跳转历史局面,评注侧栏
3. 简单统计:对局历史、胜率、平均失误数 → 进度卡片(store.js 持久化)
- 验收:构造已知失误局面验证标注正确;回放跳转/退出实测;git 提交

## 阶段 4 — 课程与题库(精华版内容)
1. js/ui/router.js:hash 路由(#/play #/courses #/courses/:id #/puzzles #/review #/stats)+ 顶栏导航;index.html 增页面骨架
2. 课程 schema:{id,title,level,steps:[{type:'explain'|'demo'|'guided'|'quiz', fen,text,moves,highlights,arrows,quiz:{goal,solution[],hints[]}}]};题库 schema:{id,fen,category,difficulty,solution[],tags}
3. js/ui/course.js 播放器:讲解(棋盘高亮+文字)→ 演示(自动播+解说)→ 跟练(引导走指定着法)→ 习题;SVG 箭头层画推荐路线
4. js/ui/puzzle.js:一步杀/两步杀/残局过关;走法匹配正解 + 引擎扮演对方最强抵抗;错题自动入 mistakes 仓,错题本重练入口
5. 内容编写(我完成):基本杀法 6 课(重炮/闷宫/卧槽马/钓鱼马/铁门栓/双车错)+ 残局定式 2 课 + 开局原理 2 课;50 题按难度分级
6. 测试中加内容自检:逐题用引擎验证正解确实可达且达成目标(一杀 = 强抵抗下将死),不成立的题让测试失败
- 验收:schema 单测 + 全部内容引擎验证通过 + 课程四段式全流程浏览器实测;git 提交

## 阶段 5 — 规则完整性 + 体验打磨
1. 重复局面判和:Zobrist 局面哈希计数三次判和;长将/长捉正式裁决;设置加"正式规则模式"开关(默认教学宽容模式维持现状)
2. 执黑翻转棋盘:渲染层坐标映射 (r,c)→(9-r,8-c) + 输入逆映射(不动 CSS transform,避免与拖拽/动画冲突)
3. 推荐着法 SVG 箭头替代现有 rec-dot 圈选
4. Elo 简版:对 AI 各档位胜负积分,进度页展示曲线
- 验收:重复判和/长将判负单测;翻转模式点击/拖拽实测;git 提交

## 执行节奏与原则
- 顺序:准备步骤 → 0 → 1 → 2 → 3 → 4 → 5,严格串行;每阶段结束时:node --test 全绿 + 浏览器冒烟通过 + git 提交,才进入下一阶段
- 每阶段结束汇报变更清单与验证结果;内容与 schema 在阶段 4 如需微调会先说明理由
- 风险提示:阶段 0 搬移量最大,靠"逐条搬迁断言"保行为不变;esbuild 首次 npx 需联网拉包