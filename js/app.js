// @ts-check
/* =====================================================================
 * 游戏流程控制：正式对局 / 教学模式 / 推演模式
 * ===================================================================== */
import { sideOf, other, RED, BLACK, sideName, initialBoard, isInCheck, legalMoves, moveName,
         detectPhase, strategyPlan, colOf, rowOf, hashOf } from './engine/index.js';
import { chooseMove } from './engine/search.js';
import { LEVELS, levelById } from './engine/levels.js';
import { workerSearch, resetWorker } from './engine/client.js';
import { buildRecommendations, openingSuggestions, positionDiagnostics,
         opponentThreats, bestReplyName, describeAiMove, formatGap,
         positionVerdict, materialDetail } from './teach/explain.js';
import { losingPlan } from './engine/eval.js';
import { boardToFen, fenToBoard } from './engine/fen.js';
import { store } from './store.js';
import { game, analysis, ui, runtime, teachMode } from './state.js';
import { snd } from './audio.js';
import { $ } from './ui/dom.js';
import { renderAllPieces, renderHints, clearRecHighlights, visualApplyMove, flashMove, setFlipped } from './ui/layout.js';
import { renderCaptured, renderMoveList, updateAll, toast, showResultModal, renderTeachPanel } from './ui/panels.js';
import { exitStudy } from './ui/study.js';
import { exitReview } from './ui/review.js';

export const aiSide = () => other(game.humanSide);
export const adviceSide = () => game.mode === 'pva' ? game.humanSide : RED;   // “我方”：人机=玩家方；双人=默认红方

// 终局弹窗延时句柄：新对局/换模式时要能取消，否则旧弹窗会盖在新棋盘上
let resultModalTimer = null;
export function cancelResultModal() {
  if (resultModalTimer) { clearTimeout(resultModalTimer); resultModalTimer = null; }
}

// 难度（1~8 档）→ 搜索参数
function aiOpts() {
  const lv = levelById(game.difficulty);
  return { depth: lv.depth, useQ: lv.useQ, timeMs: lv.timeMs, exact: false,
           randomWindow: lv.randomWindow, blunderChance: lv.blunderChance };
}

// 正式规则模式：记录局面出现次数（返回该局面第几次出现）
function bumpPos(board, turn, rec) {
  if (!game.posCounts) game.posCounts = new Map();
  const hk = hashOf(board, turn);
  const key = hk.key + ':' + hk.lock;
  game.posCounts.set(key, (game.posCounts.get(key) || 0) + 1);
  if (rec) rec.posKey = key;
  return game.posCounts.get(key);
}
// 人机模式下执黑翻转棋盘
function syncFlipped() { setFlipped(game.mode === 'pva' && game.humanSide === BLACK); }

/* ---------------- 棋盘占用者与 AI 会话 ----------------
 * game.board 是四种模式共用的唯一棋盘。runtime.boardOwner 记录此刻谁在用它：
 * 非 'formal' 时正式落子（含 AI 回调）一律拒绝，避免幻影着法写到推演/复盘/学习棋盘上。
 */
/** 切换棋盘占用者：换人即作废旧 AI 回调 */
export function setBoardOwner(owner) { runtime.boardOwner = owner; }
/** 终止在途 AI 搜索并复位思考标志（重开/换模式/载入存档共用） */
export function resetAiSession() {
  runtime.aiEpoch++;   // 作废可能挂起的旧 AI 回调
  resetWorker();       // 终止在途的旧搜索
  game.thinking = false;
}
/** 落子前置条件：必须仍是正式对局在占用棋盘 */
export function canApplyFormalMove() {
  return runtime.boardOwner === 'formal' && !analysis.active;
}

