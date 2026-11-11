/** 圣物回放共用范围检查与观察器；只读账号增益、记录W20/W40，不改游戏规则。 */
'use strict';
const assert = require('assert');
const policy = require('./relic-only-policy.cjs');
const { attach } = require('./tower-energy-observer.cjs');

function scope(g) {
  assert.equal(g.meta.talents.slots.filter(Boolean).length, 0);
  assert.equal(g.meta.talents.center, null);
  const talent = g.run.talentState;
  if (talent) {
    assert(Object.values(talent.bonuses).every(b => Object.values(b).every(v => v === 0)));
    assert.equal(talent.purple.length, 0); assert.equal(talent.gold.length, 0);
  }
  assert.equal(g.run.storeBuff().damageMultiplier, 1); assert.equal(g.run.storeBuff().speedMultiplier, 1);
  assert(Object.values(g.meta.relicBonus()).every(v => v === 0));
  assert(Object.values(g.meta.relicStars).every(v => v <= 1));
  for (const [id, count] of Object.entries(g.run.runRelic)) if (count > 0) assert.equal(g.meta.starOf(id), 1);
  assert(!g.run._testStar3Mode && !g.run._talentCenterId);
}

function configure(g, instrument = true) {
  scope(g);
  const move = g.match3._findAutoTripleMove.bind(g.match3);
  g.match3._findAutoTripleMove = () => policy.chestMove(g, move);
  g.run.buyStoreItem = () => { throw Error('Shop is excluded'); };
  if (!instrument) return null;
  const energy = attach(g), entries = [], timeline = [];
  let time = 0, seenWave = 0, nextLog = 0;
  return {
    afterUpdate(dt) {
      energy.afterUpdate(dt); time += dt;
      if (seenWave !== g.run.wave) {
        seenWave = g.run.wave;
        if ([20, 40].includes(seenWave)) entries.push({ wave: seenWave, time, relics: { ...g.run.runRelic },
          levels: Object.fromEntries(g.run.slotOrder.map(k => [k, g.combat.tower(k).level])) });
        nextLog = time;
      }
      if ([20, 40].includes(seenWave) && time >= nextLog) {
        nextLog = time + 5;
        const encounter = g.run.bossEncounter;
        const members = encounter && encounter.members || g.enemies.filter(e => e.isBoss && e.hp > 0);
        timeline.push({ time, wave: seenWave, wallHp: g.run.lineHp, phase: encounter && encounter.phase,
          resonanceStacks: encounter && encounter.resonanceStacks || 0,
          bosses: members.filter(e => e.hp > 0).map(e => ({ hp: e.hp, maxHp: e.maxHp, phase: e.phase, id: e.bossId })),
          energy: Object.fromEntries(g.run.slotOrder.map(k => [k, g.combat.tower(k).energy])),
          damage: JSON.parse(JSON.stringify(g.run.dmgStat)), relics: { ...g.run.runRelic } });
      }
    },
    finish() { scope(g); return { ...energy.finish(), entries, timeline }; },
  };
}
module.exports = { scope, configure };
