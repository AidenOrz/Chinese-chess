// 学习模式入口回归：课程/习题进入与解题全链路不抛错
// （曾因 study.js 漏导入 analysis，点击课程/习题全部静默失败，测试放行——此文件即锁住该类 bug）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installDomStub } from './helpers/dom-stub.mjs';
installDomStub();

const here = dirname(fileURLToPath(import.meta.url));
const courses = JSON.parse(readFileSync(join(here, '..', 'data', 'courses', 'courses.json'), 'utf8'));
const puzzles = JSON.parse(readFileSync(join(here, '..', 'data', 'puzzles', 'puzzles.json'), 'utf8'));
globalThis.window.__XQ_DATA__ = { courses, puzzles };   // 走 dist 同款数据注入路径

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok - ' + m); else { fails++; console.log('  FAIL - ' + m); } };

console.log('=== 学习模式入口测试 ===');
const { enterStudyCourse, enterStudyPuzzle, exitStudy, tryStudyMove } = await import('../js/ui/study.js');
const { runtime, game } = await import('../js/state.js');

// ---- 课程进入（曾在此抛 ReferenceError: analysis is not defined）----
{
  await enterStudyCourse('mate-chongpao');
  ok(runtime.study && runtime.study.kind === 'course', '课程进入 startStudy 成功');
  ok(runtime.study.phase === 'explain', '首步为讲解');
  ok(runtime.study.course.steps.length === 4, '课程步骤数正确');
  await exitStudy();
  ok(!runtime.study, '退出学习清理上下文');
}

// ---- 习题进入 + 一步杀解题 ----
{
  await enterStudyPuzzle('m1-001');
  ok(runtime.study && runtime.study.kind === 'puzzle' && runtime.study.phase === 'quiz', '习题进入 quiz 阶段');
  ok(game.board[51] === 'C', '习题局面按 FEN 载入（51 位红炮）');
  tryStudyMove(51, 49);   // 正解：炮三平五，重炮杀
  ok(runtime.study.phase === 'quiz-done', '一步杀解答成功进入 quiz-done');
  await exitStudy();
}

// ---- 错误着法不崩并保持 quiz 阶段 ----
{
  await enterStudyPuzzle('m1-001');
  tryStudyMove(51, 47);   // 非正解
  ok(runtime.study.phase === 'quiz' && runtime.study.wrong === 1, '错误着法计错且流程不中断');
  await exitStudy();
}

if (fails) throw new Error('学习模式入口测试：' + fails + ' 项失败');
console.log('=== 学习模式入口测试通过 ===');
