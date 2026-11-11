/** 前置章节P0/P1回归：旧档迁移、只读配置、棋盘色池、塔位、充能与跨章重置。 */
'use strict';
const assert = require('assert');
const CONFIG = require('../js/config.js');
const PLAN = require('../js/config/prologue.js');
const Prologue = require('../js/prologue.js');
const Access = require('../js/field-access.js');
const Board = require('../js/board.js');
const { Run } = require('../js/run.js');
const { Meta } = require('../js/meta.js');
const { Match3Controller } = require('../js/match3.js');
const configBefore = JSON.stringify(CONFIG);
const fresh = new Meta();
assert.deepEqual(fresh.prologue, Prologue.initialProgress());
assert.deepEqual(Meta.fromJSON(fresh.toJSON()).prologue, fresh.prologue);
assert.equal(Prologue.reason(PLAN.order[0], fresh), '');
assert(Prologue.reason(PLAN.order[1], fresh));
assert(Prologue.reason('ancient', fresh));
assert(Access.reason(PLAN.order[0], fresh, false), '未接好结算前不开放半成品章节');
assert.deepEqual(Access.visible(false), CONFIG.FIELD_ORDER.filter(id => id !== 'test'));
assert.equal(Access.reason('ancient', fresh, false), '', '预接入阶段仍保持现有正式入口');
for (const record of [{ bestWave: 1 }, { ancientBestWave: 20 }, { normalFieldCleared: true }]) {
  const save = { version: 5, gold: 321, diamond: 7, ...record };
  const before = JSON.stringify(save);
  const old = Meta.fromJSON(save);
  assert.equal(JSON.stringify(save), before);
  assert.deepEqual(old.prologue.cleared, PLAN.order);
  assert(old.prologue.legacyGiftPending);
  assert(!old.prologue.redGiftGranted);
  assert.equal(old.gold, 321); assert.equal(old.diamond, 7);
  assert.deepEqual(old.runCodex, {}, '加载只迁移赠礼资格，不擅自发卡');
  const restored = Meta.fromJSON(old.toJSON());
  assert.deepEqual(restored.prologue, old.prologue, '章节进度连续读档幂等');
  assert.equal(restored.gold, old.gold); assert.equal(restored.diamond, old.diamond);
  assert.deepEqual(restored.runCodex, old.runCodex);
  old.prologue.redGiftGranted = true;
  old.prologue.redGiftId = 'ur_sanctum_fire';
  old.prologue.legacyGiftPending = false;
  assert(!Meta.fromJSON(old.toJSON()).prologue.legacyGiftPending, '赠礼已提交后不再标记补发');
}
assert.deepEqual(Prologue.normalizeProgress({ version: 1, cleared: [...PLAN.order, 'ancient', PLAN.order[0]], redGiftGranted: 'true' }).cleared, PLAN.order);
assert(!Prologue.normalizeProgress({ version: 1, redGiftGranted: 'true' }).redGiftGranted);
const completed = new Meta(); completed.prologue.cleared = PLAN.order.slice();
assert.equal(Prologue.reason('ancient', completed), '');
assert(Access.reason('lava', completed, false), '前置40波不能替代正式圣坛40波');
assert(Access.reason('abyss', completed, false));
assert.equal(Access.reason('test', fresh, true), '');
assert.throws(() => new Board({ colors: ['red', 'red', 'blue'] }));
assert.throws(() => new Board({ colors: ['red', 'blue', 'unknown'] }));

