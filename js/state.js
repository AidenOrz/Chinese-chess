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
  difficulty: '5',          // AI 棋力档位 1~8（见 engine/levels.js）
  thinking: false,
  formalRules: false,         // 正式规则模式：三次重复判和 / 长将（连续 6 次将军）判负
  posCounts: null,            // Map<局面哈希, 出现次数>（正式规则模式下使用）
  checkStreak: { r: 0, b: 0 },   // 连续将军计数（长将判负）
  noCapture: 0                   // 无吃子步数（60回合=120步判和）
};
export const analysis = {
  active: false, snapshot: null, moves: [],
  turn: RED, over: false, check: false, lastMover: null
};
export const ui = { selected: -1, targets: [], dragging: null, animating: false, lastMove: null };

// 跨模块可变标量
//   teachCtx    教学分析上下文
//   aiEpoch     AI 世代计数（重开/切换占用者时递增，过期回调直接丢弃）
//   boardOwner  当前占用 game.board 的模式：'formal' | 'analysis' | 'study' | 'review'
//               非 'formal' 时禁止正式落子与 AI 回调落地（见 app.js applyFormalMove / scheduleAi）
export const runtime = { teachCtx: null, aiEpoch: 0, boardOwner: 'formal' };

export const teachMode = () => $('sel-teach').value;
