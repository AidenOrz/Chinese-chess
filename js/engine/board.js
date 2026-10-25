// @ts-check
/* =====================================================================
 * 棋盘基础：坐标、棋子编码、初始局面
 * 棋盘坐标：r=0 顶部（黑方底线），r=9 底部（红方底线），c=0..8 从左到右
 * 棋子编码：大写=红方 K帅 A仕 B相 N马 R车 C炮 P兵；小写=黑方
 * ===================================================================== */

/** @typedef {'r'|'b'} Side */
/** @typedef {string} Piece */
/** @typedef {Array.<Piece|null>} Board 长度 90，下标 = r*9+c */
/** @typedef {{from:number, to:number, piece?:Piece, captured?:Piece|null, name?:string}} Move */

export const ROWS = 10, COLS = 9;
export const RED = 'r', BLACK = 'b';
export const idx = (r, c) => r * COLS + c;
export const rowOf = i => (i / COLS) | 0;
export const colOf = i => i % COLS;
export const other = s => (s === RED ? BLACK : RED);
export const isUpper = ch => ch >= 'A' && ch <= 'Z';
export const sideOf = p => isUpper(p) ? RED : BLACK;
export const typeOf = p => isUpper(p) ? p : String.fromCharCode(p.charCodeAt(0) - 32);
export const inBoard = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const sideName = s => s === RED ? '红方' : '黑方';
export const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const KNIGHT_D = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];
export const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 棋子显示字符（红用传统红方字，黑用传统黑方字）与通用名称
export const PIECE_CHAR = {
  r: { K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵' },
  b: { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '砲', P: '卒' }
};
export const PIECE_NAME = { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' };
export const fullName = p => sideName(sideOf(p)).replace('方', '') + PIECE_NAME[typeOf(p)];

// 九宫判断（仕/帅活动范围），以及是否已过河
export function inPalace(side, r, c) { return c >= 3 && c <= 5 && (side === RED ? r >= 7 : r <= 2); }
export function crossed(side, r) { return side === RED ? r <= 4 : r >= 5; }

// 初始局面
export function initialBoard() {
  const bd = new Array(ROWS * COLS).fill(null);
  const back = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'];
  for (let c = 0; c < COLS; c++) { bd[idx(0, c)] = back[c].toLowerCase(); bd[idx(9, c)] = back[c]; }
  bd[idx(2, 1)] = 'c'; bd[idx(2, 7)] = 'c'; bd[idx(7, 1)] = 'C'; bd[idx(7, 7)] = 'C';
  for (let c = 0; c < COLS; c += 2) { bd[idx(3, c)] = 'p'; bd[idx(6, c)] = 'P'; }
  return bd;
}
