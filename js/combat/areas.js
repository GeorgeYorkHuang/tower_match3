'use strict';
// Shared delayed impacts and ground fields operate on caller-owned queues.

function updateDelayed(combat, dt) {
  for (let i = combat.delayed.length - 1; i >= 0; i--) {
    const d = combat.delayed[i];
    d.t += dt;
    if (d.t >= d.delay) {
      combat.delayed.splice(i, 1);
      if (d.fn) { d.fn(combat); continue; }   // v1.16.9 自定义延迟回调（冰花第 3 帧末结算）
      combat.explode(d.x, d.y, d.r, d.dmg, d.key, d.knock, d.slowAfter, undefined, d.skill);   // v1.17.50 透传 skill（炮火支援归炮塔）
      // v1.16.103 空袭3★：炮火支援落点 20% 概率二次轰炸（40% 伤害）
      if (d.key === 'cannon' && combat.game.run.relic3('can_airstrike') && Math.random() < 0.2) {
        combat.explode(d.x + (Math.random() - 0.5) * 40, d.y + (Math.random() - 0.5) * 40, d.r * 0.7, d.dmg * 0.4, 'cannon', undefined, undefined, undefined, d.skill);   // v1.17.50 标注
      }
      // 炮火支援 C 焦土：落点留燃烧地面 2s（每秒 30% 伤害）
      if (d.ember > 0) {
        combat.groundDots = combat.groundDots || [];
        combat.groundDots.push({ x: d.x, y: d.y, r: d.r * 0.6, ttl: 2, dps: combat.shotDmg('cannon', true) * 0.24 * d.ember, key: 'fire', skill: d.skill });   // v1.17.50 skill 优先归炮塔（key 仅渲染用）
      }
    }
  }
}

function updateGroundDots(combat, dt) {
  if (!combat.groundDots || !combat.groundDots.length) return;
  for (let i = combat.groundDots.length - 1; i >= 0; i--) {
    const gd = combat.groundDots[i];
    const activeDt = Math.min(dt, Math.max(0, gd.ttl));
    gd.ttl -= dt;
    // Poison field damage and stack/energy ticks use separate field-level clocks.
    // Advance them once per field, never once per enemy in the area.
    let poisonDamageTicks = 0;
    if (gd.key === 'poison' && gd.dps) {
      const interval = gd.damageInterval || 1;
      gd._poisonDamageT = (gd._poisonDamageT || 0) + activeDt;
      while (gd._poisonDamageT >= interval - 1e-8) {
        gd._poisonDamageT = Math.max(0, gd._poisonDamageT - interval);
        poisonDamageTicks++;
      }
    }
    let poisonStackTicks = 0;
    if (gd.key === 'poison' && (gd.stackPerSec || combat.game.run.relic3('poison_cloud'))) {
      gd._poisonStackT = (gd._poisonStackT || 0) + activeDt;
      while (gd._poisonStackT >= 1 - 1e-8) {
        gd._poisonStackT = Math.max(0, gd._poisonStackT - 1);
        poisonStackTicks++;
      }
    }
    const ringTimers = gd.ring ? (gd._ringTimers || (gd._ringTimers = new Map())) : null;
    const ringActive = ringTimers ? new Set() : null;
    combat.enemies().forEach((o) => {
      if (o.hp <= 0) return;
      const dist = Math.hypot(o.x - gd.x, o.y - gd.y);
      if (dist > gd.r) {
        // v1.16.100 腐沼3★：毒池边缘生成毒雾环，进出敌人各叠 1 层毒
        if (gd.ring && dist <= gd.r * 1.1) {
          ringActive.add(o);
          let ringT = (ringTimers.get(o) || 0) + activeDt;
          while (ringT >= 1) {
            ringT -= 1;
            combat.applyPoison(o, combat.shotDmg('poison', true), 'poison', 1);
            combat.fxParticle(o.x, o.y, '#7ee2a8', 2, 20, 0.4, 70, 3);
          }
          ringTimers.set(o, ringT);
        } else if (ringTimers) {
          ringTimers.delete(o);
        }
        return;
      }
      if (ringTimers) ringTimers.delete(o);
      if (gd.dps) {
        if (gd.key === 'poison') {
          if (poisonDamageTicks > 0) combat.damage(o, gd.dps * (gd.damageInterval || 1) * poisonDamageTicks, 'poison', undefined, gd.skill);   // v1.17.50 透传 skill
        } else {
          combat.damage(o, gd.dps * activeDt, gd.key || 'fire', undefined, gd.skill);   // v1.17.50 透传 skill（火柱余烬/碎裂弹灼地/炮火焦土按 skill 归塔）
        }
      }
      // v1.16.42 毒沼：泥沼减速（与毒池区分——毒沼纯叠毒 + 减速，无直伤）
      if (gd.swamp && gd.slow) combat.applySlow(o, gd.slow, 1);
      if (gd.key === 'poison' && gd.stackPerSec) {
        if (poisonStackTicks > 0) combat.applyPoison(o, combat.shotDmg('poison', true), 'poison', gd.stackPerSec * poisonStackTicks);
        // v1.16.100 毒云3★：毒池上的敌人每秒丢失 1 点能量（对 Boss 无效；敌人无能量系统时挂点保留）
        if (poisonStackTicks > 0 && combat.game.run.relic3('poison_cloud') && !gd.swamp && !o.isBoss && o.energy > 0) {
          o.energy = Math.max(0, o.energy - poisonStackTicks);
        }
      }
    });
    if (ringTimers) {
      for (const enemy of ringTimers.keys()) if (!ringActive.has(enemy)) ringTimers.delete(enemy);
    }
    if (gd.ttl <= 0) { combat.groundDots.splice(i, 1); continue; }
    if (gd.key === 'poison') {
      if (gd.swamp) {
        // v1.16.42 毒沼视觉粒子：暗褐绿泥沼气泡（与毒池的亮绿液区分）
        if (Math.random() < 0.5) {
          combat.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#6e8b3d', 2, 16, 0.5, 50, 4);
        }
      } else if (Math.random() < 0.3) {
        combat.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#52be80', 2, 18, 0.5, 60, 4);
      }
    } else if (Math.random() < 0.3) {
      combat.fxParticle(gd.x + (Math.random() * gd.r * 2 - gd.r), gd.y + (Math.random() * gd.r * 2 - gd.r), '#ff7043', 2, 20, 0.4, 60, 4);
    }
  }
}

module.exports = { updateDelayed, updateGroundDots };
