#!/usr/bin/env node
/* =====================================================================
 * 课程生成器：生成 data/courses/courses.json（10 课）
 *   6 个基本杀法课 + 2 个残局课（取材于题库 endgame 题）+ 2 个开局原理课
 * 所有 explain 局面经 fenToBoard 校验；demo/guided 着法逐着验证合法；
 * 标注 expectMate 的演示终局验证为严格将死；quiz 引用的题目必须存在。
 * 运行：node scripts/gen-courses.mjs（需先运行 gen-puzzles.mjs）
 * =================================================================== */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  idx, RED, BLACK, other,
  legalMoves, isInCheck, fenToBoard, boardToFen, findBestMove, clearTT,
} from '../js/engine/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const B = (r, c) => idx(r, c);
const INITIAL = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';

function assert(cond, msg) { if (!cond) throw new Error('课程生成校验失败：' + msg); }
function mkFen(pieces, turn) {
  const bd = new Array(90).fill(null);
  for (const [r, c, p] of pieces) bd[B(r, c)] = p;
  return boardToFen(bd, turn);
}
function engineReply(bd, side) {
  clearTT();
  const r = findBestMove(bd, side, { depth: 4, useQ: true, timeMs: 3000, exact: false });
  if (r.aborted || !r.list.length) return null;
  return r.list[0].m;
}
const isLegal = (bd, side, f, t) => legalMoves(bd, side).some(m => m.from === f && m.to === t);
const isMate = (bd, side) => {
  const o = other(side);
  return legalMoves(bd, o).length === 0 && isInCheck(bd, o);
};

/* ---------- 读取题库，取残题主变 ---------- */
const puzzles = JSON.parse(readFileSync(join(ROOT, 'data', 'puzzles', 'puzzles.json'), 'utf8'));
const pz = id => {
  const p = puzzles.find(x => x.id === id);
  assert(p, '题库中找不到 ' + id);
  return p;
};
/** 把残局题的主变（仅我方着）展开为完整交替序列（对方着用引擎最强应对） */
function expandLine(p) {
  const { board, turn } = fenToBoard(p.fen);
  const bd = board.slice();
  const side = turn;
  const moves = [];
  for (let i = 0; i < p.solution.length; i++) {
    const [f, t] = p.solution[i];
    assert(isLegal(bd, side, f, t), p.id + ' 主变第 ' + (i + 1) + ' 着不合法');
    moves.push([f, t]);
    bd[t] = bd[f]; bd[f] = null;
    if (i < p.solution.length - 1) {
      const rep = engineReply(bd, other(side));
      assert(rep, p.id + ' 对方无应着');
      moves.push([rep.from, rep.to]);
      bd[rep.to] = bd[rep.from]; bd[rep.from] = null;
    }
  }
  assert(isMate(bd, side), p.id + ' 主变终局未将死');
  return moves;
}
const eg1 = pz('eg-001'), eg3 = pz('eg-003'), eg5 = pz('eg-005'), eg6 = pz('eg-006');
const lineEg1 = expandLine(eg1);
const lineEg3 = expandLine(eg3);
const lineEg5 = expandLine(eg5);
const lineEg6 = expandLine(eg6);

