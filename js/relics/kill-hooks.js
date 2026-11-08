'use strict';
// Explicit combat/Run context only. Calls stay interleaved with skill death effects.
const CONFIG = require('../config.js');
const SKILL_NUM = require('../config/tower-skills.js');

function relicStar(run, id) {
  if (!run || run.relicRun(id) <= 0) return 0;
  if (run._testStar3 && run._testStar3[id]) return 3;
  return Math.max(run._talentCenterId===id?1:0,run.metaRef && run.metaRef.starOf ? run.metaRef.starOf(id) : 1);
}

function fireDeath(combat, e) {
  const g = combat.game;
  // 火塔 SSR「灼烧」3★：灼烧目标死亡后留火地。
  if (g.run.relic3('s_fire_burn') && combat.hasDot(e, 'burn')) {
    combat.groundDots = combat.groundDots || [];
    const r = 60, ttl = g.run.relicValue('s_fire_burn', 'groundDuration');
    combat.groundDots.push({ x: e.x, y: e.y, r, ttl, dps: combat.shotDmg('fire', true) * g.run.relicValue('s_fire_burn', 'groundDps') / 100, key: 'fire', seedGround: true, skill: '灼烧' });
    combat.fxRing(e.x, e.y, '#ff7043', r, 0.5, 4);
  }
}

function fireExplosionSpread(combat, e, boomR) {
  const g = combat.game;
  // 新版火塔卡表没有额外爆燃扩散效果；保留委托签名供死亡流程兼容。
}

function poisonEssence(combat, e, key) {
  // 剧毒精华3★：毒满层的敌人死亡时毒液溅射，90码 内叠 2 层（不依赖毒爆技能）
  if (key === 'poison' && combat.game.run.relic3('poison_essence') && combat.hasDot(e, 'poison')) {
    const pd = e.dots.find((d) => d.type === 'poison');
    if (pd && pd.stack >= pd.maxStack) {
      combat.enemies().forEach((o) => {
        if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 90) {
          combat.applyPoison(o, combat.shotDmg('poison', true), 'poison', 2);
        }
      });
      combat.fxRing(e.x, e.y, '#1e8449', 90, 0.5, 4);
      combat.fxParticle(e.x, e.y, '#52be80', 10, 70, 0.5, 140, 5);
    }
  }
}

function poisonTrail(combat, next) {
  // 蔓延3★：蔓延路径也留毒痕，每秒 10% 伤害（3 秒）
  if (combat.game.run.relic3('poison_spread')) {
    combat.groundDots = combat.groundDots || [];
    combat.groundDots.push({ x: next.x, y: next.y, r: 80, ttl: 3, dps: combat.shotDmg('poison', true) * 0.1, key: 'poison' });
    combat.fxRing(next.x, next.y, '#7dcea0', 80, 0.4, 3);
  }
}

function iceDeath(combat, e, key) {
  // 霜爆3★：击杀冰冻敌人时引发冰爆（100% 伤害，半径 120 码），并将范围内所有敌人冻结 1 秒
  if (key === 'ice' && combat.game.run.relic3('ice_frostburst') && e.frozen > 0) {
    combat.explode(e.x, e.y, 120, combat.shotDmg('ice', true), 'ice');
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 120) combat.freezeE(o, 1);
    });
  }
  // 霜刺3★：冰缓的敌人被击杀时，减速光环扩散至周围 80码
  if (key === 'ice' && combat.game.run.relic3('ice_spike') && e.slow && e.slow.ttl > 0) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 80) combat.applySlow(o, 0.3, 3);
    });
    combat.fxRing(e.x, e.y, '#a9d6f5', 80, 0.5, 4);
    combat.fxParticle(e.x, e.y, '#d6f0ff', 8, 60, 0.5, 120, 5);
  }
}

function electricDeath(combat, e, key) {
  // 静电3★：被麻痹敌人死亡时释放静电，麻痹周围敌人 0.8 秒
  if (key === 'electric' && combat.game.run.relic3('elec_static') && e.paralyzed > 0) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100) {
        o.paralyzed = Math.max(o.paralyzed || 0, 0.8);
        combat.applySlow(o, 0.5, 0.8);
      }
    });
    combat.fxRing(e.x, e.y, '#f4d03f', 100, 0.4, 4);
    combat.fxParticle(e.x, e.y, '#ffe08a', 8, 60, 0.4, 130, 5);
  }
}

function boomerangDeath(combat, e, key) {
  // 血刃3★：流血的敌人死亡时喷溅血液：80 码内敌人附加 1 层流血
  if (key === 'boomerang' && combat.game.run.relic3('boo_blood') && combat.hasDot(e, 'bleed')) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 80) {
        combat.applyBleed(o, combat.shotDmg('boomerang', true));
      }
    });
    combat.fxRing(e.x, e.y, '#c0392b', 80, 0.5, 4);
    combat.fxParticle(e.x, e.y, '#c0392b', 10, 70, 0.5, 140, 5);
  }
  // 追猎3★：标记的敌人被其他塔击杀时，返还 1 点能量
  if (key === 'boomerang' && combat.game.run.relic3('boo_mark') && (e._mark || 0) > 0 && e.lastDmgKey && e.lastDmgKey !== 'boomerang') {
    const bt = combat.tower('boomerang');
    if (bt) bt.energy = Math.min(bt.energy + 1, combat.game.run.armoryEnergyMax('boomerang'));
    combat.fxParticle(e.x, e.y - 10, '#d2b4de', 3, 20, 0.4, 80, 4);
  }
}

function cannonDeath(combat, e, key) {
  // 燃烧弹3★：被点燃的敌人死亡时爆炸（96% 伤害，半径 100 码）
  if (key === 'cannon' && combat.game.run.relic3('can_incend') && combat.hasDot(e, 'burn')) {
    combat.explode(e.x, e.y, 100, combat.shotDmg('cannon', true) * 0.96, 'cannon');
  }
}

function poisonInheritanceBase(combat, e) {
  return combat.game.run.relic3('poison_source') ? Math.max(1, Math.floor(combat.poisonStack(e) * 0.5)) : 1;
}

function experience(run, e, bonus) {
  const base = CONFIG.EXP.kill[e.type] || CONFIG.EXP.kill.normal;
  const gained = Math.round(base * (1 + 0.20 * bonus.exp) * (1 + run.relicNum('s_sr_cm_exp') / 100));
  run.gainExp(gained);
  if (run.relicNum('s_sr_cm_exp') > 0) run.relicFx('s_sr_cm_exp', `击杀经验 +${run.relicNum('s_sr_cm_exp')}%`, e.x, e.y);
}
function eliteChestChance(run, bonus) {
  return Math.min(1, CONFIG.RELIC.dropChance * (1 + 0.10 * bonus.chest) * (1 + run.relicNum('s_sr_cm_bounty') / 100));
}

module.exports = { fireDeath, fireExplosionSpread, poisonEssence, poisonTrail, iceDeath, electricDeath, boomerangDeath, cannonDeath, poisonInheritanceBase, experience, eliteChestChance };
