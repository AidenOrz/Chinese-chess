// 引擎规则与中文记谱测试
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, legalMoves, pseudoMoves, isInCheck, moveName, RED, BLACK } = await import('../js/engine/index.js');

{
  const bd = initialBoard();
  const mv = legalMoves(bd, RED);
  ok(mv.length === 44, '初始红方合法走法数=44（实际 ' + mv.length + '）');
  ok(mv.some(m => m.from === idx(7, 1) && m.to === idx(0, 1)), '开局炮打马（隔黑炮架吃黑马）应合法');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(7,4)]='N'; bd[idx(6,4)]='P';
  ok(pseudoMoves(bd, idx(7,4)).length === 6, '蹩马腿后马伪合法落点=6');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(9,2)]='B'; bd[idx(8,3)]='P';
  const t = pseudoMoves(bd, idx(9,2));
  ok(t.length === 1 && t[0] === idx(7,0), '塞象眼后相仅剩 1 个落点');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(5,2)]='B';
  const t = pseudoMoves(bd, idx(5,2));
  ok(t.includes(idx(7,0)) && t.includes(idx(7,4)) && !t.includes(idx(3,0)) && !t.includes(idx(3,4)), '相不能过河');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k';
  bd[idx(6,4)]='P';
  let t = pseudoMoves(bd, idx(6,4));
  ok(t.length === 1 && t[0] === idx(5,4), '未过河兵只能向前');
  bd[idx(6,4)] = null; bd[idx(4,4)] = 'P';
  ok(!pseudoMoves(bd, idx(4,4)).includes(idx(5,4)), '兵不能后退');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k';
  bd[idx(7,4)]='C'; bd[idx(5,4)]='p'; bd[idx(3,4)]='p';
  const t = pseudoMoves(bd, idx(7,4));
  ok(!t.includes(idx(4,4)) && !t.includes(idx(5,4)) && t.includes(idx(3,4)), '炮翻山吃子规则');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(5,4)]='R';
  const legal = legalMoves(bd, RED);
  ok(!legal.some(m => m.from === idx(5,4) && m.to === idx(5,3)), '遮挡子横移造成照面 → 非法');
  ok(legal.some(m => m.from === idx(5,4) && m.to === idx(4,4)), '遮挡子沿列移动 → 合法');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(8,4)]='R'; bd[idx(0,0)]='r';
  const legal = legalMoves(bd, RED);
  ok(!legal.some(m => m.from === idx(8,4) && m.to === idx(8,3)), '挪开遮挡车（送将）→ 非法');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(0,4)]='k'; bd[idx(9,4)]='K';
  bd[idx(0,0)]='R'; bd[idx(8,4)]='R';
  ok(isInCheck(bd, BLACK) && legalMoves(bd, BLACK).length === 0, '将死判定');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(0,4)]='k'; bd[idx(9,4)]='K';
  bd[idx(2,4)]='P'; bd[idx(1,3)]='P'; bd[idx(1,5)]='P';
  ok(!isInCheck(bd, BLACK) && legalMoves(bd, BLACK).length === 0, '困毙判定');
}
{
  const bd = initialBoard();
  ok(moveName(bd, {from: idx(7,1), to: idx(7,4)}) === '炮八平五', '炮八平五');
  ok(moveName(bd, {from: idx(9,7), to: idx(7,6)}) === '马二进三', '马二进三');
  ok(moveName(bd, {from: idx(0,7), to: idx(2,6)}) === '马8进7', '马8进7');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k';
  bd[idx(2,4)]='P'; bd[idx(3,4)]='P'; bd[idx(4,4)]='P'; bd[idx(5,4)]='P';
  ok(moveName(bd, { from: idx(4,4), to: idx(4,3) }) === '三兵平六', '同线 4 兵用 前二三四后 消歧');
  ok(moveName(bd, { from: idx(2,4), to: idx(1,4) }) === '前兵进一', '最前兵记“前兵”');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== 引擎规则测试通过 ===');
