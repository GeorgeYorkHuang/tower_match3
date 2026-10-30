const { recordDamage } = require('../game/fx/combat-feedback.js');
'use strict';
// Enemy status instances are caller-owned. Keep effect/death order and original tick cadence.
const CONFIG = require('../config.js');
const SKILL_NUM = require('../config/tower-skills.js');
const COMBAT_BALANCE = require('../config/combat-common.js');

function dotBoost(combat) {
  const n = combat.lv('poison', '毒性强化');
  const aLv = combat.branchLv('poison', '毒性强化', 'A');
  return {
    dmg: n > 0 ? SKILL_NUM.poison['毒性强化'].damage[aLv] || SKILL_NUM.poison['毒性强化'].damage[0] : SKILL_NUM.poison['剧毒'].baseDamage,   // 每层每秒伤害比例（单发×此比例）
    ttlAdd: n > 0 ? SKILL_NUM.poison['毒性强化'].ttlAdd[combat.branchLv('poison', '毒性强化', 'B')] : 0,
  };
}

function applyBurn(combat, e, dmg, src) {
  const bLv = combat.branchLv('fire', '点燃', 'B');       // 炽热：灼烧时间 +2/+3/+4s
  const cLv = combat.branchLv('fire', '点燃', 'C');       // 余烬：伤害 +20/40/60%、时长 -0.5/1/1.5s、结束爆炸
  const stackCap = combat.branchLv('fire', '灼烧', 'A');  // 业火：叠层上限 +1/级
  const hasBurn = combat.lv('fire', '灼烧');
  const maxStack = hasBurn > 0 ? SKILL_NUM.fire['灼烧'].baseStackCap + stackCap : 1;      // 学「灼烧」后基础上限 +2 层
  let dot = e.dots.find((d) => d.type === 'burn');
  const tickI = SKILL_NUM.fire['点燃'].tickInterval;
  const cBoost = cLv > 0 ? SKILL_NUM.fire['点燃'].emberDmg[cLv] : 0;
  // v1.16.96 薪柴3★：灼烧概率溢出（≥80%）转灼烧伤害加成
  const fuelBoost = combat.game.run._fuelBoost || 0;
  const dps = dmg * SKILL_NUM.fire['点燃'].damagePerSecond * (1 + cBoost) * (1 + fuelBoost / 100);
  let ttl = SKILL_NUM.fire['点燃'].duration + (bLv > 0 ? SKILL_NUM.fire['点燃'].heatTtl[bLv] : 0);
  if (cLv > 0) ttl -= SKILL_NUM.fire['点燃'].emberTtlCut[cLv];
  ttl = Math.max(ttl, SKILL_NUM.fire['点燃'].minDuration);
  if (!dot) {
    e.dots.push({ type: 'burn', dps, ttl, stack: 1, maxStack, tickT: 0, src, tickI });
    dot = e.dots[e.dots.length - 1];
  } else {
    dot.stack = Math.min(dot.maxStack || maxStack, dot.stack + 1);
    dot.dps = dps * dot.stack;
    dot.ttl = ttl;
    dot.tickI = tickI;
  }
  // 灼烧 B 燃尽：满层 → 小爆炸（60% 攻击伤害，范围 30/60/90px）
  const burnLv = combat.branchLv('fire', '灼烧', 'B');
  // v1.16.96 赤印3★：灼烧叠满层时触发爆发（80% 攻击伤害，半径 60码）——与 B 燃尽可并存
  if (combat.game.run.relic3('fire_seal') && dot.stack >= maxStack) {
    dot.stack = 1;
    combat.explode(e.x, e.y, 60, dmg * 0.8, 'fire');
    combat.fxRing(e.x, e.y, '#ffab40', 60, 0.45, 5);
    combat.fxFlash(e.x, e.y, '#ffd24a');
  }
  if (burnLv > 0 && dot.stack >= maxStack) {
    dot.stack = 1;
    const rB = SKILL_NUM.fire['灼烧'].burnRadius[burnLv];
    combat.explode(e.x, e.y, rB, dmg * SKILL_NUM.fire['灼烧'].burstDamage, 'fire');
    combat.fxRing(e.x, e.y, '#ff7043', rB, 0.4, 4);
    combat.fxFlash(e.x, e.y, '#ff9f43');
  }
}

