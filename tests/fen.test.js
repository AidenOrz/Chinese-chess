// FEN 编解码测试
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.error('  FAIL:', msg); } else console.log('  ok -', msg); };

const { idx, initialBoard, RED, BLACK } = await import('../js/engine/index.js');
const { boardToFen, fenToBoard, INITIAL_FEN } = await import('../js/engine/fen.js');

{
  ok(INITIAL_FEN === 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w',
    '初始局面 FEN 正确');
  const { board, turn } = fenToBoard(INITIAL_FEN);
  ok(turn === RED && board.every((p, i) => p === initialBoard()[i]), '初始 FEN 解析与 initialBoard 一致');
  ok(boardToFen(board, turn) === INITIAL_FEN, '初始局面往返一致');
}
{
  // 自定义局面：红车巡河、黑卒过河
  const bd = new Array(90).fill(null);
  bd[idx(9, 4)] = 'K'; bd[idx(0, 4)] = 'k';
  bd[idx(4, 4)] = 'R'; bd[idx(4, 0)] = 'p';
  const fen = boardToFen(bd, BLACK);
  const back = fenToBoard(fen);
  ok(back.turn === BLACK && back.board.every((p, i) => p === bd[i]), '自定义局面往返一致（' + fen + '）');
}
{
  // 走几步后的真实局面
  const bd = initialBoard();
  bd[idx(7, 4)] = 'C'; bd[idx(7, 1)] = null;        // 炮八平五
  bd[idx(6, 2)] = null; bd[idx(5, 2)] = 'P';         // 兵三进一
  const fen = boardToFen(bd, BLACK);
  const back = fenToBoard(fen);
  ok(back.board.every((p, i) => p === bd[i]) && back.turn === BLACK, '中局局面往返一致');
}
{
  const bad = s => { try { fenToBoard(s); return false; } catch (e) { return true; } };
  ok(bad('9/9/9/9/9/9/9/9/9/9 w'), '缺帅将被拒绝');
  ok(bad('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNRR w'), '红车超限被拒绝');
  ok(bad('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR x'), '非法走子方被拒绝');
  ok(bad('rnbaXabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w'), '非法棋子字符被拒绝');
  ok(bad('rnbakabnr/10/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w'), '行长超 9 被拒绝');
  // 两帅照面
  const bd = new Array(90).fill(null);
  bd[idx(0, 4)] = 'k'; bd[idx(9, 4)] = 'K';
  ok(bad(boardToFen(bd, RED)), '两帅照面被拒绝');
}

if (fails) throw new Error(fails + ' 项失败');
console.log('=== FEN 测试通过 ===');
