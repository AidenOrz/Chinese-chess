// @ts-check
/* =====================================================================
 * 局面评估（子力 + 位置分表 + 结构分，红方为正）
 * ===================================================================== */
import { ROWS, COLS, idx, rowOf, colOf, sideOf, typeOf, other, isUpper, RED, BLACK } from './board.js';
import { findKing } from './moves.js';

// 子力价值（搜索/评估用）
export const VAL = { K: 100000, R: 900, N: 400, C: 450, P: 100, A: 200, B: 200 };
export const MATE = 1000000;

const PST_P = [
  [0, 3, 6, 9, 12, 9, 6, 3, 0],
  [18, 36, 56, 80, 120, 80, 56, 36, 18],
  [14, 26, 42, 60, 80, 60, 42, 26, 14],
  [10, 20, 30, 34, 40, 34, 30, 20, 10],
  [6, 12, 18, 18, 20, 18, 18, 12, 6],
  [2, 0, 8, 0, 8, 0, 8, 0, 2],
  [0, 0, -2, 0, 4, 0, -2, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0]
];
const PST_N = [
  [0, -4, 0, 0, 0, 0, 0, -4, 0],
  [0, 2, 4, 4, -2, 4, 4, 2, 0],
  [4, 2, 8, 8, 4, 8, 8, 2, 4],
  [2, 6, 8, 6, 8, 6, 8, 6, 2],
  [4, 12, 16, 14, 12, 14, 16, 12, 4],
  [6, 16, 14, 18, 16, 18, 14, 16, 6],
  [8, 24, 18, 24, 20, 24, 18, 24, 8],
  [12, 14, 16, 20, 18, 20, 16, 14, 12],
  [4, 10, 28, 16, 8, 16, 28, 10, 4],
  [4, 8, 16, 12, 4, 12, 16, 8, 4]
];
const PST_C = [
  [6, 4, 0, -10, -12, -10, 0, 4, 6],
  [2, 2, 0, -4, -14, -4, 0, 2, 2],
  [2, 2, 0, -10, -8, -10, 0, 2, 2],
  [0, 0, -2, 4, 10, 4, -2, 0, 0],
  [0, 0, 0, 2, 8, 2, 0, 0, 0],
  [-2, 0, 4, 2, 2, 2, 4, 0, -2],
  [0, 0, 0, 2, 4, 2, 0, 0, 0],
  [4, 0, 8, 6, 10, 6, 8, 0, 4],
  [0, 2, 4, 6, 6, 6, 4, 2, 0],
  [0, 0, 8, 4, 10, 4, 8, 0, 0]
];
const PST_R = [
  [14, 14, 12, 18, 16, 18, 12, 14, 14],
  [16, 20, 18, 24, 26, 24, 18, 20, 16],
  [12, 12, 12, 18, 16, 18, 12, 12, 12],
  [12, 18, 16, 22, 22, 22, 16, 18, 12],
  [12, 14, 12, 18, 18, 18, 12, 14, 12],
  [12, 16, 14, 20, 20, 20, 14, 16, 12],
  [6, 10, 8, 14, 14, 14, 8, 10, 6],
  [4, 8, 6, 14, 12, 14, 6, 8, 4],
  [8, 4, 8, 16, 8, 16, 8, 4, 8],
  [-2, 10, 6, 14, 12, 14, 6, 10, -2]
];
const PST_K = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-4, -6, -8, -10, -12, -10, -8, -6, -4],
  [0, 0, 0, 2, 4, 2, 0, 0, 0],
  [-2, -2, 0, 4, 10, 4, 0, -2, -2]
];
function pst(t, r, c) {
  switch (t) {
    case 'P': return PST_P[r][c];
    case 'N': return PST_N[r][c];
    case 'C': return PST_C[r][c];
    case 'R': return PST_R[r][c];
    case 'K': return PST_K[r][c];
    default: return 0;
  }
}
// 己方底线行号
export const backRowOf = s => (s === RED ? 9 : 0);

