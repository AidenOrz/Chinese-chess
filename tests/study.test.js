// 学习模式入口回归：课程/习题进入与解题全链路不抛错
// （曾因 study.js 漏导入 analysis，点击课程/习题全部静默失败，测试放行——此文件即锁住该类 bug）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();

const here = dirname(fileURLToPath(import.meta.url));
const courses = JSON.parse(readFileSync(join(here, '..', 'data', 'courses', 'courses.json'), 'utf8'));
const puzzles = JSON.parse(readFileSync(join(here, '..', 'data', 'puzzles', 'puzzles.json'), 'utf8'));
globalThis.window.__XQ_DATA__ = { courses, puzzles };   // 走 dist 同款数据注入路径

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok - ' + m); else { fails++; console.log('  FAIL - ' + m); } };

console.log('=== 学习模式入口测试 ===');
const { enterStudyCourse, enterStudyPuzzle, exitStudy, tryStudyMove } = await import('../js/ui/study.js');
const { runtime, game, ui } = await import('../js/state.js');

// ---- 课程进入（曾在此抛 ReferenceError: analysis is not defined）----
{
  await enterStudyCourse('mate-chongpao');
  ok(runtime.study && runtime.study.kind === 'course', '课程进入 startStudy 成功');
  ok(runtime.study.phase === 'explain', '首步为讲解');
  ok(runtime.study.course.steps.length === 4, '课程步骤数正确');
  await exitStudy();
  ok(!runtime.study, '退出学习清理上下文');
}

// ---- 习题进入 + 一步杀解题 ----
{
  ui.lastMove = { from: 1, to: 2 }; ui.selected = 3;   // 模拟上一阶段（跟练）残留的视觉状态
  await enterStudyPuzzle('m1-001');
  ok(runtime.study && runtime.study.kind === 'puzzle' && runtime.study.phase === 'quiz', '习题进入 quiz 阶段');
  ok(game.board[51] === 'C', '习题局面按 FEN 载入（51 位红炮）');
  ok(!ui.lastMove && ui.selected === -1, '习题开始清空上一手高亮/选中（棋盘视觉复位）');
  tryStudyMove(51, 49);   // 正解：炮三平五，重炮杀
  ok(runtime.study.phase === 'quiz-done', '一步杀解答成功进入 quiz-done');
  await exitStudy();
}

// ---- 错误着法不崩并保持 quiz 阶段 ----
{
  await enterStudyPuzzle('m1-001');
  tryStudyMove(51, 47);   // 非正解
  ok(runtime.study.phase === 'quiz' && runtime.study.wrong === 1, '错误着法计错且流程不中断');
  await exitStudy();
}

