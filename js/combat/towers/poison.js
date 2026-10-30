'use strict';
// Poison tower attacks, periodic entities and enemy interactions use caller-owned state.
const SKILL_NUM = require('../../config/tower-skills.js');

function hitPoison(combat, e, dmg) {
  // v1.16.21 基础中毒：20% 概率附加 1 层（剧毒 +25%，A 每级再 +15%）——v1.16.53 统一判定
  combat.tryAttackDebuff('poison', e, dmg);
  combat.damage(e, dmg, 'poison');
}

function tickPoison(combat, dt) {
  const g = combat.game;
  const poolBalance=SKILL_NUM.poison['毒池'], stickBalance=SKILL_NUM.poison['毒棒'], vineBalance=SKILL_NUM.poison['毒藤'];
  // 毒·毒池（v1.15；v1.16.21 数值调整）：周期 5s 释放毒池（半径 130；A 伤 +40%/级；B 持续 +2s/级；C 范围 +20%/级），池内每秒毒伤并叠毒
  const pool = combat.lv('poison', '毒池');
  if (pool > 0) {
    combat.timers.pool = (combat.timers.pool || 0) + dt;
    if (combat.timers.pool >= poolBalance.period * combat._weakPeriod('poison')) {
      combat.timers.pool = 0;
      combat.castEnergy('poison', '毒池');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('poison', e.x, e.y));
      if (!alive.length) return;
      const tgt = alive[Math.floor(Math.random() * alive.length)];
      const pr = poolBalance.radius * (1 + poolBalance.radiusPerBranch * combat.branchLv('poison', '毒池', 'C'));
      const dps = combat.shotDmg('poison') * poolBalance.damage * (1 + poolBalance.damagePerBranch * combat.branchLv('poison', '毒池', 'A'));
      const ttl = poolBalance.duration + poolBalance.durationPerBranch * combat.branchLv('poison', '毒池', 'B');
      combat.groundDots = combat.groundDots || [];
      combat.groundDots.push({ x: tgt.x, y: tgt.y, r: pr, ttl, key: 'poison', dps, stackPerSec: poolBalance.stacksPerSecond, seed: Math.random() * 100, color: '#1e8449', ring: combat.game.run.relic3('poison_fen') });
      combat.fxRing(tgt.x, tgt.y, '#1e8449', pr, 0.8, 5);
      combat.fxParticle(tgt.x, tgt.y, '#28b463', 8, 60, 0.6, 60, 5);
    }
  }
  // 毒·毒棒（v1.15）：周期 4s 召唤毒棒（A 数量 +1/级；B 持续 +2s 且 CD -0.5s/级），毒棒继承 30% 攻击独立攻击 200px 内敌人（C 目标 +1/级）
  const stick = combat.lv('poison', '毒棒');
  if (stick > 0) {
    combat.timers.stick = (combat.timers.stick || 0) + dt;
    const cd = Math.max(stickBalance.minPeriod, stickBalance.period - stickBalance.periodReduction * combat.branchLv('poison', '毒棒', 'B')) * combat._weakPeriod('poison');
    if (combat.timers.stick >= cd) {
      combat.timers.stick = 0;
      combat.castEnergy('poison', '毒棒');
      const n = stickBalance.count + combat.branchLv('poison', '毒棒', 'A');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('poison', e.x, e.y));
      if (!alive.length) return;   // v1.16.18 没有敌人时不召唤毒棒
      for (let i = 0; i < n; i++) {
        const near = alive[Math.floor(Math.random() * alive.length)];
        const px = near.x + (Math.random() - 0.5) * 60;
        const py = near.y + (Math.random() - 0.5) * 60;
        const ttl = stickBalance.duration + stickBalance.durationPerBranch * combat.branchLv('poison', '毒棒', 'B');
        combat.poisonSticks = combat.poisonSticks || [];
        combat.poisonSticks.push({ x: px, y: py, ttl, atkT: 0, atkI: stickBalance.attackInterval, r: stickBalance.radius, dmg: combat.shotDmg('poison') * stickBalance.damage, targets: stickBalance.targets + combat.branchLv('poison', '毒棒', 'C'), seed: Math.random() * 100 });
        combat.fxRing(px, py, '#1e8449', 40, 0.5, 4);
        combat.fxParticle(px, py - 6, '#28b463', 6, 30, 0.5, 80, 4);
      }
    }
  }
  // 毒·毒藤（v1.15）：周期 6s 从塔口射出藤蔓，缠住最靠城墙的敌人（A 目标 +1/级；B 时长 +1s/级），定身 + 持续叠毒；C 被缠死亡延伸
  const vine = combat.lv('poison', '毒藤');
  if (vine > 0) {
    combat.timers.vine = (combat.timers.vine || 0) + dt;
    if (combat.timers.vine >= vineBalance.period * combat._weakPeriod('poison')) {
      combat.timers.vine = 0;
      combat.castEnergy('poison', '毒藤');
      const n = vineBalance.targets + combat.branchLv('poison', '毒藤', 'A');
      const dur = vineBalance.duration + combat.branchLv('poison', '毒藤', 'B');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('poison', e.x, e.y)).sort((a, b) => b.y - a.y);
      const picks = alive.slice(0, n);
      const mus = combat.towerMuzzle('poison');
      picks.forEach((e) => {
        e.frozen = Math.max(e.frozen || 0, dur);
        e._vineT = Math.max(e._vineT || 0, dur);
        // 毒藤攻击帧动画（v1.16.1）：藤蔓从塔口伸展生长到目标（0.55s），命中后持续缠绕由敌人 _vineT 驱动
        g.fx.push({ type: 'vine', x: mus.x, y: mus.y, tx: e.x, ty: e.y, t: 0, dur: 0.55, seed: Math.random() * 100 });
        combat.fxRing(e.x, e.y, '#1e8449', 26, dur, 3);
      });
    }
  }
}

