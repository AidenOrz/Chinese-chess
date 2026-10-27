// 棋盘坐标数字可读性 + 复盘面板与棋盘同屏
// 旧行为①：layout.pad = round(S*0.72)，数字带中心固定在 pad*0.5=0.5*pad，
//          而首行棋子圆盘上沿在 pad-0.43S —— 15px 高的数字有 11.6px 压在棋子底下。
//          首行 9 个列位全有棋子，等于 9 个数字全被遮挡。
// 旧行为②：#card-review 排在侧栏 6 张卡之后，一进复盘就被顶出首屏，
//          棋盘在左列、不随滚动移动，两边永远凑不到一起看。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomStub } from './helpers/dom-stub.mjs';
const registry = installDomStub();
const $ = id => document.getElementById(id);

const here = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(here, '..', 'index.html'), 'utf8');
const CSS = readFileSync(join(here, '..', 'css', 'main.css'), 'utf8');

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok - ' + m); else { fails++; console.log('  FAIL - ' + m); } };
const near = (a, b, eps = 0.51) => Math.abs(a - b) <= eps;

/** 从真实 HTML 里取某个 id 的初始 class，应用到打桩元素（打桩不解析 HTML） */
function seedClassesFromHtml(id) {
  const re = new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>');
  const tag = HTML.match(re);
  const cls = tag && tag[0].match(/class="([^"]*)"/);
  const el = $(id);
  el.className = cls ? cls[1] : '';
  return el.className;
}

const { idx, RED, BLACK } = await import('../js/engine/index.js');
const { game, ui, runtime } = await import('../js/state.js');
const { computeLayout, layout, PIECE_R, RING, numFont, pieceR, padFor, setFlipped } = await import('../js/ui/layout.js');
const { startGame, applyFormalMove } = await import('../js/app.js');
const { enterReview, exitReview } = await import('../js/ui/review.js');

console.log('=== 棋盘布局 / 复盘面板回归测试 ===');

// ---------------- 数字带几何 ----------------
// 数字元素的纵向占位：[top - font/2, top + font/2]（CSS transform: translate(-50%,-50%)）
const numBox = () => [...$('layer-nums').children].map(el => {
  const font = parseFloat(el.style.fontSize);
  const y = parseFloat(el.style.top);
  return { y, font, top: y - font / 2, bottom: y + font / 2, text: el.textContent };
});
// 第 0 行棋子的圆盘上沿 / 第 9 行的圆盘下沿
const row0PieceTop = () => layout.pad - pieceR(layout.S);
const row9PieceBottom = () => layout.pad + 9 * layout.S + pieceR(layout.S);

{
  computeLayout();
  const nums = numBox();
  ok(nums.length === 18, '上下两条数字带共 18 个列标（9 列 × 2）');
  const top = nums.filter(n => n.y < layout.pad);
  const bot = nums.filter(n => n.y > layout.pad);
  ok(top.length === 9 && bot.length === 9, '上方 9 个、下方 9 个');

  ok(nums.every(n => n.bottom <= row0PieceTop() + 0.01 || n.top >= row9PieceBottom() - 0.01),
     '数字整体不与首行/末行棋子圆盘重叠（不再被棋子遮挡）');

  // 旧公式的对照：pad*0.5 会压进棋子
  const oldY = layout.pad * 0.5, oldFont = Math.round(layout.S * 0.26);
  ok(oldY + oldFont / 2 > row0PieceTop(),
     '（对照）旧公式 ' + oldY.toFixed(1) + 'px 的数字确实压在棋子内 — 证明本用例有判别力');

  ok(top.every(n => n.top >= RING - 0.01), '上方数字不越过棋盘外框内壁');
  ok(bot.every(n => n.bottom <= 9 * layout.S + layout.pad * 2 - RING + 0.01), '下方数字不越过棋盘外框内壁');
  ok(nums.every(n => n.font === numFont(layout.S)), '字号统一取自 numFont(S)');
}

