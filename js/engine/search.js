// @ts-check
/* =====================================================================
 * 搜索（负极大 + Alpha-Beta + 迭代加深 + Zobrist 置换表 + 吃子静态延伸）
 * 纯函数，不读任何全局状态
 * ===================================================================== */
import { sideOf, typeOf, other, isUpper } from './board.js';
import { pseudoAll, isInCheck, legalMoves } from './moves.js';
import { VAL, MATE, evalSide } from './eval.js';

/* ---------------- Zobrist 哈希（确定性种子，便于测试） ---------------- */
const PIECE_SLOT = { K: 0, A: 1, B: 2, N: 3, R: 4, C: 5, P: 6 };
const ZOB_KEY = new Int32Array(90 * 14);
const ZOB_LOCK = new Int32Array(90 * 14);
let ZOB_SIDE_KEY = 0, ZOB_SIDE_LOCK = 0;
(function initZobrist() {
  let s = 0x9e3779b9 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s | 0; };
  for (let i = 0; i < ZOB_KEY.length; i++) { ZOB_KEY[i] = rnd(); ZOB_LOCK[i] = rnd(); }
  ZOB_SIDE_KEY = rnd(); ZOB_SIDE_LOCK = rnd();
})();
function pieceSlot(p) { const t = PIECE_SLOT[typeOf(p)]; return isUpper(p) ? t : t + 7; }
/** 局面哈希：同局面同键；key 用于索引、lock 用于校验（32+32 位降低碰撞） */
export function hashOf(bd, side) {
  let key = 0, lock = 0;
  for (let i = 0; i < 90; i++) {
    const p = bd[i];
    if (!p) continue;
    const s = pieceSlot(p) * 90 + i;
    key ^= ZOB_KEY[s]; lock ^= ZOB_LOCK[s];
  }
  if (side === 'b') { key ^= ZOB_SIDE_KEY; lock ^= ZOB_SIDE_LOCK; }
  return { key: key | 0, lock: lock | 0 };
}

/* ---------------- 置换表 ---------------- */
const TT_BITS = 16, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const ttLock = new Int32Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE);
const ttFrom = new Int16Array(TT_SIZE), ttTo = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);   // 0=精确 1=下界 2=上界
export function clearTT() { ttLock.fill(0); ttDepth.fill(0); }

