// @ts-check
/* =====================================================================
 * 教学/推演共用分析（推荐走法、理由、风险、威胁、开局库、诊断）
 * 全部为纯函数：局面相关上下文一律由参数传入，不读全局状态
 * ===================================================================== */
import { ROWS, COLS, idx, rowOf, colOf, sideOf, typeOf, other, inBoard,
         crossed, backRowOf, fullName, sideName, PIECE_NAME, PIECE_CHAR, RED, BLACK,
         KNIGHT_D,
         pseudoMoves, pseudoAll, legalMoves, isInCheck, kingsFacing, attackedSquares, isDefended,
         findKing, VAL, detectPhase, findBestMove, moveName,
         evalSide, materialLead } from '../engine/index.js';

/* ---------------- 局面判断与评分展示 ----------------
 * 关键区别：搜索返回的 v 是「绝对评估」（走子方视角的局面分），
 * 落后时它必然全为负——把它当成「这步棋好不好」展示，会让用户看到
 * "下什么都扣分"（对最强 AI 落后 10 分以上时，32 个合法着法无一为正）。
 * 真正该给用户看的是「与最佳着的差距」：恒 ≥ 0，0 就是最佳着。
 */
/** 与最佳着的差距 → 展示文本（不再出现负号） */
export function formatGap(gap) {
  const g = Math.max(0, Number(gap) || 0);
  // 一兵=100 分。不足半兵视为并列最佳：搜索深度有限，这种差距在噪声内。
  if (g < 50) return '最佳';
  const p = g / 100;
  // 10 兵以内保留一位小数：2.5 兵若四舍五入成 3 兵，则 1.5 与 2.4 会显示成同一个数
  const txt = p < 10 ? String(Math.round(p * 10) / 10) : String(Math.round(p));
  return '差 ' + txt + ' 兵';
}
// 子力名称随走子方变化：红用 兵/相/士，黑用 卒/象/士
const PIECE_CN = {
  r: { R: '车', N: '马', C: '炮', P: '兵', A: '仕', B: '相' },
  b: { R: '车', N: '马', C: '炮', P: '卒', A: '士', B: '象' }
};
/** 双方子力差异（side 视角），如「少 1 车、1 马」/「多 2 卒」/「双方子力相当」 */
export function materialDetail(bd, side) {
  const myNames = PIECE_CN[side] || PIECE_CN.r;
  const oppNames = PIECE_CN[other(side)] || PIECE_CN.r;
  const count = (who) => {
    const bag = {};
    for (let i = 0; i < ROWS * COLS; i++) {
      const p = bd[i];
      if (!p || sideOf(p) !== who) continue;
      const t = typeOf(p);
      if (t === 'K') continue;
      bag[t] = (bag[t] || 0) + 1;
    }
    return bag;
  };
  const mine = count(side), theirs = count(other(side));
  // 只在双方“同类棋子数目”上比多少。称呼一律用「本方」的叫法：
  // “少 1 卒”读起来是黑方少了卒，但主语明明是红方——必须说“少 1 兵”。
  const more = [], less = [];
  for (const t of ['R', 'N', 'C', 'P', 'A', 'B']) {
    const d = (mine[t] || 0) - (theirs[t] || 0);
    if (d > 0) more.push(d + ' ' + myNames[t]);
    else if (d < 0) less.push(-d + ' ' + myNames[t]);
  }
  if (!more.length && !less.length) return '双方子力相当';
  const parts = [];
  if (more.length) parts.push('多 ' + more.join('、'));
  if (less.length) parts.push('少 ' + less.join('、'));
  return parts.join('，');
}
/**
 * 局面判断：把绝对评估翻译成人话，并给出子力差异。
 * score 为走子方视角的绝对评估（缺省时现算）。
 */