// ---------------- 各种取景尺寸下都不遮挡 ----------------
{
  const cases = [
    { w: 1400, h: 1000, name: '桌面大窗' },
    { w: 1200, h: 800, name: '默认窗口' },
    { w: 900, h: 700, name: '小笔记本' },
    { w: 560, h: 640, name: '窄窗' },
    { w: 380, h: 640, name: '手机竖屏' }
  ];
  let allOk = true, widths = [];
  for (const c of cases) {
    window.innerWidth = c.w; window.innerHeight = c.h;
    computeLayout();
    const nums = numBox();
    const fits = nums.every(n => n.bottom <= row0PieceTop() + 0.01 || n.top >= row9PieceBottom() - 0.01);
    const inBand = nums.every(n => n.top >= RING - 0.01 &&
      n.bottom <= 9 * layout.S + layout.pad * 2 - RING + 0.01);
    const inWindow = layout.S * 8 + layout.pad * 2 <= Math.min(c.w - 20, 560) &&
                     layout.S * 9 + layout.pad * 2 <= c.h - 170;
    widths.push(layout.S);
    if (!(fits && inBand && inWindow)) {
      allOk = false;
      console.log('    尺寸失败：' + c.name + ' S=' + layout.S + ' pad=' + layout.pad +
        ' fits=' + fits + ' inBand=' + inBand + ' inWindow=' + inWindow);
    }
  }
  ok(allOk, '5 种窗口尺寸下：数字都在边带内、不与棋子重叠、棋盘不出可视区');
  ok(widths.every(s => s >= 30), '格宽始终不低于下限 30px');
  window.innerWidth = 1200; window.innerHeight = 800;
  computeLayout();
}

// ---------------- 窄视口不横向溢出（移动端 innerWidth > 布局视口的老问题） ----------------
// 旧 computeLayout 只读 window.innerWidth；移动端该值可能大于 documentElement.clientWidth
// （缩放/滚动条），于是按 innerWidth 算出的棋盘比布局视口还宽，页面被横向裁切。
{
  const cases = [
    { iw: 438, cw: 400, name: '移动端 innerWidth 大于布局视口' },
    { iw: 400, cw: 385, name: '有纵向滚动条' },
    { iw: 360, cw: 345, name: '小屏手机' },
    { iw: 1200, cw: 1200, name: '桌面' }
  ];
  let bad = [];
  for (const c of cases) {
    window.innerWidth = c.iw;
    document.documentElement = { clientWidth: c.cw };
    computeLayout();
    const boardW = layout.S * 8 + layout.pad * 2;
    if (boardW > c.cw) bad.push({ ...c, boardW });
  }
  ok(bad.length === 0, '4 种视口下棋盘宽度都不超过布局视口（不触发横向滚动）');
  if (bad.length) console.log('    ' + JSON.stringify(bad));
  delete document.documentElement;
  window.innerWidth = 1200; window.innerHeight = 800;
  computeLayout();
}

// ---------------- 极窄视口：允许格宽跌破 30 也不能溢出 ----------------
{
  window.innerWidth = 300;
  document.documentElement = { clientWidth: 300 };
  computeLayout();
  const boardW = layout.S * 8 + layout.pad * 2;
  ok(boardW <= 300, '极窄视口（300px）下棋盘仍不溢出');
  ok(layout.S >= 20, '极窄视口下格宽保留可用的下限（≥20px）');
  delete document.documentElement;
  window.innerWidth = 1200; window.innerHeight = 800;
  computeLayout();
}

// ---------------- pad 的推导关系 ----------------
{
  let bad = [];
  for (let s = 30; s <= 58; s++) {
    const pad = padFor(s);
    const gap = (pad - pieceR(s)) - RING;          // 外框内壁到棋子圆盘的净空隙
    if (gap < numFont(s)) bad.push({ s, pad, gap, font: numFont(s) });
  }
  ok(bad.length === 0, 'S=30..58 每一档的净空隙都容得下字号（pad 由棋子半径反推，不是固定比例）');
  if (bad.length) console.log('    ' + JSON.stringify(bad.slice(0, 3)));
  ok(padFor(56) > 56 * 0.72, '新 pad 比旧的 0.72S 更大（多出来的正是被遮挡的那一段）');
}