// 应用一步正式走法（唯一入口，全部经 legalMoves 校验后调用）
export function applyFormalMove(m) {
  // 棋盘已被推演/复盘/学习占用：丢弃（典型来源：模式切换后才落地的 AI 回调）
  if (!canApplyFormalMove()) return false;
  // 兜底校验：起点必须是当前走子方的棋子（AI 回调落在换过的棋盘上时，from 往往是空格）
  if (!m || !game.board[m.from] || sideOf(game.board[m.from]) !== game.turn) return false;
  const before = game.board.slice();
  const name = moveName(game.board, m);
  const mover = sideOf(game.board[m.from]);
  const rec = {
    from: m.from, to: m.to, piece: game.board[m.from], captured: game.board[m.to],
    name, prevNoCapture: game.noCapture, prevStreakR: game.checkStreak.r, prevStreakB: game.checkStreak.b
  };
  game.board[m.to] = game.board[m.from]; game.board[m.from] = null;
  game.moveHistory.push(rec);
  const oppSide = other(mover);
  const gaveCheck = isInCheck(game.board, oppSide);
  rec.gaveCheck = gaveCheck;
  // 连续将军计数：仅用于提示，长将不强制结束对局（可继续行棋）
  if (gaveCheck) game.checkStreak[mover]++; else game.checkStreak[mover] = 0;
  // 自然限着：连续 120 步（60 回合）无吃子判和
  game.noCapture = rec.captured ? 0 : game.noCapture + 1;
  ui.lastMove = { from: m.from, to: m.to };
  ui.selected = -1; ui.targets = [];
  game.turn = oppSide;
  visualApplyMove(m.from, m.to);
  renderCaptured();
  renderMoveList();
  // 终局判定
  const oppHasMoves = legalMoves(game.board, oppSide).length > 0;
  let repCount = 0;
  if (game.formalRules) repCount = bumpPos(game.board, game.turn, rec);
  if (!oppHasMoves) {
    game.over = true;
    game.resultTitle = sideName(mover) + '获胜';
    game.resultDesc = sideName(oppSide) + (gaveCheck ? '被将死' : '被困毙（无子可动）');
  } else if (game.formalRules && repCount >= 3) {
    game.over = true;
    game.resultTitle = '和棋';
    game.resultDesc = '同一局面第三次出现，判和';
  } else if (game.formalRules && game.checkStreak[mover] >= 6) {
    game.over = true;
    game.resultTitle = sideName(oppSide) + '获胜';
    game.resultDesc = sideName(mover) + '长将（连续 6 次将军），判负';
  } else if (game.noCapture >= 120) {
    game.over = true;
    game.resultTitle = '和棋';
    game.resultDesc = '双方 60 回合未吃子，自然限着判和';
  }
  updateAll();
  if (typeof CustomEvent !== 'undefined' && typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(new CustomEvent('xq-state-changed'));   // main.js 监听以刷新存档卡片
  }
  if (rec.captured) snd.capture(); else snd.move();
  if (game.over) archiveFinishedGame(); else autosave();
  if (gaveCheck && !game.over) {
    snd.check();
    if (game.checkStreak[mover] === 3) {
      toast('⚠ ' + sideName(mover) + '已连续将军 3 次：正式规则长将可判负，本局仅提示不判负，可继续行棋（建议变着）');
    }
  }
  // 教学反馈（不影响对局状态）
  if (game.mode === 'pva') {
    if (mover === game.humanSide) onHumanMoved(m, before, name);
    else renderAiIntent(before, m);
  }
  if (game.over) { resultModalTimer = setTimeout(showResultModal, 350); return true; }
  if (game.mode === 'pva' && game.turn !== game.humanSide) scheduleAi();
  else if (game.mode === 'pva' && game.turn === game.humanSide) runTeachAnalysis();
  return true;
}

