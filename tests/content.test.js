// 教学内容（题库 puzzles.json + 课程 courses.json）测试
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));

const puzzles = JSON.parse(readFileSync(join(here, '../data/puzzles/puzzles.json'), 'utf8'));
const courses = JSON.parse(readFileSync(join(here, '../data/courses/courses.json'), 'utf8'));
const {
  idx, RED, BLACK, other, typeOf,
  legalMoves, isInCheck, fenToBoard, findBestMove, clearTT, materialLead, MATE,
} = await import('../js/engine/index.js');

const t0 = Date.now();
const isLegal = (bd, side, f, t) => legalMoves(bd, side).some(m => m.from === f && m.to === t);
const isMate = (bd, side) => {
  const o = other(side);
  return legalMoves(bd, o).length === 0 && isInCheck(bd, o);
};
/** 引擎最强应对（清空置换表，与生成时逐着重放保持一致） */
function engineReply(bd, side, depth = 4) {
  clearTT();
  const r = findBestMove(bd, side, { depth, useQ: true, timeMs: 3000, exact: false });
  if (r.aborted || !r.list.length) return null;
  return r.list[0].m;
}
function applyM(bd, m) { bd[m[1]] = bd[m[0]]; bd[m[0]] = null; }
function tryMove(bd, from, to, fn) {
  const cap = bd[to];
  bd[to] = bd[from]; bd[from] = null;
  const r = fn();
  bd[from] = bd[to]; bd[to] = cap;
  return r;
}
function mateIn1Exists(bd, side) {
  return legalMoves(bd, side).some(m =>
    tryMove(bd, m.from, m.to, () => {
      const o = other(side);
      return isInCheck(bd, o) && legalMoves(bd, o).length === 0;
    }));
}

/* ---------- 1. 题库结构 ---------- */
{
  ok(Array.isArray(puzzles) && puzzles.length === 50, '题库共 50 题（实际 ' + puzzles.length + '）');
  const ids = new Set(puzzles.map(p => p.id));
  ok(ids.size === puzzles.length, '题目 id 唯一');
  const fens = new Set(puzzles.map(p => p.fen + '|' + p.side));
  ok(fens.size === puzzles.length, '题目局面不重复');
  const want = { mate1: 20, mate2: 18, endgame: 7, tactic: 5 };
  const got = {};
  for (const p of puzzles) got[p.category] = (got[p.category] || 0) + 1;
  for (const [k, v] of Object.entries(want)) {
    ok(got[k] === v, '分类 ' + k + ' 共 ' + v + ' 题（实际 ' + (got[k] || 0) + '）');
  }
  let schemaOk = true, fenOk = true, sideOk = true;
  for (const p of puzzles) {
    if (!p.id || !p.title || !p.fen || !p.hint || !Array.isArray(p.solution) || !p.solution.length) schemaOk = false;
    if (!['mate1', 'mate2', 'endgame', 'tactic'].includes(p.category)) schemaOk = false;
    if (![1, 2, 3].includes(p.difficulty)) schemaOk = false;
    if (!['r', 'b'].includes(p.side)) schemaOk = false;
    if (p.id.startsWith('m1-') && p.category !== 'mate1') schemaOk = false;
    if (p.id.startsWith('m2-') && p.category !== 'mate2') schemaOk = false;
    if (p.id.startsWith('eg-') && p.category !== 'endgame') schemaOk = false;
    if (p.id.startsWith('tk-') && p.category !== 'tactic') schemaOk = false;
    let turn = null;
    try { turn = fenToBoard(p.fen).turn; } catch { fenOk = false; }
    if (turn !== null && p.side !== (turn === RED ? 'r' : 'b')) sideOk = false;
  }
  ok(schemaOk, '每题字段完整且 id 前缀与类别一致');
  ok(fenOk, '所有 FEN 通过 fenToBoard 合法性校验');
  ok(sideOk, 'side 与 FEN 走子方一致');
}

