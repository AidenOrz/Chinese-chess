// 构建 dist/index.html 单文件（npx esbuild 打包 JS，再内联 JS/CSS 到 HTML）
// 运行时零依赖：esbuild 仅在构建期经 npx 使用，不入 node_modules
import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
await mkdir(join(root, 'dist'), { recursive: true });
execSync('npx -y esbuild js/main.js --bundle --format=iife --outfile=dist/bundle.js', { cwd: root, stdio: 'inherit' });
// 引擎 Worker 也打包为 IIFE，源码内联注入（Blob Worker，file:// 下可用）
execSync('npx -y esbuild js/engine/worker.js --bundle --format=iife --outfile=dist/worker.js', { cwd: root, stdio: 'inherit' });

const js = await readFile(join(root, 'dist/bundle.js'), 'utf8');
const wjs = await readFile(join(root, 'dist/worker.js'), 'utf8');
const css = await readFile(join(root, 'css/main.css'), 'utf8');
// 课程/题库数据存在则内联（dist 单文件无需 fetch）
let dataScript = '';
try {
  const courses = JSON.parse(await readFile(join(root, 'data/courses/courses.json'), 'utf8'));
  const puzzles = JSON.parse(await readFile(join(root, 'data/puzzles/puzzles.json'), 'utf8'));
  dataScript = '<script>window.__XQ_DATA__ = ' + JSON.stringify({ courses, puzzles }) + ';</script>\n';
} catch (e) { /* 数据未生成时跳过 */ }
let html = await readFile(join(root, 'index.html'), 'utf8');
// 用函数替换，避免代码中的 $& 等序列被 replace 解释
html = html.replace('<link rel="stylesheet" href="css/main.css">', () => '<style>\n' + css + '\n</style>');
html = html.replace('<script type="module" src="js/main.js"></script>', () =>
  dataScript + '<script>window.__XQ_WORKER_SRC = ' + JSON.stringify(wjs) + ';</script>\n<script>\n' + js + '\n</script>');
await writeFile(join(root, 'dist/index.html'), html);
console.log('已生成 dist/index.html（双击即玩，含内联 Worker）');