// AI 回合调度：搜索在 Worker 线程执行，主线程不冻结
export function scheduleAi() {
  if (game.over || game.mode !== 'pva' || game.turn === game.humanSide) return;
  if (runtime.boardOwner !== 'formal' || analysis.active) return;   // 棋盘已被其它模式占用
  game.thinking = true;
  updateAll();
  const epoch = runtime.aiEpoch;   // 捕获世代：期间重开/换边/换模式则本次回调作废
  const t0 = Date.now();
  workerSearch(game.board.slice(), aiSide(), aiOpts()).then(m => {
    if (epoch !== runtime.aiEpoch) return;   // 对局已重开，放弃过期结果
    const wait = Math.max(0, 420 - (Date.now() - t0));   // 保持至少 420ms 的行棋节奏
    setTimeout(() => {
      if (epoch !== runtime.aiEpoch) return;
      // 棋盘易主（进了推演/复盘/学习）时只收尾思考标志，绝不落子
      if (runtime.boardOwner !== 'formal' || analysis.active) { game.thinking = false; updateAll(); return; }
      game.thinking = false;
      if (m && !game.over) applyFormalMove(m);
      else updateAll();
    }, wait);
  });
}

// 悔棋：人机模式回退到玩家行棋（含玩家最近一步）；双人模式回退双方各一步
export function undoFormal() {
  if (analysis.active) return toast('请先退出推演模式');
  if (game.thinking) return toast('AI 思考中，请稍候');
  const h = game.moveHistory;
  if (!h.length) return toast('没有可以悔的棋');
  let pops;
  if (game.mode === 'pva') {
    let lastHuman = -1;
    for (let i = h.length - 1; i >= 0; i--) if (sideOf(h[i].piece) === game.humanSide) { lastHuman = i; break; }
    if (lastHuman < 0) return toast('还没有你的走法可悔');
    pops = h.length - lastHuman;
  } else {
    pops = Math.min(2, h.length);   // 回退双方各一步
  }
  for (let k = 0; k < pops; k++) {
    const rec = h.pop();
    game.board[rec.from] = rec.piece;
    game.board[rec.to] = rec.captured;
    game.noCapture = rec.prevNoCapture;
    game.checkStreak.r = rec.prevStreakR;
    game.checkStreak.b = rec.prevStreakB;
    game.turn = sideOf(rec.piece);
    if (rec.posKey && game.posCounts) {
      const n = game.posCounts.get(rec.posKey);
      if (n <= 1) game.posCounts.delete(rec.posKey); else game.posCounts.set(rec.posKey, n - 1);
    }
    ui.lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  }
  snd.undo();
  game.over = false; game.resultTitle = ''; game.resultDesc = '';
  cancelResultModal();
  $('modal').classList.add('hidden');
  ui.selected = -1; ui.targets = []; runtime.teachCtx = null;
  renderAllPieces(); renderCaptured(); renderMoveList(); updateAll();
  // 悔棋改变了棋局，存档必须跟着回退，否则刷新会把悔掉的棋复活
  if (game.moveHistory.length) autosave(); else store.deleteGame('current').catch(() => {});
  if (game.mode === 'pva' && game.turn === game.humanSide) runTeachAnalysis();
}

// 重新开始
export function startGame() {
  if (analysis.active) exitAnalysis(true);
  cancelResultModal();
  resetAiSession();          // 作废旧 AI 回调 + 复位 thinking
  setBoardOwner('formal');
  store.deleteGame('current').catch(() => {});   // 新对局不继承上一局的“进行中”存档
  game.board = initialBoard();
  game.turn = RED;
  game.moveHistory = [];
  game.over = false; game.resultTitle = ''; game.resultDesc = '';
  game.checkStreak = { r: 0, b: 0 };
  game.noCapture = 0;
  game.posCounts = new Map();
  if (game.formalRules) bumpPos(game.board, game.turn, null);
  syncFlipped();
  ui.selected = -1; ui.targets = []; ui.lastMove = null; runtime.teachCtx = null;
  $('modal').classList.add('hidden');
  $('teach-feedback').innerHTML = ''; $('teach-ai').innerHTML = ''; $('teach-recommend').innerHTML = '';
  renderAllPieces(); renderCaptured(); renderMoveList(); updateAll();
  if (game.mode === 'pva' && game.turn !== game.humanSide) scheduleAi();
  else if (game.mode === 'pva') runTeachAnalysis();
}

/* =====================================================================
 * 存档与恢复（IndexedDB/localStorage/内存三级后端，见 store.js）
 * ===================================================================== */
