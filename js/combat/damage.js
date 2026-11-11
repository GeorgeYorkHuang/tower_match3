const TalentRuntime = require('../talents/runtime.js');
const Bosses = require('../bosses/index.js');
const { recordDamage } = require('../game/fx/combat-feedback.js');
'use strict';
// One damage path, explicit Combat context. Preserve multiplier and reentrant death order.
const CONFIG = require('../config.js');
const SKILL_NUM = require('../config/tower-skills.js');
const GS_BALANCE = require('../config/global-balance.js');
const EnergyState = require('../config/energy-state.js');

// 伤害统计：技能名 → 归属塔（炮火支援焦土等跨塔产物按技能名归源塔）
const SKILL_TOWER = {};
for (const tkey of Object.keys(CONFIG.EFFECT_POOLS || {})) {
  const pool = CONFIG.EFFECT_POOLS[tkey] || [];
  for (const p of pool) if (p && p.name) SKILL_TOWER[p.name] = tkey;
}

/** 伤害统计归集：按实际扣血（healthLoss+shieldLoss，与飘字同口径）计入本局桶 */
function recordDmgStat(combat, e, hpBefore, shieldBefore, srcKey, kind, skill) {
  const run = combat.game && combat.game.run;
  if (!run || typeof run.dmgStatOf !== 'function') return;
  const healthLoss = Math.min(Math.max(0, hpBefore), Math.max(0, hpBefore - e.hp));
  const shieldLoss = Math.max(0, shieldBefore - Math.max(0, Number(e.shield) || 0));
  const amount = healthLoss + shieldLoss;
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const towerKey = skill ? (SKILL_TOWER[skill] || srcKey) : srcKey;
  if (!towerKey) return;
  const st = run.dmgStatOf(towerKey);
  st.total += amount;
  if (kind === 'dot' || kind === 'true') st.dot += amount;
  if (skill) st.skill[skill] = (st.skill[skill] || 0) + amount;
  else if (kind !== 'dot' && kind !== 'true') st.normal += amount;
}