function updatePoisonSticks(combat, dt) {
  if (!combat.poisonSticks || !combat.poisonSticks.length) return;
  const g = combat.game;
  for (let i = combat.poisonSticks.length - 1; i >= 0; i--) {
    const st = combat.poisonSticks[i];
    st.ttl -= dt;
    if (st.ttl <= 0) {
      // v1.16.100 毒巢3★：毒棒消失时留下 2 秒小毒池（10%/秒）
      if (combat.game.run.relic3('poison_nest')) {
        combat.groundDots = combat.groundDots || [];
        combat.groundDots.push({ x: st.x, y: st.y, r: 70, ttl: 2, dps: combat.shotDmg('poison', true) * 0.1, key: 'poison' });
        combat.fxRing(st.x, st.y, '#1e8449', 70, 0.5, 3);
      }
      combat.poisonSticks.splice(i, 1); continue;
    }
    st.atkT += dt;
    if (st.atkT >= st.atkI) {
      st.atkT -= st.atkI;
      const cands = combat.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - st.x, o.y - st.y) <= st.r)
        .sort((a, b) => b.y - a.y);   // 最靠城墙优先
      const picks = cands.slice(0, st.targets);
      picks.forEach((o) => {
        combat.damage(o, st.dmg, 'poison');
        combat.applyPoison(o, combat.shotDmg('poison', true), 'poison', 1);
        // v1.16.100 毒枝3★：毒棒攻击附带 0.5 秒减速
        if (combat.game.run.relic3('poison_branch')) combat.applySlow(o, 0.3, 0.5);
        // 毒棒攻击弹道（v1.16.1）：绿色毒刺从毒棒飞射目标（0.25s），命中溅射毒液
        g.fx.push({ type: 'thorn', x: st.x, y: st.y, tx: o.x, ty: o.y, t: 0, dur: 0.25, color: '#2e7d32' });
        combat.fxParticle(o.x, o.y, '#2e7d32', 4, 30, 0.3, 90, 4);
        combat.fxParticle(o.x, o.y, '#6fcf97', 2, 20, 0.25, 70, 3);
      });
    }
  }
}