function gameRecord(id) {
  return {
    id, mode: game.mode, humanSide: game.humanSide, difficulty: game.difficulty, formalRules: game.formalRules,
    turn: game.turn, over: game.over, resultTitle: game.resultTitle,
    moves: game.moveHistory.map(r => ({ from: r.from, to: r.to, piece: r.piece, captured: r.captured, name: r.name })),
    savedAt: Date.now()
  };
}
function autosave() { store.saveGame(gameRecord('current')).catch(() => {}); }
// 终局归档：移入存档列表并清除“进行中”标记，累计胜负统计与人机 Elo
export async function archiveFinishedGame() {
  const id = 'game-' + Date.now();
  try {
    await store.saveGame({ ...gameRecord(id), over: true, result: game.resultTitle });
    await store.deleteGame('current');
    const t = game.resultTitle;
    const s = (await store.getProgress('stats', null)) || { games: 0, red: 0, black: 0, draw: 0, blunders: 0, reviewedPlies: 0 };
    s.games++;
    if (t.includes('红方')) s.red++;
    else if (t.includes('黑方')) s.black++;
    else s.draw++;
    await store.setProgress('stats', s);
    // 人机对局 Elo：AI 档位映射参考分（L1≈520 … L8≈2410），K=32
    if (game.mode === 'pva' && t) {
      const lv = levelById(game.difficulty);
      const aiRating = 250 + lv.id * 270;
      const elo = (await store.getProgress('elo', null)) || { rating: 1200 };
      const expected = 1 / (1 + Math.pow(10, (aiRating - elo.rating) / 400));
      const humanWon = t.startsWith(sideName(game.humanSide));
      const sc = t === '和棋' ? 0.5 : (humanWon ? 1 : 0);
      elo.rating = Math.max(100, Math.round(elo.rating + 32 * (sc - expected)));
      elo.games = (elo.games || 0) + 1;
      await store.setProgress('elo', elo);
    }
  } catch (e) { /* 存档失败不影响对局 */ }
}
// 把存档重放到 game 状态（resume 与载入存档共用）
function replayIntoGame(rec, { asFinished }) {
  const bd = initialBoard();
  const hist = [];
  let noCap = 0;
  const streak = { r: 0, b: 0 };
  for (const mv of rec.moves) {
    const mover = sideOf(mv.piece);
    const gaveCheck = isInCheck(bdAfter(bd, mv), other(mover));
    hist.push({ ...mv, prevNoCapture: noCap, prevStreakR: streak.r, prevStreakB: streak.b, gaveCheck });
    bd[mv.to] = mv.piece; bd[mv.from] = null;
    noCap = mv.captured ? 0 : noCap + 1;
    if (gaveCheck) streak[mover]++; else streak[mover] = 0;
  }
  game.board = bd;
  game.moveHistory = hist;
  game.mode = rec.mode || 'pva';
  game.humanSide = rec.humanSide || RED;
  game.difficulty = rec.difficulty || '5';
  game.formalRules = !!rec.formalRules;
  game.noCapture = noCap;
  game.checkStreak = streak;
  game.posCounts = new Map();
  if (game.formalRules) {
    bumpPos(initialBoard(), RED, null);
    const b2 = initialBoard();
    for (const h of hist) { b2[h.to] = h.piece; b2[h.from] = null; bumpPos(b2, sideOf(h.piece) === RED ? BLACK : RED, h); }
  }
  if (asFinished) {
    game.over = true;
    game.resultTitle = rec.result || rec.resultTitle || '已结束';
    game.resultDesc = rec.resultDesc || '';
    game.turn = other(sideOf(rec.moves[rec.moves.length - 1].piece));
  } else {
    game.over = false; game.resultTitle = ''; game.resultDesc = '';
    game.turn = rec.turn;
  }
  resetAiSession();
  runtime.teachCtx = null;
  setBoardOwner('formal');
  syncFlipped();
  ui.selected = -1; ui.targets = [];
  ui.lastMove = rec.moves.length ? { from: rec.moves[rec.moves.length - 1].from, to: rec.moves[rec.moves.length - 1].to } : null;
}
function bdAfter(bd, mv) {   // 走完一步后的棋盘副本（用于重放时判定将军）
  const b = bd.slice();
  b[mv.to] = b[mv.from]; b[mv.from] = null;
  return b;
}
/** 启动时恢复进行中对局；无可恢复返回 false */
export async function resumeCurrentGame() {
  const rec = await store.getGame('current');
  if (!rec || !Array.isArray(rec.moves) || !rec.moves.length || rec.over) return false;
  replayIntoGame(rec, { asFinished: false });
  renderAllPieces(); renderCaptured(); renderMoveList(); updateAll();
  if (game.mode === 'pva' && game.turn !== game.humanSide) scheduleAi();
  else if (game.mode === 'pva') runTeachAnalysis();
  return true;
}
/** 载入一份历史存档（只读浏览，可悔棋回到可下状态） */
export async function loadArchiveGame(id) {
  const rec = await store.getGame(id);
  if (!rec || !rec.moves || !rec.moves.length) return false;
  if (analysis.active) exitAnalysis(true);
  // 学习/复盘会占着主棋盘或用旧快照覆盖它，载入前必须先退出
  if (runtime.study) exitStudy({ silent: true });
  if (runtime.review && runtime.review.active) exitReview();
  replayIntoGame(rec, { asFinished: true });
  $('modal').classList.add('hidden');
  renderAllPieces(); renderCaptured(); renderMoveList(); updateAll();
  return true;
}
export async function deleteArchiveGame(id) { await store.deleteGame(id); }
/** 对局文本导出：中文着法串 + ICCS 坐标串（列 a..i 从左到右，行 0..9 从红方底线向上） */
export function gameText() {
  if (!game.moveHistory.length) return '';
  const zh = game.moveHistory.map((r, i) =>
    (i % 2 === 0 ? Math.floor(i / 2) + 1 + '. ' : '') + r.name).join(' ');
  const sq = i => 'abcdefghi'[colOf(i)] + (9 - rowOf(i));
  const iccs = game.moveHistory.map(r => sq(r.from) + sq(r.to)).join(' ');
  return zh + '\n' + iccs + '\n';
}
/** 当前局面 FEN（推演中为推演局面） */
export function currentFen() {
  return boardToFen(game.board, analysis.active ? analysis.turn : game.turn);
}
/** 把 FEN 局面导入推演棋盘（正式对局不受影响，退出推演即还原） */
export function loadFenIntoAnalysis(fen) {
  let parsed;
  try { parsed = fenToBoard(fen); }
  catch (e) { return { ok: false, msg: e.message }; }
  if (!analysis.active) return { ok: false, msg: '请先进入推演模式再导入局面' };
  game.board = parsed.board;
  analysis.moves = [];
  analysis.turn = parsed.turn;
  analysis.lastMover = null;
  analysis.check = isInCheck(game.board, analysis.turn);
  analysis.over = legalMoves(game.board, analysis.turn).length === 0;
  ui.lastMove = null; ui.selected = -1; ui.targets = [];
  renderAllPieces(); updateAll(); runAnalysisAdvice();
  return { ok: true };
}

