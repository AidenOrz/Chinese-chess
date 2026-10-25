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

export function computeLayout() {
  const availW = Math.min(window.innerWidth - 20, 560);
  const availH = window.innerHeight - 170;
  let S = Math.floor(Math.min(availW / 9.6, availH / 10.7, 58));
  layout.S = Math.max(30, S);
  layout.pad = Math.round(layout.S * 0.72);   // 上下留出数字坐标带
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
    const x = pad + c * S, y = pad + r * S, o = 5, l = 7;
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
    addNum(layer, c, 0, String(c + 1), cls);
    addNum(layer, c, 1, CN[c], cls);
  }
}
function addNum(layer, c, band, text, cls) {
  const { S, pad } = layout;
  const el = document.createElement('div');
  el.className = 'filenum' + (cls || '');
  el.textContent = text;
  el.style.left = (pad + c * S) + 'px';
  el.style.top = (band === 0 ? pad * 0.5 : pad + 9 * S + pad * 0.5) + 'px';
  el.style.fontSize = Math.round(S * 0.26) + 'px';
  layer.appendChild(el);
}
export function place(el, i) {
  const { S, pad } = layout;
  const PS = S * 0.86;
  el.style.left = (pad + colOf(i) * S - PS / 2) + 'px';
  el.style.top = (pad + rowOf(i) * S - PS / 2) + 'px';
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
    d.style.width = w + 'px'; d.style.height = w + 'px';
    d.style.left = (pad + colOf(i) * S) + 'px';
    d.style.top = (pad + rowOf(i) * S) + 'px';
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
    d.style.width = w + 'px'; d.style.height = w + 'px';
    d.style.left = (pad + colOf(t) * S) + 'px';
    d.style.top = (pad + rowOf(t) * S) + 'px';
    layer.appendChild(d);
  }
  // 教学推荐（受“显示推荐走法”勾选控制）
  if ($('chk-show').checked && runtime.teachCtx && runtime.teachCtx.recs.length &&
      teachMode() !== 'off' && game.mode === 'pva' && !analysis.active &&
      game.turn === game.humanSide) {
    runtime.teachCtx.recs.forEach((r, i) => {
      for (const sq of [r.m.from, r.m.to]) {
        const d = document.createElement('div');
        d.className = 'rec-dot rec-' + i;
        const w = S * 0.92;
        d.style.width = w + 'px'; d.style.height = w + 'px';
        d.style.left = (pad + colOf(sq) * S) + 'px';
        d.style.top = (pad + rowOf(sq) * S) + 'px';
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
    d.style.width = w + 'px'; d.style.height = w + 'px';
    d.style.left = (pad + colOf(sq) * S) + 'px';
    d.style.top = (pad + rowOf(sq) * S) + 'px';
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
