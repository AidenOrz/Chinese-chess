// 控件与路由守卫回归：模式切换 / 新对局 / 路由跳转都不得在其它模式占用棋盘时动手
// 旧行为：disabled 只是装饰，sel-mode/sel-side 直接调 startGame 覆盖学习或复盘棋盘；
// 路由切页也不结束复盘，复盘会一直占着主棋盘。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();

const here = dirname(fileURLToPath(import.meta.url));
globalThis.window.__XQ_DATA__ = {
  courses: JSON.parse(readFileSync(join(here, '..', 'data', 'courses', 'courses.json'), 'utf8')),
  puzzles: JSON.parse(readFileSync(join(here, '..', 'data', 'puzzles', 'puzzles.json'), 'utf8'))
};
globalThis.location = { hash: '#/', protocol: 'http:' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 };
globalThis.sessionStorage = { getItem: () => null, setItem() {} };

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok - ' + m); else { fails++; console.log('  FAIL - ' + m); } };
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

await import('../js/main.js');   // 引入即绑定全部控件与路由

const { game, runtime, analysis } = await import('../js/state.js');
const { RED, idx, initialBoard } = await import('../js/engine/index.js');
const { applyFormalMove, startGame } = await import('../js/app.js');
const { enterReview } = await import('../js/ui/review.js');
const { enterStudyCourse, exitStudy } = await import('../js/ui/study.js');

console.log('=== 控件与路由守卫测试 ===');

// ---- 学习模式中改“对局模式”必须被拦截 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.board = initialBoard();
  game.turn = RED; game.moveHistory = []; game.over = false;
  await enterStudyCourse('mate-chongpao');
  const before = game.board.filter(Boolean).length;
  const sel = $('sel-mode'); sel.value = 'pva';
  sel.dispatchEvent({ type: 'change', target: sel });
  ok(game.mode === 'pvp', '学习模式下切换对局模式被拦截（game.mode 未变）');
  ok(sel.value === 'pvp', '被拦截后选择器回滚到原值');
  ok(game.board.filter(Boolean).length === before, '学习棋盘未被 startGame 覆盖');
  await exitStudy();
  ok(game.board.filter(Boolean).length === 32, '退出学习后正式对局完整');
}

// ---- 学习模式中改“我的执子”必须被拦截 ----
{
  game.mode = 'pva'; game.humanSide = RED; game.board = initialBoard();
  game.turn = RED; game.moveHistory = []; game.over = false;
  await enterStudyCourse('mate-chongpao');
  const sel = $('sel-side'); sel.value = 'b';
  sel.dispatchEvent({ type: 'change', target: sel });
  ok(game.humanSide === RED, '学习模式下切换执子被拦截');
  await exitStudy();
}

// ---- 复盘中改设置必须被拦截 ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  enterReview();
  const sn = $('sel-mode'); sn.value = 'pva';
  sn.dispatchEvent({ type: 'change', target: sn });
  ok(game.mode === 'pvp', '复盘中切换对局模式被拦截');
  const ss = $('sel-side'); ss.value = 'b';
  ss.dispatchEvent({ type: 'change', target: ss });
  ok(game.humanSide === RED, '复盘中切换执子被拦截');
  ok(game.moveHistory.length === 2, '复盘期间着法栈未被 startGame 清空');
}

// ---- 复盘中点“新对局”必须被拦截 ----
{
  const btn = $('btn-new');
  btn.dispatchEvent({ type: 'click', target: btn });
  ok(game.moveHistory.length === 2, '复盘中点“新对局”被拦截，着法栈保留');
  ok(!!runtime.review && runtime.review.active, '复盘会话仍在');
}

// ---- 路由跳转应结束复盘 ----
{
  ok(runtime.boardOwner === 'review', '（前置）棋盘归属 review');
  location.hash = '#/courses';
  window.dispatchEvent({ type: 'hashchange' });
  await sleep(120);
  ok(runtime.review === null, '路由跳转后复盘结束');
  ok(runtime.boardOwner === 'formal', '路由跳转后棋盘归属回到 formal');
  ok(game.moveHistory.length === 2, '路由跳转不破坏正式对局着法');
}

// ---- 学习模式中改“新对局”被拦截（btn-new 已 disabled，这里验证运行期守卫） ----
{
  game.mode = 'pvp'; game.humanSide = RED; game.board = initialBoard();
  game.turn = RED; game.moveHistory = []; game.over = false;
  await enterStudyCourse('mate-chongpao');
  const btn = $('btn-new');
  btn.dispatchEvent({ type: 'click', target: btn });
  ok(!!runtime.study, '学习模式下点“新对局”被拦截，学习会话保留');
  ok(analysis.active === false, '学习模式下不会误入推演');
  await exitStudy();
}

if (fails) throw new Error('控件与路由守卫测试：' + fails + ' 项失败');
console.log('=== 控件与路由守卫测试通过 ===');