/* ================= 课程定义 ================= */
const courses = [
  {
    id: 'mate-chongpao', title: '重炮杀', level: 1,
    intro: '两炮叠于一线，前炮叫将、后炮补位，垫将也逃不掉的经典杀法。',
    steps: [
      {
        type: 'explain',
        fen: mkFen([[9, 3, 'K'], [6, 4, 'C'], [5, 6, 'C'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a']], RED),
        text: '重炮杀：两门炮在同一条直线上重叠。前炮贴身叫将时，后炮正好以它为炮架继续将军。黑方垫上一个子，前炮就借垫子作架，照样将——怎么垫都没用。本局红方右炮平中即成重炮杀。',
        highlights: [[6, 4], [5, 6], [0, 4]],
        arrows: [[B(5, 6), B(5, 4)]],
      },
      {
        type: 'demo',
        fen: mkFen([[9, 3, 'K'], [7, 4, 'C'], [5, 8, 'C'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a'], [4, 0, 'r']], RED),
        moves: [[B(7, 4), B(6, 4)], [B(4, 0), B(4, 8)], [B(5, 8), B(5, 4)]],
        text: '先看一遍完整过程：1.后炮进一占住中路；黑车平开防守；2.前炮平中，双炮重叠——重炮杀！',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: mkFen([[9, 3, 'K'], [6, 4, 'C'], [5, 6, 'C'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a']], RED),
        moves: [[B(5, 6), B(5, 4)]],
        text: '轮到你：中路已有一炮镇守，请把另一炮平到中线，走出重炮杀。',
      },
      { type: 'quiz', puzzleId: 'm1-001' },
    ],
  },
  {
    id: 'mate-mengong', title: '闷宫杀', level: 2,
    intro: '黑将被己方棋子堵在宫里动弹不得，红炮借子作架一击致命。',
    steps: [
      {
        type: 'explain',
        fen: mkFen([[9, 3, 'K'], [4, 5, 'C'], [2, 3, 'P'], [0, 3, 'k'], [0, 4, 'r'], [3, 8, 'n']], RED),
        text: '闷宫杀的特点：黑将的所有出路都被堵死——这里黑车自己堵住了将门，红兵又封住上将之路。红炮只要平到肋线，借红兵作炮架将军，黑将就闷死在宫中。',
        highlights: [[4, 5], [2, 3], [0, 3], [0, 4]],
        arrows: [[B(4, 5), B(4, 3)]],
      },
      {
        type: 'demo',
        fen: mkFen([[9, 3, 'K'], [6, 5, 'C'], [2, 3, 'P'], [0, 3, 'k'], [0, 4, 'r'], [3, 8, 'n']], RED),
        moves: [[B(6, 5), B(4, 5)], [B(3, 8), B(4, 6)], [B(4, 5), B(4, 3)]],
        text: '演示：1.炮先沉到卒林线；黑马跳开无关紧要；2.炮平肋线借兵作架——黑将上不去、平不出，闷杀！',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: mkFen([[9, 3, 'K'], [4, 5, 'C'], [2, 3, 'P'], [0, 3, 'k'], [0, 4, 'r'], [3, 8, 'n']], RED),
        moves: [[B(4, 5), B(4, 3)]],
        text: '请你走出这手闷宫：把炮平到肋线，借兵作炮架将死黑方。',
      },
      { type: 'quiz', puzzleId: 'm1-002' },
    ],
  },
  {
    id: 'mate-wocaoma', title: '卧槽马杀', level: 2,
    intro: '马跳卧槽位将军，配合车兵封宫，一锤定音。',
    steps: [
      {
        type: 'explain',
        fen: mkFen([[9, 3, 'K'], [4, 1, 'N'], [1, 4, 'P'], [0, 3, 'k'], [2, 3, 'a'], [3, 8, 'r']], RED),
        text: '卧槽马：马跳到对方宫顶两肋的“槽”位（三·二路或三·八路）将军。这局红马卧槽将军时，中兵正好封住黑将的上下出路，黑士也挡不住——马一到位即杀。',
        highlights: [[4, 1], [2, 2], [1, 4], [0, 3]],
        arrows: [[B(4, 1), B(2, 2)]],
      },
      {
        type: 'demo',
        fen: mkFen([[9, 3, 'K'], [6, 2, 'N'], [1, 4, 'P'], [0, 3, 'k'], [2, 3, 'a'], [3, 8, 'r']], RED),
        moves: [[B(6, 2), B(4, 1)], [B(3, 8), B(3, 4)], [B(4, 1), B(2, 2)]],
        text: '演示：1.马先跳到河口的出击点；黑车平中想拦；2.马卧槽！将军封宫，黑将无路可逃。',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: mkFen([[9, 3, 'K'], [4, 1, 'N'], [1, 4, 'P'], [0, 3, 'k'], [2, 3, 'a'], [3, 8, 'r']], RED),
        moves: [[B(4, 1), B(2, 2)]],
        text: '请你完成绝杀：把马跳上卧槽位。',
      },
      { type: 'quiz', puzzleId: 'm1-003' },
    ],
  },
  {
    id: 'mate-diaoyuma', title: '钓鱼马杀', level: 2,
    intro: '马占宫门侧翼的钓鱼位，锁死将路再成杀。',
    steps: [
      {
        type: 'explain',
        fen: mkFen([[9, 3, 'K'], [3, 3, 'N'], [2, 4, 'P'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a'], [2, 7, 'r']], RED),
        text: '钓鱼马：马跳到对方宫门侧翼（一·二路或一·八路）贴着宫墙将军。黑将想上，有红兵等着；想平移，两侧都是自己的士——钓鱼马与兵联手，恰似鱼儿咬钩跑不掉。',
        highlights: [[3, 3], [1, 2], [2, 4], [0, 4]],
        arrows: [[B(3, 3), B(1, 2)]],
      },
      {
        type: 'demo',
        fen: mkFen([[9, 3, 'K'], [4, 5, 'N'], [2, 4, 'P'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a'], [2, 7, 'r']], RED),
        moves: [[B(4, 5), B(3, 3)], [B(2, 7), B(0, 7)], [B(3, 3), B(1, 2)]],
        text: '演示：1.马先跳到宫前；黑车退底线防守；2.马进钓鱼位将军——黑将上不去、出不来，杀！',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: mkFen([[9, 3, 'K'], [3, 3, 'N'], [2, 4, 'P'], [0, 4, 'k'], [0, 3, 'a'], [0, 5, 'a'], [2, 7, 'r']], RED),
        moves: [[B(3, 3), B(1, 2)]],
        text: '请你跳出钓鱼马，完成这手绝杀。',
      },
      { type: 'quiz', puzzleId: 'm1-004' },
    ],
  },
  {
    id: 'mate-tiemenshuan', title: '铁门栓杀', level: 3,
    intro: '车兵锁死两肋将门，中炮镇路，黑将插翅难飞。',
    steps: [
      {
        type: 'explain',
        fen: mkFen([[9, 3, 'K'], [6, 6, 'C'], [3, 4, 'P'], [2, 3, 'R'], [1, 5, 'P'], [0, 4, 'k'], [3, 8, 'r']], RED),
        text: '铁门栓：像门栓一样把对方将门从两头锁死。本局红车锁左肋、红兵封右肋，黑将两侧平移全被掐断；只待中炮一架，中路将军即成杀局。',
        highlights: [[2, 3], [1, 5], [3, 4], [6, 6], [0, 4]],
        arrows: [[B(6, 6), B(6, 4)]],
      },
      {
        type: 'demo',
        fen: mkFen([[9, 3, 'K'], [6, 6, 'C'], [3, 4, 'P'], [5, 3, 'R'], [1, 5, 'P'], [0, 4, 'k'], [3, 8, 'r']], RED),
        moves: [[B(5, 3), B(2, 3)], [B(3, 8), B(0, 8)], [B(6, 6), B(6, 4)]],
        text: '演示：1.车先沉下来锁住左肋；黑车退底线防守；2.炮平中路——铁门栓落锁，黑将被闷死在宫中。',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: mkFen([[9, 3, 'K'], [6, 6, 'C'], [3, 4, 'P'], [2, 3, 'R'], [1, 5, 'P'], [0, 4, 'k'], [3, 8, 'r']], RED),
        moves: [[B(6, 6), B(6, 4)]],
        text: '两肋已锁，请你平炮中路，完成铁门栓杀。',
      },
      { type: 'quiz', puzzleId: 'm1-005' },
    ],
  },
  {
    id: 'mate-shuangchecuo', title: '双车错杀', level: 3,
    intro: '双车交错将军、封锁两线，是最凶悍的连杀手段。',
    steps: [
      {
        type: 'explain',
        fen: mkFen([[9, 3, 'K'], [6, 3, 'R'], [6, 5, 'R'], [2, 7, 'N'], [3, 4, 'P'], [0, 4, 'k'], [3, 7, 'n'], [4, 8, 'r']], RED),
        text: '双车错：两车一前一后，轮流占领底线与横线交错将军。本局左车已对准底线，右车随时横扫二路线；黑方士象全无，双车一错位即成杀。',
        highlights: [[6, 3], [6, 5], [0, 4]],
        arrows: [[B(6, 3), B(0, 3)]],
      },
      {
        type: 'demo',
        fen: mkFen([[9, 3, 'K'], [6, 3, 'R'], [6, 5, 'R'], [2, 7, 'N'], [3, 4, 'P'], [0, 4, 'k'], [3, 7, 'n'], [4, 8, 'r']], RED),
        moves: [[B(6, 3), B(0, 3)], [B(0, 4), B(1, 4)], [B(6, 5), B(1, 5)]],
        text: '演示：1.左车沉底将军！黑将只能上宫心；2.右车紧跟横扫——双车交错，绝杀！',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: mkFen([[9, 3, 'K'], [6, 3, 'R'], [6, 5, 'R'], [2, 7, 'N'], [3, 4, 'P'], [0, 4, 'k'], [3, 7, 'n'], [4, 8, 'r']], RED),
        moves: [[B(6, 3), B(0, 3)], [B(0, 4), B(1, 4)], [B(6, 5), B(1, 5)]],
        text: '请你执红走出双车错：先沉左车将军，黑将被迫上宫心后，再用右车横杀。',
      },
      { type: 'quiz', puzzleId: 'm1-006' },
    ],
  },
  {
    id: 'eg-danche-jichu', title: '残局基础：单车擒王', level: 2,
    intro: '车对孤将必胜：抢线、限将、帅占中路三步走。',
    steps: [
      {
        type: 'explain',
        fen: eg1.fen,
        text: '单车必胜孤将。方法口诀：车抢将门限制黑将活动，红帅抢占中路或肋线与黑将“照面”，逼黑将退到底线，最后车沉底线将军成杀。先看这个三步杀的残局。',
        highlights: [[4, 4], [9, 5]],
      },
      {
        type: 'demo',
        fen: eg1.fen,
        moves: lineEg1,
        text: '演示三步杀：红车先控制将门，黑将被迫移动；红帅同时抢占要线配合照面，最后车沉底线绝杀。',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: eg3.fen,
        moves: lineEg3,
        text: '轮到你（红方四步杀）：按“限将—照面—沉底”的节奏，一步步把黑将逼上绝路。黑方应着由软件代走。',
      },
      { type: 'quiz', puzzleId: 'eg-001' },
    ],
  },
  {
    id: 'eg-danche-jinjie', title: '残局进阶：照面与助杀', level: 3,
    intro: '帅出宫助攻是残局胜负面手筋，车帅配合“对面笑”成杀。',
    steps: [
      {
        type: 'explain',
        fen: eg5.fen,
        text: '残局进阶要点：当黑将仍在宫内活动时，红帅要主动出宫占线，制造“将帅照面”的威胁——黑将不敢与红帅同列直面，活动范围被进一步压缩，这叫“对面笑”。车再封锁另一线，杀势自成。',
        highlights: [[2, 4], [8, 5]],
      },
      {
        type: 'demo',
        fen: eg5.fen,
        moves: lineEg5,
        text: '演示四步杀：注意红帅每一步都在收窄黑将的立足点，最后与车配合完成底线绝杀。',
        expectMate: true,
      },
      {
        type: 'guided',
        fen: eg6.fen,
        moves: lineEg6,
        text: '轮到你（红方车兵三步杀）：车抢将门、兵锁宫心、帅占线照面，三步之内擒下黑将。',
      },
      { type: 'quiz', puzzleId: 'eg-005' },
    ],
  },
  {
    id: 'open-zhongpao', title: '开局原理：中炮', level: 1,
    intro: '炮二平五直指中卒，是最古典、最凶悍的开局第一着。',
    steps: [
      {
        type: 'explain',
        fen: INITIAL,
        text: '中炮（炮二平五）：把炮平到中线，直指黑方中卒。作用有三：一是威胁中卒、争夺中心；二是为中路进攻搭好炮架；三是拉开出子序幕。开局要领：先出大子（车马炮），抢占要线。',
        highlights: [[7, 1], [6, 4]],
        arrows: [[B(7, 1), B(7, 4)]],
      },
      {
        type: 'demo',
        fen: INITIAL,
        moves: [[B(7, 1), B(7, 4)], [B(0, 7), B(2, 6)], [B(9, 7), B(7, 6)], [B(0, 8), B(0, 7)], [B(9, 8), B(9, 7)]],
        text: '典型中炮对屏风马开局：1.炮二平五，马8进7；2.马二进三，车9平8；3.车一平二。红方出动右翼大子，瞄准中路。',
      },
      {
        type: 'explain',
        fen: afterFen(INITIAL, [[B(7, 1), B(7, 4)], [B(0, 7), B(2, 6)], [B(9, 7), B(7, 6)], [B(0, 8), B(0, 7)], [B(9, 8), B(9, 7)]]),
        text: '此时红炮镇住中线，双马灵活，右车抢占直道——中炮布局的“炮镇中路、双马保中、直车出击”三要素齐备。',
        highlights: [[7, 4], [7, 6], [9, 7]],
      },
      {
        type: 'guided',
        fen: INITIAL,
        moves: [[B(7, 1), B(7, 4)], [B(0, 7), B(2, 6)], [B(9, 7), B(7, 6)]],
        text: '请你执红完成开局前三步：炮二平五，马二进三。（黑方马8进7由软件代走）',
      },
      { type: 'quiz', puzzleId: 'tk-002' },
    ],
  },
  {
    id: 'open-pingfengma', title: '开局原理：屏风马应对', level: 2,
    intro: '双马正起如屏风护中，是对抗中炮最稳健的应法。',
    steps: [
      {
        type: 'explain',
        fen: INITIAL,
        text: '屏风马：当红方摆中炮时，黑方跳双正马（马8进7、马2进3），两马在中卒前如同一道屏风，既保护中卒又活通车位。这是应对中炮最经典、最稳健的布局体系。',
        highlights: [[0, 1], [0, 7], [3, 4]],
        arrows: [[B(0, 7), B(2, 6)]],
      },
      {
        type: 'demo',
        fen: INITIAL,
        moves: [[B(7, 1), B(7, 4)], [B(0, 7), B(2, 6)], [B(9, 7), B(7, 6)], [B(0, 1), B(2, 2)], [B(9, 8), B(9, 7)], [B(0, 8), B(0, 7)]],
        text: '中炮对屏风马：1.炮二平五，马8进7；2.马二进三，马2进3；3.车一平二，车9平8。黑方双马结成屏风，出直车护炮，阵形稳固。',
      },
      {
        type: 'guided',
        fen: INITIAL,
        moves: [[B(7, 1), B(7, 4)], [B(0, 7), B(2, 6)], [B(9, 7), B(7, 6)], [B(0, 1), B(2, 2)]],
        text: '红方先行：面对黑方屏风马，请你走出中炮开局的炮二平五与马二进三。（黑方双马由软件代走）',
      },
      { type: 'quiz', puzzleId: 'tk-004' },
    ],
  },
];

/* ---------- 工具（需在 courses 定义前可见，函数提升可用） ---------- */
function mkFenSafe(pieces) { return mkFen(pieces, RED); }
function afterFen(fen, moves) {
  const { board, turn } = fenToBoard(fen);
  const bd = board.slice();
  let side = turn;
  for (const [f, t] of moves) {
    assert(legalMoves(bd, side).some(m => m.from === f && m.to === t), 'afterFen 着法不合法');
    bd[t] = bd[f]; bd[f] = null;
    side = other(side);
  }
  return boardToFen(bd, side);
}

/* ---------- 全量校验 ---------- */
assert(courses.length === 10, '课程应为 10 课');
const courseIds = new Set();
for (const c of courses) {
  assert(!courseIds.has(c.id), '课程 id 重复：' + c.id);
  courseIds.add(c.id);
  assert([1, 2, 3].includes(c.level), c.id + ' level 非法');
  assert(c.steps.length >= 3 && c.steps.length <= 6, c.id + ' 步数应为 3~6');
  assert(typeof c.intro === 'string' && c.intro, c.id + ' 缺 intro');
  for (const s of c.steps) {
    if (s.type === 'explain') {
      const { board } = fenToBoard(s.fen);
      assert(board.length === 90, c.id + ' explain 局面解析失败');
      if (s.highlights) {
        for (const [r, cc] of s.highlights) assert(r >= 0 && r < 10 && cc >= 0 && cc < 9, c.id + ' highlights 越界');
      }
      if (s.arrows) {
        for (const [f, t] of s.arrows) assert(f >= 0 && f < 90 && t >= 0 && t < 90, c.id + ' arrows 越界');
      }
    } else if (s.type === 'demo' || s.type === 'guided') {
      const { board, turn } = fenToBoard(s.fen);
      const bd = board.slice();
      let side = turn;
      assert(s.moves.length >= 1, c.id + ' 演示序列为空');
      for (let i = 0; i < s.moves.length; i++) {
        const [f, t] = s.moves[i];
        assert(legalMoves(bd, side).some(m => m.from === f && m.to === t),
          c.id + ' ' + s.type + ' 第 ' + (i + 1) + ' 着不合法（' + f + '→' + t + '）');
        bd[t] = bd[f]; bd[f] = null;
        side = other(side);
      }
      if (s.expectMate) {
        assert(isMate(bd, other(side)), c.id + ' ' + s.type + ' 终局未将死');
      }
    } else if (s.type === 'quiz') {
      assert(puzzles.some(p => p.id === s.puzzleId), c.id + ' quiz 引用不存在的题目：' + s.puzzleId);
    } else {
      assert(false, c.id + ' 未知步骤类型：' + s.type);
    }
  }
}

/* ---------- 输出（剥离生成期的 expectMate 标记） ---------- */
const out = courses.map(c => ({
  id: c.id, title: c.title, level: c.level, intro: c.intro,
  steps: c.steps.map(s => {
    const o = { type: s.type };
    if (s.type === 'explain') {
      o.fen = s.fen; o.text = s.text;
      if (s.highlights) o.highlights = s.highlights;
      if (s.arrows) o.arrows = s.arrows;
    } else if (s.type === 'demo' || s.type === 'guided') {
      o.fen = s.fen; o.moves = s.moves; o.text = s.text;
    } else {
      o.puzzleId = s.puzzleId;
    }
    return o;
  }),
}));
const outDir = join(ROOT, 'data', 'courses');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'courses.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('已生成', outPath);
for (const c of out) {
  console.log(`  ${c.id} Lv${c.level} ${c.title}（${c.steps.length} 步）`);
}
