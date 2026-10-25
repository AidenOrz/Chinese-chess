// 流程测试：正式走法 / 长将 / 推演 / AI 自对弈 / 调度世代（需 DOM 打桩后动态导入）
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, legalMoves, chooseMove, RED, BLACK } = await import('../js/engine/index.js');
const { game, analysis, runtime } = await import('../js/state.js');
const { applyFormalMove, scheduleAi, startGame, undoFormal, applyAnalysisMove, undoAnalysis, resumeCurrentGame } = await import('../js/app.js');

// ---- 长将仅提示不判负 ----
{
  game.board = new Array(90).fill(null);
  game.board[idx(9,4)]='K'; game.board[idx(0,4)]='k';
  game.board[idx(1,0)]='R'; game.board[idx(5,4)]='p';   // 黑卒挡住两帅照面
  game.turn = RED; game.over = false;
  game.mode = 'pvp';
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  // 强制长将：红车 (1,0)<->(0,0) 沿横线来回将军，黑帅被迫 (0,4)<->(1,4) 躲避
  for (let round = 0; round < 3; round++) {
    const redFrom = round % 2 === 0 ? idx(1, 0) : idx(0, 0);
    const redTo = round % 2 === 0 ? idx(0, 0) : idx(1, 0);
    const blackFrom = round % 2 === 0 ? idx(0, 4) : idx(1, 4);
    const blackTo = round % 2 === 0 ? idx(1, 4) : idx(0, 4);
    ok(legalMoves(game.board, RED).some(x => x.from === redFrom && x.to === redTo), '红车将军着法合法');
    applyFormalMove({ from: redFrom, to: redTo });
    ok(legalMoves(game.board, BLACK).some(x => x.from === blackFrom && x.to === blackTo), '黑帅躲避着法合法');
    applyFormalMove({ from: blackFrom, to: blackTo });
  }
  ok(game.checkStreak.r >= 3, '红方连续将军计数 ≥3（实际 ' + game.checkStreak.r + '）');
  ok(!game.over, '长将不再强制结束对局，可继续行棋');
}

// ---- 推演模式（回归：applyAnalysisMove 曾引用未定义的 rec 而抛错） ----
{
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  game.mode = 'pvp';
  analysis.active = true; analysis.turn = RED; analysis.moves = []; analysis.over = false;
  analysis.snapshot = { board: game.board.slice(), turn: RED, streakR: 0, streakB: 0, noCapture: 0 };
  applyAnalysisMove({ from: idx(7, 1), to: idx(7, 4) });   // 炮八平五：平移不吃子
  ok(analysis.moves.length === 1 && analysis.moves[0].captured === null, '推演走子入栈且不抛错');
  ok(analysis.turn === BLACK && game.board[idx(7, 4)] === 'C', '推演走子生效且轮到黑方');
  undoAnalysis();
  ok(game.board[idx(7, 1)] === 'C' && game.board[idx(7, 4)] === null && analysis.moves.length === 0, '撤销推演还原棋盘');
  analysis.active = false;
}

// ---- 正式规则：三次重复局面判和 ----
{
  game.mode = 'pvp'; game.humanSide = RED;
  game.formalRules = true;
  startGame();   // 初始局面计一次
  const seq = [
    [idx(9, 0), idx(8, 0)], [idx(0, 4), idx(1, 4)],
    [idx(8, 0), idx(9, 0)], [idx(1, 4), idx(0, 4)]
  ];
  for (let round = 0; round < 2; round++) {
    for (const [f, t] of seq) applyFormalMove({ from: f, to: t });
  }
  ok(game.over && game.resultTitle === '和棋' && game.resultDesc.includes('第三次出现'),
    '第三次重复局面自动判和（over=' + game.over + ' title=' + game.resultTitle + '）');
  undoFormal();
  ok(!game.over, '悔棋撤销判和状态');
  game.formalRules = false; game.posCounts = null;
}

// ---- AI 自对弈与性能 ----
{
  game.mode = 'pvp';
  game.difficulty = 'easy';
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  const easyOpts = { depth: 2, useQ: false, timeMs: 1500, exact: false, randomWindow: 90 };
  let plies = 0;
  while (!game.over && plies < 130) {
    const m = chooseMove(game.board, game.turn, easyOpts);
    if (!m) { ok(false, 'AI 在未终局时无着可走'); break; }
    const legal = legalMoves(game.board, game.turn);
    if (!legal.some(x => x.from === m.from && x.to === m.to)) { ok(false, 'AI 非法走法'); break; }
    applyFormalMove(m);
    plies++;
  }
  ok(plies > 0 && (!game.over || game.resultTitle.length > 0), '自对弈 ' + plies + ' 步正常（over=' + game.over + ' ' + game.resultTitle + '）');
}
{
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = {r:0,b:0};
  game.difficulty = 'normal';
  const t0 = Date.now();
  const m = chooseMove(game.board, RED, { depth: 3, useQ: true, timeMs: 4000, exact: false, randomWindow: 20 });
  const dt = Date.now() - t0;
  ok(m && legalMoves(game.board, RED).some(x => x.from === m.from && x.to === m.to), '普通难度返回合法走法');
  ok(dt < 3000, '普通难度单步耗时 ' + dt + 'ms < 3000ms');
}

// ---- 存档自动保存与恢复 ----
{
  const { store } = await import('../js/store.js');
  game.mode = 'pvp'; game.humanSide = RED;
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });   // 炮八平五（自动存档）
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });   // 黑马8进7
  const rec = await store.getGame('current');
  ok(rec && rec.moves.length === 2, '走子后自动存档（2 步）');
  game.board = initialBoard(); game.moveHistory = []; game.turn = RED;   // 模拟刷新清空
  const resumed = await resumeCurrentGame();
  ok(resumed && game.moveHistory.length === 2 && game.board[idx(7, 4)] === 'C' && game.board[idx(2, 2)] === 'n',
    '恢复对局重放正确（含位置与手数）');
  ok(game.turn === RED, '恢复后轮到红方');
  await store.deleteGame('current');
}

// ---- AI 调度世代：重开后过期回调不得在新对局落子（异步，汇总延后打印） ----
{
  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = 'easy';
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  const epochBefore = runtime.aiEpoch;
  scheduleAi();            // 红方（AI）排队思考
  startGame();             // 模拟 420ms 窗口内点了“重新开始”
  ok(runtime.aiEpoch === epochBefore + 1, '重开使世代递增');
  setTimeout(() => {
    ok(game.moveHistory.length === 1, '新对局只有新回调走的一步（实际 ' + game.moveHistory.length + ' 步）');
    ok(game.turn === BLACK, '过期回调未错序落子，轮到玩家行棋');
    if (fails) { console.error('\n*** ' + fails + ' 项失败 ***'); process.exitCode = 1; }
    else console.log('=== 流程测试通过 ===');
  }, 700);
}
