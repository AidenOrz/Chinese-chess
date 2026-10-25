/* =====================================================================
 * 启动与控件绑定
 * ===================================================================== */
import { other, legalMoves, isInCheck, RED } from './engine/index.js';
import { levelById } from './engine/levels.js';
import { game, analysis, ui, runtime, teachMode } from './state.js';
import { startGame, undoFormal, enterAnalysis, exitAnalysis, undoAnalysis, resetAnalysis, runTeachAnalysis,
         resumeCurrentGame, loadArchiveGame, deleteArchiveGame, gameText, currentFen, loadFenIntoAnalysis } from './app.js';
import { store } from './store.js';
import { computeLayout, renderHints, clearRecHighlights } from './ui/layout.js';
import { renderCaptured, renderMoveList, updateAll, toast, renderTeachPanel } from './ui/panels.js';
import { snd, isSoundOn, setSoundOn } from './audio.js';
import { enterReview } from './ui/review.js';
import { $ } from './ui/dom.js';
import './ui/interact.js';

$('sel-mode').addEventListener('change', e => {
  game.mode = e.target.value;
  $('row-side').style.display = game.mode === 'pva' ? 'flex' : 'none';
  $('row-diff').style.display = game.mode === 'pva' ? 'flex' : 'none';
  const teachCard = $('card-teach');
  if (game.mode === 'pvp') {
    teachCard.style.opacity = '.45';
    $('sel-teach').disabled = true;
    $('chk-show').disabled = true; $('chk-detail').disabled = true;
    $('teach-recommend').innerHTML = '<span class="tag-line">教学模式仅“玩家 vs AI”可用</span>';
  } else {
    teachCard.style.opacity = '1';
    $('sel-teach').disabled = false;
    $('chk-show').disabled = false; $('chk-detail').disabled = false;
  }
  startGame();
  toast(game.mode === 'pva' ? '已切换为玩家 vs AI，重新开局' : '已切换为玩家 vs 玩家，重新开局');
});
$('sel-side').addEventListener('change', e => {
  game.humanSide = e.target.value;
  startGame();
  toast('你执' + (game.humanSide === RED ? '红（先手）' : '黑（后手）') + '，重新开局');
});
$('sel-diff').addEventListener('change', e => {
  game.difficulty = e.target.value;
  const lv = levelById(game.difficulty);
  toast('AI 棋力已设为「' + lv.id + ' · ' + lv.name + '」' + (lv.desc ? '（' + lv.desc + '）' : ''));
});
$('sel-teach').addEventListener('change', () => {
  clearRecHighlights();
  $('teach-recommend').innerHTML = '';
  if (teachMode() !== 'off') runTeachAnalysis();
});
$('chk-show').addEventListener('change', renderHints);
$('chk-sound').addEventListener('change', e => {
  setSoundOn(e.target.checked);
  if (isSoundOn()) snd.move();
  toast(isSoundOn() ? '音效已开启' : '音效已关闭');
});
$('chk-detail').addEventListener('change', () => { if (runtime.teachCtx) renderTeachPanel(); });
$('btn-new').addEventListener('click', () => { if (analysis.active) return toast('请先退出推演模式'); startGame(); toast('新对局开始，红方先行'); });
$('btn-undo').addEventListener('click', undoFormal);
$('btn-analysis').addEventListener('click', () => { if (!analysis.active) enterAnalysis(); });
$('btn-a-undo').addEventListener('click', undoAnalysis);
$('btn-a-reset').addEventListener('click', resetAnalysis);
$('btn-a-exit').addEventListener('click', () => exitAnalysis(false));
$('btn-a-switch').addEventListener('click', () => {
  if (analysis.over) return toast('推演局面已结束，请先撤销或重置');
  analysis.turn = other(analysis.turn);
  analysis.check = isInCheck(game.board, analysis.turn);
  analysis.over = legalMoves(game.board, analysis.turn).length === 0;
  ui.selected = -1; ui.targets = [];
  updateAll(); runAnalysisAdvice();
});
// 局面 FEN 导入/导出（推演模式下）
$('btn-fen-in').addEventListener('click', () => {
  const v = $('fen-input').value.trim();
  if (!v) return toast('请先粘贴 FEN 局面串');
  const r = loadFenIntoAnalysis(v);
  toast(r.ok ? '局面已导入推演' : '导入失败：' + r.msg);
});
$('btn-fen-out').addEventListener('click', () => {
  $('fen-input').value = currentFen();
  $('fen-input').select();
  try { document.execCommand('copy'); toast('FEN 已复制到输入框/剪贴板'); }
  catch (e) { toast('FEN 已填入输入框，请手动复制'); }
});

