const Collision = require('../collision.js');
'use strict';
// Electric impacts and shared electromagnetic/paralysis hooks. No instance state is cached.
const SKILL_NUM = require('../../config/tower-skills.js');
const CONFIG = require('../../config.js');

function applyConductiveSlow(combat, enemy) {
  const level = combat.lv('electric', '导电');
  const branchC = combat.branchLv('electric', '导电', 'C');
  const balance = SKILL_NUM.electric['导电'];
  if (level <= 0 || branchC <= 0 || enemy.hp <= 0 || enemy.paralyzed <= 0) return;
  if (Math.random() < balance.branchCChance[branchC]) {
    combat.applySlow(enemy, balance.branchCSlow, balance.branchCSlowDuration);
    combat.fxParticle(enemy.x, enemy.y, '#fff2a8', 5, 36, 0.35, 120, 4);
  }
}

function hitElectric(combat, e, dmg, projectile = null) {
  combat.damage(e, dmg, 'electric');
  // v1.16.101 电涌1★/2★补齐 + 3★：普攻 20%/30% 概率额外产生一次小电弧（30% 伤害射向最近敌；3★ 小电弧命中 20% 概率填充 1 点能量）
  const surgeN = combat.game.run.relicNum('elec_surge');
  if (surgeN > 0 && Math.random() < surgeN / 100) {
    const mini = combat.enemies().filter((o) => o !== e && o.hp > 0)
      .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
    if (mini) {
      const miniDmg = dmg * 0.3;
      combat.damage(mini, miniDmg, 'electric');
      combat.tryAttackDebuff('electric', mini, miniDmg);
      combat.fxBeam(e.x, e.y, mini.x, mini.y, '#ffe08a', 0.2, 2.5);
      if (combat.game.run.relic3('elec_surge') && Math.random() < 0.2) {
        const et = combat.tower('electric');
        if (et) et.energy = Math.min(et.energy + 1, combat.game.run.armoryEnergyMax());
      }
    }
  }
  // v1.17.43 超压3★：电塔能量 ≥ 上限 80% 时，普攻额外电击另一名敌人（40% 伤害）
  if (combat.game.run.relic3('elec_overload')) {
    const et0 = combat.tower('electric');
    if (et0 && et0.energy >= combat.game.run.armoryEnergyMax() * 0.8) {
      const other = combat.enemies().filter((o) => o !== e && o.hp > 0)
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (other) {
        combat.damage(other, dmg * 0.4, 'electric');
        combat.fxBeam(e.x, e.y, other.x, other.y, '#f4d03f', 0.2, 3);
      }
    }
  }
  // 麻痹（v1.16.21 调平；v1.16.53 统一判定 + 重调）：电塔基础 20%；学麻痹 +20%（20→40）；A 每级 +15%（40→55→70→85%）；
  //   时长 2s + B 0.5s/级；目标减速 50% 并停止攻击；麻痹技能C负责传导；普攻强化攻击（连锁/活电）同吃此判定
  combat.tryAttackDebuff('electric', e, dmg);
  // 触电只检查导电追加攻击命中的麻痹敌人；基础普攻施加麻痹本身不触发C。
  const isConductiveAttack = !!(projectile && projectile.conductivityBonus);
  if (isConductiveAttack) applyConductiveSlow(combat, e);
  // 活电（v1.13.18 改电球，v1.13.19 更名）：命中麻痹中的敌人 → 向四周扩散 N 个随机游走电球（A 分支 +2/级；B 分支伤害 +20%/级；C 分支游走更久）
  const bounce = combat.lv('electric', '活电');
  if (bounce > 0 && e.paralyzed > 0) {
    const live = SKILL_NUM.electric['活电'];
    const n = live.count + live.countPerBranch * combat.branchLv('electric', '活电', 'A');
    const orbDmg = dmg * live.damage * (1 + live.damagePerBranch * combat.branchLv('electric', '活电', 'B'));
    const oDur = live.duration + live.durationPerBranch * combat.branchLv('electric', '活电', 'C');   // v1.13.21 游走时长 0.8→1.4s
    for (let i = 0; i < n; i++) {
      const orb = {
        key: 'electric', dmg: orbDmg, t: 0, dur: oDur,
        x: e.x, y: e.y,
        // v1.16.21 电球均匀向周围扩散：初始角度等分圆周（360°/n）+ 小幅抖动，不再扎堆生成方向
        ang: (Math.PI * 2 / n) * i + (Math.random() - 0.5) * live.angleJitter,
        // v1.16.21 电球速度 +30%：150-230 → 195-299
        speed: (live.minSpeed + Math.random() * live.randomSpeed) * live.speedMultiplier,   // v1.13.21 速度 95-155→150-230
        orb: true, fx: null,
      };
      orb.fx = { type: 'shot', kind: 'orb', ref: orb, t: 0, dur: oDur };
      combat.shots.push(orb);
      combat.game.fx.push(orb.fx);
    }
    combat.fxRing(e.x, e.y, '#f4d03f', 44, 0.3, 3);
  }
  // 连锁弹跳（v1.16.21 目标数调整：基础连锁 3 个敌人 + A 每级 +1；B 稳流每级衰减 -20%；C 回能：每次连锁命中缩短攻击间隔）
  const chainLv = combat.lv('electric', '连锁');
  const chainA = combat.branchLv('electric', '连锁', 'A');
  const chainB = combat.branchLv('electric', '连锁', 'B');
  const chainC = combat.branchLv('electric', '连锁', 'C');
  if (chainLv > 0) {
    const super3 = combat.game.run.relic3('elec_super');   // v1.16.101 超导3★：全部连锁类衰减归零 + 目标数 +1
    const extra = SKILL_NUM.electric['连锁'].extraTargets + SKILL_NUM.electric['连锁'].targetsPerBranch * chainA
      + (super3 ? 1 : 0) + combat.relicVal('elec_arc');   // 电弧1★/2★：攻击连锁 +2/+3
    let decay = SKILL_NUM.electric['连锁'].decay * (1 - SKILL_NUM.electric['连锁'].decayReductionPerBranch * chainB);   // 基础衰减 30% - B 稳流每级 20%
    decay = super3 ? 0 : Math.max(0.10, decay);
    // v1.16.101 传导3★：连锁衰减降为 0 时，每跳额外 +5% 伤害
    const conduit = combat.game.run.relic3('elec_conduit') && decay <= 0.11;
    const hitSet = [e];
    let cur = e;
    for (let i = 0; i < extra; i++) {
      const next = combat.enemies().filter((o) => o.hp > 0 && !hitSet.includes(o))
        .sort((a, b) => (Math.hypot(a.x - cur.x, a.y - cur.y)) - (Math.hypot(b.x - cur.x, b.y - cur.y)))[0];
      if (!next) break;
      // 连锁视觉：电弧连线（每次弹跳）
      combat.fxBeam(cur.x, cur.y, next.x, next.y, '#f4d03f', 0.25, 3.5);
      let cDmg = dmg * (1 - decay);
      // v1.16.101 电弧3★：连锁命中 3 人以上时，最后一跳伤害不衰减
      if (combat.game.run.relic3('elec_arc') && hitSet.length >= 3 && i === extra - 1) cDmg = dmg;
      if (conduit) cDmg *= (1 + 0.05 * (i + 1));
      combat.damage(next, cDmg, 'electric');
      combat.tryAttackDebuff('electric', next, cDmg);   // v1.16.53 连锁命中属普攻强化：统一麻痹判定（吃麻痹技能加成）
      if (isConductiveAttack) applyConductiveSlow(combat, next);
      // v1.16.101 闪电链增强3★：连锁每跳一次，该敌人受到的后续伤害 +5%（持续 3 秒）
      if (combat.game.run.relic3('elec_boost')) {
        next._elecBoost = { n: (next._elecBoost ? next._elecBoost.n : 0) + 1, ttl: 3 };
      }
      // C 回能：每次连锁命中缩短电塔攻击间隔（3%/级）
      if (chainC > 0 && combat.atkTimers.electric !== undefined) {
        combat.atkTimers.electric = Math.max(0, combat.atkTimers.electric - combat.interval('electric') * SKILL_NUM.electric['连锁'].cooldownRefundPerBranch * chainC);
      }
      hitSet.push(next);
      cur = next;
    }
    combat.fxRing(e.x, e.y, '#f4d03f', 40 + 12 * chainLv, 0.3, 3);
    combat.fxFlash(e.x, e.y, '#f4d03f');
  }

  // 导电：一次普通电击有概率追加一发普通电击；追加弹仍走完整命中与连锁流程，
  // 但用 projectile 标记阻止导电再次触发，避免递归连发。
  const conductionLv = combat.lv('electric', '导电');
  if (conductionLv > 0 && !(projectile && projectile.conductivityBonus)) {
    const branchA = combat.branchLv('electric', '导电', 'A');
    const balance = SKILL_NUM.electric['导电'];
    const chance = branchA > 0 ? balance.branchAChance[branchA] : balance.baseChance;
    const paralyzed = combat.enemies().filter((target) => target.hp > 0 && target.paralyzed > 0);
    if (paralyzed.length && Math.random() < chance) {
      const target = paralyzed.slice().sort((a, b) =>
        Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      const muzzle = combat.towerMuzzle('electric');
      const cfg = CONFIG.TOWERS.electric;
      const sx = muzzle.x, sy = muzzle.y, dur = cfg.shot.dur;
      const visual = { type: 'shot', kind: cfg.shot.kind, color: '#f4d03f', x: sx, y: sy,
        tx: target.x, ty: target.y, t: 0, dur, key: 'electric', target, scale: 0.8 };
      combat.addProjectile({ key: 'electric', target, dmg, t: 0, dur, sx, sy, conductivityBonus: true }, visual);
      combat.fxFlash(sx, sy, '#fff2a8', 0.18);

      if (combat.branchLv('electric', '导电', 'B') > 0) {
        const linked = paralyzed.filter((enemy) => enemy.hp > 0);
        const touched = new Set();
        for (let i = 0; i < linked.length; i++) {
          for (let j = i + 1; j < linked.length; j++) {
            combat.fxBeam(linked[i].x, linked[i].y, linked[j].x, linked[j].y, '#ffe66d', 0.3, 3);
            touched.add(linked[i]);
            touched.add(linked[j]);
          }
        }
        // 网络中的每名麻痹敌人只受一次伤害，避免多条连线让伤害随人数平方增长。
        for (const enemy of touched) combat.damage(enemy, dmg * balance.chainDamage, 'electric');
      }
    }
  }
}

function tryAttackDebuff(combat, o, dmg) {
  // 麻痹（v1.16.53）：基础 20%；学麻痹 +20%（20→40）；A 每级 +15%（40→55→70→85）；时长 2s + B 0.5s/级；
  //   C 传导：被麻痹时附近 100px 敌人 20%/30%/40% 概率被传导麻痹（1s）
  const paraLv = combat.lv('electric', '麻痹');
  const pA = combat.branchLv('electric', '麻痹', 'A');
  const pB = combat.branchLv('electric', '麻痹', 'B');
  const pC = combat.branchLv('electric', '麻痹', 'C');
  const pProb = Math.min(1, SKILL_NUM.electric['麻痹'].baseProbability + (paraLv > 0 ? SKILL_NUM.electric['麻痹'].learnedProbability : 0) + SKILL_NUM.electric['麻痹'].probabilityPerBranch * pA + combat.relicVal('elec_strong') / 100);   // v1.16.114 强麻1★/2★
  // v1.16.101 强麻3★：麻痹概率触顶（≥80%）时，多余判定转为麻痹时长 +0.5 秒
  const strong = combat.game.run.relic3('elec_strong') && pProb >= 0.8;
  if (strong ? Math.random() < 0.8 : Math.random() < pProb) {
    const dur = (SKILL_NUM.electric['麻痹'].duration + SKILL_NUM.electric['麻痹'].durationPerBranch * pB) * (1 + combat.relicVal('ur_frost_eye') / 100);   // v1.17.43 UR 霜风之眼：控制时长 +20%/+30%
    o.paralyzed = Math.max(o.paralyzed || 0, dur);
    combat.applySlow(o, SKILL_NUM.electric['麻痹'].slow, dur);
    combat.fxParticle(o.x, o.y, '#f4d03f', 8, 50, 0.4, 140, 5);
    // v1.17.43 疾电3★：电塔每麻痹 1 名敌人，自身攻速 +10%（持续 3 秒，最多叠 2 层，重复触发刷新时长）
    if (combat.game.run.relic3('elec_fast')) {
      const hs = combat.game.run._elecHaste || (combat.game.run._elecHaste = { n: 0, ttl: 0 });
      hs.n = Math.min(2, hs.n + 1);
      hs.ttl = 3;
    }
    if (pC > 0) {
      // v1.16.101 麻痹扩散3★：麻痹传导链最多 3 跳（原 1 跳），每跳概率衰减 5%
      const hopMax = combat.game.run.relic3('elec_spread') ? 3 : 1;
      const cProb0 = SKILL_NUM.electric['麻痹'].cond[pC];
      let prev = o;
      let chainProb = cProb0;
      for (let hop = 0; hop < hopMax; hop++) {
        const nexts = combat.enemies().filter((q) => q !== prev && q.hp > 0 && Math.hypot(q.x - prev.x, q.y - prev.y) <= SKILL_NUM.electric['麻痹'].spreadRadius);
        if (!nexts.length) break;
        if (Math.random() < chainProb) {
          const q = nexts[Math.floor(Math.random() * nexts.length)];
          q.paralyzed = Math.max(q.paralyzed || 0, SKILL_NUM.electric['麻痹'].spreadDuration);
          combat.applySlow(q, SKILL_NUM.electric['麻痹'].spreadSlow, SKILL_NUM.electric['麻痹'].spreadDuration);
          combat.fxParticle(q.x, q.y, '#f4d03f', 4, 30, 0.35, 110, 4);
          combat.fxBeam(prev.x, prev.y, q.x, q.y, '#ffe08a', 0.25, 2.5);
          prev = q;
          chainProb -= SKILL_NUM.electric['麻痹'].spreadDecay;
        } else break;
      }
    }
  } else if (strong) {
    // 强麻：失败判定转为麻痹时长 +0.5 秒（仍能短暂麻痹）
    o.paralyzed = Math.max(o.paralyzed || 0, 0.5);
    combat.applySlow(o, 0.5, 0.5);
    combat.fxParticle(o.x, o.y, '#f4d03f', 4, 30, 0.3, 100, 4);
  }
}

function tickElectric(combat, dt) {
  const g = combat.game;
  const arcBalance = SKILL_NUM.electric['极光电击'];
  // 球形闪电：每12秒生成3球，漂移6秒；每秒对60px范围内全体敌人造成伤害，C提升移动速度。
  const ballLv = combat.lv('electric', '球形闪电');
  if (ballLv > 0) {
    const bal = SKILL_NUM.electric['球形闪电'];
    combat.timers.ballLightning = (combat.timers.ballLightning || 0) + dt;
    if (combat.timers.ballLightning >= bal.period * combat._weakPeriod('electric')) {
      combat.timers.ballLightning = 0;
      combat.castEnergy('electric', '球形闪电');
      const aLv = combat.branchLv('electric', '球形闪电', 'A');
      const bLv = combat.branchLv('electric', '球形闪电', 'B');
      const cLv = combat.branchLv('electric', '球形闪电', 'C');
      const count = bal.count + bal.countPerBranch[aLv] + combat.relicVal('elec_magnet');   // v1.17.43 磁场1★/2★：雷球 +1/+2
      const y0 = g.ly ? g.ly.areaY + g.ly.entryH + 35 : 220;
      const y1 = g.ly ? g.ly.wallY - 35 : 1200;
      const x0 = g.ly ? g.ly.areaX + 28 : 28;
      const x1 = g.ly ? g.ly.areaX + g.ly.areaW - 28 : 722;
      const dmg = combat.shotDmg('electric', false, true) * (bal.damage + bal.damagePerBranch[bLv]);
      const foes = combat.enemies().filter((e) => e.hp > 0);
      for (let i = 0; i < count; i++) {
        // v1.17.52 生成在随机存活怪旁边（雷球锁定该怪附近开场，便于立即脉冲命中）；场上无怪时退回行动区随机
        let bx, by;
        if (foes.length) {
          const t = foes[Math.floor(Math.random() * foes.length)];
          bx = t.x + (Math.random() - 0.5) * 120;
          by = t.y + (Math.random() - 0.5) * 120;
        } else {
          bx = x0 + Math.random() * Math.max(1, x1 - x0);
          by = y0 + Math.random() * Math.max(1, y1 - y0);
        }
        const orb = {
          key: 'electric', orb: true, ballLightning: true, dmg, trailDmg: bal.trailDamage,
          t: 0, dur: bal.duration, x: bx, y: by,
          ang: Math.random() * Math.PI * 2, speed: cLv > 0 ? bal.speedPerBranch[cLv] : bal.moveSpeed,
          damageTimer: 0, trailCooldowns: new Map(), trail: [], trailDistance: 0,
          damageRadius: bal.damageRadius, damageInterval: bal.damageInterval, trailRadius: bal.trailRadius,
          trailDuration: bal.trailDuration, trailStep: bal.trailStep, trailHitInterval: bal.trailHitInterval,
          paralysisDuration: bal.paralysisDuration + SKILL_NUM.electric['麻痹'].durationPerBranch * combat.branchLv('electric', '麻痹', 'B'),
          paralysisSlow: bal.paralysisSlow, bounds: { x0, x1, y0, y1 },
        };
        orb.fx = { type: 'shot', kind: 'orb', ref: orb, t: 0, dur: bal.duration + bal.trailDuration, ballLightning: true };
        combat.shots.push(orb);
        g.fx.push(orb.fx);
      }
    }
  }
  // 极光电击：每8秒电击最近敌人，并命中其(100+20×A)码内所有敌人；
  //   A扩域 +20/级，B主电弧伤害 +20%/级，C极电：命中目标麻痹并减速50%，持续1/2/3秒。
  const arc = combat.lv('electric', '极光电击');
  if (arc > 0) {
    const arcA = combat.branchLv('electric', '极光电击', 'A');
    const arcB = combat.branchLv('electric', '极光电击', 'B');
    const arcC = combat.branchLv('electric', '极光电击', 'C');
    combat.timers.arc = (combat.timers.arc || 0) + dt;
    const period = arcBalance.period * combat._weakPeriod('electric');   // v1.16.42 周期固定 8 秒（弱化态 ×1.5）
    if (combat.timers.arc >= period) {
      combat.timers.arc = 0;
      combat.castEnergy('electric', '极光电击');
      // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
      const mz = combat.towerMuzzle('electric');
      const tx = mz.x, ty = mz.y;
      const range = combat.range('electric');
      const alive = combat.enemies().filter((e) => e.hp > 0 && Math.abs(ty - e.y) <= range);
      if (alive.length) {
        // 最近的敌人（行距离最小）为电击目标（v1.16.51：不再沿延长线穿透，仅此一目标受主线伤害）
        const nearest = alive.slice().sort((a, b) => Math.abs(ty - a.y) - Math.abs(ty - b.y))[0];
        const dmg = combat.shotDmg('electric', false, true) * (arcBalance.damage + arcBalance.damagePerBranch * arcB);
        const x1 = tx, y1 = ty, x2 = nearest.x, y2 = nearest.y;
        combat.damage(nearest, dmg, 'electric', undefined, '极光电击');   // v1.17.50 标注
        combat.fxFlash(nearest.x, nearest.y, '#f4d03f');
        const cDuration = arcBalance.paralysisDuration[arcC];
        const applyArcStatus = (enemy) => {
          if (cDuration <= 0) return;
          enemy.paralyzed = Math.max(enemy.paralyzed || 0, cDuration);
          combat.applySlow(enemy, arcBalance.paralysisSlow, cDuration);
          combat.fxParticle(enemy.x, enemy.y, '#f4d03f', 5, 36, 0.35, 115, 4);
        };
        applyArcStatus(nearest);
        // 分叉电弧命中最近目标周围范围内的全部存活敌人，不再限制目标数。
        const hitSet = new Set([nearest]);
        const branchRange = arcBalance.branchRadius + arcBalance.radiusPerBranch * arcA;
        const branchTargets = combat.enemies()
          .filter((o) => o.hp > 0 && o !== nearest && Math.hypot(o.x - nearest.x, o.y - nearest.y) <= branchRange)
          .sort((a, b) => Math.hypot(a.x - nearest.x, a.y - nearest.y) - Math.hypot(b.x - nearest.x, b.y - nearest.y));
        // 电链3★：分叉目标可再分叉一次（各20%主伤害）。
        const reFork = combat.game.run.relic3('elec_chain');
        for (const tgt of branchTargets) {
          hitSet.add(tgt);
          combat.damage(tgt, dmg * arcBalance.branchDamage, 'electric', undefined, '极光电击');   // v1.17.50 标注
          applyArcStatus(tgt);
          combat.fxFlash(tgt.x, tgt.y, '#7fc7ff');
          const cpath = [
            { x: nearest.x, y: nearest.y },
            { x: nearest.x + (tgt.x - nearest.x) * 0.5 + (Math.random() * 26 - 13), y: nearest.y + (tgt.y - nearest.y) * 0.5 + (Math.random() * 26 - 13) },
            { x: tgt.x, y: tgt.y },
          ];
          combat.game.fx.push({ type: 'shot', kind: 'zigzag', path: cpath, t: 0, dur: 0.3, color: '#7fc7ff', w: 2.5 });
          // 电链：每个分叉目标再分叉 1 次（各 20% 主线伤害）
          if (reFork) {
            const sub = combat.enemies().filter((o) => o.hp > 0 && !hitSet.has(o) && Math.hypot(o.x - tgt.x, o.y - tgt.y) <= branchRange)
              .sort((a, b) => Math.hypot(a.x - tgt.x, a.y - tgt.y) - Math.hypot(b.x - tgt.x, b.y - tgt.y))[0];
            if (sub) {
              hitSet.add(sub);
              combat.damage(sub, dmg * 0.2, 'electric', undefined, '极光电击');   // v1.17.50 标注
              applyArcStatus(sub);
              combat.fxFlash(sub.x, sub.y, '#aed6f1');
              combat.fxBeam(tgt.x, tgt.y, sub.x, sub.y, '#aed6f1', 0.25, 2);
            }
          }
        }
        // 视觉：塔口 → 最近敌人 金色主弧（v1.16.47 强化粗电弧+光晕；v1.16.49 0.6s）
        const path = [{ x: x1, y: y1 }];
        for (let s = 1; s < 4; s++) {
          const t = s / 4;
          path.push({ x: x1 + (x2 - x1) * t + (Math.random() * 30 - 15), y: y1 + (y2 - y1) * t + (Math.random() * 30 - 15) });
        }
        path.push({ x: x2, y: y2 });
        combat.game.fx.push({ type: 'shot', kind: 'zigzag', path, t: 0, dur: 0.6, color: '#ffe08a', w: 5, glow: true });
        combat.fxFlash(tx, ty, '#f4d03f');
        combat.fxRing(x2, y2, '#f4d03f', 30, 0.3, 3);
        combat.fxParticle(nearest.x, nearest.y, '#f4d03f', 6, 50, 0.45, 120, 5);
      }
    }
  }
  const stormBalance = SKILL_NUM.electric['雷暴'];
  const storm = combat.lv('electric', '雷暴');
  if (storm > 0) {
    // 雷暴分支：A 增加雷击目标；B 高压按 30%/50%/70% 概率麻痹本次雷击目标；C 缩短施放间隔。
    const cLv = combat.branchLv('electric', '雷暴', 'C');
    const period = (stormBalance.period - stormBalance.periodReductionPerBranch * cLv) * combat._weakPeriod('electric');   // C0 10 / C1 9 / C2 8 / C3 7s（弱化态 ×1.5）
    combat.timers.storm = (combat.timers.storm || 0) + dt;
    if (combat.timers.storm >= period) {
      combat.timers.storm = 0;
      combat.castEnergy('electric', '雷暴');
      const aLv = combat.branchLv('electric', '雷暴', 'A');
      const bLv = combat.branchLv('electric', '雷暴', 'B');
      const n = stormBalance.targetCount + stormBalance.targetsPerBranch * aLv;   // A0 3 / A1 5 / A2 7 / A3 9（与 A +2/级 口径一致）
      const dmg = combat.shotDmg('electric', false, true) * stormBalance.damage * (1 + stormBalance.damagePerLevel * (storm - 1));
      // 全图随机 N 个存活目标（Fisher-Yates）
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('electric', e.x, e.y));
      const pool = alive.slice();
      // v1.16.101 雷域3★：雷暴优先命中血量最高的敌人
      if (combat.game.run.relic3('elec_domain')) {
        pool.sort((a, b) => b.hp - a.hp);
      } else {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
      }
      const targets = pool.slice(0, n);
      // 按 y 从上到下分 2-3 批，每批间隔 0.12s（落雷演出分批）
      const sorted = targets.slice().sort((a, b) => a.y - b.y);
      const batches = Math.min(3, Math.max(2, Math.ceil(n / 3)));
      sorted.forEach((e, idx) => {
        const delay = Math.floor(idx * batches / n) * 0.12;
        // 雷击伤害（即时结算）
        combat.damage(e, dmg, 'electric', undefined, '雷暴');   // v1.17.50 标注
        // v1.16.101 雷霆3★：雷暴击中麻痹的敌人时，将其麻痹向 90 码内 2 名敌人传导（各 1 秒）
        if (combat.game.run.relic3('elec_storm') && e.paralyzed > 0) {
          const spread2 = combat.enemies().filter((o) => o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= stormBalance.chainRadius)
            .sort((a2, b2) => Math.hypot(a2.x - e.x, a2.y - e.y) - Math.hypot(b2.x - e.x, b2.y - e.y)).slice(0, 2);
          spread2.forEach((o) => {
            o.paralyzed = Math.max(o.paralyzed || 0, 1);
            combat.applySlow(o, 0.5, 1);
            combat.fxBeam(e.x, e.y, o.x, o.y, '#ffe08a', 0.25, 2.5);
            combat.fxParticle(o.x, o.y, '#f4d03f', 4, 30, 0.35, 110, 4);
          });
        }
        // B 高压：每个被雷暴直接击中的目标独立判定麻痹。
        if (bLv > 0 && Math.random() < stormBalance.paralysisChance[bLv]) {
          const paralysis = SKILL_NUM.electric['麻痹'];
          const duration = paralysis.duration + paralysis.durationPerBranch * combat.branchLv('electric', '麻痹', 'B');
          e.paralyzed = Math.max(e.paralyzed || 0, duration);
          combat.applySlow(e, paralysis.slow, duration);
          combat.fxBeam(combat.towerMuzzle('electric').x, combat.towerMuzzle('electric').y, e.x, e.y, '#7fc7ff', 0.25, 3.5);
          combat.fxFlash(e.x, e.y, '#7fc7ff');
          combat.fxParticle(e.x, e.y, '#b9e8ff', 6, 42, 0.4, 125, 4);
        }
        // 雷暴演出：预兆圈 0.22s → 主闪分叉 → 地面电花（按批 delay 错开）
        combat.game.fx.push({ type: 'shot', kind: 'storm', x: e.x, y: e.y, t: 0, dur: delay + 0.55, delay, seed: Math.floor(Math.random() * 9999) });
        combat.fxParticle(e.x, e.y, '#f4d03f', 6, 40, 0.35, 140, 5);
        combat.fxRing(e.x, e.y, '#f4d03f', 26, 0.35, 3);
      });
    }
  }
}

