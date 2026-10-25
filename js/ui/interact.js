// @ts-check
/* =====================================================================
 * 交互（点击 + 拖拽，鼠标/触摸统一 Pointer 事件）——引入即绑定
 * ===================================================================== */
import { idx, inBoard, sideOf, sideName, pseudoMoves, isInCheck, legalMoves } from '../engine/index.js';
import { game, analysis, ui } from '../state.js';
import { explainIllegal } from '../teach/explain.js';
import { toast } from './panels.js';
import { snd } from '../audio.js';
import { boardEl, layout, elMap, place, renderHints } from './layout.js';
import { applyFormalMove, applyAnalysisMove, aiSide } from '../app.js';

function squareFromEvent(e) {
  const rect = boardEl.getBoundingClientRect();
  const { S, pad } = layout;
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const c = Math.round((x - pad) / S), r = Math.round((y - pad) / S);
  if (!inBoard(r, c)) return -1;
  if (Math.abs(x - (pad + c * S)) > S * 0.48 || Math.abs(y - (pad + r * S)) > S * 0.48) return -1;
  return idx(r, c);
}
function moverSide() { return analysis.active ? analysis.turn : game.turn; }
function canControl(side) {
  if (analysis.active) return side === analysis.turn;
  if (game.over || game.thinking) return false;
  if (game.mode === 'pvp') return side === game.turn;
  return side === game.humanSide && side === game.turn;
}
function select(i) {
  ui.selected = i;
  ui.targets = pseudoMoves(game.board, i).filter(to => {   // 仅显示合法落点
    const cap = game.board[to];
    game.board[to] = game.board[i]; game.board[i] = null;
    const ok = !isInCheck(game.board, sideOf(game.board[to]));
    game.board[i] = game.board[to]; game.board[to] = cap;
    return ok;
  });
  for (const el of elMap) if (el) el.classList.remove('selected');
  if (elMap[i]) elMap[i].classList.add('selected');
  renderHints();
}
function deselect() {
  ui.selected = -1; ui.targets = [];
  for (const el of elMap) if (el) el.classList.remove('selected');
  renderHints();
}
function findLegalMove(from, to) {
  for (const m of legalMoves(game.board, sideOf(game.board[from]))) {
    if (m.from === from && m.to === to) return m;
  }
  return null;
}
function doMove(from, to) {
  const m = findLegalMove(from, to);
  if (!m) return false;
  if (analysis.active) applyAnalysisMove(m);
  else applyFormalMove(m);
  return true;
}
// 处理一次“落点点击”（选择 / 走子 / 非法解释）
function handleSquareTap(i) {
  if (ui.animating) return;
  if (analysis.active && analysis.over) { toast('推演局面已结束，请先撤销/重置/退出'); return; }
  const bd = game.board;
  const side = moverSide();
  if (ui.selected >= 0) {
    if (i === ui.selected) { deselect(); return; }
    if (ui.targets.includes(i)) { const f = ui.selected; deselect(); doMove(f, i); return; }
    const p = bd[i];
    if (p && sideOf(p) === side) { select(i); return; }   // 换选己方棋子
    // 非法走法提示
    const why = explainIllegal(bd, ui.selected, i, side);
    snd.illegal();
    toast(why);
    return;
  }
  const p = bd[i];
  if (!p) return;
  if (sideOf(p) === side && canControl(side)) select(i);
  else if (p) {
    if (analysis.active) toast('现在是' + sideName(analysis.turn) + '行棋（推演）');
    else if (game.over) toast('对局已结束，可重新开始或悔棋');
    else if (game.mode === 'pva' && sideOf(p) === aiSide()) toast('这是 AI 的棋子，人机模式只能操控己方');
    else if (game.thinking) toast('AI 思考中，请稍候');
    else toast('现在是' + sideName(game.turn) + '行棋');
  }
}
boardEl.addEventListener('pointerdown', e => {
  if (ui.animating || ui.dragging) return;
  const i = squareFromEvent(e);
  if (i < 0) return;
  const p = game.board[i];
  const side = moverSide();
  if (ui.selected >= 0) {
    // 先处理点击走子/换选
    handleSquareTap(i);
    // 若换选了己方棋子，可开始拖拽
    if (ui.selected >= 0 && game.board[i] && sideOf(game.board[i]) === side && canControl(side)) {
      startDrag(e, ui.selected);
    }
    return;
  }
  handleSquareTap(i);
  if (ui.selected >= 0 && game.board[i] && sideOf(game.board[i]) === side && canControl(side)) {
    startDrag(e, ui.selected);
  }
});
function startDrag(e, from) {
  const el = elMap[from];
  if (!el) return;
  ui.dragging = { from, el, x0: e.clientX, y0: e.clientY, moved: false };
  try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* 部分环境不支持，忽略 */ }
}
boardEl.addEventListener('pointermove', e => {
  const d = ui.dragging;
  if (!d) return;
  if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
  if (!d.moved) return;
  const rect = boardEl.getBoundingClientRect();
  const PS = layout.S * 0.86;
  d.el.classList.add('drag');
  d.el.style.left = (e.clientX - rect.left - PS / 2) + 'px';
  d.el.style.top = (e.clientY - rect.top - PS / 2) + 'px';
});
boardEl.addEventListener('pointerup', e => {
  const d = ui.dragging;
  if (!d) return;
  ui.dragging = null;
  d.el.classList.remove('drag');
  if (!d.moved) return;               // 未拖动 → 视为点击（已由 pointerdown 处理）
  const i = squareFromEvent(e);
  if (i >= 0 && ui.targets.includes(i)) {
    const f = d.from;
    deselect();
    doMove(f, i);
  } else {
    place(d.el, d.from);              // 无效落点：弹回
    if (i >= 0 && i !== d.from) {
      const why = explainIllegal(game.board, d.from, i, moverSide());
      snd.illegal();
      toast(why);
    }
  }
});
boardEl.addEventListener('pointercancel', () => {
  const d = ui.dragging;
  if (d) { d.el.classList.remove('drag'); place(d.el, d.from); ui.dragging = null; }
});
boardEl.addEventListener('contextmenu', e => e.preventDefault());
