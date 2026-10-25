#!/usr/bin/env node
/* =====================================================================
 * 题库生成器：生成 data/puzzles/puzzles.json（50 题）
 *   mate1 ×20（一步杀）/ mate2 ×18（两步强制杀）/ endgame ×7（残局 3~5 步杀）/ tactic ×5（得子战术）
 * 所有局面与主变均经引擎验证（fenToBoard 合法性、着法合法、终局将死/净得子）。
 * 运行：node scripts/gen-puzzles.mjs
 * =================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  idx, RED, BLACK, other, typeOf, sideOf,
  legalMoves, isInCheck, kingsFacing, isDefended,
  boardToFen, fenToBoard, findBestMove, clearTT, materialLead, MATE,
} from '../js/engine/index.js';

/* ---------- 基础工具 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261025);          // 固定种子，保证生成结果可复现
const ri = n => Math.floor(rng() * n);
const B = (r, c) => idx(r, c);
const emptyBoard = () => new Array(90).fill(null);
function mkBoard(list) {
  const bd = emptyBoard();
  for (const [r, c, p] of list) bd[B(r, c)] = p;
  return bd;
}
const FEN = (bd, side) => boardToFen(bd, side);
function tryMove(bd, from, to, fn) {
  const cap = bd[to];
  bd[to] = bd[from]; bd[from] = null;
  const r = fn();
  bd[from] = bd[to]; bd[to] = cap;
  return r;
}
const isLegal = (bd, side, from, to) => legalMoves(bd, side).some(m => m.from === from && m.to === to);
const isMate = (bd, side) => {
  const o = other(side);
  return legalMoves(bd, o).length === 0 && isInCheck(bd, o);
};
/** 一步杀着法（只扫将军着法，未将军不可能成杀） */
function mateIn1Move(bd, side) {
  for (const m of legalMoves(bd, side)) {
    const hit = tryMove(bd, m.from, m.to, () => {
      const o = other(side);
      return isInCheck(bd, o) && legalMoves(bd, o).length === 0;
    });
    if (hit) return m;
  }
  return null;
}
/** side 走 m 后，对方任意应着都无法避免被一步杀（真两步杀的核心性质） */
function forcesMate2(bd, side, m) {
  return tryMove(bd, m.from, m.to, () => {
    const opp = other(side);
    const reps = legalMoves(bd, opp);
    if (!reps.length) return false;                       // 已经直接将死 → 属于 mate1
    return reps.every(rep => tryMove(bd, rep.from, rep.to, () => !!mateIn1Move(bd, side)));
  });
}
/** 引擎最佳着（每次清空置换表，保证与测试逐着重放时确定性一致） */
function engineBest(bd, side, depth, timeMs = 3000) {
  clearTT();
  const r = findBestMove(bd, side, { depth, useQ: true, timeMs, exact: false });
  if (r.aborted || !r.list.length) return null;
  return { m: r.list[0].m, v: r.list[0].v };
}
function assert(cond, msg) { if (!cond) throw new Error('生成校验失败：' + msg); }
const sideName = s => (s === RED ? '红方' : '黑方');
const PIECE_CN = { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' };

/** 局面基本合法性（fenToBoard 全量校验 + 双方未被将军） */
function validPosition(bd) {
  try { fenToBoard(boardToFen(bd, RED)); } catch { return false; }
  return !isInCheck(bd, RED) && !isInCheck(bd, BLACK);
}

const puzzles = [];
const seen = new Set();
function pushPuzzle(p) {
  const key = p.fen + '|' + p.side;
  assert(!seen.has(key), '重复局面：' + p.fen);
  seen.add(key);
  puzzles.push(p);
}

/* ================= 一、主题一步杀（六大杀法各一） ================= */
const THEMATIC_M1 = [
  {
    id: 'm1-001', title: '重炮杀', difficulty: 1, side: RED,
    pieces: [[9, 3, 'K'], [6, 4, 'C'], [5, 6, 'C'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a']],
    move: [B(5, 6), B(5, 4)],
    hint: '两炮叠于中路：前炮叫将、后炮补位，黑方垫将也逃不掉。',
  },
  {
    id: 'm1-002', title: '闷宫杀', difficulty: 1, side: RED,
    pieces: [[9, 3, 'K'], [4, 5, 'C'], [2, 3, 'P'], [0, 3, 'k'], [0, 4, 'r'], [3, 8, 'n']],
    move: [B(4, 5), B(4, 3)],
    hint: '黑车自堵将门，红炮平到肋线借兵作炮架，黑将闷死宫中。',
  },
  {
    id: 'm1-003', title: '卧槽马杀', difficulty: 2, side: RED,
    pieces: [[9, 3, 'K'], [4, 1, 'N'], [1, 4, 'P'], [0, 3, 'k'], [2, 3, 'a'], [3, 8, 'r']],
    move: [B(4, 1), B(2, 2)],
    hint: '马跳卧槽位将军，中兵早已封住黑将上落的路。',
  },
  {
    id: 'm1-004', title: '钓鱼马杀', difficulty: 2, side: RED,
    pieces: [[9, 3, 'K'], [3, 3, 'N'], [2, 4, 'P'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a'], [2, 7, 'r']],
    move: [B(3, 3), B(1, 2)],
    hint: '马到钓鱼位（宫门侧翼）将军，黑将上不去也躲不开。',
  },
  {
    id: 'm1-005', title: '铁门栓杀', difficulty: 2, side: RED,
    pieces: [[9, 3, 'K'], [6, 6, 'C'], [3, 4, 'P'], [2, 3, 'R'], [1, 5, 'P'], [0, 4, 'k'], [3, 8, 'r']],
    move: [B(6, 6), B(6, 4)],
    hint: '车锁左肋、兵封右肋，中炮一镇，黑将两肋的门都被拴死。',
  },
  {
    id: 'm1-006', title: '双车错杀', difficulty: 2, side: RED,
    pieces: [[9, 3, 'K'], [1, 0, 'R'], [3, 5, 'N'], [2, 3, 'R'], [0, 6, 'P'], [0, 4, 'k'], [3, 0, 'n'], [4, 8, 'r']],
    move: [B(1, 0), B(1, 4)],
    hint: '双车交错封锁：一车贴身将军，另一车与兵早已锁住黑将出路。',
  },
];
for (const t of THEMATIC_M1) {
  const bd = mkBoard(t.pieces);
  assert(validPosition(bd), t.id + ' 局面不合法');
  assert(isLegal(bd, t.side, t.move[0], t.move[1]), t.id + ' 主题着法不合法');
  assert(tryMove(bd, t.move[0], t.move[1], () => isMate(bd, t.side)), t.id + ' 主题着法未将死');
  pushPuzzle({ id: t.id, category: 'mate1', difficulty: t.difficulty, title: t.title,
    fen: FEN(bd, t.side), side: t.side === RED ? 'r' : 'b', solution: [[t.move[0], t.move[1]]], hint: t.hint });
}

/* ================= 二、随机一步杀（补足 20 题） ================= */
const ATT_POOL = ['R', 'R', 'C', 'C', 'N', 'N', 'P'];
const DEF_POOL = ['a', 'a', 'b', 'p', 'p', 'n', 'r', 'c'];
const ELE_POINTS = {
  [RED]:   [[9, 2], [9, 6], [7, 0], [7, 4], [7, 8], [5, 2], [5, 6]],
  [BLACK]: [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]],
};
/**
 * 随机少子局面。deep=true 时攻方大子偏向对方半场（成杀率高，供 mate1/mate2 用）。
 */
function randomSparePosition(maxAtt, maxDef, deep) {
  const bd = emptyBoard();
  let kr, kc, br, bc, tries = 0;
  do {
    kr = 7 + ri(3); kc = 3 + ri(3); br = ri(3); bc = 3 + ri(3);
  } while (kc === bc && ++tries < 50);                     // 帅将不同列，避免照面
  if (kc === bc) return null;
  bd[B(kr, kc)] = 'K'; bd[B(br, bc)] = 'k';
  const side = rng() < 0.7 ? RED : BLACK;                  // 七成红方杀、三成黑方杀
  const attCh = ch => (side === RED ? ch : ch.toLowerCase());
  const defCh = ch => (side === RED ? ch.toLowerCase() : ch);
  const randEmpty = zone => {
    for (let i = 0; i < 60; i++) {
      let r = ri(10), c = ri(9);
      if (zone === 'att-deep') r = side === RED ? ri(6) : 4 + ri(6);        // 攻入对方半场
      if (zone === 'def-half') r = side === RED ? ri(5) : 5 + ri(5);        // 守方自己半场
      if (bd[B(r, c)]) continue;
      return [r, c];
    }
    return null;
  };
  const nAtt = 2 + ri(maxAtt - 1), nDef = 1 + ri(maxDef);
  const att = [...ATT_POOL].sort(() => rng() - 0.5).slice(0, nAtt);
  const def = [...DEF_POOL].sort(() => rng() - 0.5).slice(0, nDef);
  for (const ch of att) {
    let spot;
    if (ch === 'P') {                                       // 兵/卒必须已过河才有杀伤力
      const r = side === RED ? ri(4) : 6 + ri(4);
      const cand = [];
      for (let c = 0; c < 9; c++) if (!bd[B(r, c)]) cand.push(c);
      if (!cand.length) return null;
      bd[B(r, cand[ri(cand.length)])] = attCh(ch);
      continue;
    }
    spot = randEmpty(deep ? 'att-deep' : 'any');
    if (!spot) return null;
    bd[B(spot[0], spot[1])] = attCh(ch);
  }
  for (const ch of def) {
    if (ch === 'a') {                                       // 仕放九宫空位
      const cand = [];
      for (let r = 0; r < 3; r++) for (let c = 3; c < 6; c++) if (!bd[B(r, c)]) cand.push([r, c]);
      if (!cand.length) return null;
      const [r, c] = cand[ri(cand.length)];
      bd[B(r, c)] = defCh(ch);
      continue;
    }
    if (ch === 'b') {                                       // 象放可落点
      const pts = ELE_POINTS[other(side)].filter(([r, c]) => !bd[B(r, c)]);
      if (!pts.length) return null;
      const [r, c] = pts[ri(pts.length)];
      bd[B(r, c)] = defCh(ch);
      continue;
    }
    const spot = randEmpty('def-half');
    if (!spot) return null;
    bd[B(spot[0], spot[1])] = defCh(ch);
  }
  if (!validPosition(bd)) return null;
  return { bd, side };
}
const FLAVOR = { R: '车入底线', C: '炮镇中路', N: '马踏宫门', P: '兵临城下' };
function describeM1(bd, m) {
  const t = typeOf(bd[m.from]);
  return (PIECE_CN[t] || '子力') + '一步杀·' + (FLAVOR[t] || '精确打击');
}
let guard = 0;
while (puzzles.filter(p => p.category === 'mate1').length < 20 && guard++ < 200000) {
  const pos = randomSparePosition(3, 3, true);
  if (!pos) continue;
  const { bd, side } = pos;
  if (bd.filter(Boolean).length > 9) continue;
  const m = mateIn1Move(bd, side);
  if (!m) continue;
  const fen = FEN(bd, side);
  if (seen.has(fen + '|' + side)) continue;
  pushPuzzle({
    id: 'm1-' + String(puzzles.filter(p => p.category === 'mate1').length + 1).padStart(3, '0'),
    category: 'mate1',
    difficulty: bd.filter(p => p && sideOf(p) === other(side)).length >= 3 ? 2 : 1,
    title: describeM1(bd, m),
    fen, side: side === RED ? 'r' : 'b',
    solution: [[m.from, m.to]],
    hint: sideName(side) + '先行，有一着即杀的妙手：留意' + (PIECE_CN[typeOf(bd[m.from])] || '子力') + '的将军线路。',
  });
}
assert(puzzles.filter(p => p.category === 'mate1').length === 20, 'mate1 不足 20 题');

/* ================= 三、两步强制杀（18 题） ================= */
guard = 0;
while (puzzles.filter(p => p.category === 'mate2').length < 18 && guard++ < 200000) {
  const pos = randomSparePosition(3, 2, true);
  if (!pos) continue;
  const { bd, side } = pos;
  if (bd.filter(Boolean).length > 9) continue;
  if (mateIn1Move(bd, side)) continue;                     // 必须不是一步杀
  // 两步杀第一着通常（在本生成器中限定）是将军着，先扫将军着可大幅提速
  let first = null;
  for (const m of legalMoves(bd, side)) {
    const givesCheck = tryMove(bd, m.from, m.to, () => isInCheck(bd, other(side)));
    if (!givesCheck) continue;
    if (forcesMate2(bd, side, m)) { first = m; break; }
  }
  if (!first) continue;
  const fen = FEN(bd, side);
  if (seen.has(fen + '|' + side)) continue;
  // 记录主变：我方 first → 引擎最强应对 → 我方杀着
  const solution = [[first.from, first.to]];
  let okLine = false;
  tryMove(bd, first.from, first.to, () => {
    const opp = other(side);
    const rep = engineBest(bd, opp, 4);
    if (!rep) return;
    tryMove(bd, rep.m.from, rep.m.to, () => {
      const kill = mateIn1Move(bd, side);
      if (!kill) return;
      solution.push([kill.from, kill.to]);
      if (tryMove(bd, kill.from, kill.to, () => isMate(bd, side))) okLine = true;
    });
  });
  if (!okLine || solution.length !== 2) continue;
  const simT = bd.slice();
  const types = [...new Set(solution.map(([f, t]) => {
    const ty = typeOf(simT[f]);
    simT[t] = simT[f]; simT[f] = null;
    return ty;
  }))].map(t => PIECE_CN[t]);
  pushPuzzle({
    id: 'm2-' + String(puzzles.filter(p => p.category === 'mate2').length + 1).padStart(3, '0'),
    category: 'mate2',
    difficulty: bd.filter(Boolean).length >= 8 ? 3 : 2,
    title: types.join('') + '两步连杀',
    fen, side: side === RED ? 'r' : 'b',
    solution,
    hint: sideName(side) + '先行，两步强制杀：第一着抢先占位叫杀，对方无论怎么应都难逃下一着。',
  });
}
assert(puzzles.filter(p => p.category === 'mate2').length === 18, 'mate2 不足 18 题');

/* ================= 四、简化残局杀（7 题，3~5 步） ================= */
/* 严格将死 AND-OR 求解器（记忆化）：solve=side 能否在 ≤n 步内强制将死对方 */
const egMemo = new Map();
function egKey(bd, side) {
  let s = side;
  for (let i = 0; i < 90; i++) { const p = bd[i]; s += p ? String.fromCharCode(p.charCodeAt(0)) : '.'; }
  return s;
}
function egSolve(bd, side, n) {
  if (n <= 0) return false;
  const key = egKey(bd, side);
  let e = egMemo.get(key);
  if (!e) { e = { pMin: Infinity, dMax: 0 }; egMemo.set(key, e); }
  if (e.pMin <= n) return true;
  if (e.dMax >= n) return false;
  const m = egWinMove(bd, side, n);
  if (m) { e.pMin = Math.min(e.pMin, n); return true; }
  e.dMax = Math.max(e.dMax, n);
  return false;
}
/** 返回一个可强制 ≤n 步杀的着法（无则 null） */
function egWinMove(bd, side, n) {
  const opp = other(side);
  for (const m of legalMoves(bd, side)) {
    const win = tryMove(bd, m.from, m.to, () => {
      const reps = legalMoves(bd, opp);
      if (!reps.length) return isInCheck(bd, opp);      // 一步即杀（严格将死，不含困毙）
      if (n <= 1) return false;
      return reps.every(rep => tryMove(bd, rep.from, rep.to, () => egSolve(bd, side, n - 1)));
    });
    if (win) return m;
  }
  return null;
}
function egDist(bd, side, cap = 5) {
  for (let n = 1; n <= cap; n++) {
    egMemo.clear();
    if (egSolve(bd, side, n)) return n;
  }
  return 0;
}
function genEndgame(kind, side, wantDist) {
  for (let g = 0; g < 40000; g++) {
    const bd = emptyBoard();
    let kr, kc, br, bc, tries = 0;
    do {
      kr = 7 + ri(3); kc = 3 + ri(3); br = ri(3); bc = 3 + ri(3);
    } while (kc === bc && ++tries < 50);
    if (kc === bc) continue;
    bd[B(kr, kc)] = 'K'; bd[B(br, bc)] = 'k';
    const up = ch => (side === RED ? ch : ch.toLowerCase());
    const empties = [];
    for (let i = 0; i < 90; i++) if (!bd[i]) empties.push(i);
    const take = pred => {
      const cand = empties.filter(pred);
      if (!cand.length) return -1;
      const s = cand[ri(cand.length)];
      empties.splice(empties.indexOf(s), 1);
      return s;
    };
    let s;
    if (kind === 'R') {
      s = take(() => true);
      bd[s] = up('R');
    } else if (kind === 'RP') {
      s = take(() => true);
      bd[s] = up('R');
      s = take(i => (side === RED ? (i / 9 | 0) <= 4 : (i / 9 | 0) >= 5));   // 兵放前半场
      if (s < 0) continue;
      bd[s] = up('P');
    } else if (kind === 'RC') {
      s = take(() => true);
      bd[s] = up('R');
      s = take(() => true);
      bd[s] = up('C');
    } else return null;
    if (!validPosition(bd) || kingsFacing(bd)) continue;
    const dist = egDist(bd, side, 5);
    if (dist !== wantDist) continue;
    // 逐着记录主变：我方取求解器强制杀着法，对方用引擎最强应对（与测试重放一致）
    const line = [];
    const lineTypes = [];
    const sim = bd.slice();
    let remaining = dist;
    let okLine = true;
    while (remaining > 0) {
      egMemo.clear();
      const mine = egWinMove(sim, side, remaining);
      if (!mine) { okLine = false; break; }
      lineTypes.push(typeOf(sim[mine.from]));
      sim[mine.to] = sim[mine.from]; sim[mine.from] = null;
      line.push([mine.from, mine.to]);
      if (isMate(sim, side)) break;
      const rep = engineBest(sim, other(side), 4);
      if (!rep) { okLine = false; break; }
      sim[rep.m.to] = sim[rep.m.from]; sim[rep.m.from] = null;
      remaining--;
    }
    if (!okLine || !isMate(sim, side)) continue;
    if (line.length < 3 || line.length > 5) continue;
    if (line.length !== dist) continue;                   // 主变长度恰为求解器给出的杀距
    return { bd, side, fen: FEN(bd, side), solution: line, dist, types: lineTypes };
  }
  return null;
}
const EG_PLAN = [
  { id: 'eg-001', kind: 'R',  side: RED,   dist: 3 },
  { id: 'eg-002', kind: 'R',  side: BLACK, dist: 3 },
  { id: 'eg-003', kind: 'R',  side: RED,   dist: 4 },
  { id: 'eg-004', kind: 'R',  side: BLACK, dist: 4 },
  { id: 'eg-005', kind: 'R',  side: RED,   dist: 5 },
  { id: 'eg-006', kind: 'RP', side: RED,   dist: 3 },
  { id: 'eg-007', kind: 'RC', side: RED,   dist: 3 },
];
for (const plan of EG_PLAN) {
  let eg = genEndgame(plan.kind, plan.side, plan.dist);
  if (!eg && plan.kind !== 'R') eg = genEndgame('R', plan.side, plan.dist);
  if (!eg && plan.dist !== 4) eg = genEndgame('R', plan.side, 4);
  if (!eg && plan.side !== RED) eg = genEndgame('R', RED, plan.dist);
  assert(eg, '残局生成失败：' + plan.id);
  const pieces = [...new Set(eg.types)].map(t => PIECE_CN[t]).join('');
  const distCN = ['零', '一', '二', '三', '四', '五'][eg.dist];
  pushPuzzle({
    id: plan.id, category: 'endgame',
    difficulty: eg.dist >= 5 ? 3 : 2,
    title: pieces + '残局' + distCN + '步杀',
    fen: eg.fen, side: plan.side === RED ? 'r' : 'b',
    solution: eg.solution,
    hint: '残局要诀：大子抢占将门限制对方将的活动，帅（将）配合照面控制，' + distCN + '步成杀。',
  });
}

/* ================= 五、得子战术（5 题） ================= */
const TACTICS = [
  {
    id: 'tk-001', title: '将军抽车', difficulty: 2, side: RED,
    pieces: [[9, 5, 'K'], [3, 6, 'N'], [6, 6, 'P'], [0, 3, 'k'], [4, 3, 'r'], [3, 2, 'p']],
    moves: [[B(3, 6), B(2, 4)]], thenCapture: true,
    hint: '马跳中路既将军又踩车：黑方必须应将，车就保不住了。',
  },
  {
    id: 'tk-002', title: '炮打无根车', difficulty: 1, side: RED,
    pieces: [[9, 5, 'K'], [4, 8, 'C'], [4, 6, 'P'], [6, 2, 'N'], [0, 3, 'k'], [4, 4, 'r'], [1, 8, 'n']],
    moves: [[B(4, 8), B(4, 4)]],
    hint: '红炮隔着自家兵恰好瞄准黑车——黑车无根，一炮轰掉。',
  },
  {
    id: 'tk-003', title: '车吃无根马', difficulty: 1, side: RED,
    pieces: [[9, 4, 'K'], [4, 8, 'R'], [6, 2, 'N'], [0, 3, 'k'], [4, 4, 'n'], [0, 0, 'r']],
    moves: [[B(4, 8), B(4, 4)]],
    hint: '黑马立在通线却无保护，红车直接吃回大子。',
  },
  {
    id: 'tk-004', title: '一车捉双', difficulty: 2, side: RED,
    pieces: [[9, 4, 'K'], [2, 0, 'R'], [7, 5, 'N'], [7, 4, 'C'], [0, 3, 'k'], [2, 2, 'n'], [2, 6, 'c'], [4, 8, 'r']],
    moves: [[B(2, 0), B(2, 2)]],
    hint: '黑马、黑炮同在二路线且都无根，红车一箭双雕。',
  },
  {
    id: 'tk-005', title: '肋线捉双', difficulty: 2, side: RED,
    pieces: [[9, 5, 'K'], [0, 4, 'R'], [6, 2, 'N'], [1, 3, 'k'], [2, 4, 'n'], [6, 4, 'c'], [4, 8, 'c']],
    moves: [[B(0, 4), B(2, 4)]],
    hint: '红车沿肋线直扑黑马，远处的黑炮想救也来不及。',
  },
];
for (const t of TACTICS) {
  const bd = mkBoard(t.pieces);
  assert(validPosition(bd), t.id + ' 局面不合法');
  const sim = bd.slice();
  const solution = [];
  for (const [f, to] of t.moves) {
    assert(isLegal(sim, t.side, f, to), t.id + ' 战术着法不合法');
    sim[to] = sim[f]; sim[f] = null;
    solution.push([f, to]);
  }
  if (t.thenCapture) {
    const rep = engineBest(sim, other(t.side), 4);
    assert(rep, t.id + ' 对方无应着');
    sim[rep.m.to] = sim[rep.m.from]; sim[rep.m.from] = null;
    const cap = legalMoves(sim, t.side).find(m => sim[m.to] && typeOf(sim[m.to]) === 'R');
    assert(cap, t.id + ' 找不到抽车着法');
    sim[cap.to] = sim[cap.from]; sim[cap.from] = null;
    solution.push([cap.from, cap.to]);
  }
  const fin = engineBest(sim, other(t.side), 4);
  if (fin) { sim[fin.m.to] = sim[fin.m.from]; sim[fin.m.from] = null; }
  const lead = materialLead(sim, t.side);
  assert(lead >= 150, t.id + ' 主变后净得不足（' + lead + '）');
  const last = solution[solution.length - 1];
  if (legalMoves(sim, other(t.side)).some(m => m.to === last[1])) {
    assert(isDefended(sim, last[1], t.side), t.id + ' 得子后立即被白吃');
  }
  pushPuzzle({ id: t.id, category: 'tactic', difficulty: t.difficulty, title: t.title,
    fen: FEN(bd, t.side), side: 'r', solution, hint: t.hint });
}

/* ---------- 输出 ---------- */
assert(puzzles.length === 50, '题目总数应为 50，实际 ' + puzzles.length);
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'puzzles');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'puzzles.json');
writeFileSync(outPath, JSON.stringify(puzzles, null, 2) + '\n', 'utf8');
const byCat = {};
for (const p of puzzles) byCat[p.category] = (byCat[p.category] || 0) + 1;
console.log('已生成', outPath);
console.log('分类统计:', JSON.stringify(byCat));
for (const p of puzzles) {
  console.log(`  ${p.id} [${p.category}] d${p.difficulty} ${p.side === 'r' ? '红先' : '黑先'} ${p.title}  ${p.fen}`);
}
