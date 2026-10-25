// 极简 hash 路由：#/（对局） #/courses #/courses/:id #/puzzles
import { $ } from './dom.js';

export function showPage(name) {
  for (const p of ['play', 'courses', 'puzzles']) {
    const el = $('page-' + p);
    if (el) el.classList.toggle('hidden', p !== name);
  }
  document.querySelectorAll('#topnav a[data-nav]').forEach(a => {
    a.classList.toggle('nav-cur', a.dataset.nav === name);
  });
}
export function initRouter(onRoute) {
  const apply = () => onRoute(location.hash || '#/');
  window.addEventListener('hashchange', apply);
  apply();
}
