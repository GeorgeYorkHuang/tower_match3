'use strict';
// Explicit combat/Run context only. Calls stay interleaved with skill death effects.
const CONFIG = require('../config.js');
const SKILL_NUM = require('../config/tower-skills.js');

function fireDeath(combat, e) {
  const g = combat.game;
  /* v1.16.96 火塔 3★ 死亡触发（不依赖爆燃技能） */
  // 火种3★：灼烧目标死亡时留下火焰地面 3 秒，每秒 50% 攻击伤害
  if (g.run.relic3('fire_seed')) {
    combat.groundDots = combat.groundDots || [];
    combat.groundDots.push({ x: e.x, y: e.y, r: 60, ttl: 3, dps: combat.shotDmg('fire', true) * 0.5, key: 'fire' });
    combat.fxRing(e.x, e.y, '#ff7043', 60, 0.5, 4);
  }
  // 余烬风暴（1★/2★ 补齐保留项行为）：灼烧目标死亡时 25%/40% 概率再次爆炸（30% 伤害·半径50）
  //   3★：爆炸后留下 1 枚余烬弹，1 秒后自动射向最近敌人（伤害 30%）
  const emberN = g.run.relicNum('fire_ember');
  if (emberN > 0 && Math.random() < emberN / 100) {
    combat.explode(e.x, e.y, SKILL_NUM.fire['爆燃'].tickBurstRadius, combat.shotDmg('fire', true) * SKILL_NUM.fire['爆燃'].tickBurstDamage, 'fire');
    if (g.run.relic3('fire_ember')) {
      g.run._emberShots = g.run._emberShots || [];
      g.run._emberShots.push({ t: 1, x: e.x, y: e.y, dmg: combat.shotDmg('fire', true) * 0.30 });
    }
  }
}

function fireExplosionSpread(combat, e, boomR) {
  const g = combat.game;
  // v1.16.96 连锁爆破3★：爆燃爆炸可传染——爆炸范围内敌人 30% 概率带 1 层灼烧
  if (g.run.relic3('fire_chain')) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= boomR && Math.random() < 0.30) {
        combat.applyBurn(o, combat.shotDmg('fire', true), 'fire');
      }
    });
  }
}

function poisonEssence(combat, e, key) {
  // v1.16.100 剧毒精华3★：毒满层的敌人死亡时毒液溅射，90码 内叠 2 层（不依赖毒爆技能）
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
  // v1.16.100 蔓延3★：蔓延路径也留毒痕，每秒 10% 伤害（3 秒）
  if (combat.game.run.relic3('poison_spread')) {
    combat.groundDots = combat.groundDots || [];
    combat.groundDots.push({ x: next.x, y: next.y, r: 80, ttl: 3, dps: combat.shotDmg('poison', true) * 0.1, key: 'poison' });
    combat.fxRing(next.x, next.y, '#7dcea0', 80, 0.4, 3);
  }
}

function iceDeath(combat, e, key) {
  // v1.16.98 霜爆3★：击杀冰冻敌人时引发冰爆（100% 伤害，半径 120 码），并将范围内所有敌人冻结 1 秒
  if (key === 'ice' && combat.game.run.relic3('ice_frostburst') && e.frozen > 0) {
    combat.explode(e.x, e.y, 120, combat.shotDmg('ice', true), 'ice');
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 120) combat.freezeE(o, 1);
    });
  }
  // v1.16.99 霜刺3★：冰缓的敌人被击杀时，减速光环扩散至周围 80码
  if (key === 'ice' && combat.game.run.relic3('ice_spike') && e.slow && e.slow.ttl > 0) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 80) combat.applySlow(o, 0.3, 3);
    });
    combat.fxRing(e.x, e.y, '#a9d6f5', 80, 0.5, 4);
    combat.fxParticle(e.x, e.y, '#d6f0ff', 8, 60, 0.5, 120, 5);
  }
}

function electricDeath(combat, e, key) {
  // v1.16.101 静电3★：被麻痹敌人死亡时释放静电，麻痹周围敌人 0.8 秒
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

function hunterTransfer(combat, e, cands, markCap) {
  // v1.16.102 猎心3★：标记满层的敌人死亡时，标记转移至最近的敌人并保留全部层数
  if (combat.game.run.relic3('boo_hunt') && (e._mark || 0) >= markCap) {
    const rec = cands.slice().sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
    if (rec) {
      rec._mark = Math.min(markCap, (rec._mark || 0) + e._mark);
      rec._markT = SKILL_NUM.boomerang['猎手标记'].markDur;
      combat.fxBeam(e.x, e.y, rec.x, rec.y, '#d2b4de', 0.4, 3);
    }
  }
}

function boomerangDeath(combat, e, key) {
  // v1.16.102 血刃3★：流血的敌人死亡时喷溅血液：80 码内敌人附加 1 层流血
  if (key === 'boomerang' && combat.game.run.relic3('boo_blood') && combat.hasDot(e, 'bleed')) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 80) {
        combat.applyBleed(o, combat.shotDmg('boomerang', true));
      }
    });
    combat.fxRing(e.x, e.y, '#c0392b', 80, 0.5, 4);
    combat.fxParticle(e.x, e.y, '#c0392b', 10, 70, 0.5, 140, 5);
  }
  // v1.16.102 追猎3★：标记的敌人被其他塔击杀时，返还 1 点能量
  if (key === 'boomerang' && combat.game.run.relic3('boo_mark') && (e._mark || 0) > 0 && e.lastDmgKey && e.lastDmgKey !== 'boomerang') {
    const bt = combat.tower('boomerang');
    if (bt) bt.energy = Math.min(bt.energy + 1, combat.game.run.armoryEnergyMax());
    combat.fxParticle(e.x, e.y - 10, '#d2b4de', 3, 20, 0.4, 80, 4);
  }
}

function cannonDeath(combat, e, key) {
  // v1.16.103 燃烧弹3★：被点燃的敌人死亡时爆炸（96% 伤害，半径 100 码）
  if (key === 'cannon' && combat.game.run.relic3('can_incend') && combat.hasDot(e, 'burn')) {
    combat.explode(e.x, e.y, 100, combat.shotDmg('cannon', true) * 0.96, 'cannon');
  }
}

function poisonInheritanceBase(combat, e) {
  return combat.game.run.relic3('poison_source') ? Math.max(1, Math.floor(combat.poisonStack(e) * 0.5)) : 1;
}

function experience(run, e, bonus) {
  const base = CONFIG.EXP.kill[e.type] || CONFIG.EXP.kill.normal;
  const gained = Math.round(base * (1 + 0.20 * bonus.exp) * (1 + run.relicNum('cm_exp') / 100));
  run.gainExp(gained);
  if (run.relicNum('cm_exp') > 0) run.relicFx('cm_exp', `击杀经验 +${run.relicNum('cm_exp')}%`, e.x, e.y);
}
function eliteChestChance(run, bonus) {
  return CONFIG.RELIC.dropChance * (1 + 0.10 * bonus.chest) * (1 + run.relicNum('cm_bounty') / 100);
}

module.exports = { fireDeath, fireExplosionSpread, poisonEssence, poisonTrail, iceDeath, electricDeath, hunterTransfer, boomerangDeath, cannonDeath, poisonInheritanceBase, experience, eliteChestChance };