// 结构分：士象完整度、窝心马、沉底车、对方空头炮威胁（side 视角）
export function structureScore(bd, side) {
  let v = 0, adv = 0, ele = 0, enemyR = false, enemyC = false;
  const opp = other(side);
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = bd[i];
    if (!p) continue;
    const t = typeOf(p);
    if (sideOf(p) === side) {
      if (t === 'A') adv++;
      else if (t === 'B') ele++;
      else if (t === 'N' && i === (side === RED ? idx(8, 4) : idx(1, 4))) v -= 25;   // 窝心马自困
      else if (t === 'R' && rowOf(i) === backRowOf(opp)) v += 18;                    // 沉底车压境
    } else {
      if (t === 'R') enemyR = true;
      else if (t === 'C') enemyC = true;
    }
  }
  v += (adv + ele - 4) * 16;                       // 每缺一盾（士象）扣分
  if (adv <= 1 && enemyR) v -= 28;                 // 缺士怕车
  if (ele <= 1 && enemyC) v -= 28;                 // 缺象怕炮
  const kr = findKing(bd, side);                   // 空头炮：敌炮与帅同列且中间无子
  if (kr >= 0) {
    for (let i = 0; i < ROWS * COLS; i++) {
      const p = bd[i];
      if (!p || sideOf(p) !== opp || typeOf(p) !== 'C' || colOf(i) !== colOf(kr)) continue;
      const dir = Math.sign(rowOf(kr) - rowOf(i));
      let blocked = false;
      for (let r = rowOf(i) + dir; r !== rowOf(kr); r += dir) if (bd[idx(r, colOf(kr))]) { blocked = true; break; }
      if (!blocked) { v -= 30; break; }
    }
  }
  return v;
}
export function evalBoard(bd) {   // 返回红方视角分值
  let s = 0;
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = bd[i];
    if (!p) continue;
    const t = typeOf(p);
    if (isUpper(p)) s += VAL[t] + pst(t, rowOf(i), colOf(i));
    else s -= VAL[t] + pst(t, 9 - rowOf(i), 8 - colOf(i));   // 黑方镜像
  }
  s += structureScore(bd, RED) - structureScore(bd, BLACK);
  return s;
}
export const evalSide = (bd, side) => side === RED ? evalBoard(bd) : -evalBoard(bd);

// 纯子力差（不含位置分），side 视角
export function materialLead(bd, side) {
  let s = 0;
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = bd[i];
    if (!p) continue;
    const t = typeOf(p);
    if (t === 'K') continue;
    s += (sideOf(p) === side ? 1 : -1) * VAL[t];
  }
  return s;
}
// 局面阶段
export function detectPhase(bd) {
  let mat = 0, big = 0;
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = bd[i];
    if (!p) continue;
    const t = typeOf(p);
    if (t === 'K') continue;
    mat += VAL[t];
    if (t === 'R' || t === 'N' || t === 'C') big++;
  }
  if (mat >= 8600) return 'opening';
  if (mat <= 3000 || big <= 3) return 'end';
  return 'mid';
}
export const PHASE_NAME = { opening: '开局', mid: '中局', end: '残局' };

// 中长期方针（按阶段与子力差给出下棋策略）
export function strategyPlan(bd, side, phase) {
  const lead = materialLead(bd, side);
  if (phase === 'opening') return '开局方针：快速出车、活通马路，兵卒伺机挺起；先出大子后补士象，注意帅(将)门安全。';
  if (phase === 'end') {
    if (lead > 150) return '残局方针：子力领先，宜兑子简化局面，快速推进兵卒配合车炮做杀。';
    if (lead < -150) return '残局方针：子力落后，宜多换大子减轻压力，士象护帅、守住关键线争取守和。';
    return '残局方针：双方接近，兵卒位置与帅(将)安全决定胜负，谨防对方兵卒偷袭。';
  }
  if (lead > 150) return '中局方针：局面领先，可主动兑子简化，稳步扩大优势。';
  if (lead < -150) return '中局方针：局面落后，宜制造复杂变化、牵制对方主力，寻找反击机会。';
  return '中局方针：局面接近，重点争夺河沿与中路要道，保持子力联系，伺机夺取主动。';
}