// ---- 对局存档 ----
async function renderArchive() {
  const box = $('archive-list');
  const [games, stats] = await Promise.all([store.listGames(), store.getProgress('stats', null)]);
  const rows = [];
  if (stats && stats.games) {
    rows.push('<div class="tag-line" style="margin-bottom:6px">累计 ' + stats.games + ' 局 · 红 ' + (stats.red || 0) +
      ' 胜 / 黑 ' + (stats.black || 0) + ' 胜 / 和 ' + (stats.draw || 0) +
      (stats.blunders ? ' · 复盘失误 ' + stats.blunders + ' 手' : '') + '</div>');
  }
  if (game.moveHistory.length && !game.over) {
    rows.push('<div class="arch-item"><b>当前对局</b> · 进行中 ' + game.moveHistory.length + ' 步</div>');
  }
  for (const g of games) {
    if (g.id === 'current') continue;
    const d = new Date(g.savedAt || 0);
    const t = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    rows.push('<div class="arch-item" data-id="' + g.id + '"><b>' + (g.result || '对局') + '</b> · ' +
      (g.moves ? g.moves.length : 0) + ' 步 · ' + t +
      ' <button class="arch-load" data-id="' + g.id + '">载入</button>' +
      ' <button class="arch-del" data-id="' + g.id + '">删除</button>' +
      ' <button class="arch-copy" data-id="' + g.id + '">着法</button></div>');
  }
  box.innerHTML = rows.length ? rows.join('') : '<span class="tag-line">暂无存档（对局结束或中途退出会自动保存）</span>';
  box.querySelectorAll('.arch-load').forEach(el => el.addEventListener('click', async () => {
    if (await loadArchiveGame(el.dataset.id)) toast('已载入存档，可悔棋后继续');
    renderArchive();
  }));
  box.querySelectorAll('.arch-del').forEach(el => el.addEventListener('click', async () => {
    await deleteArchiveGame(el.dataset.id);
    renderArchive();
  }));
  box.querySelectorAll('.arch-copy').forEach(el => el.addEventListener('click', async () => {
    const g = await store.getGame(el.dataset.id);
    if (!g || !g.moves) return;
    const zh = g.moves.map((r, i) => (i % 2 === 0 ? Math.floor(i / 2) + 1 + '. ' : '') + r.name).join(' ');
    $('fen-input').value = zh;
    $('fen-input').select();
    toast('着法已填入 FEN 输入框，可手动复制');
  }));
}
$('btn-again').addEventListener('click', () => { $('modal').classList.add('hidden'); startGame(); });
$('btn-review').addEventListener('click', () => { $('modal').classList.add('hidden'); enterReview(); });
$('btn-review-live').addEventListener('click', enterReview);
$('btn-close').addEventListener('click', () => $('modal').classList.add('hidden'));
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(computeLayout, 120);
});

// 启动
$('row-side').style.display = 'flex';
$('row-diff').style.display = 'flex';
$('chk-sound').checked = isSoundOn();
computeLayout();
renderCaptured();
renderMoveList();
updateAll();
// 恢复上次进行中的对局（无则新局提示）
resumeCurrentGame().then(ok => {
  if (ok) toast('已恢复上次对局，继续行棋');
  else toast('红方先行，点击棋子开始对局');
});
renderArchive();
document.addEventListener('xq-state-changed', () => { renderArchive(); });

// PWA Service Worker（http/https 环境注册，file:// 跳过）
if ('serviceWorker' in navigator && typeof location !== 'undefined' && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