export function positionVerdict(bd, side, score) {
  const s = (score === undefined || score === null || isNaN(score)) ? evalSide(bd, side) : score;
  const abs = Math.abs(s);
  let label, cls;
  if (abs < 60) { label = '局面大致均衡'; cls = 'eval-ok'; }
  else if (abs < 200) { label = s > 0 ? '你方稍优' : '你方稍劣'; cls = s > 0 ? 'eval-good' : 'eval-ok'; }
  else if (abs < 500) { label = s > 0 ? '你方明显占优' : '你方明显劣势'; cls = s > 0 ? 'eval-good' : 'eval-bad'; }
  else if (abs < 1200) { label = s > 0 ? '你方优势很大' : '你方劣势很大'; cls = s > 0 ? 'eval-good' : 'eval-bad'; }
  else { label = s > 0 ? '你方已近胜势' : '你方已近败势'; cls = s > 0 ? 'eval-good' : 'eval-bad'; }
  return { label, cls, score: s, lead: materialLead(bd, side), detail: materialDetail(bd, side) };
}

// 判断某走法被对方吃掉是否吃亏：mover 落点被攻击 且（无保护 或 攻击者更便宜）
export function isHanging(bdAfter, to, moverPiece, mySide) {
  const opp = other(mySide);
  let minAtk = Infinity;
  for (const m of pseudoAll(bdAfter, opp)) if (m.to === to) minAtk = Math.min(minAtk, VAL[typeOf(bdAfter[m.from])]);
  if (minAtk === Infinity) return null;
  const defended = isDefended(bdAfter, to, mySide);
  const myVal = VAL[typeOf(moverPiece)];
  if (!defended) return minAtk;
  if (minAtk + 150 < myVal) return minAtk;
  return null;
}
// 走法理由分类：返回 {idea, reason, risk}
export function classifyReasons(boardBefore, side, m, plyCount) {
  const bd = boardBefore.slice();
  const p = bd[m.from], t = typeOf(p);
  const victim = bd[m.to];
  const opp = other(side);
  const wasInCheck = isInCheck(bd, side);
  const beforeEnemyAtk = attackedSquares(bd, opp);
  // 走前我方受攻击且无保护的己方子（用于“保护”判断；保护判定须临时清格，见 isDefended）
  const threatenedBefore = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const q = bd[i];
    if (!q || sideOf(q) !== side || typeOf(q) === 'K' || VAL[typeOf(q)] < 300 ||
        !beforeEnemyAtk.has(i) || i === m.from) continue;
    if (!isDefended(bd, i, side)) threatenedBefore.push(i);
  }
  const cap = bd[m.to];
  bd[m.to] = bd[m.from]; bd[m.from] = null;
  const givesCheck = isInCheck(bd, opp);
  // 走后对方是否可立即将军
  let oppCanCheck = false;
  for (const om of pseudoAll(bd, opp)) {
    const c2 = bd[om.to];
    bd[om.to] = bd[om.from]; bd[om.from] = null;
    const chk = isInCheck(bd, side);
    bd[om.from] = bd[om.to]; bd[om.to] = c2;
    if (chk) { oppCanCheck = true; break; }
  }
  // 走后该子攻击的敌方目标（捉子/捉双）
  const atkTargets = [];
  for (const to of pseudoMoves(bd, m.to)) {
    const q = bd[to];
    if (q && sideOf(q) === opp && typeOf(q) !== 'K' && VAL[typeOf(q)] >= 200) atkTargets.push(q);
  }
  // 走后是否被吃（挂）
  const hangAtk = isHanging(bd, m.to, p, side);
  // 牵制：车/炮前方敌子背后是敌将
  let pin = false;
  if (t === 'R' || t === 'C') {
    const kr = findKing(bd, opp);
    if (kr >= 0) {
      const tr = rowOf(m.to), tc = colOf(m.to), krr = rowOf(kr), kcc = colOf(kr);
      if (tr === krr || tc === kcc) {
        const dr = Math.sign(krr - tr), dc = Math.sign(kcc - tc);
        let r = tr + dr, c = tc + dc, shield = false;
        while (inBoard(r, c)) {
          const q = bd[idx(r, c)];
          if (q) {
            if (!shield) {
              if (sideOf(q) === opp && typeOf(q) !== 'K') shield = true;   // 线上第一个敌子
              else break;
            } else {
              if (r === krr && c === kcc) pin = true;   // 其后恰好是敌将帅才算真牵制
              break;
            }
          }
          r += dr; c += dc;
        }
      }
    }
  }
  const afterEnemyAtk = attackedSquares(bd, opp);   // 走后局面下对方的攻击范围（须在还原前计算）
  bd[m.from] = bd[m.to]; bd[m.to] = cap;
  // 保护：走前受攻且无保护的己方子，走后不再被攻
  const protectedNames = [];
  for (const i of threatenedBefore) {
    if (!afterEnemyAtk.has(i)) protectedNames.push(fullName(bd[i]));
  }
  // —— 组装文本 ——
  const bits = [];
  let idea = '调整';
  if (wasInCheck) { idea = '解将'; bits.push('当前被将军，此着可以解除威胁'); }
  if (victim) {
    const gain = VAL[typeOf(victim)] - VAL[t];
    if (afterEnemyAtk.has(m.to) && Math.abs(gain) <= 150) { if (idea === '调整') idea = '兑子'; bits.push('吃掉对方' + fullName(victim) + '，落点受攻，近似兑子'); }
    else { if (idea === '调整') idea = '吃子'; bits.push('可以吃掉对方' + fullName(victim) + (gain > 0 ? '（净得子）' : '')); }
  }
  if (givesCheck) { if (idea === '调整') idea = '将军'; bits.push('走后直接将军，迫使对方应对'); }
  if (atkTargets.length >= 2) { if (idea === '调整') idea = '捉双'; bits.push('走后同时捉对方' + atkTargets.map(fullName).join('、') + '，形成捉双'); }
  else if (atkTargets.length === 1) { if (idea === '调整') idea = '捉子'; bits.push('走后捉对方' + fullName(atkTargets[0])); }
  if (pin) { if (idea === '调整') idea = '牵制'; bits.push('车/炮瞄准对方将帅一线，形成牵制'); }
  if (protectedNames.length) { if (idea === '调整') idea = '保护'; bits.push('保护我方' + protectedNames.join('、')); }
  if (plyCount < 14 && (t === 'N' || t === 'R' || t === 'C') &&
      ((side === RED && rowOf(m.from) >= 8) || (side === BLACK && rowOf(m.from) <= 1))) {
    if (idea === '调整') idea = '出子'; bits.push('开局出动大子，加快布阵');
  }
  if (crossed(side, rowOf(m.to)) !== crossed(side, rowOf(m.from)) && (t === 'P' || t === 'N' || t === 'R' || t === 'C')) {
    bits.push(side === RED ? '过河参战，增强攻势' : '深入红方阵地');
  }
  if (colOf(m.to) >= 3 && colOf(m.to) <= 5 && rowOf(m.to) >= 2 && rowOf(m.to) <= 7) {
    bits.push('控制中路/要道');
  }
  if (!bits.length) bits.push(t === 'P' ? '活通兵线，稳步推进' : '调整阵型，改善子力位置');
  // 风险
  const risks = [];
  if (hangAtk !== null) {
    let attackerName = '';
    for (const om of pseudoAll(bd, opp)) if (om.to === m.to) { attackerName = fullName(bd[om.from]); break; }
    risks.push('落点可能被对方' + attackerName + '吃掉' + (hangAtk >= 300 ? '（损失较大，需谨慎）' : ''));
  }
  if (oppCanCheck) risks.push('对方可能立即将军反攻');
  return {
    idea,
    reason: bits.join('；'),
    risk: risks.length ? risks.join('；') : '暂无明显风险'
  };
}
// 对方威胁提示列表
export function opponentThreats(board, mySide) {
  const bd = board.slice();
  const opp = other(mySide);
  const res = [];
  // ① 对方是否存在立即将军
  for (const m of legalMoves(bd, opp)) {
    const nm = moveName(bd, m);
    const cap = bd[m.to];
    bd[m.to] = bd[m.from]; bd[m.from] = null;
    const chk = isInCheck(bd, mySide);
    bd[m.from] = bd[m.to]; bd[m.to] = cap;
    if (chk) { res.push('对方走「' + nm + '」可以将军'); break; }
  }
  // ② 我方受攻棋子
  const atkOpp = attackedSquares(bd, opp);
  const items = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const q = bd[i];
    if (!q || sideOf(q) !== mySide || typeOf(q) === 'K') continue;
    if (!atkOpp.has(i)) continue;
    if (VAL[typeOf(q)] < 100) continue;
    const attackers = [];
    for (const m of pseudoAll(bd, opp)) if (m.to === i) attackers.push(bd[m.from]);
    if (!attackers.length) continue;
    const minAtk = Math.min(...attackers.map(x => VAL[typeOf(x)]));
    const defended = isDefended(bd, i, mySide);   // 保护判定：临时清格，见 isDefended 注释
    if (!defended) items.push({ i, txt: '对方' + fullName(attackers[0]) + '正在攻击我方' + fullName(q) + '（该子无保护）', sev: 2 });
    else if (minAtk + 150 < VAL[typeOf(q)]) items.push({ i, txt: '对方' + fullName(attackers[0]) + '正在攻击我方' + fullName(q) + '（交换吃亏）', sev: 1 });
  }
  items.sort((a, b) => b.sev - a.sev);
  for (const it of items) { res.push(it.txt); if (res.length >= 3) break; }
  return res;
}
// 开局库：开局前几步给出命名开局与思路（推荐着法仍必须通过合法性校验）
// firstMoveName：先手第一着的记谱文本（用于后手应对库判断对方开局）
export function openingSuggestions(bd, side, plyCount, firstMoveName) {
  const res = [];
  const add = (from, to, label, tip) => {
    if (!bd[from] || !pseudoMoves(bd, from).includes(to)) return;
    const cap = bd[to]; bd[to] = bd[from]; bd[from] = null;
    const ok = !isInCheck(bd, side);                 // 理论着法同样不许送将
    bd[from] = bd[to]; bd[to] = cap;
    if (ok) res.push({ from, to, label, tip });
  };
  const br = backRowOf(side), fwd = side === RED ? -1 : 1;
  const row2 = br + fwd * 2;                         // 相/马落点行
  if (plyCount === 0) {                              // 先手开局库
    const tipCannon = '架中炮直攻中路，攻击性最强；后续配合马二进三、车一平二快速出子。';
    const cr = br + fwd * 2;                         // 炮的起始行（红 7 / 黑 2）
    add(idx(cr, 1), idx(cr, 4), '中炮', tipCannon);
    add(idx(cr, 7), idx(cr, 4), '中炮', tipCannon);
    add(idx(br, 2), idx(row2, 4), '飞相局', '相三进五稳健固防，先安内后攘外，以静制动。');
    add(idx(br, 6), idx(row2, 4), '飞相局', '相三进五稳健固防，先安内后攘外，以静制动。');
    add(idx(br + fwd * 3, 2), idx(br + fwd * 4, 2), '仙人指路', '挺七路兵试探对方意图，局型灵活多变。');
    add(idx(br + fwd * 3, 6), idx(br + fwd * 4, 6), '仙人指路', '挺三路兵试探对方意图，局型灵活多变。');
    add(idx(br, 7), idx(row2, 6), '跳马', '马二进三活通马路，为出车留出通路，稳步出子。');
    add(idx(br, 1), idx(row2, 2), '跳马', '马八进七活通马路，为出车留出通路，稳步出子。');
  } else if (plyCount === 1 && side === BLACK) {       // 应对方库：针对红方首着
    const nm = firstMoveName || '';
    if (/炮[二八]平五/.test(nm)) {                    // 对方架中炮
      add(idx(0, 7), idx(2, 6), '屏风马', '对方架中炮，马8进7与另一马成屏风马，是对抗中炮最主流的稳固应法。');
      add(idx(0, 1), idx(2, 2), '屏风马', '对方架中炮，跳马护中卒并屏风防守，稳扎稳打。');
      add(idx(2, 7), idx(2, 4), '顺炮', '同侧架中炮（顺炮）针锋相对，转入对攻局面。');
      add(idx(3, 2), idx(4, 2), '挺卒', '挺3卒活马路，先固防再伺机反击。');
    }
  }
  return res;
}
// 局面诊断：与具体着法无关的长期战略要点（plies：已行棋半回合数）
export function positionDiagnostics(bd, side, plies) {
  const out = [];
  const seen = new Set();
  const push = s => { if (!seen.has(s)) { seen.add(s); out.push(s); } };
  const opp = other(side);
  const kr = findKing(bd, side);
  let adv = 0, ele = 0, homeCharlots = 0;
  for (let i = 0; i < ROWS * COLS; i++) {
    const p = bd[i];
    if (!p) continue;
    const t = typeOf(p);
    if (sideOf(p) === side) {
      if (t === 'A') adv++;
      else if (t === 'B') ele++;
      else if (t === 'N') {
        if (i === (side === RED ? idx(8, 4) : idx(1, 4))) push('窝心马自困九宫，将帅活动受限，宜尽早跳出');
        else if (colOf(i) === 0 || colOf(i) === 8) push('边马出路狭窄，注意预留接应通道');
      } else if (t === 'R' && rowOf(i) === backRowOf(side)) homeCharlots++;
    }
  }
  if (homeCharlots >= 2 && plies >= 8 && detectPhase(bd) !== 'end') {
    push('两车仍在原地，出子偏慢：车是主力，宜尽早开出占要道');
  }
  if (kr >= 0) {
    const kCol = colOf(kr);
    for (let i = 0; i < ROWS * COLS; i++) {          // 对方空头炮
      const p = bd[i];
      if (!p || sideOf(p) !== opp || typeOf(p) !== 'C' || colOf(i) !== kCol) continue;
      const dir = Math.sign(rowOf(kr) - rowOf(i));
      let blocked = false;
      for (let r = rowOf(i) + dir; r !== rowOf(kr); r += dir) if (bd[idx(r, kCol)]) { blocked = true; break; }
      if (!blocked) { push('对方炮与帅(将)同线且中间无子（空头炮），中路上子当心充作炮架'); break; }
    }
    for (let i = 0; i < ROWS * COLS; i++) {          // 对方沉底炮
      const p = bd[i];
      if (p && sideOf(p) === opp && typeOf(p) === 'C' && rowOf(i) === backRowOf(side)) {
        push('对方炮已沉底，注意底线与士象防护'); break;
      }
    }
    for (let i = 0; i < ROWS * COLS; i++) {          // 敌马逼近九宫（卧槽/钓鱼马警戒）
      const p = bd[i];
      if (p && sideOf(p) === opp && typeOf(p) === 'N' &&
          (side === RED ? rowOf(i) >= 6 && rowOf(i) <= 8 : rowOf(i) >= 1 && rowOf(i) <= 3) &&
          colOf(i) >= 1 && colOf(i) <= 7) {
        push('对方马已逼近九宫，警惕卧槽马、钓鱼马杀势'); break;
      }
    }
  }
  if (adv <= 1) push('缺士怕车：士薄，防对方车强攻九宫');
  if (ele <= 1) push('缺象怕炮：象薄，中路与底线易受攻');
  return out.slice(0, 3);
}
// 推荐走法的“预计对方应手”（带吃子延伸的 2 层搜索，保证叶结点安静、应手真实可信）
export function bestReplyName(bdBefore, m, mySide) {
  const bd = bdBefore.slice();
  bd[m.to] = bd[m.from]; bd[m.from] = null;
  const opp = other(mySide);
  const { list } = findBestMove(bd, opp, { depth: 2, useQ: true, timeMs: 1000, exact: false });
  return list.length ? moveName(bd, list[0].m) : null;
}
// 生成 1~3 个推荐走法（复用合法走法生成 + 搜索打分；叶结点带吃子延伸，评分更真实）
export function buildRecommendations(board, side, maxN, depth, plyCount) {
  const { list } = findBestMove(board, side, { depth: depth || 2, useQ: true, timeMs: 1500, exact: true });
  if (!list.length) return { recs: [], best: null, map: {}, gaps: {} };
  // gap = 最佳着分 - 该着分，恒 ≥ 0。v 是绝对评估，落后时全为负，不能直接当“好坏”显示。
  const bestV = list[0].v;
  const recs = list.slice(0, maxN || 3).map(({ m, v }) => ({
    m, v, gap: Math.max(0, bestV - v),
    gapText: formatGap(Math.max(0, bestV - v)),
    reply: bestReplyName(board, m, side), ...classifyReasons(board, side, m, plyCount)
  }));
  const map = {}, gaps = {};
  for (const { m, v } of list) {
    const k = m.from + '-' + m.to;
    map[k] = v;
    gaps[k] = Math.max(0, bestV - v);
  }
  return { recs, best: list[0], map, gaps };
}
// AI 走法意图说明（plies：AI 走此着前已行棋半回合数）
export function describeAiMove(boardBefore, m, aiSide, plies) {
  const bd = boardBefore.slice();
  const mySide = other(aiSide);
  const p = bd[m.from], victim = bd[m.to];
  const beforeMyAtk = attackedSquares(bd, mySide);
  // 走前 AI 受攻且无保护的大子（走后若不再受攻 → “保护”）
  const aiThreatened = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const q = bd[i];
    if (!q || sideOf(q) !== aiSide || typeOf(q) === 'K' || VAL[typeOf(q)] < 300 ||
        !beforeMyAtk.has(i) || i === m.from) continue;
    if (!isDefended(bd, i, aiSide)) aiThreatened.push({ i, q });
  }
  const cap = bd[m.to];
  bd[m.to] = bd[m.from]; bd[m.from] = null;
  const givesCheck = isInCheck(bd, mySide);
  const aims = [];
  for (const to of pseudoMoves(bd, m.to)) {
    const q = bd[to];
    if (q && sideOf(q) === mySide && VAL[typeOf(q)] >= 300) aims.push(q);
  }
  const afterMyAtk = attackedSquares(bd, mySide);   // 走后局面下我方的攻击范围（须在还原前计算）
  bd[m.from] = bd[m.to]; bd[m.to] = cap;
  const protectedNames = aiThreatened.filter(x => !afterMyAtk.has(x.i)).map(x => fullName(x.q));
  const ch = PIECE_CHAR[aiSide][typeOf(p)];
  const parts = [];
  if (victim) parts.push('吃掉我方' + fullName(victim));
  if (givesCheck) parts.push('将军，威胁我方' + PIECE_NAME.K);
  if (!victim && !givesCheck) {
    if (aims.length) parts.push(ch + '正瞄准我方' + aims.map(fullName).join('、'));
    else if (protectedNames.length) parts.push('正在保护' + protectedNames.join('、'));
    else {
      const t = typeOf(p);
      if (t === 'C' && colOf(m.to) === 4 && rowOf(m.from) === backRowOf(aiSide) && plies <= 2) parts.push('架中炮，直指中路');
      else if (t === 'R' && rowOf(m.from) === backRowOf(aiSide)) parts.push('出车，机动主力');
      else if (t === 'P') parts.push('挺卒，静观其变');
      else if (t === 'A' || t === 'B') parts.push('补士象，巩固防线');
      else if (t === 'K') parts.push('调整帅位');
      else if ((aiSide === RED && rowOf(m.from) >= 8) || (aiSide === BLACK && rowOf(m.from) <= 1)) parts.push('出' + ch + '，展开阵型');
      else if (colOf(m.to) >= 3 && colOf(m.to) <= 5) parts.push(ch + '控制中路要道');
      else parts.push('调整部署，巩固阵型');
    }
  }
  const lead = (victim || givesCheck || aims.length || protectedNames.length) ? 'AI ' + ch + '：' : 'AI：';
  return lead + (parts.join('，') || '等待时机') + '（' + moveName(boardBefore, m) + '）';
}

