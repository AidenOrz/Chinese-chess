// @ts-check
/* 课程/题库列表页（数据来自 study.loadData；进度来自 store） */
import { loadData, enterStudyPuzzle } from './study.js';
import { store } from '../store.js';
import { $ } from './dom.js';

const LEVEL_TEXT = { 1: '入门', 2: '初级', 3: '中级' };
const CAT_TEXT = { mate1: '一步杀', mate2: '两步杀', endgame: '残局做杀', tactic: '战术' };

export async function renderCourseList() {
  const box = $('course-list');
  const [{ courses }, mistakes] = await Promise.all([loadData(), store.listMistakes()]);
  if (!courses.length) { box.innerHTML = '<span class="tag-line">暂无课程数据</span>'; return; }
  const items = [];
  for (const c of courses) {
    const prog = await store.getProgress('course-' + c.id, { step: 0 });
    const done = prog.done ? '<span class="prog">已完成 ✔</span>'
      : '<span class="prog">' + Math.min(prog.step || 0, c.steps.length) + ' / ' + c.steps.length + '</span>';
    items.push('<div class="lesson-item" data-id="' + c.id + '"><span class="lv">' + (LEVEL_TEXT[c.level] || '初级') + '</span>' +
      '<b>' + c.title + '</b><span class="tag-line">' + (c.intro || '') + '</span>' + done + '</div>');
  }
  box.innerHTML = items.join('');
  box.querySelectorAll('.lesson-item').forEach(el =>
    el.addEventListener('click', () => { location.hash = '#/courses/' + el.dataset.id; }));
}
export async function renderPuzzleList() {
  const box = $('puzzle-list');
  const [{ puzzles }, doneList, mistakes] = await Promise.all([
    loadData(), store.getProgress('puzzles-done', []), store.listMistakes()]);
  if (!puzzles.length) { box.innerHTML = '<span class="tag-line">暂无题库数据</span>'; return; }
  const wrongIds = new Set(mistakes.map(m => m.puzzleId));
  const cats = ['mate1', 'mate2', 'endgame', 'tactic'];
  let html = '';
  for (const cat of cats) {
    const list = puzzles.filter(p => p.category === cat);
    if (!list.length) continue;
    html += '<div class="lesson-cat">' + (CAT_TEXT[cat] || cat) + '（' + list.length + '）</div>';
    for (const p of list) {
      const status = doneList.includes(p.id) ? '<span class="pz-done">已解 ✔</span>'
        : wrongIds.has(p.id) ? '<span class="pz-wrong">错题</span>' : '';
      html += '<div class="lesson-item" data-id="' + p.id + '"><b>' + (p.title || p.id) + '</b>' +
        '<span class="tag-line">' + '★'.repeat(p.difficulty || 1) + '</span>' + status + '</div>';
    }
  }
  box.innerHTML = html;
  box.querySelectorAll('.lesson-item').forEach(el =>
    el.addEventListener('click', () => { location.hash = '#/'; enterStudyPuzzle(el.dataset.id); }));
}
