# MEMORY · 项目记忆

> 面向后续开发者/AI 会话的长期知识:事实速查、约定、踩过的坑。新会话先读这份,能少走弯路。配合 [HANDOFF.md](HANDOFF.md)(交接现状)与 [README.md](README.md)(使用)。

## 1. 引擎事实速查

- 坐标:`r=0` 黑方底线(顶部),`r=9` 红方底线(底部),`c=0..8` 左→右;`idx(r,c)=r*9+c`;棋子大写红 `KABNRCP`、小写黑;`RED='r' BLACK='b'`
- 初始 FEN:`rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w`
- 引擎全部纯函数(`js/engine/`),统一出口 `engine/index.js`;关键 API:
  - `legalMoves(bd, side)` / `isInCheck(bd, side)` / `isDefended(bd, i, side)`(保护判定必须**临时清空该格**再算己方攻击集——己方伪攻击集合永远不含己方占据格,这是修过的系统性 bug,三处同源)
  - `findBestMove(bd, side, {depth,useQ,timeMs,exact,randomWindow,blunderChance})` → `{list:[{m,v}],aborted}`(迭代加深,超时保留上一轮完整结果)
  - `chooseMove` 低档 `blunderChance` 会刻意选损失≥150 的着法
  - `fenToBoard` 会校验(子数上限/九宫/照面),不合法抛中文 Error
  - `hashOf(bd, side)`(Zobrist,确定性种子;key+lock 双 32 位)
- 引擎行为要点:困毙(无子可动)判负(象棋规则,非国际象棋和棋);将帅照面在 `isInCheck` 里按"被攻击"处理;马腿计算在 `pseudoMoves`(N)与 `isInCheck` 各有一份,改规则要同步两处
- 记谱:红方中文数字从右往左(`fileNum=9-c`),黑方阿拉伯数字(`c+1`);同线 3 子前/中/后、4+ 子前/二/三/…/后

## 2. 代码库约定

- **测试风格**:tests/*.test.js 顶层 `let fails=0; ok(cond,msg)`,末尾 `if(fails) throw`;断言全中文描述。涉及 app.js 的测试:先 `import { installDomStub } from './helpers/dom-stub.mjs'; installDomStub();` 再**动态** `await import()`(模块顶层访问 document)
- **跑测试**:`node --test tests/*.test.js`(必须通配符;`node --test tests/` 在 Windows 会把目录当模块名报错)
- **跨模块可变状态**一律挂 `state.js` 的 `runtime` 对象(ESM 导入绑定只读,不能重赋值——曾因此重构)
- **模式互斥**:formal / analysis / review / study 四模式,进入新模式前退出旧的(各自 `exitXxx()`)
- **提交**:中文 message,阶段/主题前缀(如 `阶段2:FEN …`);一个可验证完整单元一个提交
- **发布**:改资源必须递增 `sw.js` 的 `CACHE`(v1 全缓存优先导致过"发版不更新"事故,现导航网络优先,但资源指纹仍靠版本号失效)

## 3. 踩过的坑(按时间)

1. **`applyAnalysisMove` 引用未定义 `rec`**(P0):推演每走一步抛 ReferenceError,状态栏/撤销/建议全失效,测试没覆盖推演路径所以全绿。教训:新路径必须有测试;模块化后此类"全局名误用"被 ESM 作用域根治。
2. **保护判定恒假**(P1):`attackedSquares(己方)` 永不含己方占据格 → `defended` 恒 false,风险/保护提示全错。正确做法的注释就在 `opponentThreats` 里(临时清格),但另外三处没复用——修复时提炼了 `isDefended`。
3. **AI 调度竞态**(P1):`scheduleAi` 的 420ms setTimeout 回调只查 `game.over` 不查世代;窗口内点"重新开始"会让 AI 在新对局错序落子。修复:`runtime.aiEpoch` 世代 + `resetWorker()`。
4. **牵制局面构造测试翻车**:想测"放走白吃车判失误",构造的局面里红车恰被黑车钉在将线上,横移根本不合法 → actual 找不到 → loss 兜底 0。教训:构造战术测试局面先跑 `legalMoves` 确认目标着法存在。
5. **断言子串与文案不一致**:实现文案写"第三次出现",测试断言找"三次重复"——条件三项全真仍 FAIL。教训:断言文案要么引用常量,要么断言更短的公共子串。
6. **SW 缓存优先吞更新**:新加了 `#card-review` 的页面在浏览器里查无此元素——v1 SW 全缓存优先,旧 index.html 一直被返回。修复:导航请求网络优先、缓存兜底;并牢记发布 bump CACHE。
7. **中炮是否将军的迷惑**:炮(7,4)与黑将(0,4)间有黑中卒(3,4)作架,直觉以为将军——但红方中兵(6,4)才是"第一个子"(炮架),黑卒是架后目标。读引擎前先摆子验证,别凭直觉改规则。
8. **Node 测试与浏览器 API**:Worker/location/document 在 Node 各有缺失;client.js 用 `location` 存在性 + `Worker` 存在性双重门槛避免误入 Worker 路径;main.js 只在浏览器加载。

## 4. 内容生产线

- `scripts/gen-puzzles.mjs`:固定种子随机放置少量子 → 引擎验证 mate-in-1/2/残局严格杀(自实现 AND-OR 记忆化求解器)/tactic 净得≥400 → 不合格即抛。**重跑输出 md5 一致**
- `scripts/gen-courses.mjs`:杀法课模板(前 6 题手工构造对应六大杀法主题)+ 残局/开局课,每着过 `legalMoves`
- `tests/content.test.js` 是内容准入门禁:改内容必跑;杀棋验证用 `findBestMove` 且每次 `clearTT()` 保证确定性
- 已知内容细节:闷宫模板曾因"垫士可解将"重构为黑车自堵将门;tactic 首题黑将应(0,4)后红马被照面钉住,解法是红帅先移肋线

## 5. 环境事实

- Windows + Git Bash;Node v24.18(`node --test` 原生,零 npm 依赖装)
- esbuild:`npx -y esbuild`(构建期联网拉一次);`npm run build` 产出 dist(主包 IIFE + worker IIFE 内联为 `window.__XQ_WORKER_SRC` + 课程数据内联为 `window.__XQ_DATA__`)
- ZCode 内置浏览器(IAB)偶发 `browser guest not attached`:多开/重开 tab 可恢复,不可恢复时靠测试覆盖并在交接文档如实记录
- 端口约定:本地开发 8123(serve.mjs 默认)

## 6. 待办池(优先级从高到低)

1. 学习模式 + 执黑翻转的浏览器端到端点击流补测(逻辑已有测试覆盖)
2. 推荐着法 rec-dot → SVG 箭头统一
3. 复盘"深评"升级:损失>150 的手用 depth3 复评;教学分析迁 Worker
4. 内容扩充:更多杀法课(马后炮/天地炮/夹车杀…)、开局库加深、错题本 UI(数据已入库,缺专门列表页)
5. 远期:云同步/账号(当初明确排除在本规划外)