// ---- 回归：AI 思考中进入题库，不得把幻影着法写到题面上 ----
// 旧行为：scheduleAi 只靠 aiEpoch 防过期，startStudy 不递增世代也不 resetWorker，
// 5 秒搜索窗口内点开一道题，AI 回调就在题面上落子（60/60 复现），并可能误判终局、清掉题面棋子。
{
  const { BLACK } = await import('../js/engine/index.js');
  const { boardToFen } = await import('../js/engine/fen.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { startGame } = await import('../js/app.js');

  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = '8';
  startGame();                                   // 玩家执黑，AI(红) 开始思考
  ok(game.thinking === true, '（前置）AI 已进入思考');
  await enterStudyPuzzle('m1-001');
  const fen0 = boardToFen(game.board, 'b');
  const squares0 = game.board.filter(Boolean).length;
  const hist0 = game.moveHistory.length;
  ok(runtime.boardOwner === 'study', '进入学习后棋盘归属切到 study');
  ok(game.thinking === false, '进入学习后 thinking 被复位（不再显示 AI 思考中）');
  await sleep(6200);                             // 越过 8 档 5s 搜索 + 420ms 节奏窗口
  ok(boardToFen(game.board, 'b') === fen0, '题面棋盘未被 AI 回调改动');
  ok(game.board.filter(Boolean).length === squares0, '题面棋子数未变（没有被清子）');
  ok(game.moveHistory.length === hist0, '幻影着法未写入正式着法栈');
  ok(game.over === false, '学习期间未误判终局');
  ok(runtime.study.phase === 'quiz', '学习会话仍在 quiz 阶段');
  await exitStudy();
  ok(runtime.boardOwner === 'formal', '退出学习后棋盘归属回到 formal');
}

// ---- 回归：退出学习后若轮到 AI，必须重新接管 ----
{
  const { BLACK, legalMoves } = await import('../js/engine/index.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const { startGame } = await import('../js/app.js');

  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = '1';
  startGame();
  await enterStudyPuzzle('m1-001');
  await exitStudy();
  ok(game.turn !== game.humanSide, '（前置）退出学习后轮到 AI');
  ok(game.thinking === true, '退出学习后 AI 被重新调度');
  await sleep(2600);
  ok(game.moveHistory.length >= 1, 'AI 确实在退出学习后继续行棋（实际 ' + game.moveHistory.length + ' 步）');
}

// ---- 回归：课程 A → 列表 → 课程 B，快照不得拍到学习棋盘 ----
{
  const { initialBoard } = await import('../js/engine/index.js');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  game.mode = 'pvp'; game.board = initialBoard(); game.turn = 'r'; game.moveHistory = [];
  const formalSquares = game.board.filter(Boolean).length;
  await enterStudyCourse('mate-chongpao');
  await enterStudyCourse('mate-mengong');       // 未退出 A 就进入 B
  ok(runtime.study.course.id === 'mate-mengong', '（前置）当前在课程 B');
  ok(runtime.study.snapshot.board.filter(Boolean).length === formalSquares,
    '课程 B 的快照是正式对局而非课程 A 的棋盘');
  await sleep(200);
  await exitStudy();
  ok(game.board.filter(Boolean).length === formalSquares, '退出课程 B 后正式对局棋盘完整还原');
  ok(game.moveHistory.length === 0, '正式对局着法栈未被课程污染');
}

// ---- 回归：退出学习要还原 over/noCapture/posCounts，不能把“课程残局”当正式终局 ----
{
  const { initialBoard, RED } = await import('../js/engine/index.js');
  game.mode = 'pvp'; game.board = initialBoard(); game.turn = RED; game.moveHistory = [];
  game.over = false; game.resultTitle = ''; game.noCapture = 3;
  game.checkStreak = { r: 1, b: 0 };
  game.posCounts = new Map([['k', 2]]);
  await enterStudyPuzzle('m1-001');
  game.over = true; game.resultTitle = '红方获胜';   // 模拟学习期间被外部写脏
  game.noCapture = 99;
  game.posCounts = new Map([['k', 7]]);
  game.checkStreak = { r: 5, b: 5 };
  await exitStudy();
  ok(game.over === false && game.resultTitle === '', '退出学习还原 over/resultTitle');
  ok(game.noCapture === 3, '退出学习还原 noCapture（实际 ' + game.noCapture + '）');
  ok(game.checkStreak.r === 1 && game.checkStreak.b === 0, '退出学习还原连续将军计数');
  ok(game.posCounts && game.posCounts.get('k') === 2, '退出学习还原局面计数表');
}

// ---- 回归：学习会话令牌阻止“退出后重进同题”时旧应手落地 ----
{
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const p2 = puzzles.find(x => x.id === 'm2-001');
  await enterStudyPuzzle(p2.id);
  tryStudyMove(p2.solution[0][0], p2.solution[0][1]);   // 触发引擎应手（depth3/1200ms）
  const fenMid = game.board.filter(Boolean).length;
  await exitStudy();
  await enterStudyPuzzle(p2.id);                         // 立刻重进同一题（puzzle 是同一个对象引用）
  const fenRestart = game.board.map(x => x || '.').join('');
  await sleep(2600);                                     // 旧应手回调到达
  ok(game.board.map(x => x || '.').join('') === fenRestart, '旧应手的回调未落到新会话的题面');
  ok(runtime.study && runtime.study.solIdx === 0, '新会话着法进度未被旧回调推进');
  await exitStudy();
}

if (fails) throw new Error('学习模式入口测试：' + fails + ' 项失败');
console.log('=== 学习模式入口测试通过 ===');
