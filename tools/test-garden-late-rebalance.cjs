/** 花园后半段预算回归：区间/地图隔离、出生与结算一致、小Boss召唤只缩放一次、终局机制保留。 */
'use strict';
const assert = require('assert');
const api = require('./tower-balance-fixture.cjs');
const CONFIG = require('../js/config.js');
const Field = require('../js/config/field-balance.js');
const { WaveDirector } = require('../js/wave.js');
const Vera = require('../js/bosses/vera.js');
const B = require('../js/config/bosses.js').altar_vera;
const close = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const monsterBefore = JSON.stringify(CONFIG.ENEMY.levels);
function world(field, wave) {
  const w = api.setup('fire', [], 0, 'dense', 41, 'finite');
  const g = w.game; g.menuStage = field; g.run.fieldCfg = CONFIG.FIELDS[field]; g.run.wave = wave;
  g.enemies = []; g.wave = new WaveDirector(g, g.ly); g.wave.buildPlan();
  return w;
}
try {
  for (const [wave, scale] of [[1, 1], [40, 1], [41, 1], [50, .85], [59, .7], [60, 1], [61, 1]])
    close(Field.enemyHpMultiplier(CONFIG.FIELDS.ancient, wave), scale);
  for (const field of ['lava', 'frost', 'abyss', 'test']) for (const wave of [40, 41, 50, 59, 60])
    close(Field.enemyHpMultiplier(CONFIG.FIELDS[field], wave), 1);
  for (const wave of [41, 50, 59]) {
    const w = world('ancient', wave), g = w.game, mult = Field.enemyHpMultiplier(g.run.fieldCfg, wave);
    const planned = g.wave.plan.reduce((sum, e) => sum + e.hp, 0);
    close(g.wave.enemyTotalHp, planned * mult);
    while (g.wave.plan.length) g.wave.spawnOne();
    close(g.enemies.reduce((sum, e) => sum + e.maxHp, 0), planned * mult);
    close(g.run.endWave(true).enemyHp, planned * mult);
    // 动态加入的小怪也从pushEnemy出生，不再单独重复缩放。
    g.wave.pushEnemy(1000, 200, 1, .5, false, 'normal', 9);
    close(g.enemies.at(-1).maxHp, 1000 * mult);
  }
  const w = world('ancient', 60), g = w.game;
  g.run.lineMaxHp = g.run.lineHp = 2000; g.wave.spawnOne();
  const boss = g.run.bossEnemy;
  assert.equal(boss.maxHp, 240000); assert.equal(boss.armor, .38);
  assert.equal(B.summonPeriod, 10); assert.equal(B.summonCount, 3); assert.equal(B.summonHp, 2400);
  const initial = g.run.bossWaveHp;
  Vera.tick(g, 10);
  const adds = g.wave.plan.filter(e => e.isSummon);
  assert.equal(adds.length, 3); assert(adds.every(e => e.hp === 2400));
  close(g.run.bossWaveHp - initial, 7200);
  // 只有生命预算改变，阶段阈值、护甲上限和城墙百分比伤害保持。
  boss.hp = boss.maxHp * .34; Vera.afterDamage(g, boss);
  assert.equal(g.run.bossEncounter.phase, 3);
  const hp = g.run.lineHp; Vera.tick(g, 3);
  close(hp - g.run.lineHp, 80);
  assert.equal(B.wardArmorCap, .58); assert.deepStrictEqual(B.thresholds, [.7, .35]);
  assert.equal(JSON.stringify(CONFIG.ENEMY.levels), monsterBefore);
  console.log('PASS garden41/50/59HP curve, pre40/60/outside-map identity, real wave births/reference/settlement, single summon scaling, native VeraHP/7200 summon budget/phase thresholds/80rift damage.');
} finally { api.restore(); }
