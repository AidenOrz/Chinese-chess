// 局面评估测试
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, detectPhase, materialLead, evalBoard, structureScore, strategyPlan, RED, BLACK } =
  await import('../js/engine/index.js');

{
  const bd = initialBoard();
  ok(detectPhase(bd) === 'opening', '初始局面为开局阶段');
  ok(materialLead(bd, RED) === 0, '初始子力差为 0');
  ok(evalBoard(bd) === 0, '初始局面评估对称（=0）');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(5,4)]='c';    // 黑炮空头直指红帅
  const before = structureScore(bd, RED);
  ok(structureScore(bd, RED) < structureScore(bd, BLACK) - 25, '空头炮使红方结构分显著更低');
  bd[idx(6,4)]='P';                                        // 加一枚遮挡子作炮架阻挡
  ok(structureScore(bd, RED) === before + 30, '有遮挡后空头炮威胁消失（+30）');
}
{
  const bd = initialBoard();
  ok(strategyPlan(bd, RED, 'opening').includes('开局方针'), '开局方针文案');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== 评估测试通过 ===');
