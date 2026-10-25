// @ts-check
/* 引擎 Worker：消息协议
 *   → { id, type: 'search', board, turn, opts }
 *   ← { id, type: 'result', move }
 * 搜索在 Worker 线程同步执行，主线程 UI 不冻结 */
import { chooseMove } from './search.js';

self.onmessage = e => {
  const msg = e.data;
  if (!msg || msg.type !== 'search') return;
  const move = chooseMove(msg.board, msg.turn, msg.opts);
  self.postMessage({ id: msg.id, type: 'result', move });
};
