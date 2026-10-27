// @ts-check
/* =====================================================================
 * 棋盘渲染（装饰线 / 棋子 / 提示 / 最后落点 / 将军高亮）
 * ===================================================================== */
import { ROWS, COLS, idx, rowOf, colOf, sideOf, typeOf, RED, PIECE_CHAR, findKing, isInCheck } from '../engine/index.js';
import { game, analysis, ui, runtime, teachMode } from '../state.js';
import { $ } from './dom.js';

export const boardEl = $('board');
export const layout = { S: 56, pad: 28 };
export const elMap = new Array(ROWS * COLS).fill(null);

/* ---------------- 几何常量（坐标数字带的依据） ----------------
 * 棋子圆盘直径 = S*0.86（见 place/renderAllPieces）→ 半径 0.43S。
 * 首行棋子的圆盘会向上越过棋盘内框，因此数字只能放在“外缘内阴影环”与
 * 棋子圆盘之间的空隙里：pad 必须由棋子半径 + 环宽 + 字号反推，不能按 S 的
 * 固定比例给——固定比例 0.72S 时该空隙仅 0.29S，15px 高的数字有 11.6px
 * 压在棋子底下，首行 9 个列位全有棋子，等于 9 个数字全部看不见。
 */
export const PIECE_R = 0.43;                // 棋子半径 / S
export const RING = 6;                      // 棋盘外缘内阴影环宽度（= CSS inset 6px）
export const NUM_SLACK = 6;                 // 数字与棋子/外框之间的呼吸量
export const numFont = S => Math.max(9, Math.round(S * 0.24));
export const pieceR = S => S * PIECE_R;
/** 由棋子半径 + 外缘环 + 字号反推的边距（数字带 = 环与外框之间那段空隙） */
export const padFor = S => Math.ceil(pieceR(S) + RING + numFont(S) + NUM_SLACK);
/** 在给定可视区里找最大可用格宽（pad 随 S 变化，不能用固定除数） */
function fitBoardS(availW, availH) {
  const fits = s => 8 * s + 2 * padFor(s) <= availW && 9 * s + 2 * padFor(s) <= availH;
  let best = -1;
  for (let s = 20; s <= 58; s++) if (fits(s)) best = s;
  // 常规下限 30px（点击目标），只有窄到 30 都放不下时才继续收
  return best < 0 ? 20 : Math.max(20, best);
}
/** 布局视口宽度：移动端 innerWidth 可能大于实际布局视口（含滚动条/缩放），取两者较小值 */
function viewportW() {
  const iw = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024;
  const de = typeof document !== 'undefined' ? document.documentElement : null;
  const cw = de && de.clientWidth ? de.clientWidth : 0;
  return cw ? Math.min(iw, cw) : iw;
}
/** 数字带中心的 y：上带 = [外框内壁, 首行棋子圆盘上沿] 的中点；下带对称 */
function numberCenterY(band) {
  const { S, pad } = layout;
  const H = 9 * S + pad * 2;
  const top = RING, topPiece = pad - pieceR(S);          // 空隙：[6, pad-0.43S]
  const botPiece = pad + 9 * S + pieceR(S), bot = H - RING;
  return band === 0 ? (top + topPiece) / 2 : (botPiece + bot) / 2;
}

/* ---------------- 视角翻转（执黑时棋盘上下/左右镜像） ---------------- */
let flipped = false;
export function setFlipped(v) { flipped = v; }
export function isFlipped() { return flipped; }
// 棋盘格 i 的渲染坐标（翻转 = (r,c)→(9-r, 8-c)，映射为对合，输入输出同函数）
function vxy(i) {
  const { S, pad } = layout;
  const r = rowOf(i), c = colOf(i);
  return { x: pad + (flipped ? 8 - c : c) * S, y: pad + (flipped ? 9 - r : r) * S };
}
// 视觉格 (r,c) → 棋盘下标（含翻转逆映射）
function visualToIdx(r, c) {
  return idx(flipped ? 9 - r : r, flipped ? 8 - c : c);
}

