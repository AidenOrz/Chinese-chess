// @ts-check
/* =====================================================================
 * 复盘评分（纯函数）：对单手用引擎全窗口打分，算损失并给标注
 * 损失 = 最优着分 - 实际着分（走子方视角）
 * ===================================================================== */
import { sideOf, moveName, findBestMove } from '../engine/index.js';

/** 损失 → 标注 */
export function markOf(loss) {
  if (loss > 300) return '失误';
  if (loss > 150) return '疑问';
  if (loss > 40) return '一般';
  return '好棋';
}
/**
 * 评一手棋。board 为走子前局面，mv 为 {from,to}。
 * 返回 { loss, mark, bestName }（bestName 仅在明显失误时给出更佳着法）
 */
export function scoreMove(board, side, mv, opts = {}) {
  const { list } = findBestMove(board, side, {
    depth: opts.depth || 2, useQ: true, timeMs: opts.timeMs || 700, exact: true
  });
  if (!list.length) return { loss: 0, mark: '好棋', bestName: null };
  const best = list[0];
  const actual = list.find(x => x.m.from === mv.from && x.m.to === mv.to);
  const loss = Math.max(0, Math.round(best.v - (actual ? actual.v : best.v)));
  return {
    loss,
    mark: markOf(loss),
    bestName: loss > 150 ? moveName(board, best.m) : null
  };
}
