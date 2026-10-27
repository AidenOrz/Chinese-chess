// 教学评分回归：落后局面下不得"下什么都扣分"
// 旧行为：面板直接把搜索返回的绝对评估 v 当成"这一步好不好"显示。
// v 是走子方视角的局面分，落后时必然全为负——对最强 AI 落后 10 分以上时，
// 32 个合法着法无一为正，三个推荐全部显示 (-17.6)，用户看到的却是"怎么下都错"。
// 真相是那三步并列最佳（gap=0）。用户该看的是「与最佳着的差距」：恒 ≥ 0。
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();
const $ = id => document.getElementById(id);

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { idx, initialBoard, RED, BLACK, legalMoves, findBestMove, moveName } = await import('../js/engine/index.js');
const { buildRecommendations, formatGap, positionVerdict, materialDetail } =
  await import('../js/teach/explain.js');
const { losingPlan, strategyPlan, materialLead } = await import('../js/engine/eval.js');
const { game, runtime } = await import('../js/state.js');
const { renderTeachPanel } = await import('../js/ui/panels.js');

/** 从初始局面删掉指定格，造一个"被最强 AI 打崩"的落后局面 */
const boardWithout = cells => { const b = initialBoard(); for (const [r, c] of cells) b[idx(r, c)] = null; return b; };
const BIG_LOSS = boardWithout([[9, 0], [9, 7], [7, 1]]);   // 红少 1 车 1 马 1 炮
const MID_LOSS = boardWithout([[9, 0], [9, 7]]);           // 红少 1 车 1 马

console.log('=== 教学评分回归测试 ===');

// ---------------- 核心：落后时评分不得全负 ----------------
{
  const r = buildRecommendations(BIG_LOSS, RED, 3, 2, 20);
  ok(r.best.v < -1000, '（前置）落后局面绝对评估为大幅负数：' + r.best.v);
  const all = Object.values(r.map);
  ok(all.every(v => v <= 0), '（前置）全部 ' + all.length + ' 个合法着法的绝对评估都 ≤ 0 —— 这正是旧面板的问题来源');
  ok(all.filter(v => v >= 0).length === 0, '（前置）没有任何一步的绝对评估为正');

  ok(r.recs.every(x => typeof x.gap === 'number' && x.gap >= 0), '推荐走法都带 gap 且恒 ≥ 0');
  ok(r.recs[0].gap === 0, '评分最高的着法 gap = 0');
  ok(r.recs.every(x => x.gapText && !/^-/.test(x.gapText)), '展示文本不含负号：' + r.recs.map(x => x.gapText).join(' / '));
  ok(r.recs.some(x => x.gapText === '最佳'), '落后局面同样能给出“最佳”评价');
}

// ---------------- formatGap：边界与量级 ----------------
{
  ok(formatGap(0) === '最佳', 'gap=0 → 最佳');
  ok(formatGap(-50) === '最佳', 'gap 为负（数值噪声）→ 最佳，不出现负号');
  ok(formatGap(undefined) === '最佳', 'gap 缺失 → 最佳');
  ok(formatGap(30) === '最佳', '不足半兵（30）→ 最佳，避免搜深噪声制造焦虑');
  ok(formatGap(100) === '差 1 兵', 'gap=100 → 差 1 兵');
  ok(formatGap(250) === '差 2.5 兵', 'gap=250 → 差 2.5 兵');
  ok(formatGap(900) === '差 9 兵', 'gap=900 → 差 9 兵');
  ok([0, 40, 100, 260, 1500].every(g => !formatGap(g).includes('-')), '任何取值都不显示负号');
}

// ---------------- 局面判断：把绝对分翻译成人话 ----------------
{
  const lost = positionVerdict(BIG_LOSS, RED);
  ok(lost.label.includes('劣势') || lost.label.includes('败势'), '大幅落后 → ' + lost.label);
  ok(lost.cls === 'eval-bad', '落后用告警配色');
  ok(lost.detail.includes('少'), '子力差异指明"少"了什么：' + lost.detail);

  const even = positionVerdict(initialBoard(), RED);
  ok(even.label === '局面大致均衡', '初始局面 → 大致均衡');
  ok(even.detail === '双方子力相当', '初始局面子力相当');

  const win = positionVerdict(boardWithout([[0, 0], [0, 8]]), RED);
  ok(win.label.includes('胜势'), '多两车 → ' + win.label);
  ok(win.detail.includes('多 2 车'), '领先子力写对：' + win.detail);

  // 同一局面双方视角必须互为镜像（标签相反、子力描述相反）
  const asBlack = positionVerdict(BIG_LOSS, BLACK);
  ok(asBlack.label.includes('胜'), '同一局面黑方视角为胜势：' + asBlack.label);
  ok(asBlack.detail.includes('多') && lost.detail.includes('少'), '双方子力描述相反');
}