function shotDmg(combat, key, isSkill, isTowerSkill, energyBefore) {
  const dps = combat.game.run.effects.towerDps(key);
  const iv = CONFIG.TOWERS[key].atkInterval;
  let dmg = dps * iv * (combat.game.run.gsState && combat.game.run.gsState.forge > 0 ? GS_BALANCE.forge.damageMultiplier : 1);
  // 局内商店只读取限时乘区；旧最小测试桩仍兼容atk字段。
  const store = combat.game.run.storeBuff ? combat.game.run.storeBuff() : { atk: 0 };
  if (store.damageMultiplier != null) dmg *= store.damageMultiplier;
  else if (store.atk > 0) dmg *= (1 + 0.2 * store.atk);
  // 圣遗物星级乘区：力量符全塔伤害 +N% + 塔圣遗物伤害类（普攻与全部技能同源，统一生效）
  // 3★：力量符3★ 4连叠层 / 城墙加固3★ 背水（普攻技能同吃）；全局充能3★ 技能伤（仅技能）
  const run = combat.game.run;
  const talentBonus=TalentRuntime.bonus(run,key);
  dmg=(dmg+talentBonus.attack)*(1+talentBonus.damage)*((isTowerSkill===undefined?isSkill:isTowerSkill)?1+talentBonus.skill:1);
  const rl = combat.relicVal('cm_power') + combat.relicTowerDmg(key)
    + (run.cmPower3 || 0) + (run.wallAtkBonus ? run.wallAtkBonus() : 0);
  if (rl > 0) dmg *= (1 + rl / 100);
  if (isSkill && run.chargeSkillBoost > 0) dmg *= (1 + run.chargeSkillBoost / 100);
  const overload = run.electricOverload ? run.electricOverload() : { level: 0, A: 0, C: 0 };
  const overloadBalance = SKILL_NUM.electric['电磁过载'];
  if (overload.level > 0 && (isTowerSkill === undefined ? isSkill : isTowerSkill)) {
    // 基础技能增伤15%；A分支额外增加15/25/35个百分点。
    dmg *= 1 + overloadBalance.skillDamageBase + overloadBalance.skillDamagePerBranch[overload.A];
  }
  // 超压1★/2★（原「过载」重做）：全塔技能伤害 +10%/+18%（与电磁过载同口径，仅技能吃）
  const supV = combat.relicVal('elec_overload');
  if (supV > 0 && (isTowerSkill === undefined ? isSkill : isTowerSkill)) dmg *= (1 + supV / 100);
  // 战术转移3★：洗牌后 2 秒内全塔伤害 ×1.3
  if (run._shuffleBuffTtl > 0) dmg *= 1.3;
  // 能量状态同时影响普攻与周期技能伤害。
  const t = combat.tower(key);
  // 已收费的攻击/周期技传入出手快照；独立被动仍读取当前能量。
  const energy = energyBefore == null ? (t ? t.energy : 0) : energyBefore;
  if (t) dmg *= EnergyState.evaluate(energy, run.armoryEnergyMax(key)).attack;
  if (overload.level > 0 && !isSkill && t && energy >= run.armoryEnergyMax(key) * overloadBalance.resonanceThreshold) {
    dmg *= 1 + overloadBalance.resonanceDamage[overload.C];
  }
  // 炮·军火库 C 过剩：能量 ≥ 上限 80% 时普攻伤害 +10%/+20%/+30%（仅普攻，与能量状态乘区叠加）
  if (!(isTowerSkill === undefined ? isSkill : isTowerSkill) && key === 'cannon') {
    const armC = combat.branchLv('cannon', '军火库', 'C');
    if (armC > 0 && t && energy >= run.armoryEnergyMax(key) * (SKILL_NUM.cannon['军火库'].overThreshold || 0.8)) {
      dmg *= (1 + SKILL_NUM.cannon['军火库'].overPerBranch * armC);
    }
  }
  return dmg;
}