/* ---------- 2. mate1：一步杀 ---------- */
{
  let allOk = true, lenOk = true;
  for (const p of puzzles.filter(x => x.category === 'mate1')) {
    if (p.solution.length !== 1) { lenOk = false; continue; }
    const { board, turn } = fenToBoard(p.fen);
    const bd = board.slice();
    const side = turn;
    if (!isLegal(bd, side, p.solution[0][0], p.solution[0][1])) { allOk = false; continue; }
    applyM(bd, p.solution[0]);
    if (!isMate(bd, side)) allOk = false;
  }
  ok(lenOk, 'mate1 每题主变恰为 1 着');
  ok(allOk, 'mate1 20 题：正着合法且走后对方被将死（无合法着且被将军）');
}

/* ---------- 3. mate2 / endgame：多步强制杀（引擎应对逐着重放） ---------- */
{
  let allOk = true, lenOk = true, scoreOk = true, forcedOk = true;
  for (const p of puzzles.filter(x => x.category === 'mate2' || x.category === 'endgame')) {
    const minLen = p.category === 'mate2' ? 2 : 3;
    const maxLen = p.category === 'mate2' ? 2 : 5;
    if (p.solution.length < minLen || p.solution.length > maxLen) { lenOk = false; continue; }
    const { board, turn } = fenToBoard(p.fen);
    const bd = board.slice();
    const side = turn;
    // 初始局面存在强制杀：引擎分 ≥ MATE-1000（深度足以覆盖主变步数）
    clearTT();
    const needDepth = Math.min(10, Math.max(4, 2 * p.solution.length));
    const r = findBestMove(bd, side, { depth: needDepth, useQ: true, timeMs: 3000, exact: false });
    if (!r.list.length || r.list[0].v < MATE - 1000) scoreOk = false;
    // 逐着重放：对方用引擎最强应对，步数内将死
    let okLine = true;
    for (let i = 0; i < p.solution.length; i++) {
      const mv = p.solution[i];
      if (!isLegal(bd, side, mv[0], mv[1])) { okLine = false; break; }
      applyM(bd, mv);
      if (i < p.solution.length - 1) {
        const rep = engineReply(bd, other(side));
        if (!rep) { okLine = false; break; }
        bd[rep.to] = bd[rep.from]; bd[rep.from] = null;
      }
    }
    if (!okLine || !isMate(bd, side)) allOk = false;
    // mate2 加验强制性：第一着后，对方任意应着都无法逃过下一步杀
    if (p.category === 'mate2' && okLine) {
      const bd2 = fenToBoard(p.fen).board.slice();
      const first = p.solution[0];
      const forced = tryMove(bd2, first[0], first[1], () => {
        const reps = legalMoves(bd2, other(side));
        if (!reps.length) return false;
        return reps.every(rep => tryMove(bd2, rep.from, rep.to, () => mateIn1Exists(bd2, side)));
      });
      if (!forced) forcedOk = false;
    }
  }
  ok(lenOk, 'mate2 恰 2 着、endgame 3~5 着');
  ok(scoreOk, 'mate2/endgame 初始局面引擎分 ≥ MATE-1000（存在强制杀）');
  ok(allOk, 'mate2/endgame 25 题：引擎最强应对下重放主变，步数内严格将死');
  ok(forcedOk, 'mate2 18 题首着后对方任意应着均难逃一步杀（强制性）');
}

/* ---------- 4. tactic：得子战术 ---------- */
{
  let allOk = true, leadOk = true;
  for (const p of puzzles.filter(x => x.category === 'tactic')) {
    const { board, turn } = fenToBoard(p.fen);
    const bd = board.slice();
    const side = turn;
    let okLine = true;
    for (let i = 0; i < p.solution.length; i++) {
      const mv = p.solution[i];
      if (!isLegal(bd, side, mv[0], mv[1])) { okLine = false; break; }
      applyM(bd, mv);
      const rep = engineReply(bd, other(side));   // 对方最强应对（含最后一着之后）
      if (!rep) { okLine = false; break; }
      bd[rep.to] = bd[rep.from]; bd[rep.from] = null;
    }
    if (!okLine) { allOk = false; continue; }
    if (materialLead(bd, side) < 150) leadOk = false;
  }
  ok(allOk, 'tactic 5 题主变逐着合法（对方引擎应对）');
  ok(leadOk, 'tactic 5 题主变完成后净得子力 ≥ 150');
}

