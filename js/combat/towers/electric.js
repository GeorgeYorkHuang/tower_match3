const Collision = require('../collision.js');
'use strict';
// Electric impacts and shared electromagnetic/paralysis hooks. No instance state is cached.
const SKILL_NUM = require('../../config/tower-skills.js');

function hitElectric(combat, e, dmg) {
  // v1.16.101 过载3★：满层过载时下一发普攻必为双倍伤害（满层置标，本发消费）
  const ovDbl = e._ovDbl;
  e._ovDbl = false;
  // 主目标伤害（过载层数为上一击累计，连续命中递增）
  combat.damage(e, ovDbl ? dmg * 2 : dmg, 'electric');
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
  // 过载（v1.16.21 重做）：仅命中麻痹目标叠层（上限 3 层·2s）；A 每 3 层消耗所有过载 → 20%/30%/40% 伤害 + 填充 1 发炮弹；C 满层闪电爆发（不变）
  const overBalance = SKILL_NUM.electric['过载'];
  const over = combat.lv('electric', '过载');
  if (over > 0) {
    if (e.paralyzed > 0) {
      if (!e.overload) e.overload = { n: 0, ttl: overBalance.duration };
      const ovCap = overBalance.stackCap + combat.relicVal('elec_overload');   // v1.16.114 过载1★/2★：充能层数上限 +2/+3
      e.overload.n = Math.min(ovCap, e.overload.n + 1);
      e.overload.ttl = overBalance.duration;
      // v1.16.101 过载3★：满层过载时标记下一发普攻必为双倍伤害（满层=当前上限）
      if (combat.game.run.relic3('elec_overload') && e.overload.n >= ovCap) e._ovDbl = true;
      // C 分支：满层闪电爆发（每层周期只触发一次，层数清零后重新可触发）
      if (combat.branchLv('electric', '过载', 'C') > 0 && e.overload.n >= overBalance.triggerStacks && !e.overload._burst) {
        e.overload._burst = true;
        const bDmg = combat.shotDmg('electric') * overBalance.burstDamage;
        const r = overBalance.burstRadius;
        combat.enemies().forEach((o) => {
          if (o.hp <= 0 || Math.hypot(o.x - e.x, o.y - e.y) > r) return;
          combat.damage(o, bDmg, 'electric');
          o.paralyzed = Math.max(o.paralyzed || 0, overBalance.paralysisDuration);
          combat.applySlow(o, overBalance.burstSlow, overBalance.paralysisDuration);
          combat.fxFlash(o.x, o.y, '#f4d03f');
        });
        combat.fxRing(e.x, e.y, '#f4d03f', r, 0.4, 4);
      }
      // A 分支：每 3 层消耗所有过载 → 20%/30%/40% 伤害 + 填充 1 点能量（封顶能量上限）
      const ovA = combat.branchLv('electric', '过载', 'A');
      if (ovA > 0 && e.overload.n >= overBalance.triggerStacks) {
        combat.damage(e, combat.shotDmg('electric') * SKILL_NUM.electric['过载'].deton[ovA], 'electric');
        combat.fxFlash(e.x, e.y, '#f4d03f');
        combat.fxRing(e.x, e.y, '#f4d03f', 40, 0.3, 3);
        const maxA = combat.game.run.armoryEnergyMax ? combat.game.run.armoryEnergyMax() : 50;
        const et = combat.tower('electric');
        if (et) et.energy = Math.min(maxA, et.energy + 1);
        e.overload.n = 0;   // 消耗所有过载
      }
    }
  }
  // 麻痹（v1.16.21 调平；v1.16.53 统一判定 + 重调）：电塔基础 20%；学麻痹 +20%（20→40）；A 每级 +15%（40→55→70→85%）；
  //   时长 2s + B 0.5s/级；目标减速 50% 并停止攻击；C 导电传导；普攻强化攻击（连锁/活电/电磁场）同吃此判定
  combat.tryAttackDebuff('electric', e, dmg);
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
    const extra = (SKILL_NUM.electric['连锁'].extraTargets + SKILL_NUM.electric['连锁'].targetsPerBranch * chainA + (super3 ? 1 : 0)) + combat.relicVal('elec_arc')   // v1.16.114 电弧1★/2★：攻击连锁 +2/+3
      + (combat.game.run.relic3('elec_light') && (combat.tower('electric')._chargeLayers || 0) > 0 ? 1 : 0);   // 电光3★：攻速加成期间连锁数量 +1
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
}

