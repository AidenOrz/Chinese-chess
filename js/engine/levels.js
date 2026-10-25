// @ts-check
/* =====================================================================
 * 棋力分档（8 级）：深度/时限控制强度，randomWindow 制造风格差异，
 * blunderChance 让低档“在恰当的水平犯恰当的错”（教学对手的要义）
 * ===================================================================== */
export const LEVELS = [
  { id: 1, name: '入门', desc: '会送子',     depth: 1, useQ: false, timeMs: 600,  randomWindow: 250, blunderChance: 0.35 },
  { id: 2, name: '初学', desc: '常失误',     depth: 2, useQ: false, timeMs: 900,  randomWindow: 180, blunderChance: 0.22 },
  { id: 3, name: '初级', desc: '偶有失误',   depth: 2, useQ: true,  timeMs: 1100, randomWindow: 110, blunderChance: 0.12 },
  { id: 4, name: '初级+', desc: '',          depth: 2, useQ: true,  timeMs: 1400, randomWindow: 60,  blunderChance: 0.06 },
  { id: 5, name: '中级', desc: '',           depth: 3, useQ: true,  timeMs: 2000, randomWindow: 40,  blunderChance: 0.03 },
  { id: 6, name: '中级+', desc: '',          depth: 3, useQ: true,  timeMs: 2600, randomWindow: 15,  blunderChance: 0 },
  { id: 7, name: '高级', desc: '',           depth: 4, useQ: true,  timeMs: 3500, randomWindow: 5,   blunderChance: 0 },
  { id: 8, name: '大师', desc: '',           depth: 5, useQ: true,  timeMs: 5000, randomWindow: 0,   blunderChance: 0 }
];
export function levelById(id) {
  const n = Number(id);
  return LEVELS.find(l => l.id === n) || LEVELS[4];
}
