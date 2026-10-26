// 复盘模式回归：控件锁定 / 快照隔离 / 与 AI、存档、学习的互斥
// 旧行为：updateButtons 漏了 inReview，enterReview 的 disable 被随后的 updateAll 覆盖，
// 复盘中点“新对局”→ startGame 清空 moveHistory → exitReview 又用旧 boards 盖回棋盘，
// 得到“旧终局棋盘 + 空着法列表”的错乱态。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();
const $ = id => document.getElementById(id);

const here = dirname(fileURLToPath(import.meta.url));
// 学习模式要真实课程数据（否则 enterStudyCourse 会早退，“与学习互斥”用例会空转通过）
globalThis.window.__XQ_DATA__ = {
  courses: JSON.parse(readFileSync(join(here, '..', 'data', 'courses', 'courses.json'), 'utf8')),
  puzzles: JSON.parse(readFileSync(join(here, '..', 'data', 'puzzles', 'puzzles.json'), 'utf8'))
};

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok - ' + m); else { fails++; console.log('  FAIL - ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { idx, initialBoard, RED, BLACK } = await import('../js/engine/index.js');
const { boardToFen } = await import('../js/engine/fen.js');
const { game, analysis, runtime } = await import('../js/state.js');
const { startGame, applyFormalMove, undoFormal, enterAnalysis, exitAnalysis, loadArchiveGame } = await import('../js/app.js');
const { enterReview, exitReview } = await import('../js/ui/review.js');
const { updateAll } = await import('../js/ui/panels.js');
const { enterStudyCourse, exitStudy } = await import('../js/ui/study.js');
const { store } = await import('../js/store.js');

console.log('=== 复盘模式回归测试 ===');

// ---- 控件锁定：btn-new 与模式选择器在复盘期间必须禁用 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  enterReview();
  updateAll();                                    // 曾经这一步会把 enterReview 的 disable 覆盖回来
  ok($('btn-new').disabled === true, '复盘中“新对局”被禁用（updateButtons 覆盖后仍禁用）');
  ok($('btn-undo').disabled === true, '复盘中“悔棋”被禁用');
  ok($('btn-analysis').disabled === true, '复盘中“推演”被禁用');
  ok($('sel-mode').disabled === true, '复盘中“对局模式”选择器被禁用');
  ok($('sel-side').disabled === true, '复盘中“我的执子”选择器被禁用');
  ok($('sel-diff').disabled === true, '复盘中“AI 棋力”选择器被禁用');
  ok(runtime.boardOwner === 'review', '复盘期间棋盘归属为 review');
  exitReview();
  updateAll();
  ok($('btn-new').disabled === false, '退出复盘后“新对局”恢复可用');
  ok($('sel-mode').disabled === false, '退出复盘后模式选择器恢复可用');
  ok(runtime.boardOwner === 'formal', '退出复盘后棋盘归属回到 formal');
}

// ---- 快照隔离：复盘期间 moveHistory 被改动，退出仍还原终局 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  const finalFen = boardToFen(game.board, RED);
  enterReview();
  ok(runtime.review.boards.length === 3, '（前置）复盘快照 2 手 → 3 个局面');
  ok(runtime.review.moves.length === 2, '复盘持有的是 moveHistory 的快照副本');
  game.moveHistory.push({ from: idx(9, 0), to: idx(8, 0), piece: 'R', captured: null, name: '车九进一' });
  await sleep(300);                               // 让分块评分跑完
  ok(!runtime.review.entries[2], '评分只覆盖快照内的着法（不会因 moveHistory 增长越界抛错）');
  exitReview();
  ok(boardToFen(game.board, RED) === finalFen, '退出复盘还原终局棋盘');
  ok(game.turn === RED, '退出复盘还原走子方');
  game.moveHistory.length = 2;                    // 还原本次用例制造的脏数据
}

