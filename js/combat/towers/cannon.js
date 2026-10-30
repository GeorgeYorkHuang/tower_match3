'use strict';
// Caller-owned tower/enemy state; shared damage and explosion paths remain on Combat.
const SKILL_NUM = require('../../config/tower-skills.js');

function hitCannon(combat, e, dmg) {
  const g = combat.game;
  // v1.16.14 军火库 C 双倍火力：普攻 10%/20%/30% 概率造成双倍伤害（仅主目标）
  const armC = combat.branchLv('cannon', '军火库', 'C');
  if (armC > 0 && Math.random() < 0.10 * armC) {
    dmg *= 2;
    combat.fxFlash(e.x, e.y, '#ffb347', 0.25);
  }
  // v1.16.103 火药3★：每次命中积攒 1 层「火药热度」，累计 25 层后下一发炮弹为过热弹（200% 伤害，爆炸半径 +30%），随后清零
  let overheat = false;
  const powT = combat.tower('cannon');
  if (g.run.relic3('can_powder') && powT) {
    powT._heat = (powT._heat || 0) + 1;
    if (powT._heat >= 25) { powT._heat = 0; overheat = true; combat.fxFlash(e.x, e.y, '#ffb347', 0.4); }
  }
  if (overheat) dmg *= 2;
  // v1.16.103 弹药库3★：能量溢出时转化为 5% 暴击率（上限 +25%＝5 层；命中时判定）
  if (g.run.relic3('can_armory') && powT && powT.energy >= g.run.armoryEnergyMax()) {
    powT._ovCrit = Math.min(5, (powT._ovCrit || 0) + 1);
    if (Math.random() < 0.05 * powT._ovCrit) {
      dmg *= 2;
      combat.fxFlash(e.x, e.y, '#ffd24a', 0.3);
    }
  }
  // v1.16.103 重爆3★：重炮爆炸中心 40 码内伤害 ×1.5（近距离惩罚强化——主目标即中心）
  if (g.run.relic3('can_heavy') && combat.lv('cannon', '重炮') > 0) dmg *= 1.5;
  // 普攻溅射（v1.16.12）：基础 100px 范围、40% 溅射伤害（v1.16.22 由 10% 上调）；学「重炮」后范围 +25%/级（A 扩爆 +15%/级、B 炸力 +15%/级）
  const heavy = combat.lv('cannon', '重炮');
  let r = SKILL_NUM.cannon['重炮'].radius * (1 + SKILL_NUM.cannon['重炮'].radiusPerLevel * heavy + SKILL_NUM.cannon['重炮'].radiusPerBranch * combat.branchLv('cannon', '重炮', 'A'));
  if (heavy > 0) r *= (1 + combat.relicVal('can_heavy') / 100);   // v1.16.114 重爆1★/2★：爆炸范围 +30%/45%
  if (overheat) r *= 1.3;   // 过热弹爆炸半径 +30%
  const splDmg = dmg * SKILL_NUM.cannon['重炮'].splashDamage * (1 + SKILL_NUM.cannon['重炮'].damagePerBranch * combat.branchLv('cannon', '重炮', 'B'));
  // 协同（爆炸类 +50%）在 explode() 内按 SYNERGIES[1] 统一结算（v1.16.20 修正越界索引）
  // 震击（v1.16）：40%+20pp×B 概率击退 60×(1+0.4×A)px；C 迟滞被击退减速 1/1.5/2 秒（随等级）
  const shock = combat.lv('cannon', '震击');
  let knock = 0, slowAfter = 0;
  if (shock > 0 && Math.random() < SKILL_NUM.cannon['震击'].probability + SKILL_NUM.cannon['震击'].probabilityPerBranch * combat.branchLv('cannon', '震击', 'B')) {
    knock = SKILL_NUM.cannon['震击'].knockback * (1 + SKILL_NUM.cannon['震击'].knockbackPerBranch * combat.branchLv('cannon', '震击', 'A')) * (1 + combat.relicVal('can_knock') / 100);   // v1.16.114 震烈1★/2★
    slowAfter = SKILL_NUM.cannon['震击'].slowDuration + SKILL_NUM.cannon['震击'].slowDurationPerBranch * combat.branchLv('cannon', '震击', 'C');   // C1=1s / C2=1.5s / C3=2s
  }
  combat.damage(e, dmg, 'cannon');
  // 爆炸（AOE 溅射 + 震尘减速）——排除主目标（普攻主目标已吃满 100%）
  combat.explode(e.x, e.y, r, splDmg, 'cannon', knock, slowAfter, e);
  if (combat.branchLv('cannon', '重炮', 'C') > 0) {
    combat.enemies().forEach((o) => {
      if (o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= r && Math.random() < 0.20 * combat.branchLv('cannon', '重炮', 'C')) combat.applySlow(o, 0.30, 1);
    });
  }
  // 贯穿弹（v1.16）：爆炸后弹片向前贯穿 2+裂片 个敌人（70%×碎劲），C 贯透减速 15%
  const pierce = combat.lv('cannon', '贯穿弹');
  if (pierce > 0) {
    // v1.16.103 穿透3★：弹片贯穿改为贯穿路径上所有敌人（无人数上限），每多贯穿 1 名伤害 -10%（下限 40%）
    const pierceAll = g.run.relic3('can_pierce');
    const n = pierceAll ? Infinity : SKILL_NUM.cannon['贯穿弹'].targets + combat.branchLv('cannon', '贯穿弹', 'A') + combat.relicVal('can_pierce');   // v1.16.114 穿透1★/2★
    const pDmg0 = dmg * SKILL_NUM.cannon['贯穿弹'].damage * (1 + SKILL_NUM.cannon['贯穿弹'].damagePerBranch * combat.branchLv('cannon', '贯穿弹', 'B'));
    const cands = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < SKILL_NUM.cannon['贯穿弹'].targetHalfHeight && Math.abs(o.x - e.x) < SKILL_NUM.cannon['贯穿弹'].targetHalfWidth)
      .sort((a, b) => b.y - a.y);
    // v1.16.103 火线3★：贯穿路径留下火线 1.5 秒，每秒 15% 伤害
    const fireline = g.run.relic3('can_fireline');
    for (let i = 0; i < Math.min(n, cands.length); i++) {
      const hitT = cands[i];
      const pDmg = pierceAll ? pDmg0 * Math.max(0.4, 1 - 0.10 * i) : pDmg0;
      combat.damage(hitT, pDmg, 'cannon');
      if (fireline) {
        combat.groundDots = combat.groundDots || [];
        combat.groundDots.push({ x: (e.x + hitT.x) / 2, y: (e.y + hitT.y) / 2, r: 40, ttl: 1.5, dps: combat.shotDmg('cannon', true) * 0.15, key: 'fire' });
        combat.fxRing((e.x + hitT.x) / 2, (e.y + hitT.y) / 2, '#ff7043', 40, 0.4, 3);
      }
      // v1.16.42 C 贯透档位式：被贯穿敌人减速 15%/30%/45%
      const pierceC = combat.branchLv('cannon', '贯穿弹', 'C');
      if (pierceC > 0) combat.applySlow(hitT, SKILL_NUM.cannon['贯穿弹'].slow[pierceC], SKILL_NUM.cannon['贯穿弹'].slowDuration);
      combat.fxParticle(hitT.x, hitT.y, '#d89e63', 3, 22, 0.3, 90, 4);
    }
  }
}

module.exports = { hitCannon };
