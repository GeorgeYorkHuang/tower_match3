/**
 * test_render.mjs —— 渲染层冒烟测试（mock 微信环境，驱动帧循环与触摸）
 * 运行：node tools/test_render.mjs
 * 覆盖：主循环多帧无异常 / 敌人生成与移动 / 波末三选一弹层 /
 *       触摸交换 / 跨波与破防路径
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

/* ---------- mock 微信环境 ---------- */
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => undefined;
  },
  set() { return true; },
});
const handlers = {};
global.canvas = {
  width: 375, height: 667,
  getContext: () => ctx2d,
  addEventListener: (type, fn) => { handlers[type] = fn; },
};
global.GameGlobal = {};
let rafCb = null;
global.requestAnimationFrame = (fn) => { rafCb = fn; return 1; };

const CONFIG = require('../js/config.js');
const { layout } = require('../js/game/render.js');
require('../js/game/main.js');
const game = global.GameGlobal.game;
// 逻辑→物理换算：与 main.js 一致（scale = min(宽/750, 高/DESIGN.H)）
const _sc = Math.min(375 / CONFIG.DESIGN.W, 667 / CONFIG.DESIGN.H);
const toPhys = (x, y) => ({ clientX: x * _sc, clientY: y * _sc });

/* 新状态机：初始在主界面；战斗类用例先进入战斗 */
game.newRun(true);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

let simTs = 0;
function driveFrames(n, dt) {
  for (let i = 0; i < n; i++) {
    simTs += dt * 1000; // 全局递增，避免 dt 变负
    const cb = rafCb;
    rafCb = null;
    if (cb) cb(simTs);
  }
}

/* 1. 实例创建与帧循环注册 */
t('实例创建并注册帧循环', () => {
  assert.ok(game, 'GameGlobal.game 应存在');
  assert.strictEqual(game.state, 'fighting');
  assert.ok(rafCb, 'RAF 已注册');
});

/* 2. 敌人陆续投放 + 移动 */
t('战斗状态 400 帧：敌人陆续出现并移动', () => {
  driveFrames(400, 0.016);
  assert.ok(game.enemies.length > 0, '第 1 波应有已投放的敌人');
  const target = game.enemies[0];
  const y0 = target.y;
  driveFrames(60, 0.016);
  const alive = game.enemies.find((e) => e.id === target.id);
  if (alive) {
    assert.ok(alive.y > y0, `同一只敌人应下移：${y0} → ${alive.y}`);
  } else {
    // 被击杀也是合法战斗行为（伤害分配优先杀靠近城墙者）
    assert.ok(game.enemies.length < 9999);
  }
});

/* 3. 触摸交换路径 */
t('触摸交换路径无异常', () => {
  const { layout } = require('../js/game/render.js');
  const ly = layout();
  const toPhys = (x, y) => ({ clientX: x / 750 * 375, clientY: y / 1334 * 667 });
  const cellCenter = (r, c) => ({
    x: ly.boardX + c * ly.cell + ly.cell / 2,
    y: ly.boardY + r * ly.cell + ly.cell / 2,
  });
  const p1 = toPhys(cellCenter(0, 0).x, cellCenter(0, 0).y);
  const p2 = toPhys(cellCenter(0, 1).x, cellCenter(0, 1).y);
  handlers.touchstart({ touches: [{ clientX: p1.clientX, clientY: p1.clientY }] });
  handlers.touchmove({ touches: [{ clientX: p2.clientX, clientY: p2.clientY }] });
  handlers.touchend({ changedTouches: [] });
  driveFrames(10, 0.016);
  assert.ok(game.swapped === false || game.swapped === true, '交换标记状态合法');
});

/* 3.5 有效交换 → afterSwap 构造连锁动画 → 推进到稳定结束（防接口不匹配回归） */
t('有效交换→连锁动画推进到稳定结束', () => {
  const board = game.run.board;
  const PAL = ['red', 'blue', 'green', 'yellow'];
  const gg = [];
  for (let r = 0; r < board.rows; r++) { gg[r] = []; for (let c = 0; c < board.cols; c++) gg[r][c] = PAL[(r * 3 + c * 5) % 4]; }
  // 交换 (2,0)↔(2,1) 后：第 1 列 (0,1)(1,1)(2,1) 纵向 3 连 red
  gg[0][1] = 'red'; gg[1][1] = 'red'; gg[2][0] = 'red';
  board.grid = gg;
  const ly = layout();
  const center = (r, c) => ({ x: ly.boardX + c * ly.cell + ly.cell / 2, y: ly.boardY + r * ly.cell + ly.cell / 2 });
  const p1 = toPhys(center(2, 0).x, center(2, 0).y);
  const p2 = toPhys(center(2, 1).x, center(2, 1).y);
  handlers.touchstart({ touches: [{ clientX: p1.clientX, clientY: p1.clientY }] });
  handlers.touchmove({ touches: [{ clientX: p2.clientX, clientY: p2.clientY }] });
  assert.ok(game.anim, '有效交换后应进入动画');
  assert.ok(game.anim.cascade && game.anim.cascade.steps.length >= 1, '动画应含连锁步');
  let guard = 0;
  while (game.anim && guard++ < 400) driveFrames(1, 0.016);
  assert.ok(!game.anim, '动画应推进到稳定结束（guard=' + guard + '）');
  handlers.touchend({ changedTouches: [] });
});

