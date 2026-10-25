// @ts-check
/* =====================================================================
 * 学习模式：课程播放器（讲解/演示/跟练/习题）+ 独立习题 + 错题本
 * 复用主棋盘（快照隔离，退出还原正式对局），走子经 interact 转发到 tryStudyMove
 * ===================================================================== */
import { sideOf, other, sideName, fenToBoard, legalMoves, isInCheck, moveName } from '../engine/index.js';
import { workerSearch } from '../engine/client.js';
import { game, ui, runtime } from '../state.js';
import { store } from '../store.js';
import { snd } from '../audio.js';
import { exitAnalysis } from '../app.js';
import { exitReview } from './review.js';
import { renderAllPieces, renderHints, visualApplyMove, renderStudyMarks, clearStudyMarks } from './layout.js';
import { updateAll, toast } from './panels.js';
import { $ } from './dom.js';

let DATA = null;
/** 课程/题库数据：dist 内联（window.__XQ_DATA__）或 http 环境下 fetch */
export async function loadData() {
  if (DATA) return DATA;
  if (typeof window !== 'undefined' && window.__XQ_DATA__) { DATA = window.__XQ_DATA__; return DATA; }
  try {
    const [courses, puzzles] = await Promise.all([
      fetch('data/courses/courses.json').then(r => r.json()),
      fetch('data/puzzles/puzzles.json').then(r => r.json())
    ]);
    DATA = { courses, puzzles };
  } catch (e) {
    DATA = { courses: [], puzzles: [] };
    toast('课程数据加载失败（file:// 直开请使用 dist 版本）');
  }
  return DATA;
}

/* ---------------- 通用 ---------------- */
function stopTimers() {
  const st = runtime.study;
  if (st && st.timers) { st.timers.forEach(clearTimeout); st.timers = []; }
}
function later(fn, ms) {
  const st = runtime.study;
  if (!st) return;
  st.timers.push(setTimeout(fn, ms));
}
function studyText(html) { $('study-body').innerHTML = '<div>' + html + '</div>'; }
function studyAppend(html) { $('study-body').insertAdjacentHTML('beforeend', '<div>' + html + '</div>'); }
function setStudyButtons(list) {
  const box = $('study-btns');
  box.innerHTML = '';
  for (const b of list) {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.cls) el.className = b.cls;
    el.addEventListener('click', b.fn);
    box.appendChild(el);
  }
}
function setBoardFromFen(fen) {
  const { board, turn } = fenToBoard(fen);   // 内容已由 tests/content.test.js 校验
  game.board = board;
  runtime.study.turn = turn;
  ui.lastMove = null; ui.selected = -1; ui.targets = [];
}
// 学习模式落子（不写入正式对局历史）
function applyStudyMove(m) {
  const st = runtime.study;
  const name = moveName(game.board, m);
  game.board[m.to] = game.board[m.from]; game.board[m.from] = null;
  st.turn = other(sideOf(game.board[m.to]));
  ui.lastMove = { from: m.from, to: m.to };
  ui.selected = -1; ui.targets = [];
  visualApplyMove(m.from, m.to);
  updateAll();
  studyAppend('· ' + name);
  return name;
}

function startStudy(st) {
  if (analysis.active) exitAnalysis(true);
  if (runtime.review && runtime.review.active) exitReview();
  st.timers = [];
  st.snapshot = { board: game.board.slice(), turn: game.turn };
  runtime.study = st;
  runtime.teachCtx = null;
  for (const id of ['card-teach', 'card-moves', 'card-archive']) $(id).classList.add('study-hidden');
  $('card-study').classList.remove('hidden');
  clearStudyMarks();
  updateAll();
}
export function exitStudy() {
  const st = runtime.study;
  if (!st) return;
  stopTimers();
  runtime.study = null;
  game.board = st.snapshot.board;
  game.turn = st.snapshot.turn;
  ui.selected = -1; ui.targets = []; ui.lastMove = null;
  clearStudyMarks();
  $('card-study').classList.add('hidden');
  for (const id of ['card-teach', 'card-moves', 'card-archive']) $(id).classList.remove('study-hidden');
  renderAllPieces(); updateAll();
  if (typeof location !== 'undefined' && location.hash !== '#/' && location.hash !== '' && location.hash !== '#') {
    location.hash = '#/';
  }
}