function damage(combat, e, dmg, srcKey, kind = 'hit', skill) {
  if (e.hp <= 0) return;
  let v = dmg;
  // kind 归一化：statuses 传 {kind:'dot',sourceKey} 或字符串 'dot'，此处统一为字符串
  if (kind && typeof kind === 'object') {
    srcKey = kind.sourceKey || srcKey;
    kind = kind.kind || 'hit';
  }
  // 怪物减伤（armor）：Tier 越高减伤越多，精英/Boss 额外叠加（上限 85%）
  v=TalentRuntime.beforeDamage(combat,e,v,srcKey,kind,skill);
  let armorIgnore = 0;
  if (srcKey === 'boomerang' && kind !== 'dot' && combat.game.run.relic3('boo_tip')) armorIgnore = Math.max(armorIgnore, combat.game.run.relicValue('boo_tip', 'armorIgnore') / 100);
  if (e.armor > 0) v *= (1 - Math.min(0.85, e.armor * (1 - Math.min(1, armorIgnore))));
  // 腐蚀增伤
  if (e.corrode) v *= e.corrode.mult;
  // （寒霜 C 原「易伤」已改「深寒：减速幅度」，移除易伤乘区）
  // 火·灼烧 C 真火（档位式）：每层灼烧使目标受到的伤害 +10%/+20%/+30%（全来源，按层数）
  const trueLv = combat.branchLv('fire', '灼烧', 'C');
  if (trueLv > 0) {
    const bd = e.dots.find((d) => d.type === 'burn');
    if (bd) v *= (1 + SKILL_NUM.fire['灼烧'].trueFire[trueLv] * bd.stack);
  }
  // （回旋镖·猎手标记 A 深镖：技能已于 2026-11-01 删除；原猎心1★/2★ 判定随之下线，改名涡心改挂风眼涡旋）
  // 裂空3★：流血的敌人受到飞镖伤害 +12%
  if (srcKey === 'boomerang' && combat.game.run.relic3('boo_mark') && combat.hasDot(e, 'bleed')) v *= 1.12;
  // 火塔 3★ 火伤乘区（srcKey==='fire'）：
  //   熔心3★：火柱命中标记目标，目标受到火伤 +15%/层（5s，叠2层）
  //   炼狱3★：场上每存在 1 个灼烧敌人，全塔火伤 +3%（上限 +45%）
  //   火墙增烈3★：火墙内敌人每停留 1 秒，受到的伤害递增 10%（上限 +50%，全来源）
  if (srcKey === 'fire') {
    const run3 = combat.game.run;
    if (kind === 'dot' && e._seedGroundT > 0 && run3.relic3('s_fire_burn')) v *= 1 + run3.relicValue('s_fire_burn', 'groundBurn') / 100;
  }
  if (srcKey === 'electric' && e.paralyzed > 0 && combat.game.run.relic3('s_sr_elec_para')) {
    v *= 1 + combat.game.run.relicValue('s_sr_elec_para', 'paralyzedDamage') / 100;
  }
  // 凝霜3★：冰缓敌人受暴击率 +10%（无全局暴击判定，以受击 ×1.1 实现暴击期望）
  if (combat.game.run.relic3('ice_condense') && e.slow && e.slow.ttl > 0) v *= 1.1;
  // 永冻3★：被冰冻超过 1.5 秒的敌人防御 -20%
  if (e._fragile && combat.game.run.relic3('ice_forever')) v *= 1.2;
  // 闪电链增强3★：连锁每跳一次，该敌人受到的后续伤害 +5%（持续 3 秒）
  if (combat.game.run.relic3('elec_boost') && e._elecBoost && e._elecBoost.ttl > 0) v *= (1 + 0.05 * e._elecBoost.n);
  if (srcKey === 'boomerang' && kind !== 'dot' && combat.game.run.relicRun('boo_tip') > 0) v *= 1 + combat.game.run.relicNum('boo_tip') / 100;
  // 军火之王3★：每次爆炸为全塔 +1% 攻击（本局内叠加，上限 +30%）
  if (srcKey === 'cannon' && combat.game.run._warAtk > 0) v *= (1 + combat.game.run._warAtk / 100);
  // 万毒3★：敌人身上的中毒层数转化为「毒易伤」，每层受伤 +1%
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
  v = Bosses.absorb(e,v);
  applyResolvedDamage(combat, e, v, srcKey, kind, shieldBefore, skill);
}

// Carry already-mitigated threshold overflow into the new bodies without applying multipliers twice.
function applyResolvedDamage(combat, e, v, srcKey, kind, shieldBefore = 0, skill) {
  if (e.hp <= 0) return;
  const phase = Bosses.transition(combat.game, e, v);
  const hpBefore = e.hp;
  e.hp -= phase ? phase.damage : v;
  recordDamage(combat, e, hpBefore, srcKey, kind, shieldBefore, skill);
  recordDmgStat(combat, e, hpBefore, shieldBefore, srcKey, kind, skill);
  e.lastDmgKey = srcKey || e.lastDmgKey;
  if (phase) {
    const members = Bosses.split(combat.game, e);
    if (phase.overflow > 0) for (const child of members) applyResolvedDamage(combat, child, phase.overflow / members.length, srcKey, kind, 0, skill);
    return;
  }
  Bosses.afterDamage(combat.game, e);
  if (e.hp <= 0 && !e._dying) {
    e._dying = true;
    // fix：总击杀此前恒 0——kills 只在 reset 初始化、从不自增；按伤害来源（塔/DoT 元素）计数
    if (srcKey) combat.kills[srcKey] = (combat.kills[srcKey] || 0) + 1;
    combat.onKill(e);
  }
}