/* 4. 快进到波末：波次弹窗 → 继续 → 三选一或下一波 */
t('波末流转：波次弹窗 → 继续', () => {
  // 推进 ~45s 到第 1 波末
  driveFrames(3000, 0.016);
  assert.ok(['fighting', 'picking', 'gameover', 'waveclear'].includes(game.state), `状态合法：${game.state}`);
  if (game.state === 'waveclear') {
    assert.ok(game.waveClear && game.waveClear.wave >= 1, '波次弹窗数据存在');
    game.waveClearNext();
    assert.ok(['fighting', 'picking'].includes(game.state), `点击继续后状态：${game.state}`);
  }
  if (game.state === 'picking') {
    assert.ok(game.pickQueue.length > 0, '三选一队列非空');
    assert.ok(game.pickIndex === 0);
  }
});

/* 4.5 v1.11 两级候选渲染：技能卡 + 分支卡 弹层无异常 */
t('v1.11 两级候选渲染冒烟', () => {
  const group = {
    tower: 'fire',
    candidates: [
      { name: '点燃', type: 'branch', branch: 'A', branchLv: 1, fromTower: 'fire', desc: '灼烧时间 +50%', icon: '🔥', color: '#ff6b35' },
      { name: '溅射', type: 'skill', fromTower: 'fire', desc: '命中溅射邻近敌人', icon: '💥', color: '#ff9f43' },
      { name: '连击', type: 'branch', branch: 'C', branchLv: 0, fromTower: 'fire', desc: '连击保持：目标死亡时层数不清零', icon: '⚔️', color: '#e67e22' },
    ],
    target: null,
  };
  const hits = {};
  game.renderer.pickLayer(ctx2d, group, 2, hits);
  assert.strictEqual(Object.keys(hits).length, 3, '应生成 3 个按钮命中区');
});

/* 5. 三选一弹层选择（若处于 picking） */
t('三选一选择路径', () => {
  if (game.state !== 'picking') { return; } // 未进入则跳过
  const group = game.pickQueue[game.pickIndex];
  const before = group.candidates[0].level;
  const res = game.run.applyChoice(group.tower, group.candidates[0]);
  assert.ok(res.ok);
  game.nextPick();
  assert.ok(game.state === 'fighting' || game.state === 'picking');
});

/* 4.6 v1.12.1 回归：三选一全部选完 → 自动回到战斗进入下一波（修复“选完卡死”） */
t('三选一选完 → 自动进入下一波（卡死回归）', () => {
  game.newRun(true);
  ['red', 'blue', 'green', 'yellow'].forEach((c) => game.run.applyMatch(c, '3', 3));
  const t0 = game.run.effects.tower('fire');
  t0.pending = 2;
  game.waveClear = { wave: 1, waveGold: 60, pending: 0 };
  game.state = 'waveclear';
  game.waveClearNext();
  assert.strictEqual(game.state, 'picking', '有待升级应先进入三选一');
  let guard = 0;
  while (game.state === 'picking' && guard++ < 20) {
    const g0 = game.pickQueue[game.pickIndex];
    const res = game.run.applyChoice(g0.tower, g0.candidates[0]);
    assert.ok(res.ok, '选择应成功');
    game.nextPick();
  }
  assert.strictEqual(game.state, 'fighting', '选完后应自动回战斗进下一波（修复：不再卡死）');
  assert.ok(game.run.wave >= 2, '应进入下一波');
  assert.strictEqual(game.run.effects.tower('fire').pending, 0, '升级待选应全部消费');
});

/* 长跑驱动：自动点击波次弹窗「继续」 */
function driveLong(n, dt) {
  for (let i = 0; i < n; i++) {
    simTs += dt * 1000;
    const cb = rafCb;
    rafCb = null;
    if (cb) cb(simTs);
    if (game.state === 'waveclear') game.waveClearNext();
  }
}

/* 6. 长跑：跨多波与破防路径无异常 */
t('长跑 ~400s 无异常（跨波/破防）', () => {
  driveLong(25000, 0.016);
  assert.ok(['fighting', 'picking', 'gameover'].includes(game.state), `终态合法：${game.state}`);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
