// @ts-check
/* =====================================================================
 * FEN 编解码（象棋通行变体：棋子字母 KABNRCP，大写红/小写黑；
 * 行从黑方底线(r=0)到红方底线(r=9)，与棋盘数组一致；
 * 走子方 w/r=红，b=黑。初始局面：
 *   rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w
 * ===================================================================== */
import { ROWS, COLS, idx, rowOf, colOf, RED, BLACK, initialBoard, inPalace } from './board.js';
import { findKing, kingsFacing } from './moves.js';

const VALID = new Set('KABNRCPkabnrcp');

/** 局面 → FEN 字符串 */
export function boardToFen(bd, turn) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = '', empty = 0;
    for (let c = 0; c < COLS; c++) {
      const p = bd[idx(r, c)];
      if (!p) { empty++; continue; }
      if (empty) { s += empty; empty = 0; }
      s += p;
    }
    if (empty) s += empty;
    rows.push(s);
  }
  return rows.join('/') + ' ' + (turn === RED ? 'w' : 'b');
}

/**
 * FEN → { board, turn }。校验失败抛 Error（中文说明原因）。
 * 校验：棋子字符合法、每行展开恰 9 格、共 10 行、双方各恰一帅/将、
 *       帅/将在九宫内、两帅不照面。
 */
export function fenToBoard(fen) {
  if (typeof fen !== 'string') throw new Error('FEN 必须是字符串');
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) throw new Error('FEN 至少包含棋盘与走子方两段');
  const rows = parts[0].split('/');
  if (rows.length !== ROWS) throw new Error('FEN 应有 10 行（实际 ' + rows.length + '）');
  const bd = new Array(ROWS * COLS).fill(null);
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (c >= COLS) throw new Error('第 ' + (r + 1) + ' 行超过 9 格');
      if (ch >= '1' && ch <= '9') { c += Number(ch); continue; }
      if (!VALID.has(ch)) throw new Error('非法棋子字符「' + ch + '」');
      bd[idx(r, c)] = ch;
      c++;
    }
    if (c !== COLS) throw new Error('第 ' + (r + 1) + ' 行应为 9 格（实际 ' + c + '）');
  }
  const tm = parts[1];
  const turn = (tm === 'w' || tm === 'r') ? RED : (tm === 'b' ? BLACK : null);
  if (!turn) throw new Error('走子方应为 w/r（红）或 b（黑）');
  // —— 结构校验 ——
  const count = {};
  for (const p of bd) if (p) count[p] = (count[p] || 0) + 1;
  if ((count['K'] || 0) !== 1) throw new Error('红方应恰有一个帅');
  if ((count['k'] || 0) !== 1) throw new Error('黑方应恰有一个将');
  const limits = { A: 2, B: 2, N: 2, R: 2, C: 2, P: 5 };
  for (const [p, n] of Object.entries(count)) {
    const t = p.toUpperCase();
    if (t === 'K') continue;
    if (n > limits[t]) throw new Error('棋子「' + p + '」数量超限（' + n + ' > ' + limits[t] + '）');
  }
  const kr = findKing(bd, RED), kb = findKing(bd, BLACK);
  if (!inPalace(RED, rowOf(kr), colOf(kr))) throw new Error('红帅不在九宫内');
  if (!inPalace(BLACK, rowOf(kb), colOf(kb))) throw new Error('黑将不在九宫内');
  if (kingsFacing(bd)) throw new Error('两帅照面，不是合法局面');
  return { board: bd, turn };
}

export const INITIAL_FEN = boardToFen(initialBoard(), RED);