/* ---------------- 课程 ---------------- */
export async function enterStudyCourse(courseId) {
  const { courses } = await loadData();
  const course = courses.find(c => c.id === courseId);
  if (!course) return toast('未找到课程：' + courseId);
  const prog = await store.getProgress('course-' + courseId, { step: 0 });
  startStudy({ kind: 'course', course, stepIdx: 0, phase: 'idle' });
  $('study-title').textContent = course.title;
  applyCourseStep(Math.min(prog.step || 0, course.steps.length - 1));
  renderAllPieces(); updateAll();
}
function applyCourseStep(i) {
  const st = runtime.study;
  if (!st || st.kind !== 'course') return;
  stopTimers();
  clearStudyMarks();
  st.stepIdx = i;
  const step = st.course.steps[i];
  store.getProgress('course-' + st.course.id, { step: 0 }).then(p =>
    store.setProgress('course-' + st.course.id, { step: Math.max(i, p.step || 0) }));
  studyText('<span class="tag-line">第 ' + (i + 1) + ' / ' + st.course.steps.length + ' 步</span><br>' + (step.text || ''));
  if (step.type === 'explain') {
    st.phase = 'explain';
    setBoardFromFen(step.fen);
    renderStudyMarks(step.highlights, step.arrows);
    courseButtons(false);
  } else if (step.type === 'demo') {
    st.phase = 'demo';
    st.demoMoves = step.moves.slice();
    st.demoIdx = 0;
    setBoardFromFen(step.fen);
    courseButtons(false, true);
    later(playDemoStep, 700);
  } else if (step.type === 'guided') {
    st.phase = 'guided';
    st.seq = step.moves.slice();
    st.moveIdx = 0;
    st.userSide = fenToBoard(step.fen).turn;
    setBoardFromFen(step.fen);
    studyAppend('轮到' + sideName(st.userSide) + '：请走出这一步');
    setStudyButtons(courseNav(false).concat([
      { label: '提示', fn: () => toast('提示：' + moveName(game.board, { from: st.seq[st.moveIdx][0], to: st.seq[st.moveIdx][1] })) }
    ]));
  } else if (step.type === 'quiz') {
    loadData().then(({ puzzles }) => {
      const p = puzzles.find(x => x.id === step.puzzleId);
      if (!p) { studyAppend('（习题缺失：' + step.puzzleId + '）'); courseButtons(true); return; }
      startQuiz(p);
    });
  }
  renderAllPieces(); renderHints(); updateAll();
}
function courseNav(enableNext, replay) {
  const st = runtime.study;
  const btns = [];
  if (st.stepIdx > 0) btns.push({ label: '上一步', fn: () => applyCourseStep(st.stepIdx - 1) });
  if (replay) btns.push({ label: '重播', fn: () => { applyCourseStep(st.stepIdx); } });
  if (enableNext && st.stepIdx < st.course.steps.length - 1) btns.push({ label: '下一步', cls: 'go', fn: () => applyCourseStep(st.stepIdx + 1) });
  if (enableNext && st.stepIdx >= st.course.steps.length - 1) btns.push({ label: '完成课程', cls: 'go', fn: finishCourse });
  return btns;
}
function courseButtons(enableNext, replay) {
  setStudyButtons(courseNav(enableNext, replay).concat([{ label: '退出学习', cls: 'warn', fn: exitStudy }]));
}
function finishCourse() {
  const st = runtime.study;
  store.setProgress('course-' + st.course.id, { step: st.course.steps.length, done: true });
  studyAppend('🎉 课程完成！');
  setStudyButtons([{ label: '返回课程列表', cls: 'go', fn: () => { exitStudy(); location.hash = '#/courses'; } },
                   { label: '留在棋盘', fn: exitStudy }]);
}
function playDemoStep() {
  const st = runtime.study;
  if (!st || st.phase !== 'demo') return;
  if (st.demoIdx >= st.demoMoves.length) {
    st.phase = 'demo-done';
    studyAppend('（演示结束）');
    courseButtons(true);
    return;
  }
  const [f, t] = st.demoMoves[st.demoIdx++];
  applyStudyMove({ from: f, to: t });
  later(playDemoStep, 850);
}
function onGuidedMove(m) {
  const st = runtime.study;
  const exp = st.seq[st.moveIdx];
  if (m.from === exp[0] && m.to === exp[1]) {
    applyStudyMove(m);
    st.moveIdx++;
    if (st.moveIdx >= st.seq.length) {
      st.phase = 'guided-done';
      studyAppend('✔ 完成！跟练正确。');
      courseButtons(true);
      return;
    }
    // 对方着自动跟随
    const nxt = st.seq[st.moveIdx];
    later(() => {
      if (!runtime.study || runtime.study.phase !== 'guided') return;
      applyStudyMove({ from: nxt[0], to: nxt[1] });
      st.moveIdx++;
      if (st.moveIdx >= st.seq.length) {
        st.phase = 'guided-done';
        studyAppend('✔ 完成！');
        courseButtons(true);
      } else {
        studyAppend('继续，轮到你走');
      }
    }, 650);
  } else {
    snd.illegal();
    toast('这一步不对，再想想');
  }
}

