// 搜索增强测试：Zobrist 哈希 / 迭代加深 + 置换表 / 棋力分档
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, legalMoves, RED, BLACK, hashOf, findBestMove, chooseMove } =
  await import('../js/engine/index.js');
const { LEVELS } = await import('../js/engine/levels.js');

// ---- Zobrist 哈希 ----
{
  const bd = initialBoard();
  const h1 = hashOf(bd, RED), h2 = hashOf(bd.slice(), RED);
  ok(h1.key === h2.key && h1.lock === h2.lock, '相同局面哈希一致');
  ok(hashOf(bd, RED).key !== hashOf(bd, BLACK).key, '走子方不同哈希不同');
  const bd2 = bd.slice(); bd2[idx(7, 1)] = null; bd2[idx(7, 4)] = 'C';
  ok(hashOf(bd2, RED).key !== h1.key, '走一步后哈希改变');
}
// ---- 迭代加深 + 置换表：正确性与预算 ----
{
  const bd = initialBoard();
  const t0 = Date.now();
  const { list } = findBestMove(bd, RED, { depth: 4, useQ: true, timeMs: 5000, exact: false });
  const dt = Date.now() - t0;
  ok(list.length > 0 && legalMoves(bd, RED).some(x => x.from === list[0].m.from && x.to === list[0].m.to),
    '深度 4 迭代加深返回合法最佳着');
  ok(list.every(r => legalMoves(bd, RED).some(x => x.from === r.m.from && x.to === r.m.to)),
    '深度 4 根列表全部合法');
  ok(dt < 5000, '深度 4 耗时 ' + dt + 'ms 在预算内');
}
{
  const bd = initialBoard();
  findBestMove(bd, RED, { depth: 3, useQ: true, timeMs: 5000 });
  const t0 = Date.now();
  findBestMove(bd, RED, { depth: 3, useQ: true, timeMs: 5000 });
  ok(Date.now() - t0 < 2000, '重复局面搜索（含置换表命中）耗时可控（' + (Date.now() - t0) + 'ms）');
}
// ---- 8 档棋力 ----
{
  const bd = initialBoard();
  let allOk = true;
  const names = new Set();
  for (const lv of LEVELS) {
    names.add(lv.name);
    const m = chooseMove(bd, RED, { ...lv, timeMs: Math.min(lv.timeMs, 900) });
    if (!m || !legalMoves(bd, RED).some(x => x.from === m.from && x.to === m.to)) { allOk = false; break; }
  }
  ok(allOk, '8 档棋力全部返回合法着法');
  ok(names.size === LEVELS.length, '档位名称唯一');
  ok(LEVELS[0].blunderChance > 0 && LEVELS[7].blunderChance === 0, '低档有失误率、最高档无失误');
}
// ---- 强制失误（blunderChance=1）仍合法 ----
{
  const bd = new Array(90).fill(null);
  bd[idx(9, 4)] = 'K'; bd[idx(0, 4)] = 'k'; bd[idx(5, 4)] = 'R'; bd[idx(5, 0)] = 'r';
  const m = chooseMove(bd, RED, { depth: 2, useQ: true, timeMs: 1500, randomWindow: 0, blunderChance: 1 });
  ok(m && legalMoves(bd, RED).some(x => x.from === m.from && x.to === m.to), '强制失误档返回合法着法');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== 搜索增强测试通过 ===');
