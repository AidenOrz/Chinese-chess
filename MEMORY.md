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
- **打桩已具备判别力**:`dom-stub` 的 `classList`(add/remove/toggle/contains)、`className`、`children`、`innerHTML` 都是**真记账**的,`appendChild` 会记录子元素——"卡片被收起""数字位置"这类断言因此真的会失败。写新断言别退回去检查 `disabled` 这类可被脚本绕过的表象
- **跑测试**:`npm test`(= `node --test "tests/*.test.js"`,必须通配符且加引号;`node --test tests/` 在 Windows 会把目录当模块名报 MODULE_NOT_FOUND)
- **跨模块可变状态**一律挂 `state.js` 的 `runtime` 对象(ESM 导入绑定只读,不能重赋值——曾因此重构)
- **模式互斥**:formal / analysis / review / study 四模式共用主棋盘,由 `runtime.boardOwner` 标记当前占用者。进入新模式前退出旧的(各自 `exitXxx()`)并 `resetAiSession()`;`applyFormalMove` 与 `scheduleAi` 都校验 owner,非 `formal` 一律不落子。**新增模式必须同时接入这两处**,否则 AI 回调会写到别人的棋盘上
- **改 `game.board` 的路径必须紧跟视觉复位**:`renderAllPieces()` + 清 `ui.lastMove/selected/targets`。曾漏在 `startQuiz`(课程跟练→习题时棋盘停在旧局面、点子无反应);`setBoardFromFen` 是现成范本
- **布局几何**:棋盘边距/列号位置一律走 `layout.js` 的 `padFor(S)/numFont(S)/pieceR(S)`,不要另起固定比例;改完必须跑 `tests/layout.test.js`(它逐档核对 `S=30..58`)`+ 真实浏览器量 `getBoundingClientRect`,`npm test` 全绿不代表渲染正确
- **分数只有两种口径,别混用**:引擎返回的 `v` 是**绝对评估**(走子方视角的局面分,落后时为负);用户该看的是 `gap = 最佳v - 该着v`(恒 ≥ 0)。面板/走子评价一律用 `formatGap(gap)` 与 `buildRecommendations(…).gaps`,**不要直接显示 `v`**。判断走子好坏也用 gap,不能用 `v <= 阈值`(落后方任何着法的 v 都很小)
- **提交**:中文 message,阶段/主题前缀(如 `阶段2:FEN …`);一个可验证完整单元一个提交
- **发布**:SW(v3 起)统一网络优先+缓存回退,在线永远最新,离线兜底可用;发布时仍建议递增 `sw.js` 的 `CACHE` 清理历史缓存(两次事故都出在"缓存优先+版本号纪律"上,详见坑 6/9)

## 3. 踩过的坑(按时间)

1. **`applyAnalysisMove` 引用未定义 `rec`**(P0):推演每走一步抛 ReferenceError,状态栏/撤销/建议全失效,测试没覆盖推演路径所以全绿。教训:新路径必须有测试;模块化后此类"全局名误用"被 ESM 作用域根治。
2. **保护判定恒假**(P1):`attackedSquares(己方)` 永不含己方占据格 → `defended` 恒 false,风险/保护提示全错。正确做法的注释就在 `opponentThreats` 里(临时清格),但另外三处没复用——修复时提炼了 `isDefended`。
3. **AI 调度竞态**(P1):`scheduleAi` 的 420ms setTimeout 回调只查 `game.over` 不查世代;窗口内点"重新开始"会让 AI 在新对局错序落子。修复:`runtime.aiEpoch` 世代 + `resetWorker()`。
4. **牵制局面构造测试翻车**:想测"放走白吃车判失误",构造的局面里红车恰被黑车钉在将线上,横移根本不合法 → actual 找不到 → loss 兜底 0。教训:构造战术测试局面先跑 `legalMoves` 确认目标着法存在。
5. **断言子串与文案不一致**:实现文案写"第三次出现",测试断言找"三次重复"——条件三项全真仍 FAIL。教训:断言文案要么引用常量,要么断言更短的公共子串。
6. **SW 缓存优先吞更新**:新加了 `#card-review` 的页面在浏览器里查无此元素——v1 SW 全缓存优先,旧 index.html 一直被返回。修复:导航请求网络优先、缓存兜底;并牢记发布 bump CACHE。
7. **中炮是否将军的迷惑**:炮(7,4)与黑将(0,4)间有黑中卒(3,4)作架,直觉以为将军——但红方中兵(6,4)才是"第一个子"(炮架),黑卒是架后目标。读引擎前先摆子验证,别凭直觉改规则。
8. **Node 测试与浏览器 API**:Worker/location/document 在 Node 各有缺失;client.js 用 `location` 存在性 + `Worker` 存在性双重门槛避免误入 Worker 路径;main.js 只在浏览器加载。
9. **SW 资源 cache-first 二次吞更新**(用户实报"课程题库点击无反应"):v2 时期资源仍缓存优先、版本号没随阶段 4 代码递增 → 浏览器拿到**新 index.html + 旧 main.js**(旧 JS 无路由),hash 变了但页面纹丝不动,且无任何报错。诊断特征:手动 `dispatchEvent(hashchange)` 也无反应 = 监听器没注册 = 运行的 JS 是旧的;`fetch('js/main.js')` 拿到的源码不含新符号即可实锤。修复:统一网络优先+缓存回退,activate 时 `clients.navigate` 令旧页面自动重载一次。教训:**无文件名哈希的资源永远不要 cache-first**。
10. **AI 回调毒化学习棋盘**(P0,2026-10):`scheduleAi` 的回调只靠 `aiEpoch` 防过期,而 `startStudy` 既不递增世代也不 `resetWorker`,更不查 `game.thinking`——玩家走子后 5 秒内点开一道题,回调就在题面上落子。实测 60 个自然样本(50 题 + 10 课)**全部**写入幻影着法,23/50 误判终局并弹"获胜",5/10 课把 `current` 存档删掉,战绩与 Elo 被写脏,退出学习后正式对局还带着 `over=true`。修复:引入 `runtime.boardOwner` + `resetAiSession()`,并让 `study.snapshot` 一并快照 `over/resultTitle/noCapture/checkStreak/posCounts`。四条防线缺一不可:owner 守卫、世代递增、thinking 复位、快照补全。
11. **`thinking` 永久卡死**(P0,同批):`loadArchiveGame` 递增 `aiEpoch` 却不清 `game.thinking`,而过期回调在 `epoch !== aiEpoch` 处直接 `return`,第 121 行的 `thinking = false` 永远执行不到。AI 思考中点"载入存档"→ 全盘按钮永久禁用、棋盘点不动,唯一自救是靠改 `sel-mode` 触发 `startGame`。教训:**"作废回调"的分支必须自带收尾**,不能把收尾逻辑放在回调的正常路径里。
12. **课程/题库嵌套进入拍错快照**(P1,同批):路由切到列表页不退出学习,`startStudy` 直接覆盖 `runtime.study`,`st.snapshot` 拍到的是课程 A 的棋盘;退出课程 B 后正式对局变成 A 的残局,而 `moveHistory` 还是正式着法。旧会話的 `timers` 也随之失联,`stopTimers` 清不掉,两条演示定时器链叠加会倍速走子。修复:`startStudy` 先 `teardownStudy()`(还原快照 + 清定时器,不动 hash),课程/题库进入与异步回调都带 `sessionId` 令牌。
13. **复盘漏锁 `btn-new`**(P1,同批):`updateButtons` 里 `btn-undo/btn-analysis/btn-review-live` 都有 `inReview`,`btn-new` 漏了,而 `enterReview` 手动 disable 会被随后的 `reviewGo → updateAll → updateButtons` 立刻覆盖回来。复盘中点"新对局"→ `startGame` 清空 `moveHistory` → 退出复盘又用旧 `boards` 盖回棋盘,得到"旧终局棋盘 + 空着法列表"。修复:`updateButtons` 补 `inReview`,`sel-*` 与 `btn-new` 统一由 `setPlayControlsLocked`/`updateButtons` 管理,并在 `main.js` 加运行期守卫(**`disabled` 不是防线**,脚本化点击照样触发)。
14. **棋盘列号被棋子完全遮挡**(P2):`pad = round(S*0.72)`,列号固定在 `pad*0.5`;而首行棋子圆盘上沿在 `pad-0.43S`——S=56 时净空隙只有 0.29S,15px 字形有 11.6px 压在棋子底下,而首行 9 列全有子,等于 18 个列号全废。修复:边距改由几何反推 `padFor(S)=0.43S+6+字号+6`,并把列号放到"外框内壁与棋子圆盘之间"那段空隙的中点。教训:**布局常量别按 S 拍脑袋给比例**,写成 `padFor(S)` 后再用测试逐档核对不变式。
15. **侧栏复盘面板被顶出首屏**(P2):`#card-review` 排在侧栏 6 张卡之后,而棋盘在左列且不随滚动移动,进复盘必须滚动才能看到面板,于是"一边看棋盘一边看复盘"根本做不到。修复:复盘卡移到侧栏首位 + `position: sticky` 吸顶,并在复盘期间收起教学/走棋记录/存档(`.rev-hidden`)。教训:**同一视图里要并看的两块内容,不能靠 DOM 顺序碰运气**。
16. **移动端 `innerWidth` ≠ 布局视口**(P2,改布局时新发现):`computeLayout` 只读 `window.innerWidth`。CDP 模拟 400px 宽手机时 `innerWidth` 报 438,按它算出的棋盘 474px 比视口宽 74px,页面横向溢出、棋盘被裁。修复:取 `min(innerWidth, documentElement.clientWidth)`,并让 `fitBoardS` 在放不下时继续收格宽而不是死守下限。教训:**纯逻辑单测永远发现不了这类问题**,改渲染必须用真实浏览器量 `getBoundingClientRect` + `scrollWidth`。
17. **落后时"下什么都扣分"**(P1,用户实报):教学面板把搜索的**绝对评估** `v` 当成"这一步好不好"显示。`v` 是走子方视角的局面分,落后时必然全为负——实测对最强 AI 落后 10 分以上(少一车一马一炮)时,32 个合法着法**无一为正**,三个推荐全显示 `(-17.6)`,用户看到的是"怎么下都错";真相是那三步并列最佳(`gap=0`)。修复:新增 `gap = 最佳v - 该着v`(恒 ≥ 0,<50 显示"最佳",否则"差 N 兵"),面板/推演/走子评价全部改用 gap;另加 `positionVerdict`(把绝对分翻译成"你方已近败势"+子力差异)与 `losingPlan`(落后时好棋的标准:忌兑子、制造不确定、目标降级为守和)。教训:**"评分"必须区分「绝对实力」与「这一步的相对质量」**,前者落后时全负是正确行为,错在拿它当后者展示。
18. **`npm test` 在 Windows 不可用**(P1,同批):`node --test tests/` 把目录当模块名,报 `MODULE_NOT_FOUND`;`README` 却承诺可用。改 `node --test "tests/*.test.js"`(引号防 shell 展开,Node 自身 glob)后 12 文件全绿。教训:文档里写的命令要真的跑一遍。
19. **测试打桩的假通过**(P1,同批):`dom-stub` 的 `addEventListener` 原本是空函数,`element.dispatchEvent('click')` 也不会触达监听器——"点击被拦截"这类断言写出来永远是绿的,因为 handler 根本没执行。修打桩时要同时让 `addEventListener` 记账、`dispatchEvent` 传**事件对象**(不是字符串),否则回归测试形同虚设。
20. **study.js 漏导入 `analysis`**(P0,被坑 9 掩盖):SW 修好后课程/题库点击仍无反应——`startStudy` 首行 `if (analysis.active)` 抛 ReferenceError,async 函数静默 reject,无 toast 无控制台报错(除非预先挂 unhandledrejection 监听)。这正是 HANDOFF 里"学习模式 e2e 未实测"想抓的真 bug。教训:异步事件处理器失败是**静默**的,排点击无反应先挂 `unhandledrejection` 收集器;未实测的路径优先补测。同期还发现 explain 步 `courseButtons(false)` 是死胡同(无"下一步"),已改 true。

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

1. 执黑翻转的浏览器端到端点击流补测(学习模式 e2e 已于 2026-10 完成:四段式+题库+Worker 应手全通)
2. 推荐着法 rec-dot → SVG 箭头统一
3. 复盘"深评"升级:损失>150 的手用 depth3 复评;教学分析迁 Worker
4. 内容扩充:更多杀法课(马后炮/天地炮/夹车杀…)、开局库加深、错题本 UI(数据已入库,缺专门列表页)
5. 远期:云同步/账号(当初明确排除在本规划外)
