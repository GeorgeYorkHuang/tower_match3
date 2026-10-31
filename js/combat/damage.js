const Rosea = require('../bosses/rosea.js');
const { recordDamage } = require('../game/fx/combat-feedback.js');
'use strict';
// One damage path, explicit Combat context. Preserve multiplier and reentrant death order.
const CONFIG = require('../config.js');
const SKILL_NUM = require('../config/tower-skills.js');
const GS_BALANCE = require('../config/global-balance.js');

function shotDmg(combat, key, isSkill) {
  const dps = combat.game.run.effects.towerDps(key);
  const iv = CONFIG.TOWERS[key].atkInterval;
  let dmg = dps * iv * (combat.game.run.gsState && combat.game.run.gsState.forge > 0 ? GS_BALANCE.forge.damageMultiplier : 1);
  // v1.16.77 局内商店·攻击强化：+20%/层（本局临时）
  const store = combat.game.run.storeBuff ? combat.game.run.storeBuff() : { atk: 0 };
  if (store.atk > 0) dmg *= (1 + 0.2 * store.atk);
  // v1.16.78 圣遗物星级乘区：力量符全塔伤害 +N% + 塔圣遗物伤害类（普攻与全部技能同源，统一生效）
  // v1.16.96 3★：力量符3★ 4连叠层 / 城墙加固3★ 背水（普攻技能同吃）；全局充能3★ 技能伤（仅技能）
  const run = combat.game.run;
  const rl = combat.relicVal('cm_power') + combat.relicTowerDmg(key)
    + (run.cmPower3 || 0) + (run.wallAtkBonus ? run.wallAtkBonus() : 0);
  if (rl > 0) dmg *= (1 + rl / 100);
  if (isSkill && run.chargeSkillBoost > 0) dmg *= (1 + run.chargeSkillBoost / 100);
  // v1.16.96 战术转移3★：洗牌后 2 秒内全塔伤害 ×1.3
  if (run._shuffleBuffTtl > 0) dmg *= 1.3;
  // v1.16.77 能量耗尽弱化态：普攻与技能伤害 ×0.5（能量 <= 0 时）
  const t = combat.tower(key);
  if (t && t.energy <= 0) dmg *= CONFIG.GLOBAL_SKILL.weakDmg;
  return dmg;
}

function damage(combat, e, dmg, srcKey, kind = 'hit') {
  if (e.hp <= 0) return;
  let v = dmg;
  // v1.16.11 怪物减伤（armor）：Tier 越高减伤越多，精英/Boss 额外叠加（上限 85%）
  if (e.armor > 0) v *= (1 - Math.min(0.85, e.armor));
  // 腐蚀增伤
  if (e.corrode) v *= e.corrode.mult;
  // （寒霜 C 原「易伤」已改「深寒：减速幅度」，v1.16.21 移除易伤乘区）
  // 火·灼烧 C 真火（v1.16.42 档位式）：每层灼烧使目标受到的伤害 +10%/+20%/+30%（全来源，按层数）
  const trueLv = combat.branchLv('fire', '灼烧', 'C');
  if (trueLv > 0) {
    const bd = e.dots.find((d) => d.type === 'burn');
    if (bd) v *= (1 + SKILL_NUM.fire['灼烧'].trueFire[trueLv] * bd.stack);
  }
  // 回旋镖·猎手标记 A 深镖（v1.16.42）：受标记的敌人受到伤害提升 8%/16%/24%（全来源）
  const mkA = combat.branchLv('boomerang', '猎手标记', 'A');
  if (mkA > 0 && (e._mark || 0) > 0) v *= (1 + SKILL_NUM.boomerang['猎手标记'].deep[mkA]);
  // v1.16.114 猎心1★/2★：被标记敌人受到的伤害提升 12%/15%（全来源，含普攻）
  if (combat.relicVal('boo_hunt') > 0 && (e._mark || 0) > 0) v *= (1 + combat.relicVal('boo_hunt') / 100);
  // 电·过载 B 强载：每层增伤 +15%/级（未点 B 分支不增伤；v1.16.20 接入分支）
  const ovB = combat.branchLv('electric', '过载', 'B');
  if (srcKey === 'electric' && e.overload && ovB > 0) v *= (1 + 0.15 * ovB * e.overload.n);
  // v1.16.96 火塔 3★ 火伤乘区（srcKey==='fire'）：
  //   熔心3★：火柱命中标记目标，目标受到火伤 +15%/层（5s，叠2层）
  //   炼狱3★：场上每存在 1 个灼烧敌人，全塔火伤 +3%（上限 +45%）
  //   火墙增烈3★：火墙内敌人每停留 1 秒，受到的伤害递增 10%（上限 +50%，全来源）
  if (srcKey === 'fire') {
    const run3 = combat.game.run;
    if (e._core && e._core.ttl > 0) v *= (1 + 0.15 * e._core.n);
    if (run3.relic3('fire_inferno')) {
      const burnN = combat.enemies().filter((o) => o.hp > 0 && o.dots && o.dots.some((d) => d.type === 'burn')).length;
      if (burnN > 0) v *= (1 + Math.min(45, burnN * 3) / 100);
    }
  }
  if (e._wallStay > 0 && combat.game.run.relic3('fire_wall')) v *= (1 + 0.10 * Math.min(5, Math.floor(e._wallStay)));
  // v1.16.98 凝霜3★：冰缓敌人受暴击率 +10%（无全局暴击判定，以受击 ×1.1 实现暴击期望）
  if (combat.game.run.relic3('ice_condense') && e.slow && e.slow.ttl > 0) v *= 1.1;
  // v1.16.99 永冻3★：被冰冻超过 1.5 秒的敌人防御 -20%
  if (e._fragile && combat.game.run.relic3('ice_forever')) v *= 1.2;
  // v1.16.101 闪电链增强3★：连锁每跳一次，该敌人受到的后续伤害 +5%（持续 3 秒）
  if (combat.game.run.relic3('elec_boost') && e._elecBoost && e._elecBoost.ttl > 0) v *= (1 + 0.05 * e._elecBoost.n);
  // v1.16.102 镖尖3★：所有飞镖无视 20% 护甲（对高防怪与 Boss 质变）
  if (srcKey === 'boomerang' && combat.game.run.relic3('boo_tip')) v *= 1.2;
  // v1.16.103 军火之王3★：每次爆炸为全塔 +1% 攻击（本局内叠加，上限 +30%）
  if (srcKey === 'cannon' && combat.game.run._warAtk > 0) v *= (1 + combat.game.run._warAtk / 100);
  // v1.16.100 万毒3★：敌人身上的中毒层数转化为「毒易伤」，每层受伤 +1%
  if (combat.game.run.relic3('poison_all') && e.dots) {
    const pd = e.dots.find((d) => d.type === 'poison');
    if (pd && pd.stack > 0) v *= (1 + 0.01 * pd.stack);
  }
  // 圣物·利刃符：全塔伤害 +8%/级
  const g = combat.game;
  const m = g.meta;
  const dmgLv = (m && m.relicBonus && m.relicBonus().dmg) || 0;
  if (dmgLv > 0) v *= (1 + 0.08 * dmgLv);
  const shieldBefore = Math.max(0, Number(e.shield) || 0);
  v = Rosea.absorb(e,v);
  const hpBefore = e.hp;
  e.hp -= v;
  recordDamage(combat, e, hpBefore, srcKey, kind, shieldBefore);
  e.lastDmgKey = srcKey || e.lastDmgKey;
  if (e.hp <= 0 && !e._dying) {
    e._dying = true;
    // v1.17.23 fix：总击杀此前恒 0——kills 只在 reset 初始化、从不自增；按伤害来源（塔/DoT 元素）计数
    if (srcKey) combat.kills[srcKey] = (combat.kills[srcKey] || 0) + 1;
    combat.onKill(e);
  }
}

