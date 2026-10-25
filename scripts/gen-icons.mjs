// 生成 PWA 图标（纯 Node：手写 PNG 编码，无依赖）。运行：node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// 图案：木色底 + 奶油棋子圆盘 + 棕色环 + 红色中心圆（抽象“帅”）
function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const R = size * 0.36, ring = size * 0.035, rc = size * 0.13;
  const put = (i, r, g, b) => { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < rc) put(i, 181, 52, 42);                    // 红心
      else if (d < R - ring) put(i, 241, 224, 187);       // 棋子盘面
      else if (d < R) put(i, 156, 107, 47);               // 棋子边环
      else put(i, 233, 201, 140);                          // 木色底
    }
  }
  return px;
}
function makePng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;   // 8bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const px = render(size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // filter: None
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, 'icons'), { recursive: true });
await writeFile(join(root, 'icons', 'icon-192.png'), makePng(192));
await writeFile(join(root, 'icons', 'icon-512.png'), makePng(512));
console.log('icons/icon-192.png + icon-512.png 已生成');
