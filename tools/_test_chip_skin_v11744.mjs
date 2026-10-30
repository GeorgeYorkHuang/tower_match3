/**
 * _test_chip_skin_v11744.mjs —— 底板 × 图案两层方块皮肤接入回归（v1.17.44）
 *
 * 覆盖：
 *  1. 资产清单 54 张且文件全部存在（底板6 + 普通6 + 特殊 6色×7形）
 *  2. 普通块：先底板后图案，两次 drawImage，路径正确
 *  3. 特殊块：底板取来源色、图案取 tint/<色>/<形>（已染色版）
 *  4. rainbow：底板回落红色、图案 tint/red/rainbow.png
 *  5. 子雷：split + sub → sub.png
 *  6. 底板未就绪 → 回退旧整图（board/<色>.png）且不叠图案
 *  7. 全部未就绪 → 色块 + 暗条 + v5.2 矢量徽记
 *  8. ChipSkin 辅助函数：shapeOf / baseColorOf / normalSrc 回退
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  → ' + extra : '')); }
};

/* ---------- 伪环境 ---------- */
let MODE = 'all';           // all | board2fail | none
const reads = [];           // 请求过的 src
let draws = [];             // drawImage 的 src 序列
let fills = 0;              // fillRect 次数

function ready(src) {
  if (MODE === 'all') return true;
  if (MODE === 'board2fail') return String(src).indexOf('board2/') < 0;
  return false;
}
globalThis.wx = {
  createImage() {
    const img = { height: 128, src: '' };
    Object.defineProperty(img, 'width', { get: () => (ready(img.src) ? 128 : 0), configurable: true });
    return new Proxy(img, {
      set(t, k, v) { t[k] = v; if (k === 'src') reads.push(v); return true; },
    });
  },
  createCanvas() {
    const cv = { width: 0, height: 0, getContext: () => makeCtx() };
    return cv;
  },
};

