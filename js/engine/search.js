// @ts-check
/* =====================================================================
 * 搜索（负极大 + Alpha-Beta + 吃子静态延伸）——纯函数，不读任何全局状态
 * ===================================================================== */
import { sideOf, typeOf, other } from './board.js';
import { pseudoAll, isInCheck, legalMoves } from './moves.js';
import { VAL, MATE, evalSide } from './eval.js';

let searchDeadline = 0, searchAborted = false, searchNodes = 0;
function timeUp() {
  if (searchAborted) return true;
  if ((++searchNodes & 255) === 0 && Date.now() > searchDeadline) searchAborted = true;
  return searchAborted;
}
function orderMoves(bd, moves) {   // 吃子优先（MVV-LVA）
  for (const m of moves) {
    const victim = bd[m.to];
    m.score = victim ? VAL[typeOf(victim)] * 8 - VAL[typeOf(bd[m.from])] : 0;
  }
  moves.sort((a, b) => b.score - a.score);
}
function negamax(bd, side, depth, alpha, beta, ply, useQ) {
  if (timeUp()) return evalSide(bd, side);
  if (depth <= 0) return useQ ? quiesce(bd, side, alpha, beta, 4, ply) : evalSide(bd, side);
  const moves = pseudoAll(bd, side);
  orderMoves(bd, moves);
  let best = -Infinity, any = false;
  for (const m of moves) {
    const cap = bd[m.to];
    bd[m.to] = bd[m.from]; bd[m.from] = null;
    if (isInCheck(bd, side)) { bd[m.from] = bd[m.to]; bd[m.to] = cap; continue; }   // 送将/照面：非法
    any = true;
    const v = -negamax(bd, other(side), depth - 1, -beta, -alpha, ply + 1, useQ);
    bd[m.from] = bd[m.to]; bd[m.to] = cap;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
    if (searchAborted) break;
  }
  if (!any) return -(MATE - ply);   // 无合法着法：将死或困毙，均判负
  return best;
}
function quiesce(bd, side, alpha, beta, qd, ply) {
  if (timeUp() || qd <= 0) return evalSide(bd, side);
  const stand = evalSide(bd, side);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const caps = pseudoAll(bd, side).filter(m => bd[m.to]);
  orderMoves(bd, caps);
  for (const m of caps) {
    const cap = bd[m.to];
    bd[m.to] = bd[m.from]; bd[m.from] = null;
    if (isInCheck(bd, side)) { bd[m.from] = bd[m.to]; bd[m.to] = cap; continue; }
    const v = -quiesce(bd, other(side), -beta, -alpha, qd - 1, ply + 1);
    bd[m.from] = bd[m.to]; bd[m.to] = cap;
    if (v > alpha) { alpha = v; if (alpha >= beta) break; }
    if (searchAborted) break;
  }
  return alpha;
}
// 根节点搜索：对每个合法走法打分。exact=true 时每个走法使用全窗口（用于教学精确评分）
export function findBestMove(liveBoard, side, opts) {
  const bd = liveBoard.slice();   // 在副本上搜索，绝不影响调用方棋局
  searchAborted = false; searchNodes = 0;
  searchDeadline = Date.now() + (opts.timeMs || 3000);
  const legal = legalMoves(bd, side);
  if (!legal.length) return { list: [] };
  const results = [];
  let alpha = -Infinity;
  for (const m of legal) {
    const cap = bd[m.to];
    bd[m.to] = bd[m.from]; bd[m.from] = null;
    const a = opts.exact ? -Infinity : alpha;
    const v = -negamax(bd, other(side), opts.depth - 1, -Infinity, -a, 1, !!opts.useQ);
    bd[m.from] = bd[m.to]; bd[m.to] = cap;
    results.push({ m, v });
    if (v > alpha) alpha = v;
    if (searchAborted) break;
  }
  results.sort((x, y) => y.v - x.v);
  return { list: results, aborted: searchAborted };
}

// AI 选着：在打分列表头部随机窗口内取一着（弱档用大窗口制造失误）
// opts: { depth, useQ, timeMs, exact, randomWindow }
export function chooseMove(board, side, opts) {
  const { list } = findBestMove(board, side, opts);
  if (!list.length) return null;
  const best = list[0].v;
  const window = opts.randomWindow !== undefined ? opts.randomWindow : 20;
  const cands = list.filter(x => x.v >= best - window);
  return cands[Math.floor(Math.random() * cands.length)].m;
}
