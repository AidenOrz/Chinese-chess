// 引擎自动化测试：自动从 index.html 提取内嵌 JS（DOM 打桩），验证规则、AI 与战略分析层
// 运行：node _engine_test.js
'use strict';
const fs = require('fs');

function fakeEl() {
  return {
    style: {}, dataset: {}, value: '', checked: false, disabled: false,
    className: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, remove() {}, addEventListener() {}, setPointerCapture() {},
    querySelectorAll() { return []; }, getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 560 }; }
  };
}
const registry = {};
global.document = {
  getElementById: id => (registry[id] = registry[id] || fakeEl()),
  createElement: () => fakeEl()
};
global.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };
registry['sel-teach'] = Object.assign(fakeEl(), { value: 'off' });
registry['sel-mode'] = Object.assign(fakeEl(), { value: 'pvp' });
registry['chk-show'] = Object.assign(fakeEl(), { checked: false });

let engine;
try { engine = fs.readFileSync(__dirname + '/_xq_engine.js', 'utf8'); }
catch (e) {
  engine = fs.readFileSync(__dirname + '/index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
}
const tests = `
// ================= 测试代码（与引擎同作用域） =================
const assert = (c, msg) => { if (!c) { console.error('  FAIL:', msg); global.__fails = (global.__fails||0)+1; } else console.log('  ok -', msg); };

// ---- 规则核心 ----
{
  const bd = initialBoard();
  const mv = legalMoves(bd, RED);
  assert(mv.length === 44, '初始红方合法走法数=44（实际 ' + mv.length + '）');
  assert(mv.some(m => m.from === idx(7, 1) && m.to === idx(0, 1)), '开局炮打马（隔黑炮架吃黑马）应合法');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(7,4)]='N'; bd[idx(6,4)]='P';
  assert(pseudoMoves(bd, idx(7,4)).length === 6, '蹩马腿后马伪合法落点=6');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(9,2)]='B'; bd[idx(8,3)]='P';
  const t = pseudoMoves(bd, idx(9,2));
  assert(t.length === 1 && t[0] === idx(7,0), '塞象眼后相仅剩 1 个落点');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(5,2)]='B';
  const t = pseudoMoves(bd, idx(5,2));
  assert(t.includes(idx(7,0)) && t.includes(idx(7,4)) && !t.includes(idx(3,0)) && !t.includes(idx(3,4)), '相不能过河');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k';
  bd[idx(6,4)]='P';
  let t = pseudoMoves(bd, idx(6,4));
  assert(t.length === 1 && t[0] === idx(5,4), '未过河兵只能向前');
  bd[idx(6,4)] = null; bd[idx(4,4)] = 'P';
  assert(!pseudoMoves(bd, idx(4,4)).includes(idx(5,4)), '兵不能后退');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k';
  bd[idx(7,4)]='C'; bd[idx(5,4)]='p'; bd[idx(3,4)]='p';
  const t = pseudoMoves(bd, idx(7,4));
  assert(!t.includes(idx(4,4)) && !t.includes(idx(5,4)) && t.includes(idx(3,4)), '炮翻山吃子规则');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(5,4)]='R';
  const legal = legalMoves(bd, RED);
  assert(!legal.some(m => m.from === idx(5,4) && m.to === idx(5,3)), '遮挡子横移造成照面 → 非法');
  assert(legal.some(m => m.from === idx(5,4) && m.to === idx(4,4)), '遮挡子沿列移动 → 合法');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(8,4)]='R'; bd[idx(0,0)]='r';
  const legal = legalMoves(bd, RED);
  assert(!legal.some(m => m.from === idx(8,4) && m.to === idx(8,3)), '挪开遮挡车（送将）→ 非法');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(0,4)]='k'; bd[idx(9,4)]='K';
  bd[idx(0,0)]='R'; bd[idx(8,4)]='R';
  assert(isInCheck(bd, BLACK) && legalMoves(bd, BLACK).length === 0, '将死判定');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(0,4)]='k'; bd[idx(9,4)]='K';
  bd[idx(2,4)]='P'; bd[idx(1,3)]='P'; bd[idx(1,5)]='P';
  assert(!isInCheck(bd, BLACK) && legalMoves(bd, BLACK).length === 0, '困毙判定');
}
{
  const bd = initialBoard();
  assert(moveName(bd, {from: idx(7,1), to: idx(7,4)}) === '炮八平五', '炮八平五');
  assert(moveName(bd, {from: idx(9,7), to: idx(7,6)}) === '马二进三', '马二进三');
  assert(moveName(bd, {from: idx(0,7), to: idx(2,6)}) === '马8进7', '马8进7');
}

// ---- 战略分析层 ----
{
  const bd = initialBoard();
  assert(detectPhase(bd) === 'opening', '初始局面为开局阶段');
  assert(materialLead(bd, RED) === 0, '初始子力差为 0');
  assert(evalBoard(bd) === 0, '初始局面评估对称（=0）');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(5,4)]='c';    // 黑炮空头直指红帅
  const before = structureScore(bd, RED);
  assert(structureScore(bd, RED) < structureScore(bd, BLACK) - 25, '空头炮使红方结构分显著更低');
  bd[idx(6,4)]='P';                                        // 加一枚遮挡子作炮架阻挡
  assert(structureScore(bd, RED) === before + 30, '有遮挡后空头炮威胁消失（+30）');
}
{
  game.moveHistory = [];
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(8,4)]='N'; bd[idx(0,0)]='r';
  const diag = positionDiagnostics(bd, RED);
  assert(diag.some(d => d.includes('窝心马')), '诊断出窝心马');
  assert(diag.some(d => d.includes('缺士')), '诊断出缺士怕车');
}
{
  game.moveHistory = [];
  const bd = initialBoard();
  const sug = openingSuggestions(bd, RED, 0);
  assert(sug.some(s => s.label === '中炮' && s.from === idx(7,1) && s.to === idx(7,4)), '开局库含中炮（炮八平五）');
  assert(sug.some(s => s.label === '中炮' && s.from === idx(7,7) && s.to === idx(7,4)), '开局库含中炮（炮二平五）');
  assert(sug.some(s => s.label === '飞相局' || s.label === '仙人指路'), '开局库含飞相/仙人指路');
}
{
  game.moveHistory = [{ name: '炮八平五' }];
  const bd = initialBoard();
  const sug = openingSuggestions(bd, BLACK, 1);
  assert(sug.some(s => s.label === '屏风马' && s.from === idx(0,7) && s.to === idx(2,6)), '对方中炮 → 推荐屏风马');
}
{
  game.moveHistory = [];
  const bd = initialBoard();
  const reply = bestReplyName(bd, { from: idx(7,1), to: idx(7,4) }, RED);
  assert(typeof reply === 'string' && reply.length > 0, '预计对方应手生成（' + reply + '）');
  assert(reply !== '炮8进7' && reply !== '炮2进7', '预计应手不会是被反吃的贪心吃马（' + reply + '）');
  assert(opponentThreats(bd, RED).length === 0, '初始局面无失子威胁误报');
  const plan = strategyPlan(bd, RED, 'opening');
  assert(plan.includes('开局方针'), '开局方针文案');
}

// ---- 长将仅提示不判负 ----
{
  game.board = new Array(90).fill(null);
  game.board[idx(9,4)]='K'; game.board[idx(0,4)]='k';
  game.board[idx(1,0)]='R'; game.board[idx(5,4)]='p';   // 黑卒挡住两帅照面
  game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  // 强制长将：红车 (1,0)<->(0,0) 沿横线来回将军，黑帅被迫 (0,4)<->(1,4) 躲避
  for (let round = 0; round < 3; round++) {
    const redFrom = round % 2 === 0 ? idx(1, 0) : idx(0, 0);
    const redTo = round % 2 === 0 ? idx(0, 0) : idx(1, 0);
    const blackFrom = round % 2 === 0 ? idx(0, 4) : idx(1, 4);
    const blackTo = round % 2 === 0 ? idx(1, 4) : idx(0, 4);
    assert(legalMoves(game.board, RED).some(x => x.from === redFrom && x.to === redTo), '红车将军着法合法');
    applyFormalMove({ from: redFrom, to: redTo });
    assert(legalMoves(game.board, BLACK).some(x => x.from === blackFrom && x.to === blackTo), '黑帅躲避着法合法');
    applyFormalMove({ from: blackFrom, to: blackTo });
  }
  assert(game.checkStreak.r >= 3, '红方连续将军计数 ≥3（实际 ' + game.checkStreak.r + '）');
  assert(!game.over, '长将不再强制结束对局，可继续行棋');
}

// ---- AI 自对弈与性能 ----
{
  game.mode = 'pvp';
  game.difficulty = 'easy';
  let plies = 0;
  while (!game.over && plies < 130) {
    const m = aiChooseMove(game.turn);
    if (!m) { assert(false, 'AI 在未终局时无着可走'); break; }
    const legal = legalMoves(game.board, game.turn);
    if (!legal.some(x => x.from === m.from && x.to === m.to)) { assert(false, 'AI 非法走法'); break; }
    applyFormalMove(m);
    plies++;
  }
  assert(plies > 0 && (!game.over || game.resultTitle.length > 0), '自对弈 ' + plies + ' 步正常（over=' + game.over + ' ' + game.resultTitle + '）');
}
{
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = {r:0,b:0};
  game.difficulty = 'normal';
  const t0 = Date.now();
  const m = aiChooseMove(RED);
  const dt = Date.now() - t0;
  assert(m && legalMoves(game.board, RED).some(x => x.from === m.from && x.to === m.to), '普通难度返回合法走法');
  assert(dt < 3000, '普通难度单步耗时 ' + dt + 'ms < 3000ms');
}

// ---- 推演模式（回归：applyAnalysisMove 曾引用未定义的 rec 而抛错） ----
{
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  game.mode = 'pvp';
  analysis.active = true; analysis.turn = RED; analysis.moves = []; analysis.over = false;
  analysis.snapshot = { board: game.board.slice(), turn: RED, streakR: 0, streakB: 0, noCapture: 0 };
  applyAnalysisMove({ from: idx(7, 1), to: idx(7, 4) });   // 炮八平五：平移不吃子
  assert(analysis.moves.length === 1 && analysis.moves[0].captured === null, '推演走子入栈且不抛错');
  assert(analysis.turn === BLACK && game.board[idx(7, 4)] === 'C', '推演走子生效且轮到黑方');
  undoAnalysis();
  assert(game.board[idx(7, 1)] === 'C' && game.board[idx(7, 4)] === null && analysis.moves.length === 0, '撤销推演还原棋盘');
  analysis.active = false;
}

// ---- 保护判定（伪攻击集合不含己方占据格 → 须临时清格再判） ----
{
  const after = new Array(90).fill(null);
  after[idx(9,4)]='K'; after[idx(0,4)]='k';
  after[idx(4,4)]='R'; after[idx(3,4)]='r';            // 红车刚落到 (4,4)，被黑车攻击且无保护
  assert(isHanging(after, idx(4,4), 'R', RED) === 900, '无保护落子判挂（返回攻击者价值）');
  const after2 = after.slice(); after2[idx(4,3)] = 'R';   // 另一红车在旁保护
  assert(isHanging(after2, idx(4,4), 'R', RED) === null, '有等价子保护的兑子不误报挂');
  assert(isDefended(after2, idx(4,4), RED) && !isDefended(after, idx(4,4), RED), 'isDefended 临时清格判定保护');
}

// ---- 牵制判定：线上第二个子必须恰好是敌将帅 ----
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(6,4)]='R'; bd[idx(4,4)]='p';
  bd[idx(2,4)]='p';                                    // 卒后还隔一个卒，未直指将帅
  const r1 = classifyReasons(bd, RED, { from: idx(6,4), to: idx(5,4) }, 20);
  assert(!r1.reason.includes('牵制'), '线上隔两子不误报牵制');
  bd[idx(2,4)] = null;
  const r2 = classifyReasons(bd, RED, { from: idx(6,4), to: idx(5,4) }, 20);
  assert(r2.reason.includes('牵制'), '一子隔线直指将帅判牵制');
}

// ---- 同线 4 兵记谱：前/二/三/后 ----
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k';
  bd[idx(2,4)]='P'; bd[idx(3,4)]='P'; bd[idx(4,4)]='P'; bd[idx(5,4)]='P';
  assert(moveName(bd, { from: idx(4,4), to: idx(4,3) }) === '三兵平六', '同线 4 兵用 前二三四后 消歧');
  assert(moveName(bd, { from: idx(2,4), to: idx(1,4) }) === '前兵进一', '最前兵记“前兵”');
}

// ---- AI 调度世代：重开后过期回调不得在新对局落子（异步，汇总延后打印） ----
{
  game.mode = 'pva'; game.humanSide = BLACK; game.difficulty = 'easy';
  game.board = initialBoard(); game.turn = RED; game.over = false;
  game.moveHistory = []; game.noCapture = 0; game.checkStreak = { r: 0, b: 0 };
  const epochBefore = aiEpoch;
  scheduleAi();            // 红方（AI）排队思考
  startGame();             // 模拟 420ms 窗口内点了“重新开始”
  assert(aiEpoch === epochBefore + 1, '重开使世代递增');
  setTimeout(() => {
    assert(game.moveHistory.length === 1, '新对局只有新回调走的一步（实际 ' + game.moveHistory.length + ' 步）');
    assert(game.turn === BLACK, '过期回调未错序落子，轮到玩家行棋');
    console.log(global.__fails ? ('\\n*** ' + global.__fails + ' 项失败 ***') : '\\n=== 全部引擎测试通过 ===');
    if (global.__fails) process.exitCode = 1;
  }, 700);
}
`;
eval(engine + '\n' + tests);
