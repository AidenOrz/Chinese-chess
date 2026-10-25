// @ts-check
/* =====================================================================
 * 走法生成（伪合法）与规则校验（将军 / 将帅照面 / 合法走法 / 保护判定）
 * ===================================================================== */
import { ROWS, COLS, idx, rowOf, colOf, sideOf, typeOf, other, inBoard,
         inPalace, crossed, ORTHO, KNIGHT_D, RED, BLACK } from './board.js';

// 生成某格棋子的全部伪合法落点（不含“送将/照面”过滤）
export function pseudoMoves(bd, from) {
  const p = bd[from];
  if (!p) return [];
  const side = sideOf(p), t = typeOf(p);
  const r = rowOf(from), c = colOf(from);
  const res = [];
  const push = (tr, tc) => {
    if (!inBoard(tr, tc)) return;
    const q = bd[idx(tr, tc)];
    if (q && sideOf(q) === side) return;   // 不能落在己方棋子上
    res.push(idx(tr, tc));
  };
  switch (t) {
    case 'K': // 帅/将：九宫内横竖一步
      for (const [dr, dc] of ORTHO) { const tr = r + dr, tc = c + dc; if (inPalace(side, tr, tc)) push(tr, tc); }
      break;
    case 'A': // 仕/士：九宫内斜走一步
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const tr = r + dr, tc = c + dc; if (inPalace(side, tr, tc)) push(tr, tc); }
      break;
    case 'B': // 相/象：走田字，塞象眼，不能过河
      for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
        const tr = r + dr, tc = c + dc;
        if (!inBoard(tr, tc) || crossed(side, tr)) continue;   // 目标不得过河
        if (bd[idx(r + dr / 2, c + dc / 2)]) continue;          // 象眼被塞
        push(tr, tc);
      }
      break;
    case 'N': // 马：走日，蹩马腿
      for (const [dr, dc] of KNIGHT_D) {
        const tr = r + dr, tc = c + dc;
        const legR = Math.abs(dr) === 2 ? r + dr / 2 : r;
        const legC = Math.abs(dc) === 2 ? c + dc / 2 : c;
        if (bd[idx(legR, legC)]) continue;                      // 马腿被蹩
        push(tr, tc);
      }
      break;
    case 'R': // 车：直线，遇子而止（可吃第一个敌子）
      for (const [dr, dc] of ORTHO) {
        let tr = r + dr, tc = c + dc;
        while (inBoard(tr, tc)) {
          const q = bd[idx(tr, tc)];
          if (!q) { res.push(idx(tr, tc)); }
          else { if (sideOf(q) !== side) res.push(idx(tr, tc)); break; }
          tr += dr; tc += dc;
        }
      }
      break;
    case 'C': // 炮：平移不越子；吃子必须隔恰好一个炮架
      for (const [dr, dc] of ORTHO) {
        let tr = r + dr, tc = c + dc, screen = false;
        while (inBoard(tr, tc)) {
          const q = bd[idx(tr, tc)];
          if (!q) { if (!screen) res.push(idx(tr, tc)); }
          else {
            if (!screen) screen = true;
            else { if (sideOf(q) !== side) res.push(idx(tr, tc)); break; }
          }
          tr += dr; tc += dc;
        }
      }
      break;
    case 'P': // 兵/卒：向前；过河后可横走；永不后退
      push(r + (side === RED ? -1 : 1), c);
      if (crossed(side, r)) { push(r, c - 1); push(r, c + 1); }
      break;
  }
  return res;
}

// 一方所有伪合法走法
export function pseudoAll(bd, side) {
  const res = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = bd[i];
    if (!p || sideOf(p) !== side) continue;
    for (const to of pseudoMoves(bd, i)) res.push({ from: i, to });
  }
  return res;
}

export function findKing(bd, side) {
  const k = side === RED ? 'K' : 'k';
  for (let i = 0; i < ROWS * COLS; i++) if (bd[i] === k) return i;
  return -1;
}

