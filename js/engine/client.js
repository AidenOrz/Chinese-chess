// @ts-check
/* 主线程引擎客户端：把搜索派发给 Worker（浏览器）。
 * 三种 Worker 来源：
 *   ① dist 单文件注入的 window.__XQ_WORKER_SRC → Blob URL Worker（file:// 也可用）
 *   ② 模块开发环境 → new Worker(new URL('./worker.js', import.meta.url), {type:'module'})
 *   ③ Worker 不可用/失败 → 退回主线程同步搜索（带看门狗兜底）
 */
import { chooseMove } from './search.js';

let worker = null;
let workerBroken = false;
let seq = 0;
/** @type {Map<number, {resolve:(m:any)=>void, board:Array, turn:string, opts:Object}>} */
const pending = new Map();

function createWorker() {
  if (typeof window !== 'undefined' && window.__XQ_WORKER_SRC) {
    const url = URL.createObjectURL(new Blob([window.__XQ_WORKER_SRC], { type: 'text/javascript' }));
    return new Worker(url);
  }
  if (typeof Worker !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined') {
    return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  }
  return null;
}
function failAllWithSync() {
  for (const p of pending.values()) {
    const { resolve, board, turn, opts } = p;
    setTimeout(() => resolve(chooseMove(board, turn, opts)), 0);
  }
  pending.clear();
}
function ensureWorker() {
  if (worker) return true;
  if (workerBroken) return false;
  try {
    const w = createWorker();
    if (!w) { workerBroken = true; return false; }
    w.onmessage = e => {
      const p = pending.get(e.data.id);
      if (p) { pending.delete(e.data.id); p.resolve(e.data.move); }
    };
    w.onerror = () => { workerBroken = true; try { w.terminate(); } catch (err) {} worker = null; failAllWithSync(); };
    worker = w;
    return true;
  } catch (e) {
    workerBroken = true;
    return false;
  }
}
/** 异步搜索一步；Worker 不可用或无响应时退回主线程同步搜索 */
export function workerSearch(board, turn, opts) {
  return new Promise(resolve => {
    if (!ensureWorker()) {
      setTimeout(() => resolve(chooseMove(board, turn, opts)), 30);
      return;
    }
    const id = ++seq;
    let done = false;
    const finish = m => { if (done) return; done = true; pending.delete(id); resolve(m); };
    pending.set(id, { resolve: finish, board, turn, opts });
    try {
      worker.postMessage({ id, type: 'search', board, turn, opts });
    } catch (e) {
      workerBroken = true; worker = null;
      finish(chooseMove(board, turn, opts));
      return;
    }
    // 看门狗：Worker 超时无响应（如脚本 404）→ 终止并退回同步搜索
    setTimeout(() => {
      if (done) return;
      workerBroken = true;
      try { worker.terminate(); } catch (e) {}
      worker = null;
      pending.delete(id);
      for (const p of pending.values()) {
        const { resolve: r, board: b, turn: t, opts: o } = p;
        setTimeout(() => r(chooseMove(b, t, o)), 0);
      }
      pending.clear();
      resolve(chooseMove(board, turn, opts));
    }, (opts.timeMs || 3000) + 2500);
  });
}
/** 重开/换边时调用：终止在途搜索，释放 Worker */
export function resetWorker() {
  if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
  for (const p of pending.values()) p.resolve(null);
  pending.clear();
}