/* =====================================================================
 * 教学模式
 * ===================================================================== */
export function runTeachAnalysis() {
  clearRecHighlights();
  $('teach-recommend').innerHTML = '';
  if (game.mode !== 'pva' || teachMode() === 'off' || game.over ||
      game.turn !== game.humanSide || analysis.active || game.thinking) return;
  if (runtime.study || (runtime.review && runtime.review.active)) return;   // 棋盘已被其它模式占用
  if (runtime.boardOwner !== 'formal') return;
  $('teach-recommend').innerHTML = '<span class="tag-line">正在分析局面…</span>';
  const epoch = runtime.aiEpoch;   // 期间换局/换模式则丢弃本次分析结果
  setTimeout(() => {
    if (epoch !== runtime.aiEpoch) return;
    if (game.turn !== game.humanSide || game.over || analysis.active || teachMode() === 'off') return;
    if (runtime.boardOwner !== 'formal' || runtime.study) return;
    const side = game.humanSide;
    const bd = game.board.slice();          // 分析基于快照，期间走子也不会污染结果
    const phase = detectPhase(bd);
    const plyCount = game.moveHistory.length;
    const { recs: searchRecs, best, map, gaps } = buildRecommendations(bd, side, 3, 2, plyCount);
    // 开局库建议排在最前（去重，最多占 2 席），其余席位由搜索推荐补足
    const merged = [];
    const seen = new Set();
    const firstName = plyCount ? game.moveHistory[0].name : '';
    for (const th of openingSuggestions(bd, side, plyCount, firstName).slice(0, 2)) {
      const key = th.from + '-' + th.to;
      if (seen.has(key)) continue;
      seen.add(key);
      // 开局库着法若在搜索列表里就用它的真实差距，否则按并列最佳处理
      const gap = gaps[key] === undefined ? 0 : gaps[key];
      merged.push({
        m: { from: th.from, to: th.to },
        gap, gapText: formatGap(gap),
        idea: '开局库 · ' + th.label, reason: th.tip, risk: '暂无明显风险',
        reply: bestReplyName(bd, { from: th.from, to: th.to }, side), theory: true
      });
    }
    for (const r of searchRecs) {
      if (merged.length >= 3) break;
      const key = r.m.from + '-' + r.m.to;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
    runtime.teachCtx = {
      recs: merged, best, map, gaps, phase, side,
      verdict: positionVerdict(bd, side, best ? best.v : undefined),
      plan: strategyPlan(bd, side, phase),
      losingTips: losingPlan(bd, side),
      diag: positionDiagnostics(bd, side, plyCount),
      threats: opponentThreats(bd, side)
    };
    renderTeachPanel();
    renderHints();
  }, 30);
}
// 玩家走完后的简要评价（好棋 / 一般 / 可改进）
function onHumanMoved(m, beforeBoard, name) {
  const ctx = runtime.teachCtx;              // 先取走既有分析，再清理高亮
  clearRecHighlights();
  const box = $('teach-feedback');
  if (teachMode() === 'off') { box.innerHTML = ''; return; }
  const useCtx = ctx || buildRecommendations(beforeBoard, game.humanSide, 3, 2, game.moveHistory.length);
  if (!useCtx || !useCtx.best) { box.innerHTML = ''; return; }
  const key = m.from + '-' + m.to;
  // 一律用「与最佳着的差距」判断好坏。绝对评估 v 落后时为负，
  // 拿它当门槛（如 v <= 30）会让落后方的任何着法都被判“好棋”。
  const gap = useCtx.gaps && useCtx.gaps[key] !== undefined
    ? useCtx.gaps[key]
    : Math.max(0, (useCtx.best ? useCtx.best.v : 0) - (useCtx.map[key] === undefined ? (useCtx.best ? useCtx.best.v : 0) : useCtx.map[key]));
  let cls, label;
  if (useCtx.best && useCtx.best.m.from === m.from && useCtx.best.m.to === m.to) { cls = 'eval-good'; label = '好棋！与推荐一致'; }
  else if (gap <= 30) { cls = 'eval-good'; label = '好棋！'; }
  else if (gap <= 120) { cls = 'eval-ok'; label = '一般'; }
  else { cls = 'eval-bad'; label = '可改进'; }
  let html = '你走了 <b>' + name + '</b>：<span class="' + cls + '">' + label + '</span>';
  // 落后局面下别只说“可改进”，把差距量级也告诉用户（小差距就别制造焦虑）
  if (gap > 30) html += '<span class="tag-line">（与最佳着 ' + formatGap(gap) + '）</span>';
  if (cls === 'eval-bad' && useCtx.best) html += '，更佳是「' + moveName(beforeBoard, useCtx.best.m) + '」';
  box.innerHTML = html;
  runtime.teachCtx = null;
}
// AI 走完后的意图说明
function renderAiIntent(beforeBoard, m) {
  const box = $('teach-ai');
  if (game.mode !== 'pva' || teachMode() === 'off') { box.innerHTML = ''; return; }
  box.innerHTML = '<span class="tag-line">' + describeAiMove(beforeBoard, m, aiSide(), game.moveHistory.length) + '</span>';
}

/* =====================================================================
 * 推演模式
 * ===================================================================== */
export function enterAnalysis() {
  if (game.thinking) return toast('AI 思考中，请稍候');
  if (runtime.study) return toast('请先退出学习模式');
  if (runtime.review && runtime.review.active) return toast('请先退出复盘模式');
  analysis.active = true;
  setBoardOwner('analysis');
  analysis.snapshot = {
    board: game.board.slice(), turn: game.turn,
    streakR: game.checkStreak.r, streakB: game.checkStreak.b, noCapture: game.noCapture
  };
  analysis.moves = [];
  analysis.turn = game.turn;
  analysis.over = false; analysis.check = isInCheck(game.board, game.turn);
  analysis.lastMover = null;
  ui.selected = -1; ui.targets = []; runtime.teachCtx = null;
  clearRecHighlights();
  $('card-analysis').classList.remove('hidden');
  $('card-teach').classList.add('hidden');
  $('btn-analysis').disabled = true;
  $('btn-new').disabled = true; $('btn-undo').disabled = true;
  ['sel-mode', 'sel-side', 'sel-diff', 'sel-teach'].forEach(id => $(id).disabled = true);
  $('modal').classList.add('hidden');
  renderAllPieces(); updateAll(); runAnalysisAdvice();
}
export function exitAnalysis(silent) {
  if (!analysis.active) return;
  const s = analysis.snapshot;
  game.board = s.board.slice();
  game.turn = s.turn;
  game.checkStreak.r = s.streakR; game.checkStreak.b = s.streakB;
  game.noCapture = s.noCapture;
  analysis.active = false; analysis.moves = [];
  setBoardOwner('formal');
  ui.selected = -1; ui.targets = []; ui.lastMove = null;
  $('card-analysis').classList.add('hidden');
  $('card-teach').classList.remove('hidden');
  $('btn-analysis').disabled = false;
  $('btn-new').disabled = false; $('btn-undo').disabled = false;
  ['sel-mode', 'sel-side', 'sel-diff', 'sel-teach'].forEach(id => $(id).disabled = false);
  renderAllPieces(); renderCaptured(); renderMoveList(); updateAll();
  if (!silent && game.mode === 'pva') {
    if (game.turn !== game.humanSide && !game.over) scheduleAi();
    else if (game.turn === game.humanSide && !game.over) runTeachAnalysis();
  }
}
export function applyAnalysisMove(m) {
  const mover = sideOf(game.board[m.from]);
  const rec = { from: m.from, to: m.to, piece: game.board[m.from], captured: game.board[m.to] };
  analysis.moves.push(rec);
  game.board[m.to] = game.board[m.from]; game.board[m.from] = null;
  analysis.lastMover = mover;
  analysis.turn = other(mover);
  ui.lastMove = { from: m.from, to: m.to };
  ui.selected = -1; ui.targets = [];
  analysis.check = isInCheck(game.board, analysis.turn);
  analysis.over = legalMoves(game.board, analysis.turn).length === 0;
  visualApplyMove(m.from, m.to);
  if (rec.captured) snd.capture(); else snd.move();
  if (analysis.check) snd.check();
  updateAll(); runAnalysisAdvice();
}
export function undoAnalysis() {
  if (!analysis.moves.length) return toast('没有可撤销的推演');
  const rec = analysis.moves.pop();
  game.board[rec.from] = rec.piece;
  game.board[rec.to] = rec.captured;
  analysis.turn = sideOf(rec.piece);
  snd.undo();
  analysis.over = false;
  analysis.check = isInCheck(game.board, analysis.turn);
  ui.lastMove = analysis.moves.length ? { from: analysis.moves[analysis.moves.length - 1].from, to: analysis.moves[analysis.moves.length - 1].to } : null;
  ui.selected = -1; ui.targets = [];
  renderAllPieces(); updateAll(); runAnalysisAdvice();
}
export function resetAnalysis() {
  const s = analysis.snapshot;
  game.board = s.board.slice();
  analysis.turn = s.turn;
  analysis.moves = []; analysis.over = false;
  analysis.check = isInCheck(game.board, analysis.turn);
  analysis.lastMover = null;
  ui.lastMove = null; ui.selected = -1; ui.targets = [];
  renderAllPieces(); updateAll(); runAnalysisAdvice();
}
function runAnalysisAdvice() {
  const box = $('analysis-info');
  const mySide = adviceSide();
  let html = '<div>当前推演走子方：<b>' + sideName(analysis.turn) + '</b>　我方：<b>' + sideName(mySide) + '</b></div>';
  if (analysis.check) html += '<div class="threat">⚠ ' + sideName(analysis.turn) + '正被将军</div>';
  if (analysis.over) html += '<div class="threat">推演局面：' + sideName(analysis.turn) + '无子可动（' +
    (analysis.check ? '被将死' : '被困毙') + '）——仅推演结果，不影响正式对局。请撤销/重置/退出。</div>';
  if (analysis.lastMover && analysis.lastMover !== mySide) {
    html += '<div style="color:#ffd97a">你刚推演了对方（' + sideName(analysis.lastMover) + '）的走法，我方应如何应对：</div>';
  }
  html += '<div id="analysis-recs"><span class="tag-line">正在分析推演局面…</span></div>';
  box.innerHTML = html;
  if (analysis.over) return;
  setTimeout(() => {
    if (!analysis.active) return;
    const phase = detectPhase(game.board);
    const { recs, best } = buildRecommendations(game.board, mySide, 3, 2, game.moveHistory.length);
    const threats = opponentThreats(game.board, mySide);
    const diag = positionDiagnostics(game.board, mySide, game.moveHistory.length);
    const verdict = positionVerdict(game.board, mySide, best ? best.v : undefined);
    let h = '<div><b>局面判断：</b><span class="' + verdict.cls + '">' + verdict.label + '</span>' +
      '<div class="why">' + verdict.detail + '</div></div>' +
      '<div class="why">' + strategyPlan(game.board, mySide, phase) + '</div>';
    if (recs.length) {
      h += '<b>我方（' + sideName(mySide) + '）推荐走法：</b>';
      recs.forEach((r, i) => {
        const gap = r.gap === undefined ? 0 : r.gap;
        const gapCls = gap <= 0 ? 'eval-good' : (gap < 150 ? 'eval-ok' : 'eval-bad');
        h += '<div class="rec-item" data-a="' + i + '"><b>' + (i + 1) + '. ' + moveName(game.board, r.m) + '</b>' +
          '<span class="' + gapCls + '">（' + (r.gapText || formatGap(gap)) + '）</span> · ' + r.idea +
          '<div class="why">理由：' + r.reason + (r.reply ? '<br>预计对方：' + r.reply : '') + '</div>' +
          '<div class="risk">风险：' + r.risk + '</div></div>';
      });
    } else {
      h += '<div class="tag-line">我方无合法走法</div>';
    }
    h += '<b>局面诊断：</b>' +
      (diag.length ? diag.map(d => '<div class="threat">· ' + d + '</div>').join('') : '<div class="tag-line">暂无明显结构问题</div>');
    h += '<b>对方威胁提示：</b>';
    h += threats.length ? threats.map(t => '<div class="threat">· ' + t + '</div>').join('') : '<div class="tag-line">暂未发现对方明显威胁</div>';
    const target = $('analysis-recs');
    if (target) target.innerHTML = h;
    target.querySelectorAll('.rec-item').forEach(el => {
      el.addEventListener('click', () => {
        const r = recs[+el.dataset.a];
        if (r) flashMove(r.m);
      });
    });
  }, 30);
}