/* ---------- 5. 课程 ---------- */
{
  ok(Array.isArray(courses) && courses.length === 10, '课程共 10 课（实际 ' + courses.length + '）');
  const ids = new Set(courses.map(c => c.id));
  ok(ids.size === courses.length, '课程 id 唯一');
  const pzIds = new Set(puzzles.map(p => p.id));
  const MATE_COURSES = ['mate-chongpao', 'mate-mengong', 'mate-wocaoma', 'mate-diaoyuma', 'mate-tiemenshuan', 'mate-shuangchecuo'];
  const EG_COURSES = ['eg-danche-jichu', 'eg-danche-jinjie'];
  const OPEN_COURSES = ['open-zhongpao', 'open-pingfengma'];
  for (const id of [...MATE_COURSES, ...EG_COURSES, ...OPEN_COURSES]) {
    ok(ids.has(id), '课程清单包含 ' + id);
  }
  let structOk = true, explainOk = true, movesOk = true, quizOk = true, typeOk = true;
  for (const c of courses) {
    if (!c.title || !c.intro || ![1, 2, 3].includes(c.level)) structOk = false;
    if (!Array.isArray(c.steps) || c.steps.length < 3 || c.steps.length > 6) structOk = false;
    for (const s of c.steps) {
      if (s.type === 'explain') {
        try {
          const { board } = fenToBoard(s.fen);
          if (board.length !== 90) explainOk = false;
        } catch { explainOk = false; }
        if (s.highlights) {
          for (const [r, cc] of s.highlights)
            if (!(r >= 0 && r < 10 && cc >= 0 && cc < 9)) explainOk = false;
        }
        if (s.arrows) {
          for (const [f, t] of s.arrows)
            if (!(f >= 0 && f < 90 && t >= 0 && t < 90)) explainOk = false;
        }
      } else if (s.type === 'demo' || s.type === 'guided') {
        try {
          const { board, turn } = fenToBoard(s.fen);
          const bd = board.slice();
          let side = turn;
          if (!Array.isArray(s.moves) || !s.moves.length) { movesOk = false; break; }
          for (let i = 0; i < s.moves.length; i++) {
            const [f, t] = s.moves[i];
            if (!isLegal(bd, side, f, t)) { movesOk = false; break; }
            bd[t] = bd[f]; bd[f] = null;
            side = other(side);
          }
        } catch { movesOk = false; }
      } else if (s.type === 'quiz') {
        if (!pzIds.has(s.puzzleId)) quizOk = false;
      } else typeOk = false;
    }
  }
  ok(structOk, '课程字段完整、每课 3~6 步');
  ok(typeOk, '课程步骤类型均为 explain/demo/guided/quiz');
  ok(explainOk, 'explain 局面 FEN 合法、highlights/arrows 坐标在界内');
  ok(movesOk, 'demo/guided 着法序列逐着合法（红黑交替）');
  ok(quizOk, 'quiz 引用的 puzzleId 全部存在');
  // 杀法课演示终局确为将死（与生成器约定一致：demo 序列末着成杀）
  let mateDemoOk = true;
  for (const id of MATE_COURSES) {
    const c = courses.find(x => x.id === id);
    for (const s of c.steps) {
      if (s.type !== 'demo') continue;
      const { board, turn } = fenToBoard(s.fen);
      const bd = board.slice();
      let side = turn;
      for (const [f, t] of s.moves) { bd[t] = bd[f]; bd[f] = null; side = other(side); }
      if (!isMate(bd, other(side))) mateDemoOk = false;
    }
  }
  ok(mateDemoOk, '六大杀法课的演示终局均为将死');
}

const dt = Date.now() - t0;
ok(dt < 60000, '内容测试总耗时 ' + dt + 'ms < 60s');
if (fails) throw new Error(fails + ' 项失败');
console.log('=== 内容测试通过 ===');
