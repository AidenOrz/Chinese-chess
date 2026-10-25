// 教学分析层测试（解释/诊断/开局库/保护判定）
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, RED, BLACK, isDefended } = await import('../js/engine/index.js');
const { isHanging, classifyReasons, opponentThreats, openingSuggestions,
        positionDiagnostics, bestReplyName } = await import('../js/teach/explain.js');

{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(8,4)]='N'; bd[idx(0,0)]='r';
  const diag = positionDiagnostics(bd, RED, 0);
  ok(diag.some(d => d.includes('窝心马')), '诊断出窝心马');
  ok(diag.some(d => d.includes('缺士')), '诊断出缺士怕车');
}
{
  const bd = initialBoard();
  const sug = openingSuggestions(bd, RED, 0, '');
  ok(sug.some(s => s.label === '中炮' && s.from === idx(7,1) && s.to === idx(7,4)), '开局库含中炮（炮八平五）');
  ok(sug.some(s => s.label === '中炮' && s.from === idx(7,7) && s.to === idx(7,4)), '开局库含中炮（炮二平五）');
  ok(sug.some(s => s.label === '飞相局' || s.label === '仙人指路'), '开局库含飞相/仙人指路');
}
{
  const bd = initialBoard();
  const sug = openingSuggestions(bd, BLACK, 1, '炮八平五');
  ok(sug.some(s => s.label === '屏风马' && s.from === idx(0,7) && s.to === idx(2,6)), '对方中炮 → 推荐屏风马');
}
{
  const bd = initialBoard();
  const reply = bestReplyName(bd, { from: idx(7,1), to: idx(7,4) }, RED);
  ok(typeof reply === 'string' && reply.length > 0, '预计对方应手生成（' + reply + '）');
  ok(reply !== '炮8进7' && reply !== '炮2进7', '预计应手不会是被反吃的贪心吃马（' + reply + '）');
  ok(opponentThreats(bd, RED).length === 0, '初始局面无失子威胁误报');
}
{
  const after = new Array(90).fill(null);
  after[idx(9,4)]='K'; after[idx(0,4)]='k';
  after[idx(4,4)]='R'; after[idx(3,4)]='r';            // 红车刚落到 (4,4)，被黑车攻击且无保护
  ok(isHanging(after, idx(4,4), 'R', RED) === 900, '无保护落子判挂（返回攻击者价值）');
  const after2 = after.slice(); after2[idx(4,3)] = 'R';   // 另一红车在旁保护
  ok(isHanging(after2, idx(4,4), 'R', RED) === null, '有等价子保护的兑子不误报挂');
  ok(isDefended(after2, idx(4,4), RED) && !isDefended(after, idx(4,4), RED), 'isDefended 临时清格判定保护');
}
{
  const bd = new Array(90).fill(null);
  bd[idx(9,4)]='K'; bd[idx(0,4)]='k'; bd[idx(6,4)]='R'; bd[idx(4,4)]='p';
  bd[idx(2,4)]='p';                                    // 卒后还隔一个卒，未直指将帅
  const r1 = classifyReasons(bd, RED, { from: idx(6,4), to: idx(5,4) }, 20);
  ok(!r1.reason.includes('牵制'), '线上隔两子不误报牵制');
  bd[idx(2,4)] = null;
  const r2 = classifyReasons(bd, RED, { from: idx(6,4), to: idx(5,4) }, 20);
  ok(r2.reason.includes('牵制'), '一子隔线直指将帅判牵制');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== 教学分析测试通过 ===');
