/**
 * _test_special_chip_v11735.mjs —— 特殊方块染色贴图接入回归（v1.17.35）
 *
 * 覆盖：
 *  1. 贴图未就绪 → drawCell 走旧路径（底图/色块 + v5.2 矢量徽记），不抛错
 *  2. 贴图就绪   → drawCell 只画 1 次（合成贴图），不再叠矢量徽记
 *  3. 组合缓存   → 同 piece 二次绘制不新建离屏画布；6 形 × 6 色 + rainbow = 37 张
 *  4. 染色协议   → 合成为 body → source-atop 染色(α0.78) → mark；rainbow 不染色
 *  5. 子雷通路   → split+sub 取 body_sub/mark_sub
 *  6. 能力缺失   → 不支持 source-atop 时返回 null（调用方回退矢量徽记）
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  → ' + extra : '')); }
};

/* ---------- 伪环境：wx.createImage / wx.createCanvas ---------- */
let IMG_READY = false;              // 图片是否「下载完成」（动态 width）
let COMPOSITE_OK = true;            // 离屏 ctx 是否支持 source-atop
const imgSrcs = [];                 // 被请求的图片路径
const drawCalls = [];               // 主绘制 ctx 调用
const props = [];                   // 主绘制 ctx 属性赋值
const madeCanvases = [];            // 离屏画布
const compLog = [];                 // 合成 ctx 调用（{fn,args}）

function makeImage(src) {
  const img = { src, __img: true, height: 128 };
  Object.defineProperty(img, 'width', { get: () => (IMG_READY ? 128 : 0) });
  return img;
}
function makeCtx(log) {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k === 'canvas') return { width: 750, height: 1626 };
      if (k === 'measureText') return () => ({ width: 12 });
      if (k in t) return t[k];
      return (...args) => { log.push({ fn: String(k), args }); };
    },
    set(t, k, v) {
      if (k === 'globalCompositeOperation' && !COMPOSITE_OK && v !== 'source-over') return true; // 静默忽略
      t[k] = v;
      log.push({ set: String(k), v });
      if (log === drawCalls) props.push([String(k), v]);
      return true;
    },
  });
}
globalThis.wx = {
  createImage: () => { const i = makeImage(''); const orig = i; return new Proxy(orig, {
    set(t, k, v) { t[k] = v; if (k === 'src') imgSrcs.push(v); return true; },
  }); },
  createCanvas: () => {
    const cv = { width: 0, height: 0, __off: true };
    cv.getContext = () => makeCtx(compLog);
    madeCanvases.push(cv);
    return cv;
  },
};

const render = require('../js/game/render.js');
const chipMod = require('../js/game/icons/special-chip.js');
const R = Object.create(render.Renderer.prototype);
R.ly = render.layout();

const ctx = makeCtx(drawCalls);
const reset = () => { drawCalls.length = 0; props.length = 0; };

/* ---------- 1. 未就绪回退 ---------- */
console.log('[1] 贴图未就绪 → 旧绘制路径');
IMG_READY = false;
reset();
R.drawCell(ctx, 0, 0, 60, { c: 'red', s: 'cross' }, 0, 0, null);
ok(drawCalls.some((c) => c.fn === 'fillRect'), '回退画色块/暗条');
ok(props.some(([, v]) => v === '#172035'), '叠了 v5.2 矢量徽记（深色描边）');
ok(!drawCalls.some((c) => c.fn === 'drawImage' && c.args[0] && c.args[0].__off), '未使用离屏贴图');

/* ---------- 2. 就绪后改用贴图 ---------- */
console.log('[2] 贴图就绪 → 单次 drawImage');
IMG_READY = true;
reset();
R.drawCell(ctx, 0, 0, 60, { c: 'red', s: 'cross' }, 0, 0, null);
const imgs = drawCalls.filter((c) => c.fn === 'drawImage');
ok(imgs.length === 1, '每格只 1 次 drawImage', 'got ' + imgs.length);
ok(imgs[0] && imgs[0].args[0].__off === true, '画的是离屏合成贴图');
ok(!props.some(([, v]) => v === '#172035'), '不再叠矢量徽记');
ok(imgs[0] && Math.round(imgs[0].args[1]) === 0 && Math.round(imgs[0].args[3]) === 56, '按 56 逻辑 px 绘制（cell-4）');