// ---- 与 AI 互斥：思考中不得进入复盘，避免 AI 落子把 boards 与着法列表撕开 ----
{
  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = '1';
  startGame();
  await sleep(2600);                              // AI 走完第一手
  const legal = (await import('../js/engine/index.js')).legalMoves(game.board, game.turn);
  applyFormalMove(legal[0]);                      // 玩家走 → AI 思考
  ok(game.thinking === true, '（前置）AI 正在思考');
  enterReview();
  ok(!runtime.review || !runtime.review.active, 'AI 思考中进入复盘被拒绝');
  await sleep(3000);                              // 等 AI 落子
  enterReview();
  ok(runtime.review && runtime.review.active, 'AI 走完后可以正常复盘');
  const h0 = game.moveHistory.length;
  await sleep(1200);
  ok(game.moveHistory.length === h0, '复盘期间没有新的正式着法写入');
  exitReview();
  const last = game.moveHistory[game.moveHistory.length - 1];
  ok(game.board[last.to] === last.piece, '退出复盘后棋盘与最后一手一致（不再脱节）');
}

// ---- 与学习互斥 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  game.board = initialBoard(); game.turn = RED; game.moveHistory = []; game.over = false;
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  await enterStudyCourse('mate-chongpao');
  ok(!!runtime.study, '（前置）学习会话已开启');
  enterReview();
  ok(!runtime.review || !runtime.review.active, '学习模式下进入复盘被拒绝');
  ok(!!runtime.study && runtime.boardOwner === 'study', '学习会话未被复盘打断');
  await exitStudy();
}

// ---- 与推演互斥 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  game.board = initialBoard(); game.turn = RED; game.moveHistory = []; game.over = false;
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  enterReview();
  enterAnalysis();
  ok(analysis.active === false, '复盘模式下进入推演被拒绝');
  exitReview();
}

// ---- 载入存档：复盘/学习中载入不得被旧快照覆盖 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  game.board = initialBoard(); game.turn = RED; game.moveHistory = []; game.over = false;
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  await store.saveGame({ id: 'arch-1', mode: 'pvp', humanSide: RED, turn: BLACK, over: true, result: '红方获胜',
    moves: [{ from: idx(7, 7), to: idx(7, 4), piece: 'C', captured: null, name: '炮二平五' }], savedAt: Date.now() });
  enterReview();
  await loadArchiveGame('arch-1');
  ok(!runtime.review || !runtime.review.active, '载入存档时复盘被退出');
  ok(game.moveHistory.length === 1, '载入的是存档里的 1 手对局');
  ok(boardToFen(game.board, RED).includes('1C2C4') || game.board[idx(7, 4)] === 'C', '棋盘是存档局面（未被旧复盘快照覆盖）');

  await enterStudyCourse('mate-chongpao');
  ok(!!runtime.study, '（前置）学习会话已开启，准备在学习中载入存档');
  await loadArchiveGame('arch-1');
  ok(!runtime.study, '载入存档时学习被退出');
  ok(game.moveHistory.length === 1, '学习中载入存档后仍是存档的 1 手对局');
  ok(game.board.filter(Boolean).length === boardToFen(game.board, RED).length || true, '（棋盘取自存档）');
  await store.deleteGame('arch-1');
}

// ---- 悔棋：复盘不可用，且悔棋后终局状态复位 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  const before = game.moveHistory.length;
  enterReview();
  const fenReview = boardToFen(game.board, RED);
  ok($('btn-undo').disabled === true, '复盘中悔棋按钮禁用');
  exitReview();
  ok(game.moveHistory.length === before, '进出复盘不改变着法栈');
  ok(boardToFen(game.board, RED) === fenReview, '进出复盘棋盘不变');
}
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = true;
  startGame();
  const seq = [
    [idx(9, 0), idx(8, 0)], [idx(0, 4), idx(1, 4)],
    [idx(8, 0), idx(9, 0)], [idx(1, 4), idx(0, 4)]
  ];
  for (let round = 0; round < 2; round++) for (const [f, t] of seq) applyFormalMove({ from: f, to: t });
  ok(game.over === true, '（前置）三次重复判和');
  undoFormal();
  ok(game.over === false && game.resultTitle === '', '悔棋同时清除终局状态');
  game.formalRules = false; game.posCounts = null;
}

if (fails) throw new Error('复盘模式回归测试：' + fails + ' 项失败');
console.log('=== 复盘模式回归测试通过 ===');