function explode(combat, x, y, r, dmg, key, knock, slowAfter, exclude, skill) {
  const g = combat.game;
  let damageBonus = 0;
  if (key === 'cannon') {
    damageBonus = g.run.relicNum('s_sr_can_powder') + g.run.relicNum('can_war');
    r *= 1 + (g.run.relicNum('s_sr_can_splash') + g.run.relicValue('s_sr_can_powder', 'radius')) / 100;
    if (knock > 0) knock *= 1 + g.run.relicNum('s_sr_can_knock') / 100;
  }
  // 协同（修正）：重炮×大火球（SYNERGIES[1]）达成 → 爆炸类伤害 +50%（原引用 [0]/[2] 错位已修正）
  let mult = 1;
  if (g.run.effects.synergyDone && g.run.effects.synergyDone[1]) mult *= 1.5;
  const entryY = combat.ly().areaY + combat.ly().entryH;
  combat.enemies().forEach((o) => {
    if (o.hp <= 0) return;
    if (exclude && o === exclude) return;   // 溅射不重复结算施爆点主目标（）
    const d = Math.hypot(o.x - x, o.y - y);
    if (d > r) return;
    combat.damage(o, dmg * mult * (1 + damageBonus / 100), key, undefined, skill);
    if (key === 'cannon' && g.run.relic3('s_sr_can_splash')) {
      combat.applySlow(o, g.run.relicValue('s_sr_can_splash', 'slow') / 100, g.run.relicValue('s_sr_can_splash', 'slowDuration'));
    }
    if (knock > 0 && !o.immuneKnockback) {
      const fromX = o.x, fromY = o.y;
      o.y = Math.max(entryY + 10, o.y - knock * (1 - d / r));
      if (key === 'cannon' && g.run.relic3('s_sr_can_knock')) {
        const collisionR = (o.r || o.radius || 18) + 18;
        const collided = combat.enemies().find((other) => other !== o && other.hp > 0
          && Math.hypot(other.x - o.x, other.y - o.y) <= collisionR
          && Math.hypot(other.x - fromX, other.y - fromY) > collisionR);
        if (collided) {
          combat.damage(collided, dmg * g.run.relicValue('s_sr_can_knock', 'collisionDamage') / 100, 'cannon', undefined, skill || '震退');
          combat.fxRing(collided.x, collided.y, '#f5c27b', 24, 0.24, 2.5);
        }
      }
      // 震地3★：击退的敌人撞墙时受到 20% 伤害（击退落点结算）
      if (g.run.relic3('can_quake')) combat.damage(o, dmg * 0.2, key);
      // 震烈3★：击退打断敌人攻击动作（对远程怪质变——击退瞬间强减速 0.3 秒）
      if (g.run.relic3('can_knock')) combat.applySlow(o, 1, 0.3);
      if (slowAfter > 0) combat.applySlow(o, 0.3, slowAfter);   // 震击 C：仅减速实际被击退的敌人
    }
    // 燃烧弹1★/2★：炮弹爆炸 N% 概率点燃敌人；3★ 100% 引燃
    if (key === 'cannon') {
      const incN = combat.relicVal('can_incend');
      if ((incN > 0 && Math.random() < incN / 100) || g.run.relic3('can_incend')) combat.applyBurn(o, dmg);
    }
  });
  // 军火之王3★：每次爆炸为全塔 +1% 攻击（本局内叠加，上限 +30%）
  if (key === 'cannon' && g.run.relic3('can_war')) g.run._warAtk = Math.min(g.run.relicValue('can_war', 'attackCap'), (g.run._warAtk || 0) + g.run.relicValue('can_war', 'attackPerExplosion'));
  // 爆炸视觉：按塔类型着色的爆炸 + 冲击环
  const COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
  const col = COLOR[key] || '#ff9f43';
  g.fx.push({ type: 'boom', x, y, t: 0, dur: 0.5, color: col });
  combat.fxRing(x, y, col, r, 0.4, 3.5);
  combat.fxParticle(x, y, col, 6, r, 0.45, 130, 5);
}

module.exports = { shotDmg, damage, explode, applyResolvedDamage, recordDmgStat };