function stepOrb(combat, s, dt) {
  if (s.ballLightning) return stepBallLightning(combat, s, dt);
  // v1.16.21 游走电球（活电扩散）：每帧随机转向漂移（转向幅度加大 ±1.6 rad，配合等分初角更像四周扩散），命中 34px 内敌人即结算消失，dur 耗尽消散
  s.ang += (Math.random() - 0.5) * SKILL_NUM.electric['活电'].turnJitter;
  s.x += Math.cos(s.ang) * s.speed * dt;
  s.y += Math.sin(s.ang) * s.speed * dt;
  const hitE = combat.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < Collision.reach(o, SKILL_NUM.electric['活电'].hitRadius));
  if (hitE) {
    if (s.fx) s.fx.t = s.fx.dur;
    combat.damage(hitE, s.dmg, 'electric');
    combat.tryAttackDebuff('electric', hitE, s.dmg);   // v1.16.53 活电电球属普攻强化：统一麻痹判定（吃麻痹技能加成）
    // v1.16.101 电球3★：电球游走路径留电痕 1 秒，触碰敌人受 10% 伤害
    if (combat.game.run.relic3('elec_orb')) {
      combat.groundDots = combat.groundDots || [];
      combat.groundDots.push({ x: hitE.x, y: hitE.y, r: 50, ttl: 1, dps: combat.shotDmg('electric', false, true) * 0.1, key: 'electric' });
      combat.fxRing(hitE.x, hitE.y, '#f4d03f', 50, 0.4, 3);
    }
    combat.fxFlash(hitE.x, hitE.y, '#f4d03f');
    combat.fxParticle(hitE.x, hitE.y, '#f4d03f', 5, 30, 0.3, 120, 4);
    return false;
  }
  return s.t < s.dur;
}

