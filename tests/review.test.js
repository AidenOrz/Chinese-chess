// 复盘评分测试
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, RED } = await import('../js/engine/index.js');
const { markOf, scoreMove } = await import('../js/teach/review.js');

{
  ok(markOf(0) === '好棋' && markOf(30) === '好棋', '损失≤40 记“好棋”');
  ok(markOf(60) === '一般', '损失 41~150 记“一般”');
  ok(markOf(200) === '疑问', '损失 151~300 记“疑问”');
  ok(markOf(400) === '失误', '损失>300 记“失误”');
}
{
  // 红车可白吃无保护黑车（不同纵线，无牵制）：吃 = 最优；平移让吃 = 明显失误
  const bd = new Array(90).fill(null);
  bd[idx(9, 4)] = 'K'; bd[idx(0, 4)] = 'k';
  bd[idx(3, 4)] = 'p';                               // 黑卒挡住两帅照面
  bd[idx(5, 3)] = 'R'; bd[idx(4, 3)] = 'r';          // 黑车在红车正前方、无保护
  const good = scoreMove(bd, RED, { from: idx(5, 3), to: idx(4, 3) }, { timeMs: 1200 });
  ok(good.loss <= 40 && good.mark === '好棋', '白吃无保护车判“好棋”（损失 ' + good.loss + '）');
  ok(good.bestName === null, '好棋不附更佳着法');
  const bad = scoreMove(bd, RED, { from: idx(5, 3), to: idx(5, 2) }, { timeMs: 1200 });
  ok(bad.loss > 150 && (bad.mark === '疑问' || bad.mark === '失误'),
    '放走白吃的车被判差着（损失 ' + bad.loss + ' · ' + bad.mark + '）');
  ok(typeof bad.bestName === 'string' && bad.bestName.length > 0, '差着附更佳着法（' + bad.bestName + '）');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== 复盘评分测试通过 ===');
