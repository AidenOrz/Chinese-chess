// @ts-check
/* =====================================================================
 * 中文着法记谱（炮二平五 / 马8进7 等）
 * ===================================================================== */
import { ROWS, idx, rowOf, colOf, sideOf, typeOf, RED, CN_NUM, PIECE_NAME } from './board.js';

function fileNum(side, c) { return side === RED ? 9 - c : c + 1; }
function numStr(side, n) { return side === RED ? (CN_NUM[n] || n) : String(n); }
export function moveName(bd, m) {
  const p = bd[m.from];
  if (!p) return '?';
  const side = sideOf(p), t = typeOf(p);
  const fr = rowOf(m.from), fc = colOf(m.from), tr = rowOf(m.to), tc = colOf(m.to);
  const ch = PIECE_NAME[t];   // 记谱用通用字（马/车），红中文数字、黑阿拉伯数字区分双方
  // 同列同名棋子消歧（前/中/后）
  const mates = [];
  for (let r = 0; r < ROWS; r++) if (bd[idx(r, fc)] === p && r !== fr) mates.push(r);
  let prefix = '';
  if (mates.length) {
    const all = [...mates, fr].sort((a, b) => side === RED ? a - b : b - a);   // 排在最前为“前”
    const myIdx = all.indexOf(fr);
    // 同线 3 子用前/中/后；4 子及以上用 前/二/三/…/后
    prefix = myIdx === 0 ? '前' : (myIdx === all.length - 1 ? '后' :
      (all.length === 3 ? '中' : CN_NUM[myIdx + 1]));
  }
  const dirChar = tr === fr ? '平' : ((side === RED ? tr < fr : tr > fr) ? '进' : '退');
  let dest;
  if (tr === fr || t === 'N' || t === 'B' || t === 'A') dest = numStr(side, fileNum(side, tc));
  else dest = numStr(side, Math.abs(tr - fr));
  if (prefix) return prefix + ch + dirChar + dest;
  return ch + numStr(side, fileNum(side, fc)) + dirChar + dest;
}
