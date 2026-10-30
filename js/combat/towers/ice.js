'use strict';
// Ice attack/impact callbacks use the supplied Combat and current enemy instances.
const CONFIG = require('../../config.js');
const SKILL_NUM = require('../../config/tower-skills.js');

function _iceMultiShot(combat, e, dmg) {
  const g = combat.game;
  const balance = SKILL_NUM.ice['多重冰锥'];
  const mz = combat.towerMuzzle('ice');
  const msx = mz.x, msy = mz.y;
  const aLv = combat.branchLv('ice', '多重冰锥', 'A');
  const bLv = combat.branchLv('ice', '多重冰锥', 'B');
  const cLv = combat.branchLv('ice', '多重冰锥', 'C');
  const dur = CONFIG.TOWERS.ice.shot.dur;
  const R = combat.range('ice');                 // 射界半径（= 塔射程）
  if (cLv > 0) {
    // C 增殖：超小型冰锥各自索敌（循环锁定射程内敌人直飞），每枚 10% 伤害（A 数量叠加、B 伤害叠加），命中 20% 冰缓
    const n = SKILL_NUM.ice['多重冰锥'].swarm[cLv] + aLv + combat.relicVal('ice_blizzard');   // v1.16.114 暴雪1★/2★
    const perDmg = dmg * balance.swarmDamage * (1 + balance.damagePerBranch * bLv);
    const hitR = balance.swarmHitRadius;                             // 超小冰锥碰撞半径更小
    const strike = (o, d) => {
      combat.damage(o, d, 'ice');
      combat.tryAttackDebuff('ice', o, d);   // v1.16.53 增殖超小冰锥属普攻强化：统一冰缓/冰冻判定（吃寒霜/冰冻技能加成）
      combat.iceHitFx(o, d);                 // v1.16.98 暴雪3★
      combat.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
      combat.fxRing(o.x, o.y, '#7fd4ff', 16, 0.2, 2);
    };
    const targets = combat.enemies().filter((o) => o.hp > 0 && combat.inTowerRange('ice', o.x, o.y));
    for (let i = 0; i < n; i++) {
      const tgt = targets.length ? targets[i % targets.length] : e;   // 各自索敌：循环分配射程内目标
      combat.addProjectile({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx: tgt.x, ty: tgt.y, hitR, onHit: strike }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 0.38, tx: tgt.x, ty: tgt.y });
    }
    // 增殖仅由每枚真实冰锥碰撞结算，不额外对主目标即时扣血。
    return;
  }
  const n = balance.count + aLv + combat.relicVal('ice_blizzard');   // v1.16.114 暴雪1★/2★：每次攻击冰锥数量 +2/+3
  const perDmg = dmg * balance.damage * (1 + balance.damagePerBranch * bLv);
  const hitR = balance.hitRadius;                                     // 散射冰锥碰撞半径
  const strike = (o, d) => {                           // 命中结算（中心直瞄与散射弹道共用）
    combat.damage(o, d, 'ice');
    combat.tryAttackDebuff('ice', o, d);   // v1.16.53 多重冰锥散射属普攻强化：统一冰缓/冰冻判定
    combat.iceHitFx(o, d);                 // v1.16.98 暴雪3★
    combat.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
    combat.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
    combat.fxFlash(o.x, o.y, '#7fd4ff', 0.2);
  };
  // 以主目标方向为基准旋转 off 角度 → 扇形轨迹终点（中心弹 off=0 即锁定主目标）
  const aimOf = (tgt, off) => {
    const dx = tgt.x - msx, dy = tgt.y - msy;
    const cos = Math.cos(off), sin = Math.sin(off);
    return { tx: msx + dx * cos - dy * sin, ty: msy + dx * sin + dy * cos };
  };
  // 中心弹：锁定主目标（onHit 命中才结算；render 末端跟随目标，目标死亡时落回创建点，弹体始终可见）
  const aim0 = aimOf(e, 0);
  const strikeCenter = (o) => strike(o, perDmg);
  combat.addProjectile({ key: 'ice', target: e, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, onHit: strikeCenter }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', target: e, scale: 1.15, tx: e.x, ty: e.y });
  // 两侧：以主目标方向为基准等角扇形（中心弹两侧均匀分布），沿途碰撞命中即止
  const maxOff = (n - 2) * balance.fanStep;
  for (let i = 0; i < n - 1; i++) {
    const off = n > 2 ? (-maxOff + i * (2 * maxOff / (n - 2))) : 0;
    const ap = aimOf(e, off);
    const rayLen=Math.hypot(ap.tx-msx,ap.ty-msy)||1;
    const reach=combat.range('ice');
    ap.tx=msx+(ap.tx-msx)*reach/rayLen; ap.ty=msy+(ap.ty-msy)*reach/rayLen;
    const strikeSide = (o) => strike(o, perDmg);
    combat.addProjectile({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx: ap.tx, ty: ap.ty, hitR, onHit: strikeSide }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 1.15, tx: ap.tx, ty: ap.ty });
  }
}

