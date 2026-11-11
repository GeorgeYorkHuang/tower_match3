/** 单因素隔离回归：伤害/经验只乘一次，Boss本体与分身分离，不改共享配置。 */
'use strict';
const assert = require('assert');
const { attach } = require('./relic-interventions.cjs');
const C = require('../js/config.js'), B = require('../js/config/bosses.js');
const before = JSON.stringify({ towers: C.TOWERS, boss: B, skills: require('../js/config/tower-skills.js') });
function mock() {
  const calls = { damage: [], xp: [] };
  const g = { menuStage: 'ancient', run: { wave: 40, bossWaveHp: 600000,
    gainExp(v) { calls.xp.push(v); return v; } }, wave: { enemyTotalHp: 600000 },
    combat: { damage(...args) { calls.damage.push(args); return args[1]; } } };
  return { g, calls };
}
for (const name of ['none', 'damage20', 'exp20', 'boss80', 'boss50']) {
  const { g, calls } = mock(), t = attach(g, name), enemy = {};
  g.combat.damage(enemy, 100, 'fire', 'hit', '火柱');
  g.combat.damage(enemy, 100, undefined, { kind: 'dot', sourceKey: 'poison' }, '毒性强化');
  g.combat.damage(enemy, 100, 'other', 'hit');
  g.run.gainExp(100); g.run.gainExp(0);
  assert.equal(calls.damage[0][1], name === 'damage20' ? 120 : 100);
  assert.equal(calls.damage[1][1], name === 'damage20' ? 120 : 100);
  assert.equal(calls.damage[2][1], 100, '非六塔来源不混入输出干预');
  assert.equal(calls.xp[0], name === 'exp20' ? 120 : 100);
  const body = { id: 1, bossId: 'altar_galvin', phase: 1, hp: 540000, maxHp: 540000, armor: .25, attack: 275 };
  const twin = { id: 2, bossId: 'altar_galvin', phase: 2, hp: 172800, maxHp: 172800, armor: .125 };
  const twinCopy = { ...twin };
  t.spawn(g, body); t.spawn(g, twin);
  const factor = name === 'boss80' ? .8 : name === 'boss50' ? .5 : 1;
  assert.equal(body.hp, 540000 * factor); assert.equal(body.maxHp, body.hp);
  assert.equal(body.armor, .25); assert.equal(body.attack, 275); assert.deepStrictEqual(twin, twinCopy);
  const change = (540000 * factor - 540000) * .4;
  assert(Math.abs(g.wave.enemyTotalHp - (600000 + change)) < 1e-7);
  assert.equal(g.run.bossWaveHp, g.wave.enemyTotalHp);
}
assert.equal(JSON.stringify({ towers: C.TOWERS, boss: B, skills: require('../js/config/tower-skills.js') }), before);
console.log('PASS single-factor damage/XP, source/DOT handling, body-onlyHP, unchanged twins/armor/attack/cost config, display HP accounting.');
