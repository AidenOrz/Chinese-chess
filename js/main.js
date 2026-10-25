/* =====================================================================
 * 启动与控件绑定
 * ===================================================================== */
import { other, legalMoves, isInCheck, RED } from './engine/index.js';
import { game, analysis, ui, runtime, teachMode } from './state.js';
import { startGame, undoFormal, enterAnalysis, exitAnalysis, undoAnalysis, resetAnalysis, runTeachAnalysis } from './app.js';
import { computeLayout, renderHints, clearRecHighlights } from './ui/layout.js';
import { renderCaptured, renderMoveList, updateAll, toast, renderTeachPanel } from './ui/panels.js';
import { snd, isSoundOn, setSoundOn } from './audio.js';
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
$('sel-diff').addEventListener('change', e => { game.difficulty = e.target.value; toast('AI 难度已设为「' + (e.target.value === 'easy' ? '简单' : '普通') + '」'); });
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
$('btn-again').addEventListener('click', () => { $('modal').classList.add('hidden'); startGame(); });
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
toast('红方先行，点击棋子开始对局');