function valid(board, colors) {
  for (const row of board.grid) for (const cell of row) {
    const color = cell && typeof cell === 'object' ? cell.c : cell;
    assert(color == null || colors.includes(color), '棋盘出现未开放色：' + color);
  }
}
let boards = 0;
for (const id of PLAN.order) {
  const run = new Run({ field: id });
  const chapter = PLAN.chapters[id], colors = chapter.colors;
  const auto = new Match3Controller({ run });
  assert.equal(run.towerSlots, colors.length - 1);
  assert(Object.isFrozen(run.chapter)); assert(Object.isFrozen(run.chapter.colors));
  assert.throws(() => run.chapter.colors.push('purple'));
  assert.throws(() => { run.chapter.features.skills = true; });
  assert.deepEqual(run.board.activeColors, colors);
  for (let n = 0; n < 100; n++) {
    const b = run.board;
    b.regen(); valid(b, colors);
    b.grid[0][0] = null; b.grid[1][1] = null;
    b.gravity(); valid(b, colors);
    // 强制四连、五连，经真实resolve与特殊块生成/染色/播种路径。
    for (const count of [4, 5]) {
      b.init();
      for (let c = 0; c < count; c++) b.grid[2][c] = colors[n % colors.length];
      b.grid[2][count] = colors[(n + 1) % colors.length];
      b.resolve(); valid(b, colors);
    }
    const clear = b._markMatrix(false);
    b._recolorBoard(colors[n % colors.length], clear);
    b._seedSpecials(colors[n % colors.length], clear);
    const matches = []; b._scanAllColors(matches, clear);
    b.resolve(); valid(b, colors);
    // 自动药剂沿用真实提示交换流程，不另造颜色。
    const move = auto._findAutoTripleMove();
    if (move) b.trySwap(...move[0], ...move[1]);
    valid(b, colors);
    assert(colors.includes(run._pickColor()));
    boards++;
  }
  run.applyMatch('purple', '3', 3);
  assert.equal(run.slotOrder.length, 0, '未开放色不能从外部结算建塔');
  assert.equal(run._globalSkillOf(colors[0]), null);
  for (const color of colors) run.applyMatch(color, '3', 3);
  assert.equal(run.slotOrder.length, run.towerSlots);
  assert.equal(run.effects.tower(CONFIG.COLORS[colors[colors.length - 1]].tower).level, 0);
  const last = colors[colors.length - 1];
  if (chapter.features.globalSkills) {
    assert.equal(run._globalSkillOf(last), 'both');
    assert.equal(run.shuffleAmmo, 3); assert.equal(run.refillAmmo, 3);
    run._blastReward({ clearedDetails: [{ r: 0, c: 0, color: last }] });
    assert.equal(run.shuffleAmmo, 4); assert.equal(run.refillAmmo, 4);
  } else {
    assert.equal(run.shuffleAmmo, 0); assert.equal(run.refillAmmo, 0);
    assert.equal(run.gainExp(1e6), 0);
    assert.equal(run.effects.pendingTotal(), 0);
  }
  run.gainExp(1e6);
  if (id === PLAN.order[1]) assert.equal(run.effects.pendingTotal(), 9, '第二章最多预留三塔九次激活');
  run.resetRunBuild();
  assert.deepEqual(run.slotOrder, []);
  assert.equal(run.expLevel, 0); assert.equal(run.shuffleAmmo, 0); assert.equal(run.refillAmmo, 0);
  assert.equal(run._globalMap, null);
  assert.deepEqual(run.board.activeColors, colors);
}
for (const difficulty of [4, 5, 6]) {
  const run = new Run({ field: 'ancient', difficulty });
  assert.deepEqual(run.board.activeColors, CONFIG.DIFFICULTY.activeColors[difficulty]);
  assert.equal(run.towerSlots, 4);
  assert.equal(run.expNeed(), CONFIG.EXP.need(0));
}
const normal = new Run({ field: 'ancient' });
for (const color of normal._colors.slice(0, 4)) normal.applyMatch(color, '3', 3);
const rest = normal._colors.slice(4);
assert.deepEqual(new Set(rest.map(color => normal._globalSkillOf(color))), new Set(['shuffle', 'refill']));
normal.applyMatch(rest[0], '3', 3);
assert.equal(normal.shuffleAmmo + normal.refillAmmo, 6);
assert.equal(normal.slotOrder.length, 4);
assert.equal(JSON.stringify(CONFIG), configBefore, '不改写正式全局配置');

// 使用原生GameMain验证布局/sceneState，不进入尚未接好Boss和结算的前置战斗。
const fixture = require('./moving-battle-fixture.cjs');
try {
  const Main = require('../js/game/main.js');
  const game = new Main();
  game.meta = new Meta(); game.meta.tutorial.done = true;
  game.saveData = null; game.save.save = () => false;
  for (const id of [...PLAN.order, 'ancient', PLAN.order[0], 'lava']) {
    game.menuStage = id; game.newRun(false);
    const count = game.run.towerSlots;
    assert.equal(game.ly.slotCount, count); assert.equal(game.renderer.ly.slotCount, count);
    assert.equal(game.sceneState().towers.length, count);
    game.run.applyMatch('red', '3', 3);
    const muzzle = game.combat.towerMuzzle('fire');
    assert.equal(game.towerSlotAt({ x: muzzle.x, y: muzzle.y }), 0);
    assert.equal(game.sceneState().showGlobal, game.run.chapter.features.globalSkills);
  }
} finally { fixture.restore(); }
console.log(`PASS P0/P1: ${boards} chapter board cycles, save migration, 2/3/4 towers, single-color energy, native layout and formal defaults.`);