function explode(combat, x, y, r, dmg, key, knock, slowAfter, exclude) {
  const g = combat.game;
  // 协同（v1.16.20 修正）：重炮×大火球（SYNERGIES[1]）达成 → 爆炸类伤害 +50%（原引用 [0]/[2] 错位已修正）
  let mult = 1;
  if (g.run.effects.synergyDone && g.run.effects.synergyDone[1]) mult *= 1.5;
  const entryY = combat.ly().areaY + combat.ly().entryH;
  combat.enemies().forEach((o) => {
    if (o.hp <= 0) return;
    if (exclude && o === exclude) return;   // 溅射不重复结算施爆点主目标（v1.16.12）
    const d = Math.hypot(o.x - x, o.y - y);
    if (d > r) return;
    combat.damage(o, dmg * mult, key);
    if (knock > 0) {
      o.y = Math.max(entryY + 10, o.y - knock * (1 - d / r));
      // v1.16.103 震地3★：击退的敌人撞墙时受到 20% 伤害（击退落点结算）
      if (g.run.relic3('can_quake')) combat.damage(o, dmg * 0.2, key);
      // v1.16.103 震烈3★：击退打断敌人攻击动作（对远程怪质变——击退瞬间强减速 0.3 秒）
      if (g.run.relic3('can_knock')) combat.applySlow(o, 1, 0.3);
    }
    if (slowAfter > 0) combat.applySlow(o, 0.3, slowAfter);   // slowAfter = 减速秒数（震击 C：1/1.5/2）
    // v1.16.114 燃烧弹1★/2★：炮弹爆炸 N% 概率点燃敌人；3★ 100% 引燃
    if (key === 'cannon') {
      const incN = combat.relicVal('can_incend');
      if ((incN > 0 && Math.random() < incN / 100) || g.run.relic3('can_incend')) combat.applyBurn(o, dmg);
    }
  });
  // v1.16.103 军火之王3★：每次爆炸为全塔 +1% 攻击（本局内叠加，上限 +30%）
  if (g.run.relic3('can_war')) g.run._warAtk = Math.min(30, (g.run._warAtk || 0) + 1);
  // 爆炸视觉：按塔类型着色的爆炸 + 冲击环
  const COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
  const col = COLOR[key] || '#ff9f43';
  g.fx.push({ type: 'boom', x, y, t: 0, dur: 0.5, color: col });
  combat.fxRing(x, y, col, r, 0.4, 3.5);
  combat.fxParticle(x, y, col, 6, r, 0.45, 130, 5);
}

module.exports = { shotDmg, damage, explode };
