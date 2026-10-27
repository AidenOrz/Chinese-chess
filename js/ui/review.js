// @ts-check
/* =====================================================================
 * 复盘模式：局面回放 + 逐手标注 + 统计（引入即绑定控件）
 * 复盘期间棋盘只读（interact.canControl 锁定），退出恢复终局局面
 * ===================================================================== */
import { sideOf, initialBoard } from '../engine/index.js';
import { game, analysis, ui, runtime } from '../state.js';
import { scoreMove } from '../teach/review.js';
import { store } from '../store.js';
import { exitAnalysis, setBoardOwner } from '../app.js';
import { renderAllPieces } from './layout.js';
import { updateAll, toast, renderMoveList, setPlayControlsLocked } from './panels.js';
import { $ } from './dom.js';

// 复盘期间与它抢首屏的卡片：教学面板在复盘时本来就不出推荐（renderHints 已按模式屏蔽），
// 走棋记录/存档也一样只占高度。收起它们，复盘才能和棋盘同屏。
const REVIEW_HIDDEN_CARDS = ['card-teach', 'card-moves', 'card-archive'];
function setReviewCardsHidden(hidden) {
  for (const id of REVIEW_HIDDEN_CARDS) {
    const el = $(id);
    if (!el) continue;
    if (hidden) el.classList.add('rev-hidden');
    else el.classList.remove('rev-hidden');
  }
}

export function enterReview() {
  if (!game.moveHistory.length) return toast('还没有可复盘的对局');
  if (game.thinking) return toast('AI 思考中，请稍候');
  if (runtime.study) return toast('请先退出学习模式');
  if (analysis.active) { exitAnalysis(true); }
  // 快照化：复盘期间 AI 回调或悔棋改动 moveHistory 时，boards 与着法列表不能各说各话
  const moves = game.moveHistory.slice();
  // 局面快照序列：boards[k] = 前 k 手走完后的棋盘
  const boards = [];
  const bd = initialBoard();
  boards.push(bd.slice());
  for (const mv of moves) { bd[mv.to] = mv.piece; bd[mv.from] = null; boards.push(bd.slice()); }
  runtime.review = {
    active: true, ply: boards.length - 1, boards, moves,
    entries: new Array(moves.length).fill(null), done: false,
    // 退出时要还原的正式对局状态（终局棋盘 + 走子方）
    over: game.over, resultTitle: game.resultTitle, resultDesc: game.resultDesc, turn: game.turn
  };
  setBoardOwner('review');
  $('card-review').classList.remove('hidden');
  setReviewCardsHidden(true);
  setPlayControlsLocked(true);
  // 侧栏此时若已滚动到下半部分，把复盘卡带进视野（棋盘在左列、不随滚动移动）
  const card = $('card-review');
  if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' });
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
  setBoardOwner('formal');
  $('card-review').classList.add('hidden');
  setReviewCardsHidden(false);
  setPlayControlsLocked(false);
  // 恢复终局局面与终局状态（review 期间 AI/悔棋可能改过 moveHistory，一律以快照为准）
  game.board = rv.boards[rv.boards.length - 1].slice();
  game.turn = rv.turn;
  game.over = rv.over; game.resultTitle = rv.resultTitle; game.resultDesc = rv.resultDesc;
  ui.lastMove = rv.moves.length
    ? { from: rv.moves[rv.moves.length - 1].from, to: rv.moves[rv.moves.length - 1].to }
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
  ui.lastMove = rv.ply > 0 && rv.moves[rv.ply - 1]
    ? { from: rv.moves[rv.ply - 1].from, to: rv.moves[rv.ply - 1].to }
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
  (rv.moves || game.moveHistory).forEach((mv, i) => {
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
