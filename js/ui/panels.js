// @ts-check
/* =====================================================================
 * 侧栏面板渲染（教学面板 / 失子 / 走棋记录 / 状态栏 / 弹窗 / Toast）
 * ===================================================================== */
import { sideOf, typeOf, RED, PIECE_CHAR, sideName, PHASE_NAME, moveName, isInCheck } from '../engine/index.js';
import { game, analysis, runtime, teachMode } from '../state.js';
import { snd } from '../audio.js';
import { $ } from './dom.js';
import { renderLastMove, applyCheckPulse, flashMove } from './layout.js';

export function renderCaptured() {
  const redLost = [], blackLost = [];
  for (const rec of game.moveHistory) {
    if (rec.captured) (sideOf(rec.captured) === RED ? redLost : blackLost).push(rec.captured);
  }
  const chip = p => '<span class="cap-chip ' + (sideOf(p) === RED ? 'red' : 'black') + '">' + PIECE_CHAR[sideOf(p)][typeOf(p)] + '</span>';
  $('captured-row').innerHTML =
    '<span>红方失子：</span>' + (redLost.map(chip).join('') || '<span class="tag-line">无</span>') +
    '<span style="margin-left:12px">黑方失子：</span>' + (blackLost.map(chip).join('') || '<span class="tag-line">无</span>');
}
// 走棋记录：按回合成对编号（红先），最新一步高亮；推演走子不入栈、不显示
export function renderMoveList() {
  const box = $('move-list');
  if (!game.moveHistory.length) { box.innerHTML = '<span class="tag-line">尚未行棋</span>'; return; }
  let html = '';
  game.moveHistory.forEach((rec, i) => {
    html += '<span class="mv' + (i === game.moveHistory.length - 1 ? ' mv-last' : '') + '">' +
      '<span class="mv-no">' + (Math.floor(i / 2) + 1) + '.</span>' +
      '<span class="' + (sideOf(rec.piece) === RED ? 'mv-red' : 'mv-black') + '">' + rec.name + '</span></span>';
  });
  if (game.over) html += '<span class="tag-line" style="grid-column:1/-1">' + game.resultTitle + '</span>';
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}
export function updateAll() { updateStatus(); renderLastMove(); applyCheckPulse(); updateButtons(); }
function updateStatus() {
  const dot = $('turn-dot'), txt = $('status-text'), badge = $('mode-badge'), sub = $('sub-status');
  const sideNow = analysis.active ? analysis.turn : game.turn;
  dot.className = sideNow;
  badge.style.display = analysis.active ? 'inline-block' : 'none';
  let t;
  if (runtime.study && runtime.study.kind) {
    const st = runtime.study;
    t = (st.kind === 'course' ? '课程 · ' + st.course.title + '（' + (st.stepIdx + 1) + '/' + st.course.steps.length + '）'
                              : '习题 · ' + (st.puzzle ? (st.puzzle.title || st.puzzle.id) : ''));
  } else if (runtime.review && runtime.review.active) {
    t = '复盘 · 第 ' + runtime.review.ply + ' / ' + (runtime.review.boards.length - 1) + ' 手';
  } else if (analysis.active) {
    t = sideName(analysis.turn) + '行棋（推演）';
    if (analysis.over) t = '推演局面已结束';
  } else if (game.over) {
    t = game.resultTitle + ' — ' + game.resultDesc;
  } else if (game.thinking) {
    t = 'AI 思考中…';
  } else {
    t = sideName(game.turn) + '行棋';
  }
  const inCheck = analysis.active ? analysis.check : (!game.over && isInCheck(game.board, game.turn));
  if (inCheck && (!analysis.active || !analysis.over)) t += ' ⚡将军！';
  txt.textContent = t;
  const subs = [];
  if (!analysis.active && !game.over) {
    if (game.checkStreak.r >= 2) subs.push('红方已连续将军 ' + game.checkStreak.r + ' 次（提示：长将不宜，建议变着）');
    if (game.checkStreak.b >= 2) subs.push('黑方已连续将军 ' + game.checkStreak.b + ' 次（提示：长将不宜，建议变着）');
    if (game.noCapture >= 90) subs.push('已 ' + Math.floor(game.noCapture / 2) + ' 回合未吃子（60 回合判和）');
  }
  sub.textContent = subs.join('　');
}
function updateButtons() {
  const inReview = !!(runtime.review && runtime.review.active);
  const inStudy = !!(runtime.study && runtime.study.kind);
  $('btn-undo').disabled = inStudy || inReview || analysis.active || game.thinking || game.moveHistory.length === 0 ||
    (game.mode === 'pva' && !game.moveHistory.some(r => sideOf(r.piece) === game.humanSide));
  $('btn-analysis').disabled = inStudy || inReview || game.thinking || analysis.active;
  $('btn-review-live').disabled = inStudy || inReview || analysis.active || game.thinking || game.moveHistory.length === 0;
  // btn-new 必须锁在复盘里：startGame 会清空 moveHistory，而 exitReview 又会用旧 boards 覆盖棋盘
  $('btn-new').disabled = inStudy || inReview || game.thinking || analysis.active;
  $('btn-a-undo').disabled = !analysis.moves.length;
  // 推演/复盘/学习占用棋盘时，模式与执子选择器一律锁住（改了就会 startGame 覆盖棋盘）
  const lockModes = inStudy || inReview || analysis.active;
  for (const id of ['sel-mode', 'sel-side', 'sel-diff']) {
    const el = $(id);
    if (el) el.disabled = lockModes;
  }
  const selTeach = $('sel-teach');
  if (selTeach) selTeach.disabled = lockModes || game.mode === 'pvp';
}
/** 复盘等模式显式锁定/解锁对局控件（与 updateButtons 共用同一套规则） */
export function setPlayControlsLocked(locked) {
  for (const id of ['btn-new', 'btn-undo', 'btn-analysis', 'btn-review-live']) {
    const el = $(id);
    if (el && locked) el.disabled = true;
  }
  if (!locked) updateButtons();
}
function showResultModal() {
  $('modal-title').textContent = '对局结束 · ' + game.resultTitle;
  $('modal-desc').textContent = game.resultDesc + '。共 ' + game.moveHistory.length + ' 步。';
  $('modal').classList.remove('hidden');
  if (game.resultTitle === '和棋') snd.draw();
  else if (game.mode === 'pva' && !game.resultTitle.startsWith(sideName(game.humanSide))) snd.lose();
  else snd.win();
}
export { showResultModal };
let toastTimer = null;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
export function renderTeachPanel() {
  const box = $('teach-recommend');
  if (!runtime.teachCtx || !runtime.teachCtx.recs.length) { box.innerHTML = '<span class="tag-line">当前无推荐走法</span>'; return; }
  const detail = teachMode() === 'detail' || $('chk-detail').checked;
  const showRisk = teachMode() === 'detail';
  const c = runtime.teachCtx;
  const score = c.best ? c.best.v : 0;
  const scoreTxt = score > 60 ? '你方略优' : score < -60 ? '你方略亏' : '局面大致均衡';
  let html = '<b>局面判断：</b>' + (PHASE_NAME[c.phase] || '') + ' · ' + scoreTxt +
    '<div class="why">' + c.plan + '</div>';
  html += '<b>推荐走法（' + sideName(c.side) + '）：</b>';
  c.recs.forEach((r, i) => {
    const vTxt = (r.v === undefined || isNaN(r.v)) ? '' : '（' + (r.v >= 0 ? '+' : '') + Math.round(r.v / 10) / 10 + '）';
    html += '<div class="rec-item" data-i="' + i + '"><b>' + (i + 1) + '. ' + moveName(game.board, r.m) + '</b>' + vTxt +
      ' · ' + r.idea +
      (detail ? '<div class="why">思路：' + r.reason +
        (r.reply ? '<br>预计对方：' + r.reply : '') + '</div>' : '') +
      (showRisk ? '<div class="risk">风险：' + r.risk + '</div>' : '') + '</div>';
  });
  if (detail) {
    html += '<b>局面诊断：</b>' +
      (c.diag.length ? c.diag.map(d => '<div class="threat">· ' + d + '</div>').join('') : '<div class="tag-line">暂无明显结构问题</div>');
    html += '<b>对方威胁：</b>' +
      (c.threats.length ? c.threats.map(t => '<div class="threat">· ' + t + '</div>').join('') : '<div class="tag-line">暂未发现对方明显威胁</div>');
  }
  box.innerHTML = html;
  box.querySelectorAll('.rec-item').forEach(el => {
    el.addEventListener('click', () => {
      const r = c.recs[+el.dataset.i];
      if (r) flashMove(r.m);
    });
  });
}