function stepBallLightning(combat, s, dt) {
  const bal = SKILL_NUM.electric['球形闪电'];
  const alive = s.t < s.dur;
  for (const [enemy, ttl] of s.trailCooldowns) {
    if (!enemy || enemy.hp <= 0 || ttl <= dt) s.trailCooldowns.delete(enemy);
    else s.trailCooldowns.set(enemy, ttl - dt);
  }
  if (alive) {
    const oldX = s.x, oldY = s.y;
    s.ang += (Math.random() - 0.5) * 1.5 * dt;
    s.x += Math.cos(s.ang) * s.speed * dt;
    s.y += Math.sin(s.ang) * s.speed * dt;
    const b = s.bounds;
    if (s.x < b.x0 || s.x > b.x1) { s.ang = Math.PI - s.ang; s.x = Math.max(b.x0, Math.min(b.x1, s.x)); }
    if (s.y < b.y0 || s.y > b.y1) { s.ang = -s.ang; s.y = Math.max(b.y0, Math.min(b.y1, s.y)); }
    let dx = s.x - oldX, dy = s.y - oldY;
    let moved = Math.hypot(dx, dy);
    while (moved > 0 && s.trailDistance + moved >= s.trailStep) {
      const take = s.trailStep - s.trailDistance;
      const ratio = take / moved;
      s.trail.push({ x: oldX + dx * ratio, y: oldY + dy * ratio, age: 0 });
      oldX += dx * ratio; oldY += dy * ratio;
      dx = s.x - oldX; dy = s.y - oldY; moved = Math.hypot(dx, dy); s.trailDistance = 0;
    }
    s.trailDistance += moved;
    // 雷球每秒脉冲一次：脉冲瞬间对半径 60px 内所有敌人分别结算，而非只命中最近的单体。
    s.damageTimer += dt;
    while (s.damageTimer >= s.damageInterval) {
      s.damageTimer -= s.damageInterval;
      const targets = combat.enemies().filter((e) => e.hp > 0 && Math.hypot(e.x - s.x, e.y - s.y) <= s.damageRadius);
      if (targets.length) {
        combat.fxRing(s.x, s.y, '#8feaff', s.damageRadius, 0.24, 3);
        targets.forEach((enemy) => {
          combat.damage(enemy, s.dmg, 'electric', undefined, '球形闪电');   // v1.17.50 标注
          enemy.paralyzed = Math.max(enemy.paralyzed || 0, s.paralysisDuration);
          combat.applySlow(enemy, s.paralysisSlow, s.paralysisDuration);
          // 雷球到目标的瞬时电弧 + 命中闪光，让每次范围脉冲都能看见伤害反馈。
          combat.fxBeam(s.x, s.y, enemy.x, enemy.y, '#fff2a8', 0.18, 3.5);
          combat.fxFlash(enemy.x, enemy.y, '#ffe978', 0.2);
          combat.fxRing(enemy.x, enemy.y, '#f5d54a', 24, 0.24, 2.5);
          combat.fxParticle(enemy.x, enemy.y, '#c8f8ff', 7, 42, 0.32, 135, 4);
        });
      }
    }
    for (const e of combat.enemies()) {
      if (e.hp <= 0 || (s.trailCooldowns.get(e) || 0) > 0) continue;
      const onTrail = s.trail.some((p) => Math.hypot(e.x - p.x, e.y - p.y) <= s.trailRadius);
      if (!onTrail) continue;
      combat.damage(e, combat.shotDmg('electric', false, true) * s.trailDmg, 'electric', undefined, '球形闪电');   // v1.17.50 电痕归球形闪电
      s.trailCooldowns.set(e, s.trailHitInterval);
    }
  }
  for (let i = s.trail.length - 1; i >= 0; i--) {
    s.trail[i].age += dt;
    if (s.trail[i].age >= s.trailDuration) s.trail.splice(i, 1);
  }
  if (!alive && !s._magnetBurstDone && combat.game.run.relic3('elec_magnet')) {
    s._magnetBurstDone = true;
    combat.explode(s.x, s.y, 80, combat.shotDmg('electric', false, true) * 0.6, 'electric', undefined, undefined, undefined, '球形闪电');   // v1.17.50 磁爆3★归球形闪电
    combat.fxRing(s.x, s.y, '#ffe978', 80, 0.42, 4);
  }
  return alive || s.trail.length > 0;
}

module.exports = { tickElectric, hitElectric, tryAttackDebuff, stepOrb };