function applyPoison(combat, e, dmg, src, layers) {
  const boost = combat.dotBoost();
  const perStackDps = dmg * boost.dmg;
  const ttl = (SKILL_NUM.poison['剧毒'].baseDuration + SKILL_NUM.poison['剧毒'].durationPerBranch * combat.branchLv('poison', '剧毒', 'B')) + boost.ttlAdd;
  const cap = SKILL_NUM.poison['毒性强化'].stackCap + SKILL_NUM.poison['毒性强化'].stacksPerBranch * combat.branchLv('poison', '毒性强化', 'C');
  const add = Math.max(1, layers || 1);
  const freq = 1 / (1 - SKILL_NUM.poison['剧毒'].freq[combat.branchLv('poison', '剧毒', 'C')]);
  let dot = e.dots.find((d) => d.type === 'poison');
  if (!dot) {
    e.dots.push({ type: 'poison', stackDps: perStackDps, stack: Math.min(add, cap), maxStack: cap, ttl, tickT: 0, freq, src });
  } else {
    dot.stack = Math.min(cap, dot.stack + add);
    dot.stackDps = Math.max(dot.stackDps, perStackDps);
    dot.maxStack = cap;
    dot.freq = freq;
    dot.ttl = Math.max(dot.ttl, ttl);
  }
  // v1.16.100 缠毒3★：被缠绕的敌人每被叠 1 层中毒，缠绕时间延长 0.5 秒（上限 +3 秒）
  if (combat.game.run.relic3('poison_vine') && e._vineT > 0) {
    e._vineT = Math.min(e._vineT + 0.5 * add, 6);
  }
}

function poisonStack(combat, e) {
  const d = (e.dots || []).find((x) => x.type === 'poison');
  return d ? d.stack : 1;
}

function applyBleed(combat, e, dmg) {
  e.bleedT = SKILL_NUM.boomerang['放血'].duration + SKILL_NUM.boomerang['放血'].durationPerBranch * combat.branchLv('boomerang', '放血', 'B');          // 流血持续 4s（B +1s/级）
  const cLv = combat.branchLv('boomerang', '放血', 'C');
  e._bleedDmg = dmg * (SKILL_NUM.boomerang['放血'].damage + SKILL_NUM.boomerang['放血'].damagePerBranch * cLv);                            // 每移动 100px 结算（= 每 10px 4% 攻击；C 溃烂 4%→6/8/10%）
  e._bleedDist = 0;
  e._bleedLastY = e.y;
  // 流血视觉：暗红血珠粒子
  combat.fxParticle(e.x, e.y - 8, '#c0392b', 3, 18, 0.4, 70, 4);
}

function applySlow(combat, e, mult, ttl) {
  // v1.16.114 冰川1★/2★：所有减速效果的幅度提升 15%/20%
  mult *= (1 + combat.relicVal('ice_glacier') / 100);
  // v1.16.114 凝霜1★/2★：减速持续时间延长 1/1.5 秒（与凝霜3★ 同口径）
  ttl += combat.relicVal('ice_condense');
  // v1.16.98 冰川3★：敌人身上每存在 1 个减速类 debuff，其受到的减速效果 +8%（多 debuff 协同）
  if (combat.game.run.relic3('ice_glacier')) {
    const n = ((e.slow && e.slow.ttl > 0) ? 1 : 0) + (e.frozen > 0 ? 1 : 0) + ((e._vineT || 0) > 0 ? 1 : 0);
    if (n > 0) mult = Math.min(COMBAT_BALANCE.glacierSlowCap, mult * (1 + 0.08 * n));
  }
  if (!e.slow || e.slow.ttl <= 0) e.slow = { mult: 1, ttl };
  else e.slow.ttl = Math.max(e.slow.ttl, ttl);
  e.slow.mult = 1 - mult;
  // v1.16.98 凝霜3★：冰缓持续时间延长 1 秒
  if (combat.game.run.relic3('ice_condense')) e.slow.ttl += 1;
}

function freezeE(combat, e, dur) {
  const d = (e.controlResist ? dur : e.isBoss ? dur * SKILL_NUM.ice['冰冻'].bossDurationRatio : dur) + combat.relicVal('ice_forever');   // v1.16.114 永冻1★/2★：冰冻时长 +1/1.5s
  const prev = e.frozen || 0;
  e.frozen = Math.max(prev, d);
  // v1.16.99 寒髓3★：冰塔每冻结一个敌人，自身充能 +2 点能量（新的更强冻结才算一次）
  if (d > prev && combat.game.run.relic3('ice_marrow')) {
    const it = combat.tower('ice');
    if (it) it.energy = Math.min(it.energy + 2, combat.game.run.armoryEnergyMax());
  }
  combat.fxFlash(e.x, e.y, '#d6f0ff', 0.3);
  combat.fxRing(e.x, e.y, '#7fd4ff', 46, 0.4, 4);
}

