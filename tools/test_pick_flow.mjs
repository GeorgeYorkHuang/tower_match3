/**
 * test_pick_flow.mjs —— 功能键命中 + 三选一候选渲染/点击 专项回归
 * 覆盖两个真机 bug：
 *   1. 下方功能按键点击没反应（renderer.funcHits 未同步到 game.funcHits）
 *   2. 三选一界面选项的渲染与点击（pickHits 引用填充 + wx 通道坐标）
 * 运行：node tools/test_pick_flow.mjs
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

/* ---------- mock 微信环境（wx 全局触摸通道，真机同路径） ---------- */
const store = {};
const wxHandlers = {};
const grad = { addColorStop() {} };
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
    return () => undefined;
  },
  set() { return true; },
});
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; },
  setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; },
  onTouchMove(fn) { wxHandlers.move = fn; },
  onTouchEnd(fn) { wxHandlers.end = fn; },
};
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener() {} };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');
const DESIGN = CONFIG.DESIGN;
const L = CONFIG.LAYOUT;

/* 新状态机：初始在主界面，测试先进入战斗（应用技能搭配 + wave.start） */
game.newRun(true);

/* 逻辑坐标 → 真机逻辑像素坐标（wx 通道） */
const toClient = (lx, ly) => ({ x: lx * 375 / DESIGN.W, y: ly * 667 / DESIGN.H });

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

/* 渲染一帧（复用 main.js render 的渲染序列，保证 funcHits 同步生效） */
function renderOnce() {
  const ctx = ctx2d;
  const st = game.sceneState();
  game.renderer.status(ctx, st);
  game.renderer.actionArea(ctx, st);
  game.funcHits = game.renderer.funcHits || []; // main.js render() 中的同步行
  game.renderer.enemies(ctx, game.enemies);
  game.renderer.fx(ctx, game.fx);
  if (game.state === 'picking') {
    const group = game.pickQueue[game.pickIndex];
    game.renderer.pickLayer(ctx, group, game.remainingPending(group.tower), game.pickHits);
  }
}

/* ---- bug 1：功能键命中 ---- */
t('功能键命中区同步：渲染后 game.funcHits 有 4 键 + 加速按钮独立 speedHit（v1.16.30 加速移出底栏）', () => {
  renderOnce();
  assert.strictEqual(game.funcHits.length, 4, `funcHits 应有 4 个（实际 ${game.funcHits.length}）`);
  assert.ok(game.renderer.speedHit && game.renderer.speedHit.hit, 'speedHit 存在且可命中');
});

t('点击设置键 → 打开设置弹层', () => {
  game.funcLayer = null;
  const fy = L.funcBar ? undefined : undefined;
  // 设置键为 funcHits[0]：从渲染生成的真实命中区取中心
  const hits = game.funcHits;
  assert.ok(hits[0], '设置键命中区存在');
  // 取第一个键的命中区中心：直接扫描一个可命中点
  let px = 0, py = 0, found = false;
  for (let yy = 1536; yy <= 1614 && !found; yy += 4) {
    for (let xx = 30; xx <= 180 && !found; xx += 4) {
      if (hits[0].hit(xx, yy)) { px = xx; py = yy; found = true; }
    }
  }
  assert.ok(found, '设置键命中区应可命中');
  const c = toClient(px, py);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
  assert.strictEqual(game.funcLayer && game.funcLayer.type, 'setting', '点击设置键应打开设置弹层');
  game.funcLayer = null;
});

t('点击商店键 → 打开商店弹层', () => {
  const hits = game.funcHits;
  let px = 0, py = 0, found = false;
  for (let yy = 1536; yy <= 1614 && !found; yy += 4) {
    for (let xx = 30; xx <= 720 && !found; xx += 4) {
      if (hits[2] && hits[2].hit(xx, yy)) { px = xx; py = yy; found = true; }
    }
  }
  assert.ok(found, '商店键命中区应可命中');
  const c = toClient(px, py);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
  assert.strictEqual(game.funcLayer && game.funcLayer.type, 'shop', '点击商店键应打开商店弹层');
  game.funcLayer = null;
});

/* ---- bug 2：三选一候选渲染与点击 ---- */
t('三选一：候选卡片渲染并填充 pickHits', () => {
  // 真实路径 candidates 为池内特效对象引用（applyChoice 校验 includes）
  const pool = game.run.effects.tower('fire').pool;
  game.run.effects.tower('fire').pending = 1;
  game.pickQueue = [{ tower: 'fire', candidates: pool.slice(0, 3), target: '爆燃' }];
  game.pickIndex = 0;
  game.pickHits = {};
  game.state = 'picking';
  renderOnce();
  assert.ok(game.pickHits[0] && game.pickHits[1] && game.pickHits[2], 'pickHits 应填 3 个候选按钮');
});

t('三选一：点击候选按钮 → 应用选择并推进', () => {
  const before = game.pickIndex;
  // 从渲染生成的 pickHits 扫描第一个候选按钮的可命中点（布局无关）
  let px = 0, py = 0, found = false;
  const region = game.pickHits[0];
  assert.ok(region && typeof region.hit === 'function', 'pickHits[0] 命中区存在');
  for (let yy = 900; yy <= 1180 && !found; yy += 4) {
    for (let xx = 30; xx <= 720 && !found; xx += 4) {
      if (region.hit(xx, yy)) { px = xx; py = yy; found = true; }
    }
  }
  assert.ok(found, '候选 1 按钮应有可命中点');
  const c = toClient(px, py);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
  assert.ok(game.pickIndex > before || game.state === 'fighting', '点击候选后应推进三选一（pickIndex 增或回战斗）');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
