// @ts-check
/* =====================================================================
 * 复盘模式：局面回放 + 逐手标注 + 统计（引入即绑定控件）
 * 复盘期间棋盘只读（interact.canControl 锁定），退出恢复终局局面
 * ===================================================================== */
import { sideOf, initialBoard } from '../engine/index.js';
import { game, analysis, ui, runtime } from '../state.js';
import { scoreMove } from '../teach/review.js';
import { store } from '../store.js';
import { exitAnalysis } from '../app.js';
import { renderAllPieces } from './layout.js';
import { updateAll, toast, renderMoveList } from './panels.js';
import { $ } from './dom.js';

export function enterReview() {
  if (!game.moveHistory.length) return toast('还没有可复盘的对局');
  if (analysis.active) { exitAnalysis(true); }
  const moves = game.moveHistory;
  // 局面快照序列：boards[k] = 前 k 手走完后的棋盘
  const boards = [];
  const bd = initialBoard();
  boards.push(bd.slice());
  for (const mv of moves) { bd[mv.to] = mv.piece; bd[mv.from] = null; boards.push(bd.slice()); }
  runtime.review = { active: true, ply: boards.length - 1, boards, entries: new Array(moves.length).fill(null), done: false };
  $('card-review').classList.remove('hidden');
  $('btn-analysis').disabled = true;
  $('btn-undo').disabled = true;
  $('btn-new').disabled = true;
  reviewGo(boards.length - 1);
  renderReviewList();
  // 分块评分（每片 ≤120ms，避免阻塞 UI）
  let i = 0;
  const step = () => {
    const rv = runtime.review;
    if (!rv || !rv.active) return;
    const t0 = Date.now();
    while (i < moves.length && Date.now() - t0 < 120) {
      const mv = moves[i];
      rv.entries[i] = { i, name: mv.name, side: sideOf(mv.piece), ...scoreMove(rv.boards[i], sideOf(mv.piece), mv) };
      i++;
    }
    $('rev-progress').textContent = '分析中 ' + i + '/' + moves.length;
    renderReviewList();
    if (i < moves.length) setTimeout(step, 0);
    else {
      rv.done = true;
      $('rev-progress').textContent = '分析完成';
      const blunders = rv.entries.filter(e => e && e.mark === '失误').length;
      recordReviewStats(blunders, moves.length);
      renderReviewList();
    }
  };
  setTimeout(step, 0);
}
export function exitReview() {
  const rv = runtime.review;
  if (!rv || !rv.active) return;
  runtime.review = null;
  $('card-review').classList.add('hidden');
  $('btn-new').disabled = false;
  // 恢复终局局面
  const last = rv.boards[rv.boards.length - 1];
  game.board = last.slice();
  ui.lastMove = game.moveHistory.length
    ? { from: game.moveHistory[game.moveHistory.length - 1].from, to: game.moveHistory[game.moveHistory.length - 1].to }
    : null;
  ui.selected = -1; ui.targets = [];
  renderAllPieces(); renderMoveList(); updateAll();
  toast('已退出复盘');
}
export function reviewGo(ply) {
  const rv = runtime.review;
  if (!rv || !rv.active) return;
  rv.ply = Math.max(0, Math.min(rv.boards.length - 1, ply));
  game.board = rv.boards[rv.ply].slice();
  ui.lastMove = rv.ply > 0
    ? { from: game.moveHistory[rv.ply - 1].from, to: game.moveHistory[rv.ply - 1].to }
    : null;
  ui.selected = -1; ui.targets = [];
  $('rev-pos').textContent = rv.ply + ' / ' + (rv.boards.length - 1);
  renderAllPieces(); updateAll();
  renderReviewList();
}
const MARK_CLS = { '好棋': 'eval-good', '一般': 'eval-ok', '疑问': 'eval-bad', '失误': 'eval-bad' };
function renderReviewList() {
  const rv = runtime.review;
  const box = $('rev-list');
  if (!rv || !rv.active) return;
  let html = '';
  game.moveHistory.forEach((mv, i) => {
    const e = rv.entries[i];
    const cur = rv.ply === i + 1 ? ' rev-cur' : '';
    html += '<span class="rev-item' + cur + '" data-ply="' + (i + 1) + '">' +
      (i % 2 === 0 ? '<span class="mv-no">' + (Math.floor(i / 2) + 1) + '.</span>' : '') +
      mv.name +
      (e ? ' <b class="' + (MARK_CLS[e.mark] || '') + '">' + e.mark + '</b>' +
        (e.mark !== '好棋' && e.bestName ? '<span class="tag-line">宜 ' + e.bestName + '</span>' : '') : '') +
      '</span>';
  });
  box.innerHTML = html || '<span class="tag-line">无着法</span>';
  box.querySelectorAll('.rev-item').forEach(el => {
    el.addEventListener('click', () => reviewGo(+el.dataset.ply));
  });
  const cur = box.querySelector('.rev-cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}
// 复盘完成后把失误数并入累计统计
async function recordReviewStats(blunders, plies) {
  try {
    const s = (await store.getProgress('stats', null)) || { games: 0, red: 0, black: 0, draw: 0, blunders: 0, reviewedPlies: 0 };
    s.blunders = (s.blunders || 0) + blunders;
    s.reviewedPlies = (s.reviewedPlies || 0) + plies;
    await store.setProgress('stats', s);
  } catch (e) { /* 统计失败不打断 */ }
}

// ---- 控件绑定 ----
$('btn-rv-first').addEventListener('click', () => reviewGo(0));
$('btn-rv-prev').addEventListener('click', () => { if (runtime.review) reviewGo(runtime.review.ply - 1); });
$('btn-rv-next').addEventListener('click', () => { if (runtime.review) reviewGo(runtime.review.ply + 1); });
$('btn-rv-last').addEventListener('click', () => { if (runtime.review) reviewGo(runtime.review.boards.length - 1); });
$('btn-rv-exit').addEventListener('click', exitReview);
