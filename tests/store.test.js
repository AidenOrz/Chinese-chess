// 持久化存储测试（内存后端逻辑 + Node 下自动降级）
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { createMemoryStore, createStore } = await import('../js/store.js');

{
  const s = createMemoryStore();
  await s.saveGame({ id: 'current', moves: [{ from: 1, to: 2 }], savedAt: 2000 });
  await s.saveGame({ id: 'game-a', moves: [], savedAt: 1000 });
  await s.saveGame({ id: 'game-b', moves: [], savedAt: 3000 });
  const g = await s.getGame('current');
  ok(g && g.moves.length === 1, 'saveGame/getGame 读写一致');
  const list = await s.listGames();
  ok(list.length === 3 && list[0].id === 'game-b', 'listGames 按时间倒序');
  await s.deleteGame('game-a');
  ok((await s.listGames()).length === 2, 'deleteGame 删除');
  await s.setProgress('stats', { wins: 3 });
  ok((await s.getProgress('stats', null)).wins === 3, 'progress 读写');
  ok((await s.getProgress('nope', 42)) === 42, 'progress 默认值');
  await s.addMistake({ id: 'm1', puzzleId: 'p1' });
  ok((await s.listMistakes()).length === 1, 'mistakes 增查');
  await s.deleteMistake('m1');
  ok((await s.listMistakes()).length === 0, 'mistakes 删除');
}
{
  // Node 无 indexedDB/localStorage → 自动落到内存后端且可用
  const s = createStore();
  await s.saveGame({ id: 'x', moves: [1], savedAt: 1 });
  ok((await s.getGame('x')).id === 'x', 'createStore 在 Node 下降级可用');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== 存储测试通过 ===');