function tryAttackDebuff(combat, o, dmg) {
  // 麻痹（v1.16.53）：基础 20%；学麻痹 +20%（20→40）；A 每级 +15%（40→55→70→85）；时长 2s + B 0.5s/级；
  //   C 导电：被麻痹时附近 100px 敌人 20%/30%/40% 概率被传导麻痹（1s）
  const paraLv = combat.lv('electric', '麻痹');
  const pA = combat.branchLv('electric', '麻痹', 'A');
  const pB = combat.branchLv('electric', '麻痹', 'B');
  const pC = combat.branchLv('electric', '麻痹', 'C');
  const pProb = Math.min(1, SKILL_NUM.electric['麻痹'].baseProbability + (paraLv > 0 ? SKILL_NUM.electric['麻痹'].learnedProbability : 0) + SKILL_NUM.electric['麻痹'].probabilityPerBranch * pA + combat.relicVal('elec_strong') / 100);   // v1.16.114 强麻1★/2★
  // v1.16.101 强麻3★：麻痹概率触顶（≥80%）时，多余判定转为麻痹时长 +0.5 秒
  const strong = combat.game.run.relic3('elec_strong') && pProb >= 0.8;
  if (strong ? Math.random() < 0.8 : Math.random() < pProb) {
    const dur = SKILL_NUM.electric['麻痹'].duration + SKILL_NUM.electric['麻痹'].durationPerBranch * pB;
    o.paralyzed = Math.max(o.paralyzed || 0, dur);
    combat.applySlow(o, SKILL_NUM.electric['麻痹'].slow, dur);
    combat.fxParticle(o.x, o.y, '#f4d03f', 8, 50, 0.4, 140, 5);
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

function onAnyTowerHit(combat, e) {
  // 电磁场（v1.13.22 分支补全）：任意塔命中概率触发微型连锁——A 激磁 +10%/级、B 强磁伤害 +30%/级、C 扩磁目标 +1/级
  const emBalance = SKILL_NUM.electric['电磁场'];
  const em = combat.lv('electric', '电磁场');
  if (em > 0) {
    const emA = combat.branchLv('electric', '电磁场', 'A');
    const emB = combat.branchLv('electric', '电磁场', 'B');
    const emC = combat.branchLv('electric', '电磁场', 'C');
    if (Math.random() < emBalance.probability + emBalance.probabilityPerLevel * (em - 1) + emBalance.probabilityPerBranch * emA) {
      const cands = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.x - e.x) < emBalance.radius && Math.abs(o.y - e.y) < emBalance.radius);
      const emDmg = combat.shotDmg('electric') * emBalance.damage * (1 + emBalance.damagePerLevel * (em - 1)) * (1 + emBalance.damagePerBranch * emB);
      // v1.16.101 超导3★：全部连锁类效果目标数 +1
      const n = emBalance.targets + emC + (combat.game.run.relic3('elec_super') ? 1 : 0);   // C 扩磁：目标 +1/级
      for (let i = 0; i < n && cands.length; i++) {
        const pick = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
        combat.damage(pick, emDmg, 'electric');
        combat.tryAttackDebuff('electric', pick, emDmg);   // v1.16.53 电磁场微型连锁属普攻强化：同样判定麻痹（吃麻痹技能加成）
        combat.fxFlash(pick.x, pick.y, '#f4d03f');
        // v1.16.101 磁力3★：电磁场的微型连锁命中敌人后，向其 90 码内最多 2 名敌人跳跃（每跳 40% 伤害，可正常触发麻痹判定）
        if (combat.game.run.relic3('elec_magnet')) {
          const hop2 = combat.enemies().filter((o) => o !== pick && o !== e && o.hp > 0 && Math.hypot(o.x - pick.x, o.y - pick.y) <= 90)
            .sort((a2, b2) => Math.hypot(a2.x - pick.x, a2.y - pick.y) - Math.hypot(b2.x - pick.x, b2.y - pick.y)).slice(0, 2);
          hop2.forEach((o) => {
            combat.damage(o, emDmg * 0.4, 'electric');
            combat.tryAttackDebuff('electric', o, emDmg * 0.4);
            combat.fxBeam(pick.x, pick.y, o.x, o.y, '#f4d03f', 0.25, 2);
            combat.fxFlash(o.x, o.y, '#f4d03f');
          });
        }
      }
      combat.fxRing(e.x, e.y, '#f4d03f', 110, 0.3, 3);
    }
  }

}