// ---------------- 翻转视角下仍在边带 ----------------
{
  setFlipped(true);
  computeLayout();
  const nums = numBox();
  ok(nums.every(n => n.bottom <= row0PieceTop() + 0.01 || n.top >= row9PieceBottom() - 0.01),
     '执黑翻转后数字依然不被遮挡');
  const topTexts = nums.filter(n => n.y < layout.pad).map(n => n.text);
  ok(topTexts.join('') === '九八七六五四三二一', '翻转后上方改为红方中文列号（九→一）');
  setFlipped(false);
  computeLayout();
  const tops = numBox().filter(n => n.y < layout.pad).map(n => n.text).join('');
  ok(tops === '123456789', '未翻转时上方为黑方 1-9');
}

// ---------------- 复盘面板与棋盘同屏 ----------------
{
  const seed = seedClassesFromHtml('card-review');
  ok(seed.split(' ').includes('hidden'), '（前置）#card-review 在 HTML 里初始为隐藏');
  seedClassesFromHtml('card-teach');
  seedClassesFromHtml('card-moves');
  seedClassesFromHtml('card-archive');

  // 结构：复盘卡排在侧栏首位（在“对局设置”之前）
  const iReview = HTML.indexOf('id="card-review"');
  const iSettings = HTML.indexOf('id="card-settings"');
  ok(iReview > 0 && iSettings > 0 && iReview < iSettings, '复盘卡排在“对局设置”之前，落在侧栏首位');

  game.mode = 'pvp'; game.humanSide = RED; game.formalRules = false;
  startGame();
  applyFormalMove({ from: idx(7, 1), to: idx(7, 4) });
  applyFormalMove({ from: idx(0, 1), to: idx(2, 2) });
  enterReview();

  ok(!$('card-review').classList.contains('hidden'), '进入复盘后复盘卡显示');
  for (const id of ['card-teach', 'card-moves', 'card-archive']) {
    ok($(id).classList.contains('rev-hidden'), '复盘中收起抢首屏的卡片：' + id);
  }
  ok(CSS.includes('#card-review') && CSS.includes('position: sticky'),
     '复盘卡用 sticky 吸顶，滚动侧栏时不会离开视野');
  ok(CSS.includes('.rev-hidden'), '收起卡片用的 .rev-hidden 有对应样式规则');
  ok(!/<div id="rev-list"[^>]*style=/.test(HTML), 'rev-list 不再用行内 style 定高（改由 CSS 类控制）');
  ok(CSS.includes('.rev-list'), '.rev-list 高度由 CSS 类控制，可随视口收缩');

  exitReview();
  ok($('card-review').classList.contains('hidden'), '退出复盘后复盘卡隐藏');
  for (const id of ['card-teach', 'card-moves', 'card-archive']) {
    ok(!$(id).classList.contains('rev-hidden'), '退出复盘后恢复显示：' + id);
  }
}

// ---------------- 与学习模式的卡片互不干扰 ----------------
{
  const { enterStudyCourse, exitStudy } = await import('../js/ui/study.js');
  globalThis.window.__XQ_DATA__ = {
    courses: JSON.parse(readFileSync(join(here, '..', 'data', 'courses', 'courses.json'), 'utf8')),
    puzzles: JSON.parse(readFileSync(join(here, '..', 'data', 'puzzles', 'puzzles.json'), 'utf8'))
  };
  game.mode = 'pvp'; game.humanSide = RED;
  await enterStudyCourse('mate-chongpao');
  ok($('card-teach').classList.contains('study-hidden'), '学习模式仍用自己的 study-hidden 收起卡片');
  ok(!$('card-teach').classList.contains('rev-hidden'), '学习模式不会误加复盘的 rev-hidden');
  await exitStudy();
  ok(!$('card-teach').classList.contains('study-hidden'), '退出学习后 study-hidden 被移除');
}

if (fails) throw new Error('棋盘布局/复盘面板回归测试：' + fails + ' 项失败');
console.log('=== 棋盘布局 / 复盘面板回归测试通过 ===');
