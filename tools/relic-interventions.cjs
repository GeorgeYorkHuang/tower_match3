/** 离线单因素干预：只改当前Game实例，不改配置、存档、技能费用或随机数。 */
'use strict';
const CONFIG = require('../js/config.js');
const spec = {
  none: { damage: 1, experience: 1, bossBodyHp: 1 },
  damage20: { damage: 1.2, experience: 1, bossBodyHp: 1 },
  exp20: { damage: 1, experience: 1.2, bossBodyHp: 1 },
  boss80: { damage: 1, experience: 1, bossBodyHp: .8 },
  boss50: { damage: 1, experience: 1, bossBodyHp: .5 },
};
function attach(game, name) {
  const treatment = spec[name];
  if (!treatment) throw Error('Unknown intervention');
  const audit = { damageCalls: 0, rawDamageInput: 0, scaledDamageInput: 0,
    xpCalls: 0, originalXp: 0, grantedXp: 0, bossBodies: [] };
  if (treatment.damage !== 1) {
    const damage = game.combat.damage.bind(game.combat);
    game.combat.damage = (enemy, value, key, kind, skill) => {
      const source = kind && typeof kind === 'object' && kind.sourceKey || key;
      const scale = CONFIG.TOWERS[source] ? treatment.damage : 1;
      if (scale !== 1) { audit.damageCalls++; audit.rawDamageInput += value; audit.scaledDamageInput += value * scale; }
      return damage(enemy, value * scale, key, kind, skill);
    };
  }
  if (treatment.experience !== 1) {
    const gain = game.run.gainExp.bind(game.run);
    game.run.gainExp = value => {
      if (value > 0) { audit.xpCalls++; audit.originalXp += value; audit.grantedXp += value * treatment.experience; }
      return gain(value * treatment.experience);
    };
  }
  function spawn(g, enemy) {
    if (treatment.bossBodyHp === 1 || g.menuStage !== 'ancient' || g.run.wave !== 40 ||
        enemy.bossId !== 'altar_galvin' || enemy.phase !== 1) return;
    const before = enemy.maxHp;
    enemy.hp = enemy.maxHp = before * treatment.bossBodyHp; enemy.delayHp = enemy.maxHp;
    // 转阶段只需消耗本体40%生命；分身仍由原配置生成，血量/护甲/回血完全保留。
    const delta = (enemy.maxHp - before) * (1 - require('../js/config/bosses.js').altar_galvin.threshold);
    g.wave.enemyTotalHp += delta; g.run.bossWaveHp += delta;
    audit.bossBodies.push({ id: enemy.id, before, after: enemy.maxHp });
  }
  return { audit, spawn, treatment };
}
module.exports = { attach, spec };