/* ---------------- 搜索 ---------------- */
let searchDeadline = 0, searchAborted = false, searchNodes = 0;
function timeUp() {
  if (searchAborted) return true;
  if ((++searchNodes & 255) === 0 && Date.now() > searchDeadline) searchAborted = true;
  return searchAborted;
}
function orderMoves(bd, moves, ttMove) {   // 置换表着法最优先，其后吃子优先（MVV-LVA）
  for (const m of moves) {
    const victim = bd[m.to];
    m.score = victim ? VAL[typeOf(victim)] * 8 - VAL[typeOf(bd[m.from])] : 0;
    if (ttMove && m.from === ttMove.from && m.to === ttMove.to) m.score = 1e9;
  }
  moves.sort((a, b) => b.score - a.score);
}
function negamax(bd, side, depth, alpha, beta, ply, useQ, key, lock) {
  if (timeUp()) return evalSide(bd, side);
  if (depth <= 0) return useQ ? quiesce(bd, side, alpha, beta, 4, ply) : evalSide(bd, side);
  // 置换表探测
  const ti = key & TT_MASK;
  let hashFrom = -1, hashTo = -1;
  if (ttLock[ti] === lock) {
    hashFrom = ttFrom[ti]; hashTo = ttTo[ti];
    if (ttDepth[ti] >= depth) {
      let s = ttScore[ti];
      if (s > MATE - 1000) s -= ply; else if (s < -MATE + 1000) s += ply;   // 杀棋分距还原
      const f = ttFlag[ti];
      if (f === 0) return s;
      if (f === 1 && s >= beta) return s;
      if (f === 2 && s <= alpha) return s;
    }
  }
  const moves = pseudoAll(bd, side);
  orderMoves(bd, moves, hashFrom >= 0 ? { from: hashFrom, to: hashTo } : null);
  let best = -Infinity, any = false;
  let bestFrom = -1, bestTo = -1;
  const alphaOrig = alpha;
  for (const m of moves) {
    const cap = bd[m.to];
    const mover = bd[m.from];
    bd[m.to] = mover; bd[m.from] = null;
    if (isInCheck(bd, side)) { bd[m.from] = bd[m.to]; bd[m.to] = cap; continue; }   // 送将/照面：非法
    any = true;
    // 增量更新子节点哈希：移除起点、落到终点、移除被吃子、翻转走子方
    const ms = pieceSlot(mover);
    let k = key ^ ZOB_SIDE_KEY ^ ZOB_KEY[ms * 90 + m.from] ^ ZOB_KEY[ms * 90 + m.to];
    let lk = lock ^ ZOB_SIDE_LOCK ^ ZOB_LOCK[ms * 90 + m.from] ^ ZOB_LOCK[ms * 90 + m.to];
    if (cap) { const cs = pieceSlot(cap); k ^= ZOB_KEY[cs * 90 + m.to]; lk ^= ZOB_LOCK[cs * 90 + m.to]; }
    const v = -negamax(bd, other(side), depth - 1, -beta, -alpha, ply + 1, useQ, k | 0, lk | 0);
    bd[m.from] = bd[m.to]; bd[m.to] = cap;
    if (searchAborted) return best === -Infinity ? evalSide(bd, side) : best;
    if (v > best) { best = v; bestFrom = m.from; bestTo = m.to; }
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  if (!any) return -(MATE - ply);   // 无合法着法：将死或困毙，均判负
  // 置换表保存（杀棋分转为距本节点的距离存储）
  let sStore = best;
  if (sStore > MATE - 1000) sStore += ply; else if (sStore < -MATE + 1000) sStore -= ply;
  const t2 = key & TT_MASK;
  ttLock[t2] = lock; ttDepth[t2] = depth; ttScore[t2] = sStore;
  ttFlag[t2] = best <= alphaOrig ? 2 : (best >= beta ? 1 : 0);
  ttFrom[t2] = bestFrom; ttTo[t2] = bestTo;
  return best;
}
function quiesce(bd, side, alpha, beta, qd, ply) {
  if (timeUp() || qd <= 0) return evalSide(bd, side);
  const stand = evalSide(bd, side);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const caps = pseudoAll(bd, side).filter(m => bd[m.to]);
  orderMoves(bd, caps, null);
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
/* ---------------- 根节点：迭代加深 ----------------
 * 时间预算内从 1 层逐层加深；某层超时则保留上一轮完整结果。
 * exact=true 时每个走法全窗口（教学精确评分）。
 * opts: { depth, useQ, timeMs, exact, randomWindow, blunderChance }
 */
export function findBestMove(liveBoard, side, opts) {
  const bd = liveBoard.slice();   // 在副本上搜索，绝不影响调用方棋局
  searchAborted = false; searchNodes = 0;
  searchDeadline = Date.now() + (opts.timeMs || 3000);
  const legal = legalMoves(bd, side);
  if (!legal.length) return { list: [] };
  const maxDepth = Math.max(1, opts.depth || 3);
  const h0 = hashOf(bd, side);
  let results = legal.map(m => ({ m, v: 0 }));
  for (let d = 1; d <= maxDepth; d++) {
    const iter = [];
    let alpha = -Infinity;
    for (const { m } of results) {   // 上一轮的排序即本轮的着法顺序
      const cap = bd[m.to];
      bd[m.to] = bd[m.from]; bd[m.from] = null;
      const a = opts.exact ? -Infinity : alpha;
      const hk = hashOf(bd, other(side));   // 根节点子局面数量少，直接重算哈希
      const v = -negamax(bd, other(side), d - 1, -Infinity, -a, 1, !!opts.useQ, hk.key, hk.lock);
      bd[m.from] = bd[m.to]; bd[m.to] = cap;
      if (searchAborted) break;
      iter.push({ m, v });
      if (v > alpha) alpha = v;
    }
    if (searchAborted) break;   // 丢弃未完成的这一轮，保留上一轮完整结果
    results = iter;
    results.sort((x, y) => y.v - x.v);
  }
  return { list: results, aborted: searchAborted };
}

// AI 选着：低档按 blunderChance 概率刻意选明显更差的一手（模拟初学者送子/漏守），
// 其余在头部随机窗口内取一着制造风格差异
export function chooseMove(board, side, opts) {
  const { list } = findBestMove(board, side, opts);
  if (!list.length) return null;
  if (opts.blunderChance && Math.random() < opts.blunderChance) {
    const bad = list.filter(x => x.v <= list[0].v - 150);
    if (bad.length) return bad[Math.floor(Math.random() * bad.length)].m;
  }
  const best = list[0].v;
  const window = opts.randomWindow !== undefined ? opts.randomWindow : 20;
  if (window <= 0) return list[0].m;
  const cands = list.filter(x => x.v >= best - window);
  return cands[Math.floor(Math.random() * cands.length)].m;
}