// ---------------- materialDetail：称呼与数量 ----------------
{
  ok(materialDetail(initialBoard(), RED) === '双方子力相当', '初始局面无差异');
  const b = boardWithout([[0, 0], [0, 8]]);
  ok(materialDetail(b, RED) === '多 2 车', '红方视角多 2 车：' + materialDetail(b, RED));
  ok(materialDetail(b, BLACK) === '少 2 车', '黑方视角少 2 车：' + materialDetail(b, BLACK));
  // 兵/卒按各方习惯称呼，且称呼必须跟着「主语」走：
  // 删掉一只红兵后，红方是“少 1 兵”（不是“少 1 卒”），黑方是“多 1 卒”
  const p = initialBoard(); p[idx(6, 4)] = null;
  ok(materialDetail(p, RED) === '少 1 兵', '红方少兵用“兵”称呼：' + materialDetail(p, RED));
  ok(materialDetail(p, BLACK) === '多 1 卒', '黑方多兵用“卒”称呼：' + materialDetail(p, BLACK));
}

// ---------------- 落后时的教学方针 ----------------
{
  ok(losingPlan(initialBoard(), RED) === null, '均势时不弹出“落后方针”');
  const tips = losingPlan(BIG_LOSS, RED);
  ok(Array.isArray(tips) && tips.length >= 2, '落后时给出 ' + (tips ? tips.length : 0) + ' 条方针');
  ok(tips.some(t => t.includes('忌兑子')), '落后方针提醒少子方忌兑子');
  ok(tips.some(t => t.includes('不确定') || t.includes('复杂')), '落后方针提醒制造不确定');
  ok(tips.some(t => t.includes('守和')), '大幅落后时目标降级为守和');
  ok(losingPlan(MID_LOSS, RED).length >= 2, '中等落后也有方针');
  // 领先方不该收到“落后方针”
  ok(losingPlan(boardWithout([[0, 0], [0, 8]]), RED) === null, '领先时不弹出落后方针');
  ok(losingPlan(BIG_LOSS, BLACK) === null, '同一局面黑方（领先方）不弹出落后方针');
}

// ---------------- 面板端到端：渲染出的 HTML 不含负分 ----------------
{
  const r = buildRecommendations(BIG_LOSS, RED, 3, 2, 20);
  game.board = BIG_LOSS.slice();
  runtime.teachCtx = {
    recs: r.recs, best: r.best, map: r.map, gaps: r.gaps, phase: 'mid', side: RED,
    verdict: positionVerdict(BIG_LOSS, RED, r.best.v),
    plan: strategyPlan(BIG_LOSS, RED, 'mid'),
    losingTips: losingPlan(BIG_LOSS, RED),
    diag: [], threats: []
  };
  $('chk-detail').checked = true;
  $('sel-teach').value = 'detail';
  renderTeachPanel();
  const html = $('teach-recommend').innerHTML;

  ok(html.includes('局面判断'), '面板渲染出局面判断');
  ok(!/（-\d/.test(html), '面板里不出现“（-17.6）”这类负分');
  ok(html.includes('最佳'), '面板里出现“最佳”');
  ok(html.includes('与当前最佳着的差距'), '面板显式说明评分口径，避免被误解为绝对实力');
  ok(html.includes('少 1 车'), '面板写出子力差异');
  ok(html.includes('落后局面怎么下才算好'), '面板给出落后局面的判断标准');
  ok(html.includes('eval-good'), '“最佳”用正向配色（与旧版全红形成对比）');

  // 三个推荐若并列最佳，应全部显示“最佳”而不是三个相同的负数
  const bestCount = (html.match(/（最佳）/g) || []).length;
  ok(bestCount >= 1, '至少一个推荐标为最佳（实际 ' + bestCount + ' 个）');

  runtime.teachCtx = null;
  $('sel-teach').value = 'off';
}

// ---------------- 无推荐时不留残影 ----------------
{
  runtime.teachCtx = null;
  renderTeachPanel();
  ok($('teach-recommend').innerHTML.includes('当前无推荐走法'), '无上下文时给出明确空状态');
}

if (fails) throw new Error('教学评分回归测试：' + fails + ' 项失败');
console.log('=== 教学评分回归测试通过 ===');