function hasDot(e, type) { return !!e.dots.find((d) => d.type === type); }

function tickBaseStatus(combat, e, dt) {
  const boost = combat.dotBoost();
  // v1.16.96 火塔 3★ 标记衰减：熔心3★ 火伤标记 / 火墙增烈3★ 停留增伤计时
  if (e._core) { e._core.ttl -= dt; if (e._core.ttl <= 0) e._core = null; }
  if (e._wallStay > 0) e._wallStay -= dt;
  // v1.16.101 闪电链增强3★：连锁增伤窗口递减
  if (e._elecBoost) {
    e._elecBoost.ttl -= dt;
    if (e._elecBoost.ttl <= 0) e._elecBoost = null;
  }
  // v1.16.98 冬域3★：冰缓→冰冻转化冷却
  if (e._domainCd > 0) e._domainCd -= dt;
  // v1.16.99 寒髓3★：冻结事件检测（由未冻结→冻结为一次，任意来源；charge 在 freezeE 处理，此处补非 freezeE 路径）
  if (e.frozen > 0) {
    if (!e._wasFrozen && combat.game.run.relic3('ice_marrow')) {
      e._wasFrozen = true;
      const it = combat.tower('ice');
      if (it) it.energy = Math.min(it.energy + 2, combat.game.run.armoryEnergyMax());
    }
  } else {
    e._wasFrozen = false;
  }
  // v1.16.99 永冻3★：被冰冻超过 1.5 秒的敌人防御 -20%（冻得越久越脆）
  if (e.frozen > 0) {
    e._frozenLongT = (e._frozenLongT || 0) + dt;
    e._fragile = (e._frozenLongT >= 1.5);
  } else {
    e._frozenLongT = 0;
    e._fragile = false;
  }
  // v1.16.100 腐化3★：中毒的敌人每移动 60 码，额外受到其最大生命值 2% 的真实伤害（对 Boss 单次上限 1%，无视减伤）
  if (combat.game.run.relic3('poison_corrode') && combat.hasDot(e, 'poison') && e.hp > 0) {
    const spd = (e.speed || 0) * (e.slow && e.slow.ttl > 0 ? e.slow.mult : 1);
    e._corrodeD = (e._corrodeD || 0) + spd * dt;
    while (e._corrodeD >= 60) {
      e._corrodeD -= 60;
      const pct = e.isBoss ? 0.01 : 0.02;
      const v0 = (e.maxHp || e.hp) * pct;
      const hpBefore = e.hp;
      e.hp -= v0;
      recordDamage(combat, e, hpBefore, 'poison', 'true');
      if (e.hp <= 0 && !e._dying) { e._dying = true; combat.kills.poison = (combat.kills.poison || 0) + 1; combat.onKill(e); }   // v1.17.23 击杀归属：腐化3★致死归毒塔（不走 damage()）
      combat.fxParticle(e.x, e.y, '#6e8b3d', 3, 26, 0.4, 90, 4);
    }
  }
  // DoT
  if (e.dots.length) {
    for (let i = e.dots.length - 1; i >= 0; i--) {
      const d = e.dots[i];
      d.ttl -= dt;
      if (d.ttl <= 0) {
        // 火·点燃 C 余烬：灼烧结束瞬间「余烬爆发」= 期间总灼烧伤害的 30% 立即结算
        if (d.type === 'burn' && combat.branchLv('fire', '点燃', 'C') > 0 && d.totalDealt > 0) {
          combat.damage(e, d.totalDealt * 0.30, 'fire');
          combat.fxFlash(e.x, e.y, '#ff7043', 0.3);
          combat.fxRing(e.x, e.y, '#ff7043', 36, 0.3, 3);
        }
        e.dots.splice(i, 1); continue;
      }
      d.tickT -= dt;
      if (d.tickT <= 0) {
        // v1.16.21 毒塔：中毒跳频 = 剧毒 C 每跳间隔 -0.1/-0.2/-0.3s（freq=1/间隔，基础 1Hz/1s）；burn 等旧 DoT 保持 2Hz
        const tickI = d.freq ? 1 / d.freq : 0.5;
        d.tickT += tickI;
        // 毒（层数×每层 dps）走 stackDps；灼烧等旧 DoT 走 dps×全局强化
        const dealt = d.stackDps ? (d.stack || 1) * d.stackDps * tickI : d.dps * boost.dmg * tickI;
        // v1.16.100 毒爆连锁3★：传染链每跳一环，毒伤 +10%（链式增伤）
        let dealtV = dealt;
        if (d.type === 'poison' && e._poisonChain > 0) dealtV *= (1 + 0.10 * e._poisonChain);
        combat.damage(e, dealtV, d.src, { kind: 'dot', sourceKey: d.src || ({ burn: 'fire', poison: 'poison', bleed: 'boomerang' })[d.type] });
        d.totalDealt = (d.totalDealt || 0) + dealt;
        // v1.16.100 毒腺3★：中毒伤害的 20% 转化为城墙修复
        if (d.type === 'poison' && combat.game.run.relic3('poison_gland')) {
          const maxHp = combat.game.run.lineMaxHp || CONFIG.LINE.hp;
          combat.game.run.lineHp = Math.min(maxHp, (combat.game.run.lineHp || 0) + dealt * 0.2);
        }
        // 火·爆燃 C 灼裂：灼烧每跳 15%/30%/50% 概率爆炸一次（30% 范围伤害）
        const burstLv = combat.branchLv('fire', '爆燃', 'C');
        if (d.type === 'burn' && burstLv > 0 && Math.random() < SKILL_NUM.fire['灼烧'].burst[burstLv]) {
          combat.explode(e.x, e.y, SKILL_NUM.fire['爆燃'].tickBurstRadius, combat.shotDmg('fire', true) * SKILL_NUM.fire['爆燃'].tickBurstDamage, 'fire');
        }
        // 持续伤特效：灼烧=火焰粒子（上飘，数量随叠层）、中毒=毒泡（小概率避免过密）
        if (Math.random() < 0.7) {
          if (d.type === 'burn') {
            const fireN = 3 + Math.min(4, d.stack || 1);
            for (let k = 0; k < fireN; k++) {
              combat.fxParticle(e.x + (Math.random() * 20 - 10), e.y - 12 - Math.random() * 8, Math.random() < 0.4 ? '#ffd24a' : '#ff7043', 1, 28, 0.45, 100, 5);
            }
          } else {
            combat.fxParticle(e.x + (Math.random() * 16 - 8), e.y - 8, '#7ee2a8', 3, 24, 0.5, 70, 4);
          }
        }
      }
    }
  }
  // 回旋镖·猎手标记（v1.16.42）：标记持续 5 秒，到期清零
  if (e._markT > 0) { e._markT -= dt; if (e._markT <= 0) { e._mark = 0; e._markT = 0; } }
  // 控制
  if (e.frozen > 0) e.frozen -= dt / (e.controlResist || 1);
  if (e.paralyzed > 0) e.paralyzed -= dt;
  if (e.slow) { e.slow.ttl -= dt / (e.controlResist || 1); if (e.slow.ttl <= 0) e.slow = null; }
  if (e.corrode) { e.corrode.ttl -= dt; if (e.corrode.ttl <= 0) e.corrode = null; }
  if (e.overload) { e.overload.ttl -= dt; if (e.overload.ttl <= 0) e.overload = null; }
  // 流血（v1.16.12，回旋镖普攻）：随移动距离结算——每累计移动 100px 跳一次伤害
  if (e.bleedT > 0) {
    e.bleedT -= dt;
    e._bleedDist = (e._bleedDist || 0) + Math.max(0, e.y - (e._bleedLastY != null ? e._bleedLastY : e.y));
    e._bleedLastY = e.y;
    if (e._bleedDist >= SKILL_NUM.boomerang['放血'].distancePerTick) {
      e._bleedDist -= SKILL_NUM.boomerang['放血'].distancePerTick;
      combat.damage(e, e._bleedDmg || 0, 'boomerang', 'dot');
      combat.fxParticle(e.x, e.y - 10, '#c0392b', 4, 20, 0.35, 80, 5);
    }
    if (e.bleedT <= 0) { e.bleedT = 0; e._bleedDist = 0; }
  }
}

module.exports = { dotBoost, applyBurn, applyPoison, poisonStack, applyBleed, applySlow, freezeE, hasDot, tickBaseStatus };