function tickElectric(combat, dt) {
  const g = combat.game;
  const arcBalance = SKILL_NUM.electric['极光电击'];
  // v1.16.101 快充3★：过载脉冲窗口递减（interval 读取 run._elecPulseTtl）
  if (g.run._elecPulseTtl > 0) g.run._elecPulseTtl -= dt;
  // 电·极光电击（v1.16.21 电弧重做改名；v1.16.42 修复性调整；v1.16.49 树状分支；v1.16.50 C 裂电；
  //   v1.16.51 基础重做）：每 8 秒电击最近敌人（不再穿透延长线），并向 (100+20×A) 码内分叉电弧命中 3+arcC 个敌人
  //   （各造成主线伤害 40%）；A 扩域：分叉寻敌范围 +20/级（100→120→140→160）；
  //   B 增伤 +20%/级（80→100/120/140%）；C 裂电：分叉命中数量 +1/级（3→4→5→6）
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
        const dmg = combat.shotDmg('electric') * (arcBalance.damage + arcBalance.damagePerBranch * arcB);
        const x1 = tx, y1 = ty, x2 = nearest.x, y2 = nearest.y;
        combat.damage(nearest, dmg, 'electric');
        combat.fxFlash(nearest.x, nearest.y, '#f4d03f');
        // v1.16.51 分叉电弧：从最近敌向 (100+20×A) 码内分叉 3+arcC 个敌人，各 40% 主线伤害（不递归、不重复）
        const hitSet = new Set([nearest]);
        const branchRange = arcBalance.branchRadius + arcBalance.radiusPerBranch * arcA;   // A 扩域：100→120→140→160 码
        // v1.16.101 超导3★：全部连锁类效果目标数 +1
        const nB = arcBalance.branchCount + arcC + (combat.game.run.relic3('elec_super') ? 1 : 0);   // C 裂电：3→4→5→6 个
        // v1.16.101 电链3★：分叉电弧可再分叉一次（各 20% 伤害）
        const reFork = combat.game.run.relic3('elec_chain');
        for (let k = 0; k < nB; k++) {
          const cands = combat.enemies().filter((o) => o.hp > 0 && !hitSet.has(o) && Math.hypot(o.x - nearest.x, o.y - nearest.y) <= branchRange);
          if (!cands.length) break;
          const tgt = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
          hitSet.add(tgt);
          combat.damage(tgt, dmg * arcBalance.branchDamage, 'electric');
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
              combat.damage(sub, dmg * 0.2, 'electric');
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
    // v1.16.21 雷暴分支调整：A=雷击目标+2/级（3/5/7/9）；B=连雷 30%/45%/60% 几率连锁周边 90px 敌人；C=雷击间隔 -1s/级（10→9/8/7s）
    const cLv = combat.branchLv('electric', '雷暴', 'C');
    const period = (stormBalance.period - stormBalance.periodReductionPerBranch * cLv) * combat._weakPeriod('electric');   // C0 10 / C1 9 / C2 8 / C3 7s（弱化态 ×1.5）
    combat.timers.storm = (combat.timers.storm || 0) + dt;
    if (combat.timers.storm >= period) {
      combat.timers.storm = 0;
      combat.castEnergy('electric', '雷暴');
      const aLv = combat.branchLv('electric', '雷暴', 'A');
      const bLv = combat.branchLv('electric', '雷暴', 'B');
      const n = stormBalance.targetCount + stormBalance.targetsPerBranch * aLv;   // A0 3 / A1 5 / A2 7 / A3 9（与 A +2/级 口径一致）
      const dmg = combat.shotDmg('electric') * stormBalance.damage * (1 + stormBalance.damagePerLevel * (storm - 1));
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
        combat.damage(e, dmg, 'electric');
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
        // B 分支（v1.16.21 连雷）：雷击 30%/45%/60% 几率连锁周边最近 bLv 个敌人（90px，50% 伤害）
        if (bLv > 0 && Math.random() < stormBalance.chainProbability[bLv]) {
          // v1.16.101 超导3★：全部连锁类效果目标数 +1
          const chainN = bLv + (combat.game.run.relic3('elec_super') ? 1 : 0);
          const chain = combat.enemies().filter((o) => o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= stormBalance.chainRadius)
            .sort((a2, b2) => Math.hypot(a2.x - e.x, a2.y - e.y) - Math.hypot(b2.x - e.x, b2.y - e.y)).slice(0, chainN);
          chain.forEach((o) => {
            combat.damage(o, dmg * stormBalance.chainDamage, 'electric');
            const cpath = [{ x: e.x, y: e.y }];
            const mx = (e.x + o.x) / 2 + (Math.random() * 14 - 7), my = (e.y + o.y) / 2 + (Math.random() * 14 - 7);
            cpath.push({ x: mx, y: my }, { x: o.x, y: o.y });
            combat.game.fx.push({ type: 'shot', kind: 'zigzag', path: cpath, t: 0, dur: 0.3, color: '#7fc7ff', w: 2.5 });
            combat.fxFlash(o.x, o.y, '#7fc7ff');
          });
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
      combat.groundDots.push({ x: hitE.x, y: hitE.y, r: 50, ttl: 1, dps: combat.shotDmg('electric') * 0.1, key: 'electric' });
      combat.fxRing(hitE.x, hitE.y, '#f4d03f', 50, 0.4, 3);
    }
    combat.fxFlash(hitE.x, hitE.y, '#f4d03f');
    combat.fxParticle(hitE.x, hitE.y, '#f4d03f', 5, 30, 0.3, 120, 4);
    return false;
  }
  return s.t < s.dur;
}

module.exports = { tickElectric, hitElectric, tryAttackDebuff, onAnyTowerHit, stepOrb };