function tryAttackDebuff(combat, o, dmg) {
  // 中毒（v1.16.21）：基础 20%；学剧毒 +25% + A 每级 +15%
  let prob = SKILL_NUM.poison['剧毒'].baseProbability;
  const toxic = combat.lv('poison', '剧毒');
  if (toxic > 0) prob += SKILL_NUM.poison['剧毒'].learnedProbability + SKILL_NUM.poison['剧毒'].probabilityPerBranch * combat.branchLv('poison', '剧毒', 'A');
  prob += combat.relicVal('poison_fang') / 100;   // v1.16.114 毒牙1★/2★
  // v1.16.100 毒牙3★：中毒概率触顶（≥80%）时，多余判定转为 +1 层毒
  if (combat.game.run.relic3('poison_fang') && prob >= 0.8) {
    if (Math.random() < 0.8) {
      combat.applyPoison(o, dmg, 'poison', 1);
      combat.fxParticle(o.x, o.y, '#7ee2a8', 6, 44, 0.45, 100, 5);
    } else {
      combat.applyPoison(o, dmg, 'poison', 1);
      combat.fxFlash(o.x, o.y, '#52be80', 0.25);
    }
  } else if (Math.random() < prob) {
    combat.applyPoison(o, dmg, 'poison', 1);
    combat.fxParticle(o.x, o.y, '#7ee2a8', 6, 44, 0.45, 100, 5);
  }
}

