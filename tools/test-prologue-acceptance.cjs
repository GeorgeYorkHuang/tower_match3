/** P0–P2补充验收：固定种子、过程快照、全部塔位排列及真实内存存档往返。 */
'use strict';
const assert = require('assert');
const CONFIG = require('../js/config.js');
const PLAN = require('../js/config/prologue.js');
const Board = require('../js/board.js');
const { Run } = require('../js/run.js');
const { Meta } = require('../js/meta.js');
const { SaveManager } = require('../js/save.js');
const Guide = require('../js/game/prologue-tutorial.js');
const randomBefore = Math.random;
const counts = { boardCases: 0, snapshots: 0, rosters: 0, branchUpgrades: 0, storageReloads: 0, nativeAuto: 0, nativeShuffle: 0, nativeReset: 0, crossChapter: 0 };
function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function validGrid(grid, colors) {
  counts.snapshots++;
  for (const row of grid) for (const cell of row) {
    const color = cell && typeof cell === 'object' ? cell.c : cell;
    assert(color == null || colors.includes(color), `章外颜色：${color}`);
  }
}
function validSteps(result, colors) {
  for (const step of result.stepList || result.resolved && result.resolved.stepList || []) {
    validGrid(step.gridAfter, colors);
    for (const item of [...step.planted, ...step.clearedDetails]) assert(item.color == null || colors.includes(item.color));
  }
}
function permutations(items, count) {
  if (!count) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i), count - 1).map(tail => [item, ...tail]));
}
try {
  for (const id of PLAN.order) {
    const chapter = PLAN.chapters[id], colors = chapter.colors;
    for (let seed = 1; seed <= 100; seed++) {
      Math.random = random(seed);
      // 额外执行所有高连操作，以覆盖旧特殊块/道具回调，而非只测本章已开放操作。
      const b = new Board({ colors, hooks: {
        onMatch4: () => ['row', 'col', 'cross', 'split', 'rand'][seed % 5],
        onMatch5: () => ['rainbow', 'scan', 'recolor', 'seed'][seed % 4],
      } }).init();
      validGrid(b.grid, colors);
      b.regen(); validGrid(b.grid, colors);
      b.grid[0][0] = null; b.grid[3][4] = null; b.gravity(); validGrid(b.grid, colors);
      for (const length of [4, 5]) {
        b.init();
        for (let c = 0; c < length; c++) b.grid[2][c] = colors[0];
        b.grid[2][length] = colors[1];
        validSteps(b.resolve(), colors); validGrid(b.grid, colors);
      }
      // 主雷/子雷、行列消除、十字、乱数、彩虹块的真实引爆与补落。
      for (const type of ['row', 'col', 'cross', 'split', 'rand', 'rainbow']) {
        b.init();
        if (type === 'rainbow') {
          b.grid[2][1] = b._makeSpecial(null, 'rainbow');
          validSteps(b.trySwap(2, 1, 2, 2), colors);
        } else {
          b.grid[2][0] = colors[0]; b.grid[2][1] = b._makeSpecial(colors[0], type); b.grid[2][2] = colors[0];
          validSteps(b.resolve(), colors);
        }
        validGrid(b.grid, colors);
      }
      b.grid = Array.from({ length: b.rows }, () => Array(b.cols).fill(null));
      assert.deepEqual(b._seedSpecials('purple', b._markMatrix(false)), []);
      validGrid(b.grid, colors);
      counts.boardCases++;
    }
    for (const order of permutations(colors, chapter.towerSlots)) {
      const run = new Run({ field: id });
      for (const color of order) assert(run.applyMatch(color, '3', 3).gotTower);
      const extra = colors.find(color => !order.includes(color));
      const result = run.applyMatch(extra, '3', 3);
      assert(!result.gotTower); assert.equal(run.slotOrder.length, chapter.towerSlots);
      assert.equal(Object.values(run.effects.towers).filter(tower => tower.level > 0).length, chapter.towerSlots);
      if (chapter.features.globalSkills) {
        assert.equal(result.shuffleGain + result.refillGain, 6);
        run._blastReward({ clearedDetails: [{ r: 0, c: 0, color: extra }] });
        assert.equal(run.shuffleAmmo, 4); assert.equal(run.refillAmmo, 4);
      } else {
        assert.equal(result.shuffleGain + result.refillGain + result.ammoGain, 0);
      }
      counts.rosters++;
    }
    // 备用塔级经验入口不能绕过全局容量，更不能在第一章发待选。
    const run = new Run({ field: id }); run.applyMatch('red', '3', 3);
    const tower = run.effects.tower('fire');
    tower.gainExp(1e6);
    assert.equal(tower.exp, 0);
    assert.equal(run.effects.pendingTotal(), chapter.features.skills ? (chapter.features.branches ? CONFIG.EFFECT.pendingCap : 3) : 0);
    assert.equal(run.expLevel, run.effects.pendingTotal());
    const choice = { name: tower.pool[0].name, type: 'skill', fromTower: 'fire' };
    tower.pending = 0;
    const snapshot = JSON.stringify({ level: tower.level, pool: tower.pool, active: tower.activeNames });
    assert(!run.applyChoice('fire', choice).ok, '耗尽待选后不能消费过期窗口');
    assert.equal(JSON.stringify({ level: tower.level, pool: tower.pool, active: tower.activeNames }), snapshot);
  }

  for (const color of PLAN.chapters[PLAN.order[2]].colors) {
    const key = CONFIG.COLORS[color].tower;
    for (const skill of CONFIG.EFFECT_POOLS[key]) for (const branch of ['A', 'B', 'C']) {
      const run = new Run({ field: PLAN.order[2] }); run.applyMatch(color, '3', 3); run.gainExp(1e6);
      assert(run.applyChoice(key, { name: skill.name, type: 'skill', fromTower: key }).ok);
      for (let rank = 1; rank <= 3; rank++) {
        assert(run.applyChoice(key, { name: skill.name, type: 'branch', branch, fromTower: key }).ok);
        assert.equal(run.effects.tower(key).branchLv(skill.name, branch), rank);
        counts.branchUpgrades++;
      }
      const level = run.effects.tower(key).level, pending = run.effects.pendingTotal();
      assert(!run.applyChoice(key, { name: skill.name, type: 'branch', branch, fromTower: key }).ok);
      assert.equal(run.effects.tower(key).level, level); assert.equal(run.effects.pendingTotal(), pending);
    }
  }

  const fixture = require('./moving-battle-fixture.cjs');
  const Main = require('../js/game/main.js');
  try {
    for (const id of PLAN.order) for (let seed = 1; seed <= 10; seed++) {
      Math.random = random(seed);
      const g = new Main(); g.meta = new Meta(); g.saveData = null; g.menuStage = id; g.newRun(false);
      g.state = 'fighting'; g.run.wave = 1;
      // 注入药剂计时器仅用于测控制器；第一章正常入口不允许购买此药剂。
      g.run.storeTimers.auto = 60;
      g.match3._tickStoreAutoMatch(1);
      validGrid(g.run.board.grid, g.run.chapter.colors);
      if (g.anim && g.anim.cascade) validSteps({ stepList: g.anim.cascade.steps }, g.run.chapter.colors);
      counts.nativeAuto++;
      if (g.run.chapter.features.globalSkills) {
        g.run.globalSlots[0] = 'shuffle'; g.run.shuffleAmmo = 90;
        assert(g.combat.castGlobal('shuffle'));
        validGrid(g.run.board.grid, g.run.chapter.colors); counts.nativeShuffle++;
        const reset = CONFIG.STORE.items.find(item => item.resetBoard);
        if (reset) {
          g.run.gold = 1e6;
          assert(g.run.buyStoreItem(reset.id));
          validGrid(g.run.board.grid, g.run.chapter.colors); counts.nativeReset++;
        }
      }
    }

    const originalGet = wx.getStorageSync, originalSet = wx.setStorageSync;
    try {
      let stored = null;
      wx.getStorageSync = () => structuredClone(stored);
      wx.setStorageSync = (_key, value) => { stored = structuredClone(value); };
      const host = { meta: new Meta() }, save = new SaveManager(host);
      assert.equal(save.load(), null); assert.equal(save.lastLoadStatus, 'missing');
      for (const version of [1, 2, 3, 4, 5]) {
        stored = { version, gold: 1234, bestWave: 20, ancientBestWave: 12 };
        const before = structuredClone(stored);
        const meta = save.applyMeta(save.load());
        assert.equal(meta.gold, 1234); assert.deepEqual(stored, before);
        assert.equal(meta.prologue.cleared.length, 3);
        assert(meta.prologue.legacyGiftPending);
        assert.equal(meta.bestWave, 20); assert.equal(meta.ancientBestWave, 12);
        assert(save.save());
        const progress = structuredClone(host.meta.prologue);
        for (let n = 0; n < 5; n++) {
          save.applyMeta(save.load()); assert.deepEqual(host.meta.prologue, progress);
          assert.equal(host.meta.gold, 1234); assert(save.save()); counts.storageReloads++;
        }
      }
      for (const version of [1, 2]) {
        stored = { version, gold: 1234 };
        const empty = save.applyMeta(save.load());
        assert.deepEqual(empty.prologue.cleared, []);
        assert(!empty.prologue.legacyGiftPending, '没有正式记录时不能凭旧版本号补发红卡');
      }
      stored = new Meta().toJSON();
      stored.prologue.cleared = [PLAN.order[0]];
      stored.prologue.tutorials[PLAN.order[0]] = { done: ['match', 'tower'], skipped: false };
      save.applyMeta(save.load()); assert(save.save());
      const expected = structuredClone(host.meta.prologue);
      for (let n = 0; n < 10; n++) {
        save.applyMeta(save.load()); assert.deepEqual(host.meta.prologue, expected); assert(save.save()); counts.storageReloads++;
      }
    } finally { wx.getStorageSync = originalGet; wx.setStorageSync = originalSet; }

    const g = new Main(); g.meta = new Meta(); g.saveData = null;
    const progress = structuredClone(g.meta.prologue);
    for (const id of [...PLAN.order, ...PLAN.order.slice().reverse(), 'ancient', PLAN.order[0]]) {
      g.menuStage = id; g.newRun(false);
      assert.equal(g.run.exp, 0); assert.equal(g.run.expLevel, 0);
      assert.deepEqual(g.run.slotOrder, []); assert.equal(g.run.effects.pendingTotal(), 0);
      assert(Object.values(g.run.effects.towers).every(tower => tower.level === 0 && tower.pool.every(skill => skill.level === 0)));
      assert.deepEqual(g.run.storeTimers, {}); assert.deepEqual(g.run.gsState, {});
      assert.equal(g.run.shuffleAmmo, 0); assert.equal(g.run.refillAmmo, 0);
      validGrid(g.run.board.grid, g.run.chapter.colors);
      assert.deepEqual(g.meta.prologue, progress);
      g.run.applyMatch('red', '3', 3); g.run.gainExp(500);
      g.run.storeTimers.auto = 60; g.run.gsState.forge = 12; g.run.shuffleAmmo = 30;
      counts.crossChapter++;
    }
    // 重复开启引导及旧Run的清理，都不能把临时全局配置写进新Run。
    g.menuStage = PLAN.order[1]; g.newRun(false); g.state = 'fighting'; g.run.wave = 5;
    g.meta.prologue.tutorials[PLAN.order[1]] = { done: ['activate', 'third'], skipped: false };
    g.run.globalSlots[0] = 'forge'; Guide.begin(g); Guide.tick(g);
    assert.equal(g.run.globalSlots[0], 'refill');
    Guide.begin(g); assert.equal(g.run.globalSlots[0], 'forge'); Guide.tick(g);
    const oldRun = g.run;
    g.run = new Run({ field: PLAN.order[2] }); g.run.globalSlots[0] = 'haste';
    Guide.cancel(g);
    assert.equal(oldRun.globalSlots[0], 'forge'); assert.equal(g.run.globalSlots[0], 'haste');
  } finally { fixture.restore(); }
  console.log('PASS P0-P2 acceptance ' + JSON.stringify(counts));
  console.log('OPEN: 第一章因globalSkills=false，第三色不产生充能收益；需主会话确认规则并集成。');
} finally { Math.random = randomBefore; }