function hitIce(combat, e, dmg) {
  combat.damage(e, dmg, 'ice');
  // v1.16.114 暴雪1★/2★（未学多重冰锥时）：单发追加 N 枚散射冰锥（命中结算：冰缓/冰冻/暴雪3★ 冰爆）
  const blzN = combat.relicVal('ice_blizzard');
  if (blzN > 0) {
    const mzI = combat.towerMuzzle('ice');
    const RI = combat.range('ice');
    const durI = CONFIG.TOWERS.ice.shot.dur;
    for (let i = 0; i < blzN; i++) {
      const offI = blzN > 1 ? (i / (blzN - 1) - 0.5) * 0.24 : 0;
      const txI = mzI.x + Math.sin(offI) * RI;
      const tyI = mzI.y - Math.cos(offI) * RI;
      const stI = (o) => {
        combat.damage(o, dmg, 'ice');
        combat.tryAttackDebuff('ice', o, dmg);
        combat.iceHitFx(o, dmg);
        combat.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
      };
      combat.addProjectile({ key: 'ice', scatter: true, dmg, t: 0, dur: durI, sx: mzI.x, sy: mzI.y, tx: txI, ty: tyI, hitR: 45, onHit: stI }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: mzI.x, y: mzI.y, t: 0, dur: durI, key: 'ice', aim: true, scale: 1.15, tx: txI, ty: tyI });
    }
  }
  // v1.13.27 普攻命中打击特效：冰锥撞击爆冰晶（白屑 + 蓝屑 + 小环 + 微闪）
  combat.fxParticle(e.x, e.y, '#eaf6ff', 6, 44, 0.30, 130, 5);
  combat.fxParticle(e.x, e.y, '#a9d6f5', 4, 62, 0.35, 90, 4);
  combat.fxRing(e.x, e.y, '#d6f0ff', 16, 0.2, 2);
  // 普攻冰缓+冰冻（v1.16.21→v1.16.53 统一判定）：冰缓基础 20%（寒霜 +25% + A 极寒每级 +15%）；
  //   冰冻学技能后 20%（A 档位）；强化攻击同吃此加成
  combat.tryAttackDebuff('ice', e, dmg);
  // v1.16.98 暴雪3★：主目标命中判定（已冰缓 → 30% 冰爆）
  combat.iceHitFx(e, dmg);
  // v1.16.98 冰雾（1★/2★ 补齐保留项行为）：普攻 20%/30% 概率额外减速目标周围敌人（半径100）
  //   3★：触发时残留冰雾地面 3 秒，域内敌人攻速 -20%
  const fogN = combat.game.run.relicNum('ice_fog');
  if (fogN > 0 && Math.random() < fogN / 100) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100) {
        combat.applySlow(o, 0.3, 1);
        combat.fxParticle(o.x, o.y, '#d6f0ff', 4, 34, 0.35, 100, 4);
      }
    });
    if (combat.game.run.relic3('ice_fog')) {
      combat.iceGrounds.push({ x: e.x, y: e.y, r: 100, ttl: 3, fog: true });
      combat.fxRing(e.x, e.y, '#d6f0ff', 100, 0.6, 4);
    }
  }
  // v1.16.130 多重冰锥发射已移至 attackOnce _iceMultiShot（一次普攻从塔口扇形飞出 n 枚，中心锁定主目标）；
  //   C 增殖分支保留在 _iceMultiShot（超小冰锥各自索敌独立飞行）
  // 碎冰（v1.13.24 原低温全塔改；v1.16.21 分支重做）：冰锥命中目标后碎裂成 3 枚小碎冰，飞行速度与原冰锥一致，
  //   沿弹道方向呈 60° 角散射（±30°），碎冰命中敌人即止（不穿透）
  //   A 裂片 +1/级（3→4→5）、B 碎劲 伤害档位 +15%/30%/45%、C 冻结 命中 5%/10%/15% 几率冻结 2s
  const shard = combat.lv('ice', '碎冰');
  if (shard > 0) {
    const g = combat.game;
    // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
    const mz = combat.towerMuzzle('ice');
    const msx = mz.x, msy = mz.y;
    const len = Math.hypot(e.x - msx, e.y - msy) || 1;
    const dx = (e.x - msx) / len, dy = (e.y - msy) / len;   // 弹道方向（继续向前 = 敌人身后）
    const n = SKILL_NUM.ice['碎冰'].count + combat.branchLv('ice', '碎冰', 'A');
    const dmg = combat.shotDmg('ice') * SKILL_NUM.ice['碎冰'].baseDamage * (1 + SKILL_NUM.ice['碎冰'].dmg[combat.branchLv('ice', '碎冰', 'B')]);
    const frzP = SKILL_NUM.ice['碎冰'].frz[combat.branchLv('ice', '碎冰', 'C')];
    const sx = e.x + dx * SKILL_NUM.ice['碎冰'].spawnOffset, sy = e.y + dy * SKILL_NUM.ice['碎冰'].spawnOffset;   // 越过主目标，避免立即重复命中
    const R = combat.range('ice');
    const dur = CONFIG.TOWERS.ice.shot.dur;
    const hitR = SKILL_NUM.ice['碎冰'].hitRadius;
    const strike = (o, d) => {
      // v1.16.98 碎冰强化3★：碎冰命中已有冰缓的敌人时伤害 ×1.5
      if (combat.game.run.relic3('ice_shard') && o.slow && o.slow.ttl > 0) d *= 1.5;
      combat.damage(o, d, 'ice');
      combat.tryAttackDebuff('ice', o, d);   // v1.16.53 碎冰小碎冰属普攻强化：统一冰缓/冰冻判定（C 冻结为其专属保留）
      combat.iceHitFx(o, d);                 // v1.16.98 暴雪3★
      // v1.13.27 碎冰命中：冰晶迸发 + 闪光 + 小环
      combat.fxFlash(o.x, o.y, '#d6f0ff', 0.22);
      combat.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
      combat.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
      // C 冻结：命中 5%/10%/15% 几率冻结 2s
      if (frzP > 0 && Math.random() < frzP) {
        o.frozen = Math.max(o.frozen || 0, SKILL_NUM.ice['碎冰'].freezeDuration);
        combat.fxFlash(o.x, o.y, '#d6f0ff', 0.3);
        combat.fxRing(o.x, o.y, '#7fd4ff', 40, 0.35, 3);
      }
    };
    const baseA = Math.atan2(dy, dx);
    const spread = SKILL_NUM.ice['碎冰'].halfAngle;   // 60° 总散射角（±30°）
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0;
      const a = baseA + off;
      const tx = sx + Math.cos(a) * R;
      const ty = sy + Math.sin(a) * R;
      combat.addProjectile({ key: 'ice', scatter: true, dmg, t: 0, dur, sx, sy, tx, ty, hitR, onHit: strike }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: sx, y: sy, t: 0, dur, key: 'ice', aim: true, scale: 0.85, tx, ty });
    }
  }
  // 冰穿刺（v1.16.21 重做，原「冰锥穿透」未实装补全）：弹道可穿透敌人（基础 1 名）
  //   A 冰穿 穿透目标 +1/+2/+3（1→2/3/4 名）；B 透射 穿透后伤害 +30%/60%/90%；C 冰霜透射 命中后对敌人身后 60px·90° 扇形造成 30%/40%/50% 伤害
  const pierce = combat.lv('ice', '冰穿刺');
  if (pierce > 0) {
    const g = combat.game;
    // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
    const mz = combat.towerMuzzle('ice');
    const psx = mz.x, psy = mz.y;
    const dirLen = Math.hypot(e.x - psx, e.y - psy) || 1;
    const ddx = (e.x - psx) / dirLen, ddy = (e.y - psy) / dirLen;   // 弹道方向（塔→目标）
    const aLv = combat.branchLv('ice', '冰穿刺', 'A');
    const bLv = combat.branchLv('ice', '冰穿刺', 'B');
    const cLv = combat.branchLv('ice', '冰穿刺', 'C');
    const pierceN = SKILL_NUM.ice['冰穿刺'].baseTargets + aLv + combat.relicVal('ice_pierce');   // v1.16.114 穿透凝冰1★/2★：+1/+2
    // 穿透目标：沿弹道方向位于目标身后（远离塔侧）的敌人，按投影距离排序
    const cands = combat.enemies().filter((o) => o.hp > 0 && o !== e
        && ((o.x - e.x) * ddx + (o.y - e.y) * ddy) > SKILL_NUM.ice['冰穿刺'].minProjection)
      .sort((a, b) => ((a.x - e.x) * ddx + (a.y - e.y) * ddy) - ((b.x - e.x) * ddx + (b.y - e.y) * ddy));
    const hitCnt = Math.min(pierceN, cands.length);
    for (let i = 0; i < hitCnt; i++) {
      const pT = cands[i];
      const pDmg = dmg * (1 + SKILL_NUM.ice['冰穿刺'].pierceDmg[bLv]);   // B 透射 +30/60/90%
      combat.damage(pT, pDmg, 'ice');
      combat.iceHitFx(pT, pDmg);                 // v1.16.98 暴雪3★
      // v1.16.98 穿透凝冰3★：冰锥贯穿 2 名以上敌人时，对最后一名敌人造成冰冻 1 秒
      if (combat.game.run.relic3('ice_pierce') && hitCnt >= 2 && i === hitCnt - 1) combat.freezeE(pT, 1);
      combat.fxParticle(pT.x, pT.y, '#b8e6ff', 5, 40, 0.3, 110, 4);
      combat.fxRing(pT.x, pT.y, '#a9d6f5', 20, 0.2, 2);
    }
    // C 冰霜透射：对敌人身后 60px·90° 扇形区域（以弹道方向为中轴 ±45°）造成伤害
    if (cLv > 0) {
      const fDmg = combat.shotDmg('ice') * SKILL_NUM.ice['冰穿刺'].cone[cLv];
      combat.enemies().forEach((o) => {
        if (o.hp <= 0 || o === e) return;
        const proj = (o.x - e.x) * ddx + (o.y - e.y) * ddy;          // 沿弹道方向投影（正=身后）
        const side = Math.abs((o.x - e.x) * ddy - (o.y - e.y) * ddx); // 侧向距离
        if (proj > 0 && proj <= SKILL_NUM.ice['冰穿刺'].coneLength && side <= proj * SKILL_NUM.ice['冰穿刺'].coneWidthRatio) combat.damage(o, fDmg, 'ice');   // ±45°（90° 扇形）
      });
      combat.fxParticle(e.x, e.y, '#d6f0ff', 8, 70, 0.35, 130, 5);
      combat.fxRing(e.x, e.y, '#b8e6ff', 42, 0.3, 3);
    }
  }
}

