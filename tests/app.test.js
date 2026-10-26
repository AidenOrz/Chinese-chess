// 流程测试：正式走法 / 长将 / 推演 / AI 自对弈 / 调度世代（需 DOM 打桩后动态导入）
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, legalMoves, chooseMove, RED, BLACK } = await import('../js/engine/index.js');
const { game, analysis, runtime } = await import('../js/state.js');
const { applyFormalMove, scheduleAi, startGame, undoFormal, applyAnalysisMove, undoAnalysis, resumeCurrentGame,
        loadArchiveGame, setBoardOwner, runTeachAnalysis } = await import('../js/app.js');
const { boardToFen } = await import('../js/engine/fen.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// ---- AI 调度世代：重开后过期回调不得在新对局落子 ----
await (async () => {
  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = 'easy';
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  const epochBefore = runtime.aiEpoch;
  scheduleAi();            // 红方（AI）排队思考
  startGame();             // 模拟 420ms 窗口内点了“重新开始”
  ok(runtime.aiEpoch === epochBefore + 1, '重开使世代递增');
  await sleep(700);
  ok(game.moveHistory.length === 1, '新对局只有新回调走的一步（实际 ' + game.moveHistory.length + ' 步）');
  ok(game.turn === BLACK, '过期回调未错序落子，轮到玩家行棋');
})();

// ---- 载入存档必须复位 thinking（回归：曾因 epoch 递增让回调提前 return，thinking 永久卡住） ----
await (async () => {
  const { store } = await import('../js/store.js');
  await store.saveGame({ id: 'finished-x', mode: 'pva', humanSide: RED, turn: BLACK, over: true, result: '红方获胜',
    moves: [{ from: idx(7, 1), to: idx(7, 4), piece: 'C', captured: null, name: '炮八平五' }], savedAt: Date.now() });
  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = 'easy';
  startGame();                                   // AI(红) 开始思考
  ok(game.thinking === true, '开局后 AI 进入思考');
  await loadArchiveGame('finished-x');
  ok(game.thinking === false, '载入存档后 thinking 复位（否则全盘按钮永久禁用）');
  ok(runtime.boardOwner === 'formal', '载入存档后棋盘归属回到正式对局');
  await sleep(900);                              // 越过 420ms 节奏窗口
  ok(game.thinking === false, '过期回调落地后 thinking 仍为 false');
  await store.deleteGame('finished-x');
})();

// ---- 悔棋必须同步存档（回归：曾出现“界面 0 步、存档 2 步”，刷新复活被悔的棋） ----
await (async () => {
  const { store } = await import('../js/store.js');
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  ok((await store.getGame('current')).moves.length === 2, '走两步后自动存档 2 步');
  undoFormal();
  ok(game.moveHistory.length === 0, '悔棋回退到开局');
  ok((await store.getGame('current')) === undefined, '悔棋后进行中存档被清除，刷新不会复活');
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  undoFormal();
  ok((await store.deleteGame('current')) === undefined, '（清理）');
})();

// ---- 新对局不得继承上一局的“进行中”存档 ----
await (async () => {
  const { store } = await import('../js/store.js');
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  ok((await store.getGame('current')) !== undefined, '上一局留下进行中存档');
  startGame();
  ok((await store.getGame('current')) === undefined, '新对局清除进行中存档');
  game.board = initialBoard(); game.moveHistory = []; game.turn = RED;
  ok((await resumeCurrentGame()) === false, '刷新不会把上一局当成本局恢复');
})();

// ---- 棋盘归属守卫：非 formal 时正式落子一律拒绝 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  const fenBefore = boardToFen(game.board, RED);
  setBoardOwner('study');
  const applied = applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  ok(applied === false, '学习占用棋盘时 applyFormalMove 返回 false（拒绝落子）');
  ok(boardToFen(game.board, RED) === fenBefore && game.moveHistory.length === 0, '被拒绝的落子不改变棋盘与着法栈');
  setBoardOwner('formal');
  ok(applyFormalMove({ from: idx(7, 1), to: idx(7, 4) }) === true, '归属回到 formal 后正常落子');
  // 起点为空 / 不是当前走子方的棋子：兜底拒绝（AI 回调落在换过的棋盘上时正是这种形态）
  setBoardOwner('formal');
  ok(game.turn === BLACK, '（前置）红炮八平五后轮到黑方');
  ok(game.board[idx(5, 0)] === null, '（前置）第 5 行是空格');
  ok(applyFormalMove({ from: idx(5, 0), to: idx(4, 0) }) === false, '起点为空格时拒绝（幻影着法防线）');
  ok(applyFormalMove({ from: idx(9, 0), to: idx(8, 0) }) === false, '非当前走子方的棋子拒绝（红车在黑方回合）');
}

// ---- 学习/复盘占用棋盘时，教学分析不得写入正式对局面板 ----
await (async () => {
  game.mode = 'pva'; game.humanSide = RED; game.difficulty = 'easy'; game.formalRules = false;
  startGame();
  document.getElementById('sel-teach').value = 'detail';
  setBoardOwner('study');
  runtime.teachCtx = null;
  runTeachAnalysis();
  await sleep(250);
  ok(runtime.teachCtx === null, '学习模式占用棋盘时不产生教学推荐（否则推荐点会画在题面上）');
  setBoardOwner('formal');
  document.getElementById('sel-teach').value = 'off';
})();

if (fails) { console.error('\n*** ' + fails + ' 项失败 ***'); process.exitCode = 1; }
else console.log('=== 流程测试通过 ===');