function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'canvas') return { width: 750, height: 1626 };
      if (k === 'measureText') return () => ({ width: 12 });
      if (k in t) return t[k];
      return (...args) => {
        if (k === 'drawImage') draws.push(args[0] && args[0].src);
        if (k === 'fillRect') fills++;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const render = require('../js/game/render.js');
const ChipSkin = require('../js/game/icons/chip-skin.js');
const R = Object.create(render.Renderer.prototype);
const ctx = makeCtx();
const reset = () => { draws = []; fills = 0; reads.length = 0; };

/* ---------- 1. 资产清单与文件存在 ---------- */
console.log('[1] 资产清单');
const list = ChipSkin.assets();
ok(list.length === 54, '54 张资产', 'got ' + list.length);
const missing = list.filter((p) => !fs.existsSync(path.resolve(p)));
ok(missing.length === 0, '全部文件存在', JSON.stringify(missing));
ok(list.filter((p) => p.indexOf('base_') >= 0).length === 6, '底板 6 张');
ok(list.filter((p) => p.indexOf('tint/') >= 0).length === 42, '特殊染色图案 42 张');

/* ---------- 2. 普通块 ---------- */
console.log('[2] 普通块：底板 + 原色图案');
MODE = 'all'; reset();
R.drawCell(ctx, 0, 0, 60, 'red', 0, 0, null);
ok(draws.length === 2, '两次 drawImage', JSON.stringify(draws));
ok(draws[0] === 'assets/images/board2/base_red.png', '先画红底板', draws[0]);
ok(draws[1] === 'assets/images/board2/glyph_flame.png', '再叠火焰图案', draws[1]);

reset();
R.drawCell(ctx, 0, 0, 60, 'yellow', 0, 0, null);
ok(draws[0] === 'assets/images/board2/base_yellow.png' && draws[1] === 'assets/images/board2/glyph_bolt.png',
  '黄块 = base_yellow + glyph_bolt', JSON.stringify(draws));

/* ---------- 3. 特殊块 ---------- */
console.log('[3] 特殊块：来源色底板 + 染色图案');
const cases = [
  [{ c: 'blue', s: 'col' }, 'base_blue.png', 'tint/blue/col.png'],
  [{ c: 'green', s: 'cross' }, 'base_green.png', 'tint/green/cross.png'],
  [{ c: 'purple', s: 'row' }, 'base_purple.png', 'tint/purple/row.png'],
  [{ c: 'orange', s: 'rand' }, 'base_orange.png', 'tint/orange/rand.png'],
  [{ c: 'red', s: 'split' }, 'base_red.png', 'tint/red/split.png'],
];
for (const [piece, b, g] of cases) {
  reset();
  R.drawCell(ctx, 0, 0, 60, piece, 0, 0, null);
  ok(draws.length === 2 && draws[0].endsWith(b) && draws[1].endsWith(g),
    piece.s + '/' + (piece.c || 'null') + ' → ' + g, JSON.stringify(draws));
}

/* ---------- 4. rainbow 与子雷 ---------- */
console.log('[4] rainbow 与子雷特例');
reset();
R.drawCell(ctx, 0, 0, 60, { c: null, s: 'rainbow' }, 0, 0, null);
ok(draws.length === 1 && !draws.some(p=>p.includes('base_')), 'rainbow 只绘制图标，无底板', JSON.stringify(draws));
ok(draws[0] && draws[0].endsWith('tint/red/rainbow.png'), 'rainbow 图案', JSON.stringify(draws));

reset();
R.drawCell(ctx, 0, 0, 60, { c: 'green', s: 'split', sub: true }, 0, 0, null);
ok(draws[1] && draws[1].endsWith('tint/green/sub.png'), '子雷取 sub.png（非 split.png）', JSON.stringify(draws));

reset();
R.drawCell(ctx, 0, 0, 60, { c: 'blue', s: 'split' }, 0, 0, null);
ok(draws[1] && draws[1].endsWith('tint/blue/split.png'), '父雷取 split.png', JSON.stringify(draws));

/* ---------- 5. 底板未就绪 → 回退旧整图 ---------- */
console.log('[5] 底板未就绪 → 旧整图回退（不叠图案）');
MODE = 'board2fail'; reset();
R.drawCell(ctx, 0, 0, 60, 'red', 0, 0, null);
ok(draws.length === 1, '只画 1 次', JSON.stringify(draws));
ok(draws[0] === 'assets/images/board/fire.png', '回退旧整图 fire.png', draws[0]);
ok(fills === 0, '不回退色块', 'fills=' + fills);

reset();
R.drawCell(ctx, 0, 0, 60, { c: 'blue', s: 'cross' }, 0, 0, null);
ok(draws.length === 1 && draws[0] === 'assets/images/board/ice.png', '特殊块也回退旧整图', JSON.stringify(draws));

reset();
R.drawCell(ctx, 0, 0, 60, { c: null, s: 'rainbow' }, 0, 0, null);
ok(fills === 0 && draws.length === 0, 'rainbow 图片缺失时仅矢量图标，无底板或暗条');

/* ---------- 6. 全部未就绪 → 色块 + 矢量徽记 ---------- */
console.log('[6] 全部未就绪 → 色块 + 矢量徽记');
MODE = 'none'; reset();
R.drawCell(ctx, 0, 0, 60, { c: 'yellow', s: 'split', sub: true }, 0, 0, null);
ok(draws.length === 0, '无 drawImage', JSON.stringify(draws));
ok(fills >= 1, '底部暗条 fillRect（色块本体走 fillRoundRect 路径）', 'fills=' + fills);

/* ---------- 7. 辅助函数 ---------- */
console.log('[7] ChipSkin 辅助函数');
ok(ChipSkin.shapeOf({ s: 'split', sub: true }) === 'sub', 'shapeOf 子雷 → sub');
ok(ChipSkin.shapeOf({ s: 'split' }) === 'split', 'shapeOf 父雷 → split');
ok(ChipSkin.shapeOf({ s: 'bogus' }) === null, 'shapeOf 未知形状 → null');
ok(ChipSkin.baseColorOf({ c: null }) === 'red', 'baseColorOf rainbow → red');
ok(ChipSkin.baseColorOf({ c: 'nope' }) === 'red', 'baseColorOf 非法色 → red');
ok(ChipSkin.normalSrc('unknown') === 'assets/images/board2/glyph_flame.png', 'normalSrc 未知色回退火焰');

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILED') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
