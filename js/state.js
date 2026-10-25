// @ts-check
/* =====================================================================
 * 全局状态（正式对局 / 推演 / UI 选择态）
 * 注意：跨模块的可变“标量”收纳在 runtime 对象里（ESM 导入绑定只读，不能重赋值）
 * ===================================================================== */
import { RED, initialBoard } from './engine/board.js';
import { $ } from './ui/dom.js';

export const game = {
  board: initialBoard(),
  turn: RED,
  moveHistory: [],          // 正式对局走法栈（推演不写入）
  over: false, resultTitle: '', resultDesc: '',
  mode: 'pva',              // 'pva' | 'pvp'
  humanSide: RED,
  difficulty: 'normal',
  thinking: false,
  checkStreak: { r: 0, b: 0 },   // 连续将军计数（长将判负）
  noCapture: 0                   // 无吃子步数（60回合=120步判和）
};
export const analysis = {
  active: false, snapshot: null, moves: [],
  turn: RED, over: false, check: false, lastMover: null
};
export const ui = { selected: -1, targets: [], dragging: null, animating: false, lastMove: null };

// 跨模块可变标量：教学上下文 / AI 对局世代
export const runtime = { teachCtx: null, aiEpoch: 0 };

export const teachMode = () => $('sel-teach').value;
