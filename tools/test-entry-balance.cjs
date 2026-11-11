/** 首关攻击配置回归：基础单发攻击微调、火塔加速、保留单发成长与独立费用。 */
'use strict';
const assert = require('assert');
const api = require('./tower-balance-fixture.cjs');
const CONFIG = require('../js/config.js');
const { WaveDirector } = require('../js/wave.js');
const B = require('../js/config/bosses.js').altar_galvin;
const close = (a, b, msg) => assert(Math.abs(a - b) < 1e-5, `${msg}: ${a} != ${b}`);
// [基础单发攻击, 每级单发成长, 每秒发数, 每发费用]；不使用伤害结算层增伤。
const expectedStats = {
  fire: [43, 15, .74, 35 / 60], ice: [30.8, 7.68 / .88, .88, 24 / 60],
  poison: [20.2, 6, 1.44, 16 / 60], electric: [38, 10.8, .8, 30 / 60],
  boomerang: [34.2, 8.64 / .56, .56, 26 / 60], cannon: [72, 20, .48, 1],
};
try {
  assert(!('towerDamageMultiplier' in require('../js/config/combat-common.js')));
  assert.equal(B.hp, 108000); assert.equal(B.hp * B.twinHpRatio, 34560);
  for (const [key, [attack, growth, rate, cost]] of Object.entries(expectedStats)) {
    const cfg = CONFIG.TOWERS[key];
    close(cfg.baseDps * cfg.atkInterval, attack, '基础单发攻击直接写入配置');
    close(cfg.perLv * cfg.atkInterval, growth, '每级单发成长保持');
    close(1 / cfg.atkInterval, rate, '基础发射频率');
    close(cfg.attackCost, cost, '基础费用保持独立');
    for (const level of [1, 4, 8, 13]) {
      const w = api.setup(key, [], 0, 'boss', 41, 'finite');
      w.tower.level = level;
      const raw = attack + growth * (level - 1);
      close(w.combat.shotDmg(key, false, false, 60), raw, '各等级普攻读新增攻击');
      close(w.combat.shotDmg(key, true, true, 60), raw, '周期技能读同一攻击源');
      close(w.combat.interval(key), 1 / rate, '真实普攻调度读取基础攻速');
      w.combat.attackOnce(key);
      close(w.tower.energy, 60 - cost, '提高攻击不额外收费');
    }
    for (const kind of ['hit', 'dot', 'true', { kind: 'dot', sourceKey: key }]) {
      const w = api.setup(key, [], 0, 'boss', 41, 'finite'), e = w.game.enemies[0];
      e.armor = .25; const hp = e.hp;
      w.combat.damage(e, 100, typeof kind === 'object' ? undefined : key, kind);
      close(hp - e.hp, 75, '100原始伤害只计算25%减伤，没有隐藏倍率');
    }
  }
  const fire = api.setup('fire', [], 0, 'boss', 41, 'finite'), target = fire.game.enemies[0];
  const attack = fire.combat.shotDmg('fire', false, false, 60);
  close(attack, 43, '一级火塔攻击42→43');
  fire.combat.applyBurn(target, attack, 'fire');
  close(target.dots[0].dps, 8.6, '灼烧由43攻击派生，每秒20%，不再二次增伤');
  const w = api.setup('fire', [], 0, 'dense', 41, 'finite'), g = w.game;
  g.menuStage = 'ancient'; g.run.wave = 40; g.wave = new WaveDirector(g, g.ly);
  g.enemies = []; g.wave.buildPlan(); g.wave.spawnOne();
  const body = g.run.bossEnemy;
  body.hp = body.maxHp * B.threshold + 30;
  w.combat.damage(body, 100, 'fire');
  const twins = g.run.bossEncounter.members;
  assert.equal(twins.length, 2);
  for (const twin of twins) {
    close(twin.maxHp, B.hp * B.twinHpRatio, '分身血量保持');
    close(twin.maxHp - twin.hp, 22.5, '(100×75%-30)/2溢出直接结算');
  }
  console.log('PASS tuned base attacks/rates atLv1/4/8/13, unchanged per-hit growth/costs, fire0.74/s, attack-derived skills/burn, no shared multiplier, native W40 overflow.');
} finally { api.restore(); }