// side 的帅/将是否被攻击。纵向射线中首个敌子为对方将帅 → 视为被攻击（即“将帅照面”）。
export function isInCheck(bd, side) {
  const k = findKing(bd, side);
  if (k < 0) return true;
  const r = rowOf(k), c = colOf(k), by = other(side);
  // 直线：第一个子若是敌车则被将；任何第一个子都可作为炮架，炮架后的敌炮构成将军；
  // 纵向第一个子是敌将帅 → 将帅照面，视为被攻击
  for (const [dr, dc] of ORTHO) {
    let tr = r + dr, tc = c + dc, screen = false;
    while (inBoard(tr, tc)) {
      const q = bd[idx(tr, tc)];
      if (q) {
        if (!screen) {
          if (sideOf(q) === by) {
            const t = typeOf(q);
            if (t === 'R') return true;
            if (t === 'K' && dc === 0) return true;   // 将帅照面
          }
          screen = true;                              // 该子成为炮架，继续找第二个子
        } else {
          if (sideOf(q) === by && typeOf(q) === 'C') return true;
          break;
        }
      }
      tr += dr; tc += dc;
    }
  }
  // 马（从帅的位置看马：马腿在马的位置一侧）
  for (const [dr, dc] of KNIGHT_D) {
    const hr = r + dr, hc = c + dc;
    if (!inBoard(hr, hc)) continue;
    const q = bd[idx(hr, hc)];
    if (q && sideOf(q) === by && typeOf(q) === 'N') {
      const legR = Math.abs(dr) === 2 ? r + dr / 2 : r + dr;   // 马走竖日：腿与马同列
      const legC = Math.abs(dc) === 2 ? c + dc / 2 : c + dc;   // 马走横日：腿与马同行
      if (!bd[idx(legR, legC)]) return true;
    }
  }
  // 兵/卒
  if (by === BLACK) { // 黑卒向下走（r 增大），攻击其上方一格与（过河后）左右
    if (r - 1 >= 0 && bd[idx(r - 1, c)] === 'p') return true;
    for (const dc of [-1, 1]) if (c + dc >= 0 && c + dc < COLS && r >= 5 && bd[idx(r, c + dc)] === 'p') return true;
  } else {            // 红兵向上走（r 减小）
    if (r + 1 < ROWS && bd[idx(r + 1, c)] === 'P') return true;
    for (const dc of [-1, 1]) if (c + dc >= 0 && c + dc < COLS && r <= 4 && bd[idx(r, c + dc)] === 'P') return true;
  }
  return false;
}

// 将帅是否照面（同一列且中间无子）
export function kingsFacing(bd) {
  const kr = findKing(bd, RED), kb = findKing(bd, BLACK);
  if (kr < 0 || kb < 0) return false;
  if (colOf(kr) !== colOf(kb)) return false;
  const c = colOf(kr);
  for (let r = rowOf(kb) + 1; r < rowOf(kr); r++) if (bd[idx(r, c)]) return false;
  return true;
}

// 合法走法 = 伪合法 且 走后不被将军（含将帅照面判定）
export function legalMoves(bd, side) {
  const res = [];
  for (const m of pseudoAll(bd, side)) {
    const cap = bd[m.to];
    bd[m.to] = bd[m.from]; bd[m.from] = null;
    const ok = !isInCheck(bd, side);
    bd[m.from] = bd[m.to]; bd[m.to] = cap;
    if (ok) res.push({ from: m.from, to: m.to, piece: bd[m.from], captured: cap });
  }
  return res;
}

// bySide 伪攻击的所有格子集合（用于威胁/保护分析）
export function attackedSquares(bd, bySide) {
  const set = new Set();
  for (const m of pseudoAll(bd, bySide)) set.add(m.to);
  return set;
}

// 某格上的棋子是否被 side 一方保护：须临时清空该格再算攻击范围，
// 否则被己方棋子占住的格子永远不会出现在己方伪攻击集合里（“保护恒为假”的陷阱）
export function isDefended(bd, i, side) {
  const saved = bd[i];
  bd[i] = null;
  let defended = false;
  for (const m of pseudoAll(bd, side)) {
    if (m.to === i && m.from !== i) { defended = true; break; }
  }
  bd[i] = saved;
  return defended;
}