function iceHitFx(combat, o, d) {
  if (!combat.game.run.relic3('ice_blizzard')) return;
  if (!(o.slow && o.slow.ttl > 0)) return;
  if (Math.random() >= 0.30) return;
  combat.explode(o.x, o.y, 80, d * 0.6, 'ice');
}

function tickIce(combat, dt) {
  const g = combat.game;
  // 冰·冰花（v1.13.23 原霜星改周期技；v1.16.21 分支重做）：每 8 秒对最近 N 个敌人召唤冰花（爆炸范围 100·本体 80% 伤害；
  //     A 扩张 范围 +20/40/60%、B 霜力 伤害 +20/40/60%、C 繁花 数量 +1/+2/+3；原 A 碎散传染移除）
  const flowerBalance = SKILL_NUM.ice['冰花'];
  const flower = combat.lv('ice', '冰花');
  if (flower > 0) {
    combat.timers.iceFlower = (combat.timers.iceFlower || 0) + dt;
    if (combat.timers.iceFlower >= flowerBalance.period * combat._weakPeriod('ice')) {
      combat.timers.iceFlower = 0;
      combat.castEnergy('ice', '冰花');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('ice', e.x, e.y));
      if (alive.length) {
        const n = flowerBalance.baseCount + SKILL_NUM.ice['冰花'].n[combat.branchLv('ice', '冰花', 'C')];
        const dmg = combat.shotDmg('ice') * flowerBalance.baseDamage * (1 + SKILL_NUM.ice['冰花'].dmg[combat.branchLv('ice', '冰花', 'B')]);
        const r = flowerBalance.baseRadius * (1 + SKILL_NUM.ice['冰花'].radius[combat.branchLv('ice', '冰花', 'A')]);
        const targets = alive.sort((a, b) => b.y - a.y).slice(0, n);   // 最近敌人（靠城墙侧优先）
        targets.forEach((tgt) => {
          // v1.16.9 伤害改为延迟到冰花第 3 帧动画末尾（dur 1.1s ÷ 4 帧 ≈ 0.275s/帧 → 0.825s≈0.8s）结算，
          // 此时冰花绽放完成"爆炸"，一并触发范围伤害与扩散演出
          const fxDmg = dmg;
          const fxR = r;
          combat.delayed.push({
            x: tgt.x, y: tgt.y, r: fxR, dmg: fxDmg, delay: 0.8, t: 0, key: 'ice',
            fn: (cb) => {
              const hitOnes = cb.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - tgt.x, o.y - tgt.y) <= fxR);
              hitOnes.forEach((o) => cb.damage(o, fxDmg, 'ice'));
              // 爆炸演出：扩散冰环 + 冰晶碎瓣 + 闪光（与伤害同时）
              cb.fxRing(tgt.x, tgt.y, '#7fd4ff', fxR, 0.5, 5);
              cb.fxParticle(tgt.x, tgt.y, '#b8e6ff', 16, 90, 0.6, 160, 6);
              cb.fxFlash(tgt.x, tgt.y, '#7fd4ff');
              // v1.16.98 冰晶3★：冰花爆炸后残留冰晶地面 2 秒，敌人经过减速 20%
              if (cb.game.run.relic3('ice_crystal')) {
                cb.iceGrounds.push({ x: tgt.x, y: tgt.y, r: fxR, ttl: 2, slow: 0.2 });
              }
              // v1.16.98 雪崩3★：冰花落地后每 2 秒在原地再次爆炸，共追加 2 次，每次伤害为上一段的 80%
              if (cb.game.run.relic3('ice_avalanche')) {
                const mkAval = (delay, mult) => cb.delayed.push({
                  x: tgt.x, y: tgt.y, r: fxR, dmg: fxDmg * mult, delay, t: 0, key: 'ice',
                  fn: (cb2) => {
                    const h2 = cb2.enemies().filter((o) => o.hp > 0 && Math.hypot(o.x - tgt.x, o.y - tgt.y) <= fxR);
                    h2.forEach((o) => cb2.damage(o, fxDmg * mult, 'ice'));
                    cb2.fxRing(tgt.x, tgt.y, '#a9d6f5', fxR, 0.45, 4);
                    cb2.fxParticle(tgt.x, tgt.y, '#b8e6ff', 12, 80, 0.5, 140, 5);
                    cb2.fxFlash(tgt.x, tgt.y, '#a9d6f5', 0.25);
                  }
                });
                mkAval(2, 0.8);
                mkAval(4, 0.64);
              }
            }
          });
          // 冰花视觉：绽放六瓣冰花本体 + 扩散冰环 + 冰晶碎瓣 + 闪光（v1.13.26）
          combat.game.fx.push({ type: 'shot', kind: 'icebloom', x: tgt.x, y: tgt.y, r: fxR, t: 0, dur: 1.1 });
        });
      }
    }
  }
  // 冰·冬珠（v1.13.23 原冻结率改持续球；v1.16.21 分支重做）：每 10 秒释放冰霜之球，球持续 5s，期内周期对周围造成伤害
  //     A 寒域 范围减速 20%/30%/40%；B 扩张 范围 +20/40/60%；C 凝华 伤害频率 0.7/0.55/0.4 秒一跳（原数量+1 移除）
  const orbBalance = SKILL_NUM.ice['冬珠'];
  const orbSkill = combat.lv('ice', '冬珠');
  if (orbSkill > 0) {
    combat.timers.frostOrb = (combat.timers.frostOrb || 0) + dt;
    if (combat.timers.frostOrb >= orbBalance.period * combat._weakPeriod('ice')) {
      combat.timers.frostOrb = 0;
      combat.castEnergy('ice', '冬珠');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('ice', e.x, e.y));
      if (alive.length) {
        const r = orbBalance.baseRadius * (1 + SKILL_NUM.ice['冬珠'].radius[combat.branchLv('ice', '冬珠', 'B')]);
        const cLv = combat.branchLv('ice', '冬珠', 'C');
        const tickI = cLv > 0 ? SKILL_NUM.ice['冬珠'].tickI[cLv] : orbBalance.defaultTickInterval;
        const slowMult = SKILL_NUM.ice['冬珠'].slowMult[combat.branchLv('ice', '冬珠', 'A')];
        const dmg = combat.shotDmg('ice') * orbBalance.damage;   // v1.16.11 平衡：冬珠每跳 0.55→0.44×普攻
        const spots = alive.sort((a, b) => b.y - a.y).slice(0, orbBalance.targetCount);   // 最近 1 个敌人位置落球（C 不再增加数量）
        combat.frostOrbs = combat.frostOrbs || [];
        spots.forEach((sp) => {
          combat.frostOrbs.push({ x: sp.x, y: sp.y, r, ttl: orbBalance.duration, tickT: 0, tickI, dmg, slowMult });
          combat.game.fx.push({ type: 'shot', kind: 'frostorb', x: sp.x, y: sp.y, r, t: 0, dur: orbBalance.duration });
          // v1.13.27 冬珠浮现光效：冰球凝现闪光 + 冰雾
          combat.fxFlash(sp.x, sp.y, '#d6f0ff', 0.3);
          combat.fxParticle(sp.x, sp.y, '#b8e6ff', 8, 70, 0.5, 140, 5);
        });
      }
    }
    // 冬珠持续推进（每跳范围伤害 + 减速）
    if (combat.frostOrbs && combat.frostOrbs.length) {
      const remain = [];
      for (const ob of combat.frostOrbs) {
        ob.ttl -= dt;
        if (ob.ttl <= 0) { combat.fxRing(ob.x, ob.y, '#7fd4ff', ob.r * 0.6, 0.3, 3); continue; }
        ob.tickT -= dt;
        if (ob.tickT <= 0) {
          ob.tickT += ob.tickI;
          combat.enemies().forEach((o) => {
            if (o.hp <= 0 || Math.hypot(o.x - ob.x, o.y - ob.y) > ob.r) return;
            combat.damage(o, ob.dmg, 'ice');
            if (ob.slowMult > 0) combat.applySlow(o, ob.slowMult, orbBalance.slowDuration);
            // v1.16.98 冬域3★：冬珠伤害命中冰缓的敌人时，将其冰缓转化为冰冻 0.5 秒（同一敌人 3 秒内仅触发一次）
            if (combat.game.run.relic3('ice_domain') && o.slow && o.slow.ttl > 0 && !(o._domainCd > 0)) {
              o._domainCd = 3;
              combat.freezeE(o, 0.5);
            }
          });
          combat.fxRing(ob.x, ob.y, '#b8e6ff', ob.r * 0.5, 0.35, 3);
        }
        remain.push(ob);
      }
      combat.frostOrbs = remain;
    }
  }
  // 冰墙（v1.13.25 原永冻改，驻场城墙护盾；v1.16.21 数值重做）：每 20 秒为城墙附魔冰盾，持续 10s，
  //     抵御 300 伤害；攻击冰墙的敌人减速 40% + 攻击间隔 +0.5s（由 main.js 攻城段结算吸收/反伤/迟缓）
  //     A 凝壁 持续 +2/+4/+6s（档位式）；B 霜反 反伤 30%/60%/90%；C 融暖 结束回血 +50/+100/+150
  const iceWallBalance = SKILL_NUM.ice['冰墙'];
  const wallSkill = combat.lv('ice', '冰墙');
  if (wallSkill > 0) {
    combat.timers.iceWall = (combat.timers.iceWall || 0) + dt;
    // 冰墙驻场推进（ttl 递减，结束回血 + 消散特效）
    const iw = combat.iceWall;
    if (iw && iw.ttl > 0) {
      iw.ttl -= dt;
      if (iw.ttl <= 0) {
        if (iw.heal > 0 && combat.game.run) {
          const maxHp = combat.game.run.lineMaxHp || CONFIG.LINE.hp;
          combat.game.run.lineHp = Math.min(maxHp, combat.game.run.lineHp + iw.heal);
        }
        // v1.16.47：冰盾碎裂白光一闪（v1.16.53 扩散环扩至整墙）
        combat.fxFlash(375, combat.ly().wallY, '#ffffff', 0.3);
        combat.fxRing(375, combat.ly().wallY, '#7fd4ff', 700, 0.5, 5);
        combat.fxParticle(375, combat.ly().wallY, '#b8e6ff', 16, 90, 0.6, 160, 6);
        // v1.16.98 冰甲3★：冰盾破碎时向周围释放冰环，冻结敌人 1 秒
        if (combat.game.run.relic3('ice_armor')) {
          combat.enemies().forEach((o) => {
            if (o.hp > 0 && o.y >= combat.ly().areaY) combat.freezeE(o, 1);
          });
          combat.fxFlash(375, combat.ly().wallY, '#d6f0ff', 0.5);
        }
        combat.iceWall = null;
      }
    }
    if (combat.timers.iceWall >= iceWallBalance.period * combat._weakPeriod('ice')) {
      combat.timers.iceWall = 0;
      combat.castEnergy('ice', '冰墙');
      combat.iceWall = {
        ttl: iceWallBalance.duration + SKILL_NUM.ice['冰墙'].ttl[combat.branchLv('ice', '冰墙', 'A')],   // 基础 10s + A 档位 +2/+4/+6s
        absorb: iceWallBalance.absorb,   // v1.16.21：基础抵御 300 点伤害
        reflect: SKILL_NUM.ice['冰墙'].reflect[combat.branchLv('ice', '冰墙', 'B')],   // B 反伤 30%/60%/90%
        heal: SKILL_NUM.ice['冰墙'].heal[combat.branchLv('ice', '冰墙', 'C')],      // C 融暖结束回血 +50/+100/+150
      };
      combat.game.fx.push({ type: 'shot', kind: 'icewall', x: 375, y: combat.ly().wallY, r: 700, t: 0, dur: combat.iceWall.ttl });   // v1.16.53 r=700 覆盖整座城墙（25~725）
      combat.fxRing(375, combat.ly().wallY, '#7fd4ff', 700, 0.6, 5);
      combat.fxParticle(375, combat.ly().wallY, '#b8e6ff', 18, 100, 0.7, 180, 6);
      // v1.16.47：冰盾生成寒光一闪
      combat.fxFlash(375, combat.ly().wallY, '#d6f0ff');
    }
  }
  // ===== tickIce 尾部：冰塔 3★ 地面与城墙联动（v1.16.98） =====
  // 冰晶3★ 减速地面 / 冰雾3★ 降攻速地面：域内敌人持续受影响
  if (combat.iceGrounds && combat.iceGrounds.length) {
    const rem = [];
    for (const ig of combat.iceGrounds) {
      ig.ttl -= dt;
      if (ig.ttl <= 0) continue;
      combat.enemies().forEach((o) => {
        if (o.hp <= 0 || Math.hypot(o.x - ig.x, o.y - ig.y) > ig.r) return;
        if (ig.slow) combat.applySlow(o, ig.slow, 0.3);
        if (ig.fog) o._fogTtl = 0.3;
      });
      rem.push(ig);
    }
    combat.iceGrounds = rem;
  }
  // 冰墙裂变3★：冰盾生效期间，城墙每受到 100 点伤害，冰塔获得 1 点能量
  if (combat.iceWall && combat.iceWall.ttl > 0 && g.run.relic3('ice_wallshift')) {
    const acc = g.run._wallDmgAcc || 0;
    if (acc >= 100) {
      const n = Math.floor(acc / 100);
      g.run._wallDmgAcc -= n * 100;
      const it = combat.tower('ice');
      if (it) it.energy = Math.min(it.energy + n, g.run.armoryEnergyMax());
    }
  }
}

module.exports = { tickIce, _iceMultiShot, hitIce, iceHitFx };