/* ---------- 3. 缓存复用 ---------- */
console.log('[3] 组合缓存');
const before = madeCanvases.length;
R.drawCell(ctx, 0, 0, 60, { c: 'red', s: 'cross' }, 0, 0, null);
ok(madeCanvases.length === before, '同组合第二次不新建离屏画布');

/* ---------- 4. 染色协议 + 全组合计数 ---------- */
console.log('[4] 染色协议（body → source-atop 染色 → mark）');
const mk = () => { reset(); compLog.length = 0; };
mk();
const c0 = chipMod.specialChip({ c: 'blue', s: 'row' });   // 未被前面步骤缓存过
ok(!!c0, '合成成功');
ok(compLog.filter((c) => c.fn === 'drawImage').length === 2, 'body + mark 两次 drawImage');
ok(compLog.some((c) => c.set === 'globalCompositeOperation' && c.v === 'source-atop'), '用 source-atop 染色');
ok(compLog.some((c) => c.set === 'globalAlpha' && c.v === 0.78), '染色 α=0.78');
const seq = compLog.filter((c) => c.fn === 'drawImage' || c.fn === 'fillRect').map((c) => c.fn);
ok(JSON.stringify(seq) === JSON.stringify(['drawImage', 'fillRect', 'drawImage']), '顺序 body→染色→mark', JSON.stringify(seq));

console.log('[4b] 6 形 × 6 色 + rainbow = 37');
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const SHAPES = [{ s: 'row' }, { s: 'col' }, { s: 'cross' }, { s: 'split' }, { s: 'split', sub: true }, { s: 'rand' }];
let nullCount = 0;
for (const c of COLORS) for (const sh of SHAPES) { mk(); if (!chipMod.specialChip({ c, ...sh })) nullCount++; }
if (!chipMod.specialChip({ s: 'rainbow' })) nullCount++;
ok(nullCount === 0, '37 个组合全部合成成功', 'null=' + nullCount);
ok(chipMod.cachedKeys().length === 37, '缓存键 37 个', 'got ' + chipMod.cachedKeys().length);
ok(madeCanvases.length === 37, '离屏画布 37 张（不重复创建）', 'got ' + madeCanvases.length);

/* rainbow 不染色 */
mk();
chipMod.specialChip({ s: 'rainbow' });
ok(!compLog.some((c) => c.fn === 'fillRect'), 'rainbow 不做染色填充');

/* ---------- 5. 子雷通路 ---------- */
console.log('[5] 子雷取独立贴图');
ok(imgSrcs.includes('assets/images/board/special/body_sub.png'), '请求了 body_sub.png');
ok(imgSrcs.includes('assets/images/board/special/mark_sub.png'), '请求了 mark_sub.png');
ok(imgSrcs.includes('assets/images/board/special/body_rainbow.png'), '请求了 body_rainbow.png');

/* ---------- 6. 无 source-atop 能力时回退 ---------- */
console.log('[6] 合成模式缺失 → 回退');
const fresh = require.cache[require.resolve('../js/game/icons/special-chip.js')];
delete require.cache[require.resolve('../js/game/icons/special-chip.js')];
const chip2 = require('../js/game/icons/special-chip.js');
COMPOSITE_OK = false;
chip2.configure({ loadImage: (src) => (IMG_READY ? { width: 128, height: 128, src } : null), createCanvas: globalThis.wx.createCanvas });
ok(chip2.specialChip({ c: 'red', s: 'row' }) === null, '不支持 source-atop → 返回 null（外层回退矢量徽记）');
ok(chip2.specialChip({ s: 'rainbow' }) !== null, 'rainbow 不依赖合成模式，仍可用');

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
process.exit(fail === 0 ? 0 : 1);