/* ---------------- 习题 ---------------- */
const GOAL_TEXT = { mate1: '一步杀', mate2: '两步杀', endgame: '残局做杀', tactic: '得子战术' };
export async function enterStudyPuzzle(puzzleId) {
  const { puzzles } = await loadData();
  const p = puzzles.find(x => x.id === puzzleId);
  if (!p) return toast('未找到习题：' + puzzleId);
  startStudy({ kind: 'puzzle', phase: 'idle' });
  $('study-title').textContent = '习题 · ' + (p.title || p.id);
  startQuiz(p);
  renderAllPieces(); updateAll();
}
function startQuiz(p) {
  const st = runtime.study;
  const { board, turn } = fenToBoard(p.fen);
  game.board = board;
  st.phase = 'quiz';
  st.puzzle = p;
  st.userSide = p.side;
  st.turn = turn;
  st.solIdx = 0;
  st.wrong = 0;
  st.done = false;
  clearStudyMarks();
  studyText('<b>' + (p.title || p.id) + '</b> · ' + (GOAL_TEXT[p.category] || '解题') +
    '（难度 ' + '★'.repeat(p.difficulty || 1) + '）<br>轮到' + sideName(p.side) + '行棋，点击棋子开始。');
  quizButtons();
}
function quizButtons() {
  const st = runtime.study;
  const btns = [];
  if (!st.done) btns.push({ label: '提示', fn: () => toast('提示：' + st.puzzle.hint) });
  if (st.kind === 'course') {
    btns.push({ label: '跳过', fn: () => setStudyButtons(courseNav(true).concat([{ label: '退出学习', cls: 'warn', fn: exitStudy }])) });
  } else {
    btns.push({ label: '返回题库', fn: () => { exitStudy(); location.hash = '#/puzzles'; } });
  }
  btns.push({ label: '退出学习', cls: 'warn', fn: exitStudy });
  setStudyButtons(btns);
}
function recordMistake(p) {
  store.addMistake({ id: 'pz-' + p.id + '-' + Date.now(), puzzleId: p.id, category: p.category, at: Date.now() }).catch(() => {});
}
function quizSolved() {
  const st = runtime.study;
  st.done = true;
  st.phase = 'quiz-done';
  studyAppend('✔ 解答正确！');
  snd.win();
  store.getProgress('puzzles-done', []).then(done => {
    if (!done.includes(st.puzzle.id)) { done.push(st.puzzle.id); return store.setProgress('puzzles-done', done); }
  }).catch(() => {});
  if (st.kind === 'course') setStudyButtons(courseNav(true).concat([{ label: '退出学习', cls: 'warn', fn: exitStudy }]));
  else setStudyButtons([
    { label: '返回题库', cls: 'go', fn: () => { exitStudy(); location.hash = '#/puzzles'; } },
    { label: '留在棋盘', fn: exitStudy }
  ]);
}
function onQuizMove(m) {
  const st = runtime.study, p = st.puzzle;
  if (st.done) return;
  const expected = p.solution[st.solIdx];
  if (m.from === expected[0] && m.to === expected[1]) {
    applyStudyMove(m);
    st.solIdx++;
    // 对方无着可走 → 杀/困毙达成
    if (legalMoves(game.board, st.turn).length === 0) { quizSolved(); return; }
    if (st.solIdx >= p.solution.length) { quizSolved(); return; }
    // 对方以引擎应对（题库内容已验证：正解可达成目标）
    workerSearch(game.board.slice(), st.turn, { depth: 3, useQ: true, timeMs: 1200, exact: false, randomWindow: 0 })
      .then(rm => {
        if (!runtime.study || runtime.study.phase !== 'quiz' || runtime.study.puzzle !== p) return;
        const legal = legalMoves(game.board, st.turn);
        const mv = (rm && legal.some(x => x.from === rm.from && x.to === rm.to)) ? rm : legal[0];
        if (!mv) { quizSolved(); return; }
        applyStudyMove(mv);
        if (legalMoves(game.board, st.turn).length === 0) { quizSolved(); return; }
        studyAppend('轮到你走第 ' + (st.solIdx + 1) + ' 着');
      });
  } else {
    st.wrong++;
    snd.illegal();
    if (st.wrong === 1) toast('不对，再想想');
    else if (st.wrong === 2) toast('提示：' + p.hint);
    else if (st.wrong === 3) {
      toast('正确着法是「' + moveName(game.board, { from: expected[0], to: expected[1] }) + '」，已记入错题本');
      recordMistake(p);
    }
  }
}

/* ---------------- interact 入口 ---------------- */
export function tryStudyMove(from, to) {
  const st = runtime.study;
  if (!st) return false;
  if (st.phase === 'guided' && st.turn === st.userSide) { onGuidedMove({ from, to }); return true; }
  if (st.phase === 'quiz' && st.turn === st.userSide && !st.done) { onQuizMove({ from, to }); return true; }
  if (st.phase === 'explain' || st.phase === 'demo' || st.phase === 'demo-done') toast('演示/讲解步骤中棋盘只读，可点“下一步”继续');
  return true;
}