/* =====================================================================
 * 非法走法解释（用户体验）
 * ===================================================================== */
export function explainIllegal(bd, from, to, moverSide) {
  const p = bd[from];
  if (!p) return '这里没有棋子';
  if (sideOf(p) !== moverSide) return '不能移动' + sideName(sideOf(p)) + '的棋子';
  const t = typeOf(p);
  if (bd[to] && sideOf(bd[to]) === moverSide) return '不能吃自己的棋子';
  const fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to);
  const pm = pseudoMoves(bd, from);
  if (pm.includes(to)) {
    // 伪合法但不合法：送将或照面
    const cap = bd[to];
    bd[to] = bd[from]; bd[from] = null;
    const bad = isInCheck(bd, moverSide);
    const facing = kingsFacing(bd);
    bd[from] = bd[to]; bd[to] = cap;
    if (facing) return '将帅不能照面';
    if (bad) return '此走法会让己方被将军（不能送将）';
  }
  switch (t) {
    case 'N': {
      for (const [dr, dc] of KNIGHT_D) {
        if (fr + dr === tr && fc + dc === tc) {
          const legR = Math.abs(dr) === 2 ? fr + dr / 2 : fr;
          const legC = Math.abs(dc) === 2 ? fc + dc / 2 : fc;
          return bd[idx(legR, legC)] ? '马腿被蹩，不能这样走' : '马走日字';
        }
      }
      return '马只能走日字';
    }
    case 'B': {
      if (Math.abs(tr - fr) === 2 && Math.abs(tc - fc) === 2) {
        if (crossed(moverSide, tr)) return moverSide === RED ? '相不能过河' : '象不能过河';
        return bd[idx((fr + tr) / 2, (fc + tc) / 2)] ? '象眼被塞，不能这样走' : '相/象走田字';
      }
      return '相/象只能走田字';
    }
    case 'A': return '仕/士只能在九宫内斜走一格';
    case 'K': return '帅/将只能在九宫内横竖走一格';
    case 'P': {
      const fwd = moverSide === RED ? -1 : 1;
      if (tc === fc && tr === fr + fwd) return '前方被阻挡';
      if (tr !== fr + fwd && crossed(moverSide, fr)) return '兵/卒不能后退';
      if (tc !== fc && !crossed(moverSide, fr)) return '兵/卒过河前不能横走';
      return '兵/卒每次只能前进一格';
    }
    case 'R': {
      if (tr !== fr && tc !== fc) return '车只能走直线';
      const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
      let r = fr + dr, c = fc + dc, blocks = 0;
      while (r !== tr || c !== tc) { if (bd[idx(r, c)]) blocks++; r += dr; c += dc; }
      return blocks ? '路线被其他棋子阻挡' : '车走直线';
    }
    case 'C': {
      if (tr !== fr && tc !== fc) return '炮只能走直线';
      const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
      let r = fr + dr, c = fc + dc, blocks = 0;
      while (r !== tr || c !== tc) { if (bd[idx(r, c)]) blocks++; r += dr; c += dc; }
      if (bd[to]) return blocks === 1 ? '炮翻山吃子' : (blocks === 0 ? '炮吃子必须隔一个炮架' : '炮架只能有一个');
      return blocks ? '炮移动时不能越子' : '炮平移';
    }
  }
  return '非法走法';
}