export function computeLayout() {
  const availW = Math.min(viewportW() - 20, 560);
  const availH = window.innerHeight - 170;
  layout.S = fitBoardS(availW, availH);
  layout.pad = padFor(layout.S);              // 上下留出数字坐标带（由棋子半径反推）
  boardEl.style.width = (layout.S * 8 + layout.pad * 2) + 'px';
  boardEl.style.height = (layout.S * 9 + layout.pad * 2) + 'px';
  buildBoardDecor();
  renderAllPieces();
  renderHints();
}
function buildBoardDecor() {
  const { S, pad } = layout;
  const lines = $('layer-lines');
  lines.innerHTML = '';
  const mkLine = (x, y, w, h, angle) => {
    const d = document.createElement('div');
    d.className = 'line';
    if (angle !== undefined) {
      d.style.width = w + 'px'; d.style.height = '2px';
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.style.transformOrigin = '0 50%';
      d.style.transform = 'rotate(' + angle + 'rad)';
    } else {
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.style.width = w + 'px'; d.style.height = h + 'px';
    }
    lines.appendChild(d);
  };
  // 横线 10 条
  for (let r = 0; r < ROWS; r++) mkLine(pad, pad + r * S - 1, 8 * S, 2);
  // 竖线：中间各列在河界断开，两侧贯通
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) mkLine(pad + c * S - 1, pad, 2, 9 * S);
    else { mkLine(pad + c * S - 1, pad, 2, 4 * S); mkLine(pad + c * S - 1, pad + 5 * S, 2, 4 * S); }
  }
  // 九宫斜线
  const diag = (r1, c1, r2, c2) => {
    const x1 = pad + c1 * S, y1 = pad + r1 * S, x2 = pad + c2 * S, y2 = pad + r2 * S;
    const len = Math.hypot(x2 - x1, y2 - y1);
    mkLine(x1, y1 - 1, len, 2, Math.atan2(y2 - y1, x2 - x1));
  };
  diag(0, 3, 2, 5); diag(0, 5, 2, 3); diag(7, 3, 9, 5); diag(7, 5, 9, 3);
  // 楚河汉界
  const river = document.createElement('div');
  river.className = 'river-text';
  river.style.left = pad + 'px'; river.style.width = 8 * S + 'px';
  river.style.top = (pad + 4 * S + S / 2 - 12) + 'px';
  river.innerHTML = '<span>楚 河</span><span>汉 界</span>';
  river.style.fontSize = Math.round(S * 0.34) + 'px';
  lines.appendChild(river);
  // 炮位/兵位标记
  const marks = $('layer-marks');
  marks.innerHTML = '';
  const pts = [[2, 1], [2, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8], [7, 1], [7, 7]];
  for (const [r, c] of pts) {
    const { x, y } = vxy(idx(r, c));
    const o = 5, l = 7;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      if ((c === 0 && sx < 0) || (c === COLS - 1 && sx > 0)) continue;
      const m = document.createElement('div');
      m.className = 'mk';
      m.style.width = l + 'px'; m.style.height = l + 'px';
      m.style.left = (x + sx * o - (sx < 0 ? l : 0)) + 'px';
      m.style.top = (y + sy * o - (sy < 0 ? l : 0)) + 'px';
      m.style.borderLeftWidth = sx > 0 ? '1.5px' : '0';
      m.style.borderRightWidth = sx < 0 ? '1.5px' : '0';
      m.style.borderTopWidth = sy > 0 ? '1.5px' : '0';
      m.style.borderBottomWidth = sy < 0 ? '1.5px' : '0';
      marks.appendChild(m);
    }
  }
  // 棋盘内框（紧贴线路）
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.style.left = (pad - 6) + 'px'; frame.style.top = (pad - 6) + 'px';
  frame.style.width = (8 * S + 12) + 'px'; frame.style.height = (9 * S + 12) + 'px';
  lines.appendChild(frame);
  renderBoardNumbers();
}
// 路线数字坐标：上方黑方 1-9（黑方视角从右到左，即视觉左→右），下方红方 一-九（红方视角从右到左，即视觉右→左）；
// 选中棋子与最后落点所在的列数字会高亮，便于看清“第几列”
function renderBoardNumbers() {
  const layer = $('layer-nums');
  if (!layer) return;
  layer.innerHTML = '';
  const hiSel = ui.selected >= 0 ? colOf(ui.selected) : -1;
  const hiLast = ui.lastMove ? colOf(ui.lastMove.to) : -1;
  const CN = ['九', '八', '七', '六', '五', '四', '三', '二', '一'];   // c=0 → 九 … c=8 → 一
  for (let c = 0; c < COLS; c++) {
    const cls = c === hiSel ? ' hi-sel' : (c === hiLast ? ' hi-last' : '');
    // 未翻转：上=黑方 1-9、下=红方 一-九；翻转后互换
    const topText = flipped ? CN[c] : String(c + 1);
    const botText = flipped ? String(c + 1) : CN[c];
    addNum(layer, c, 0, topText, cls);
    addNum(layer, c, 1, botText, cls);
  }
}
function addNum(layer, c, band, text, cls) {
  const { S, pad } = layout;
  const el = document.createElement('div');
  el.className = 'filenum' + (cls || '');
  el.textContent = text;
  el.style.left = (pad + (flipped ? 8 - c : c) * S) + 'px';
  el.style.top = numberCenterY(band) + 'px';
  el.style.fontSize = numFont(S) + 'px';
  layer.appendChild(el);
}
export function place(el, i) {
  const { S, pad } = layout;
  const PS = S * 0.86;
  const { x, y } = vxy(i);
  el.style.left = (x - PS / 2) + 'px';
  el.style.top = (y - PS / 2) + 'px';
}
export function renderAllPieces() {
  const layer = $('layer-pieces');
  layer.innerHTML = '';
  elMap.fill(null);
  const { S } = layout;
  const PS = S * 0.86;
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = game.board[i];
    if (!p) continue;
    const el = document.createElement('div');
    el.className = 'piece ' + (sideOf(p) === RED ? 'red' : 'black');
    el.textContent = PIECE_CHAR[sideOf(p)][typeOf(p)];
    el.style.width = PS + 'px'; el.style.height = PS + 'px';
    el.style.fontSize = Math.round(PS * 0.5) + 'px';
    place(el, i);
    layer.appendChild(el);
    elMap[i] = el;
  }
  // 选中态
  if (ui.selected >= 0 && elMap[ui.selected]) elMap[ui.selected].classList.add('selected');
  applyCheckPulse();
}
// 常规走子的动画（棋子滑动、被吃子淡出）
export function visualApplyMove(from, to) {
  const moving = elMap[from], capEl = elMap[to];
  if (capEl) {
    capEl.classList.add('captured');
    setTimeout(() => capEl.remove(), 260);
  }
  if (moving) {
    moving.classList.add('moving');
    place(moving, to);
    setTimeout(() => moving.classList.remove('moving'), 260);
  }
  elMap[from] = null;
  elMap[to] = moving || null;
  ui.animating = true;
  setTimeout(() => { ui.animating = false; applyCheckPulse(); }, 270);
  renderHints();
  renderLastMove();
}
export function renderLastMove() {
  const layer = $('layer-last');
  layer.innerHTML = '';
  if (!ui.lastMove) return;
  const { S, pad } = layout;
  for (const i of [ui.lastMove.from, ui.lastMove.to]) {
    const d = document.createElement('div');
    d.className = 'last-mk';
    const w = S * 0.95;
    const { x, y } = vxy(i);
    d.style.width = w + 'px'; d.style.height = w + 'px';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    layer.appendChild(d);
  }
  renderBoardNumbers();   // 同步刷新列数字高亮（最后落点列）
}
// 提示层：选中目标点 + 教学推荐高亮
export function renderHints() {
  const layer = $('layer-hints');
  layer.innerHTML = '';
  renderBoardNumbers();   // 同步刷新列数字高亮（选中列）
  const { S, pad } = layout;
  // 走法目标点
  for (const t of ui.targets) {
    const d = document.createElement('div');
    d.className = 'dot' + (game.board[t] ? ' capture' : '');
    const w = S * 0.3;
    const { x, y } = vxy(t);
    d.style.width = w + 'px'; d.style.height = w + 'px';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    layer.appendChild(d);
  }
  // 教学推荐（受“显示推荐走法”勾选控制）
  if ($('chk-show').checked && runtime.teachCtx && runtime.teachCtx.recs.length &&
      teachMode() !== 'off' && game.mode === 'pva' && !analysis.active &&
      !runtime.study && !(runtime.review && runtime.review.active) &&   // 学习/复盘时不要拿正式对局的推荐盖住题面
      game.turn === game.humanSide) {
    runtime.teachCtx.recs.forEach((r, i) => {
      for (const sq of [r.m.from, r.m.to]) {
        const d = document.createElement('div');
        d.className = 'rec-dot rec-' + i;
        const w = S * 0.92;
        const { x, y } = vxy(sq);
        d.style.width = w + 'px'; d.style.height = w + 'px';
        d.style.left = x + 'px';
        d.style.top = y + 'px';
        if (sq === r.m.from) d.textContent = String(i + 1);
        layer.appendChild(d);
      }
    });
  }
}
export function clearRecHighlights() { runtime.teachCtx = null; renderHints(); }
// 临时闪现某走法的起止点（点击推荐项时）
export function flashMove(m) {
  const layer = $('layer-hints');
  const { S, pad } = layout;
  for (const sq of [m.from, m.to]) {
    const d = document.createElement('div');
    d.className = 'rec-dot rec-0';
    const w = S * 0.92;
    const { x, y } = vxy(sq);
    d.style.width = w + 'px'; d.style.height = w + 'px';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    layer.appendChild(d);
  }
  setTimeout(renderHints, 1500);
}
// 被将军的帅/将高亮
export function applyCheckPulse() {
  for (const el of elMap) if (el) el.classList.remove('checked');
  let side = null;
  if (analysis.active) { if (analysis.check) side = analysis.turn; }
  else if (isInCheck(game.board, game.turn)) side = game.turn;
  if (side !== null) {
    const k = findKing(game.board, side);
    if (k >= 0 && elMap[k]) elMap[k].classList.add('checked');
  }
}
/* ---------------- 学习模式标记（SVG 高亮 + 箭头） ---------------- */
export function clearStudyMarks() {
  const svg = $('layer-arrows');
  if (svg) svg.innerHTML = '';
}
/** highlights: [[r,c]...]；arrows: [[fromIdx, toIdx]...] */
export function renderStudyMarks(highlights, arrows) {
  const svg = $('layer-arrows');
  if (!svg) return;
  const { S, pad } = layout;
  const W = S * 8 + pad * 2, H = S * 9 + pad * 2;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  let s = '';
  for (const [r, c] of (highlights || [])) {
    const w = S * 0.92;
    const { x, y } = vxy(idx(r, c));
    s += '<rect x="' + (x - w / 2) + '" y="' + (y - w / 2) + '" width="' + w + '" height="' + w + '" rx="6" fill="rgba(255,213,79,.10)" stroke="#ffd54f" stroke-width="2"/>';
  }
  for (const [from, to] of (arrows || [])) {
    const p1 = vxy(from), p2 = vxy(to);
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const hx = x2 - ux * S * 0.36, hy = y2 - uy * S * 0.36;   // 箭身止点，留出箭头
    s += '<line x1="' + (x1 + ux * S * 0.3) + '" y1="' + (y1 + uy * S * 0.3) + '" x2="' + hx + '" y2="' + hy +
      '" stroke="rgba(46,204,113,.85)" stroke-width="' + Math.max(3, S * 0.09) + '" stroke-linecap="round"/>';
    const aw = S * 0.22, px = -uy * aw, py = ux * aw;
    s += '<polygon points="' + x2 + ',' + y2 + ' ' + (hx + px) + ',' + (hy + py) + ' ' + (hx - px) + ',' + (hy - py) +
      '" fill="rgba(46,204,113,.9)"/>';
  }
  svg.innerHTML = s;
}
