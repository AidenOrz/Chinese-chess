// 构建 dist/index.html 单文件（npx esbuild 打包 JS，再内联 JS/CSS 到 HTML）
// 运行时零依赖：esbuild 仅在构建期经 npx 使用，不入 node_modules
import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
await mkdir(join(root, 'dist'), { recursive: true });
execSync('npx -y esbuild js/main.js --bundle --format=iife --outfile=dist/bundle.js', { cwd: root, stdio: 'inherit' });

const js = await readFile(join(root, 'dist/bundle.js'), 'utf8');
const css = await readFile(join(root, 'css/main.css'), 'utf8');
let html = await readFile(join(root, 'index.html'), 'utf8');
// 用函数替换，避免代码中的 $& 等序列被 replace 解释
html = html.replace('<link rel="stylesheet" href="css/main.css">', () => '<style>\n' + css + '\n</style>');
html = html.replace('<script type="module" src="js/main.js"></script>', () => '<script>\n' + js + '\n</script>');
await writeFile(join(root, 'dist/index.html'), html);
console.log('已生成 dist/index.html（双击即玩）');