function tickEnemyStatus(combat, e, dt) {
  // 瘟疫传染（毒·瘟疫 v1.15；v1.16.21 C 概率调整）：中毒敌人减速 20% + 周期判定传染（A 判定 1.7/1.5/1.3s；B 范围 +25px/级；C 概率 +10pp/级 30→40/50/60%）
  const plague = combat.lv('poison', '瘟疫');
  if (plague > 0 && combat.hasDot(e, 'poison')) {
    // 减速：中毒敌人移速 ×0.8（与冰减速并存取更慢）
    const s = e.slow;
    const mult = s && s.ttl > 0 ? Math.min(s.mult, SKILL_NUM.poison['瘟疫'].speedMultiplier) : SKILL_NUM.poison['瘟疫'].speedMultiplier;
    e.slow = { mult, ttl: SKILL_NUM.poison['瘟疫'].slowDuration };
    e._plagueT = (e._plagueT || 0) + dt;
    const ivP = SKILL_NUM.poison['瘟疫'].iv[combat.branchLv('poison', '瘟疫', 'A')] || SKILL_NUM.poison['瘟疫'].defaultInterval;
    if (e._plagueT >= ivP) {
      e._plagueT -= ivP;
      const prob = Math.min(1, SKILL_NUM.poison['瘟疫'].baseProbability + SKILL_NUM.poison['瘟疫'].probabilityPerBranch * combat.branchLv('poison', '瘟疫', 'C'));
      if (Math.random() < prob) {
        const rP = SKILL_NUM.poison['瘟疫'].radius + SKILL_NUM.poison['瘟疫'].radiusPerBranch * combat.branchLv('poison', '瘟疫', 'B');
        const near = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= rP);
        if (near.length) {
          // v1.16.100 速疫3★：瘟疫传染无人数上限（按范围判定，范围内全部判定）
          const picks = combat.game.run.relic3('poison_quick') ? near : [near[Math.floor(Math.random() * near.length)]];
          picks.forEach((pick) => {
            combat.applyPoison(pick, combat.shotDmg('poison', true), 'poison', 1);
            combat.fxBeam(e.x, e.y, pick.x, pick.y, '#45b39d', 0.35, 2.5);
          });
        }
      }
    }
  }
  // 毒·毒藤缠绕（v1.15）：定身期间每秒叠毒
  if (e._vineT > 0) {
    e._vineT -= dt;
    e._vineAcc = (e._vineAcc || 0) + dt;
    if (e._vineAcc >= 1) {
      e._vineAcc -= 1;
      combat.applyPoison(e, combat.shotDmg('poison', true), 'poison', 1);
      combat.fxParticle(e.x, e.y - 10, '#7dcea0', 3, 24, 0.4, 80, 4);
    }
  }
  // 毒·瘴气（v1.16.21 重做；v1.16.47 毒雾区域渲染）：城墙上方 50px 处毒瘴条带（半高 20×(1+0.2A)）——
  //   每 2s 叠毒 1 层 + 命中率下降标记；B 中毒 dot 伤 +20~40%；C 瘴内中毒敌攻击降低
  const miasmaBalance = SKILL_NUM.poison['瘴气'];
  const miasma = combat.lv('poison', '瘴气');
  if (miasma > 0) {
    const wallY = (combat.game.ly && combat.game.ly.wallY) ? combat.game.ly.wallY : 967;
    const half = miasmaBalance.halfHeight * (1 + miasmaBalance.heightPerBranch * combat.branchLv('poison', '瘴气', 'A'));
    // v1.16.47：毒雾驻场 fx（城墙上方翻滚毒雾条带；全帧只推入一次，失活时在 else 分支移除）
    if (!combat.game.fx.some((f) => f.kind === 'miasma')) {
      combat.game.fx.push({ type: 'shot', kind: 'miasma', x: 375, y: wallY - miasmaBalance.wallOffset, w: 750, half, t: 0, dur: 1e9 });
    }
    const inM = Math.abs(e.y - (wallY - miasmaBalance.wallOffset)) <= half;
    e._miasma = inM;
    if (inM) {
      e._miaT = (e._miaT || 0) + dt;
      if (e._miaT >= miasmaBalance.tickInterval) {
        e._miaT -= miasmaBalance.tickInterval;
        // v1.16.42 瘴气 B 浓瘴档位式：中毒 DoT 伤害 +20%/+30%/+40%（B0=1 / B1=1.2 / B2=1.3 / B3=1.4）
        const bLv = combat.branchLv('poison', '瘴气', 'B');
        combat.applyPoison(e, combat.shotDmg('poison', true) * (bLv > 0 ? SKILL_NUM.poison['瘴气'].dotMult[bLv] : 1), 'poison', miasmaBalance.stacksPerTick);
        // v1.16.100 瘴毒3★：瘴气每叠 4 层毒引发一次小毒爆（30% 攻击伤害）
        if (combat.game.run.relic3('poison_miasma')) {
          e._miaLayers = (e._miaLayers || 0) + 1;
          if (e._miaLayers >= 4) {
            e._miaLayers = 0;
            combat.explode(e.x, e.y, 60, combat.shotDmg('poison', true) * 0.3, 'poison');
          }
        }
      }
      if (Math.random() < 0.4) combat.fxParticle(e.x, e.y - 6, '#7ee2a8', 1, 16, 0.6, 50, 4);
    }
    const cLv = combat.branchLv('poison', '瘴气', 'C');
    e._miasmaAtkMult = (cLv > 0 && inM && combat.hasDot(e, 'poison')) ? (1 - SKILL_NUM.poison['瘴气'].atkCut[cLv]) : 1;
  } else {
    e._miasma = false;
    e._miasmaAtkMult = 1;
    // v1.16.47：瘴气未激活/失效时移除毒雾驻场 fx
    combat.game.fx = combat.game.fx.filter((f) => !(f.kind === 'miasma'));
  }
}

module.exports = { hitPoison, tickPoison, updatePoisonSticks, tryAttackDebuff, tickEnemyStatus };
