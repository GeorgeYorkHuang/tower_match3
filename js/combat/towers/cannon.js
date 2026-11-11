'use strict';
// Caller-owned tower/enemy state; shared damage and explosion paths remain on Combat.
const SKILL_NUM = require('../../config/tower-skills.js');
const CONFIG = require('../../config.js');
const TurretVisual = require('../turret-visual.js');

function hitCannon(combat, e, dmg, impactPosition) {
  const g = combat.game;
  // 军火库C的高能量普攻增伤已在shotDmg结算，不再额外判定双倍伤害。
  // 火药3★：每次命中积攒 1 层「火药热度」，累计 25 层后下一发炮弹为过热弹（200% 伤害，爆炸半径 +30%），随后清零
  let overheat = false;
  const powT = combat.tower('cannon');
  if (g.run.relic3('can_powder') && powT) {
    powT._heat = (powT._heat || 0) + 1;
    if (powT._heat >= 25) { powT._heat = 0; overheat = true; combat.fxFlash(e.x, e.y, '#ffb347', 0.4); }
  }
  if (overheat) dmg *= 2;
  // 弹药库3★：能量溢出时转化为 5% 暴击率（上限 +25%＝5 层；命中时判定）
  if (g.run.relic3('can_armory') && powT && powT.energy >= g.run.armoryEnergyMax('cannon')) {
    powT._ovCrit = Math.min(5, (powT._ovCrit || 0) + 1);
    if (Math.random() < 0.05 * powT._ovCrit) {
      dmg *= 2;
      combat.fxFlash(e.x, e.y, '#ffd24a', 0.3);
    }
  }
  // 重爆3★：重炮爆炸中心 40 码内伤害 ×1.5（近距离惩罚强化——主目标即中心）
  if (g.run.relic3('can_heavy') && combat.lv('cannon', '重炮') > 0) dmg *= 1.5;
  combat.damage(e, dmg, 'cannon');
  cannonSplash(combat,dmg,impactPosition || {x:e.x,y:e.y},e,overheat);
}

// 命中与落空复用同一套原溅射数值；落空没有虚构的主目标直伤或命中返能。
function missCannon(combat,dmg,impactPosition) {
  if(combat.game.run.relic3('can_heavy') && combat.lv('cannon','重炮')>0)dmg*=1.5;
  cannonSplash(combat,dmg,impactPosition,null,false);
}
function cannonSplash(combat,dmg,impactPosition,exclude,overheat) {
  const g=combat.game;
  // 普攻基础溅射：75px 范围、20%伤害；每级「重炮」增加25px与20个百分点溅射伤害，A扩大范围，B额外增加15个百分点。
  const heavy = combat.lv('cannon', '重炮');
  let r = (SKILL_NUM.cannon['重炮'].radius + SKILL_NUM.cannon['重炮'].radiusPerLevel * heavy) * (1 + SKILL_NUM.cannon['重炮'].radiusPerBranch * combat.branchLv('cannon', '重炮', 'A'));
  if (heavy > 0) r *= (1 + combat.relicVal('can_heavy') / 100);   // 重爆1★/2★：爆炸范围 +30%/45%
  if (overheat) r *= 1.3;   // 过热弹爆炸半径 +30%
  const splashRatio = SKILL_NUM.cannon['重炮'].splashDamage
    + SKILL_NUM.cannon['重炮'].damagePerLevel * heavy
    + SKILL_NUM.cannon['重炮'].damagePerBranch * combat.branchLv('cannon', '重炮', 'B');
  const splDmg = dmg * splashRatio;
  // 协同（爆炸类 +50%）在 explode() 内按 SYNERGIES[1] 统一结算（修正越界索引）
  // 震击（）：40%+20pp×B 概率击退 60×(1+0.4×A)px；C 迟滞被击退减速 1/1.5/2 秒（随等级）
  const shock = combat.lv('cannon', '震击');
  let knock = 0, slowAfter = 0;
  if (shock > 0 && Math.random() < SKILL_NUM.cannon['震击'].probability + SKILL_NUM.cannon['震击'].probabilityPerBranch * combat.branchLv('cannon', '震击', 'B')) {
    knock = SKILL_NUM.cannon['震击'].knockback * (1 + SKILL_NUM.cannon['震击'].knockbackPerBranch * combat.branchLv('cannon', '震击', 'A')) * (1 + combat.relicVal('can_knock') / 100);   // 震烈1★/2★
    const shockC = combat.branchLv('cannon', '震击', 'C');
    if (shockC > 0) slowAfter = SKILL_NUM.cannon['震击'].slowDuration + SKILL_NUM.cannon['震击'].slowDurationPerBranch * shockC;   // C1=1s / C2=1.5s / C3=2s；未点C不减速
  }
  // 爆炸（AOE 溅射 + 震尘减速）——排除主目标（普攻主目标已吃满 100%）
  const impactX = impactPosition.x;
  const impactY = impactPosition.y;
  combat.explode(impactX, impactY, r, splDmg, 'cannon', knock, slowAfter, exclude);
  if (combat.branchLv('cannon', '重炮', 'C') > 0) {
    combat.enemies().forEach((o) => {
      if (o.hp > 0 && o !== exclude && Math.hypot(o.x - impactX, o.y - impactY) <= r && Math.random() < 0.20 * combat.branchLv('cannon', '重炮', 'C')) combat.applySlow(o, 0.30, 1, 'cannon');
    });
  }
}

function launchShardBomb(combat, sx, sy, tx, ty, dmg, onReach) {
  const bal = SKILL_NUM.cannon['碎裂弹'];
  const dist = Math.hypot(tx - sx, ty - sy);
  const dur = dist / bal.fragmentSpeed;
  const visual = { type: 'shot', kind: 'fragmentBomb', color: '#e6b980', x: sx, y: sy, tx, ty, t: 0, dur, key: 'cannon', aim: true, scale: 0.68 };
  combat.addProjectile({ key: 'cannon', t: 0, dur, sx, sy, tx, ty, onReach }, visual);
}

function detonateShardBomb(combat, x, y, attackDmg, branchA, branchB, branchC, angle) {
  const bal = SKILL_NUM.cannon['碎裂弹'];
  combat.explode(x, y, bal.radius, attackDmg * bal.damage, 'cannon', undefined, undefined, undefined, '碎裂弹');   // 标注
  combat.fxRing(x, y, '#d89e63', bal.radius, 0.38, 3.5);
  combat.fxParticle(x, y, '#ffd27a', 10, 48, 0.42, 145, 5);

  if (branchB > 0) {
    const hitCount = bal.dotHits[branchB];
    const targets = combat.enemies().filter((e) => e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= bal.radius);
    targets.forEach((enemy) => {
      combat.applySlow(enemy, bal.dotSlow, bal.dotDuration, 'cannon');
      const interval = bal.dotDuration / hitCount;
      for (let i = 1; i <= hitCount; i++) {
        combat.delayed.push({
          t: 0, delay: interval * i,
          fn: (ctx) => { if (enemy.hp > 0) ctx.damage(enemy, attackDmg * bal.dotDamage, 'cannon', { kind: 'dot' }, '碎裂弹'); },   // B 分段伤害计入 DOT 与技能明细
        });
      }
    });
  }

  if (branchC > 0) {
    // 灼地1★/2★：燃烧地面持续 +1/+2 秒；3★：每秒伤害额外 +15%
    const duration = bal.burnDuration[branchC] + combat.relicVal('can_fireline');
    const burnDps = attackDmg * bal.burnDps * (combat.game.run.relic3('can_fireline') ? 1.15 : 1);
    combat.groundDots = combat.groundDots || [];
    combat.groundDots.push({ x, y, r: bal.radius, ttl: duration, dps: burnDps, key: 'cannon', kind: 'cannonBurn', seed: Math.random() * 100, skill: '碎裂弹' });   // C 灼地归碎裂弹
    combat.fxRing(x, y, '#ff9f43', bal.radius, 0.6, 4);
  }

  if (branchA > 0) {
    const bounceAngle = angle == null ? Math.atan2(y - combat.towerMuzzle('cannon').y, x - combat.towerMuzzle('cannon').x) : angle;
    const bx = x + Math.cos(bounceAngle) * bal.bounceDistance;
    const by = y + Math.sin(bounceAngle) * bal.bounceDistance;
    const ly = combat.ly();
    const tx = Math.max(18, Math.min(732, bx));
    const ty = Math.max(ly.areaY + ly.entryH + 8, Math.min(ly.wallY - 10, by));
    launchShardBomb(combat, x, y, tx, ty, attackDmg, () => {
      combat.explode(tx, ty, bal.bounceRadius, attackDmg * bal.bounceDamage[branchA], 'cannon', undefined, undefined, undefined, '碎裂弹');   // A 弹跳归碎裂弹
      combat.fxRing(tx, ty, '#f0b45d', bal.bounceRadius, 0.34, 3);
      combat.fxParticle(tx, ty, '#ffd27a', 6, 30, 0.32, 120, 4);
    });
  }

  // 连爆3★：小弹爆炸时 40% 概率再分裂 1 枚小弹（30% 伤害，不再分裂）
  if (combat.game.run.relic3('can_pierce') && Math.random() < 0.4) {
    const subAngle = (angle == null ? Math.random() * Math.PI * 2 : angle + Math.PI / 4);
    const ly2 = combat.ly();
    const tx2 = Math.max(18, Math.min(732, x + Math.cos(subAngle) * bal.bounceDistance));
    const ty2 = Math.max(ly2.areaY + ly2.entryH + 8, Math.min(ly2.wallY - 10, y + Math.sin(subAngle) * bal.bounceDistance));
    launchShardBomb(combat, x, y, tx2, ty2, attackDmg, () => {
      combat.explode(tx2, ty2, bal.bounceRadius, attackDmg * 0.3, 'cannon', undefined, undefined, undefined, '碎裂弹');   // 连爆3★归碎裂弹
      combat.fxRing(tx2, ty2, '#f0b45d', bal.bounceRadius, 0.28, 2.5);
    });
  }
}

function tickCannon(combat, dt) {
  const g = combat.game;
  const relicCd = Math.max(0.2, 1 - g.run.relicNum('r_cannon_cd') / 100);
  // 炮·碎裂弹：每 8 秒发射一枚，命中后沿 0°/45°/90° 扇出三枚小弹。
  const shatterLv = combat.lv('cannon', '碎裂弹');
  if (shatterLv > 0) {
    combat.timers.shatter = (combat.timers.shatter || 0) + dt;
    const bal = SKILL_NUM.cannon['碎裂弹'];
    if (combat.timers.shatter >= bal.period * combat._weakPeriod('cannon') * relicCd) {
      const target = combat.pickTarget('cannon');
      if (target) {
        combat.timers.shatter = 0;
        const energyBefore = combat.castEnergy('cannon', '碎裂弹');
        const attackDmg = combat.shotDmg('cannon', true, true, energyBefore);
        const branchA = combat.branchLv('cannon', '碎裂弹', 'A');
        const branchB = combat.branchLv('cannon', '碎裂弹', 'B');
        const branchC = combat.branchLv('cannon', '碎裂弹', 'C');
        const muzzle = combat.towerMuzzle('cannon');
        const dur = CONFIG.TOWERS.cannon.shot.dur;
        const visual = { type: 'shot', kind: 'shatterShell', color: '#ffc45e', x: muzzle.x, y: muzzle.y, tx: target.x, ty: target.y, t: 0, dur, key: 'cannon' };
        combat.addProjectile({
          key: 'cannon', target, trackTarget: true, t: 0, dur, sx: muzzle.x, sy: muzzle.y, tx: target.x, ty: target.y, dmg: attackDmg,
          onReach: (shell) => {
            const impactX = shell.tx, impactY = shell.ty;
            const baseAngle = Math.atan2(impactY - muzzle.y, impactX - muzzle.x);
            combat.fxFlash(impactX, impactY, '#ffd27a', 0.32);
            combat.fxRing(impactX, impactY, '#e6b980', 28, 0.28, 3);
            // 连爆1★/2★：小弹数量 +1/+2（角度表不足时按 45° 递增补齐）
            const fragN = bal.fragmentCount + combat.relicVal('can_pierce');
            const fragAngles = bal.fragmentAngles.slice(0, fragN);
            while (fragAngles.length < fragN) fragAngles.push(45 * fragAngles.length);
            fragAngles.forEach((offset) => {
              const angle = baseAngle + offset * Math.PI / 180;
              const tx = Math.max(18, Math.min(732, impactX + Math.cos(angle) * bal.fragmentDistance));
              const ly = combat.ly();
              const ty = Math.max(ly.areaY + ly.entryH + 8, Math.min(ly.wallY - 10, impactY + Math.sin(angle) * bal.fragmentDistance));
              launchShardBomb(combat, impactX, impactY, tx, ty, attackDmg,
                () => detonateShardBomb(combat, tx, ty, attackDmg, branchA, branchB, branchC, angle));
            });
          },
        }, visual);
        g.playSfx('shot', 0.25);
      }
    }
  }
  // 炮·炮火支援：每 12 秒逐发发射，发射间隔 0.1s；升空 0.4s → 瞄准圈闪烁 1s → 高空落弹 0.5s。
  // 落弹期间显示半径 130 的地面预警圈，落地时结算 60% 攻击伤害；A 增援 +1 发/级，C 焦土留地面燃烧区。
  const support = combat.lv('cannon', '炮火支援');
  if (support > 0) {
    combat.timers.support = (combat.timers.support || 0) + dt;
    if (combat.timers.support >= SKILL_NUM.cannon['炮火支援'].period * combat._weakPeriod('cannon') * relicCd && combat.enemies().some((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y))) {
      combat.timers.support = 0;
      const energyBefore = combat.castEnergy('cannon', '炮火支援');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y, energyBefore));
      if (alive.length) {
        const n = SKILL_NUM.cannon['炮火支援'].count + combat.branchLv('cannon', '炮火支援', 'A') + g.run.relicNum('s_can_splash');
        const dmg = combat.shotDmg('cannon', false, true, energyBefore) * SKILL_NUM.cannon['炮火支援'].damage * (1 + SKILL_NUM.cannon['炮火支援'].damagePerBranch * combat.branchLv('cannon', '炮火支援', 'B'));
        const warningR = SKILL_NUM.cannon['炮火支援'].radius * (1 + (g.run.relicNum('s_sr_can_splash') + g.run.relicValue('s_sr_can_powder', 'radius')) / 100);
        const mus = combat.towerMuzzle('cannon');
        for (let i = 0; i < n; i++) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          const px = t.x;
          const py = t.y;
          const off = 0.1 * i;
          const impactAt = 1.9 + off;
          // 塔口升空 0.4s 后消失；瞄准 1s；炮弹再从目标头顶 300px 处垂直落下 0.5s。
          g.fx.push({ type: 'strikeShell', sx: mus.x, sy: mus.y, tx: px, ty: py, target: t, t: 0, dur: impactAt, offset: off, seed: Math.random() * 100 });
          // 升空后对目标位置闪烁两次，完整时序 0.1入+0.2亮+0.2灭，重复一次。
          // 锁定圈只包住单个目标；130码打击范围由后续地面预警圈明确显示。
          g.fx.push({ type: 'strikeAim', x: px, y: py, r: 40, target: t, t: 0, dur: 1.4 + off, offset: off, seed: Math.random() * 100 });
          // 地面受击圈只在 0.5s 落弹阶段显示，落地时与伤害结算同步结束。
          g.fx.push({ type: 'strike', x: px, y: py, r: warningR, target: t, t: 0, dur: impactAt, offset: off, seed: Math.random() * 100 });
          combat.delayed.push({ x: px, y: py, r: SKILL_NUM.cannon['炮火支援'].radius, target: t, dmg, delay: impactAt, t: 0, key: 'cannon', knock: 0, slowAfter: false, ember: combat.branchLv('cannon', '炮火支援', 'C'), skill: '炮火支援' });   // 标注
        }
      }
    }
  }
  // 炮·地雷阵（重做）：每 6 秒抛投 3 颗雷（A 布雷 +2/级），雷从塔口以 500px/s 飞向部署点（飞行不可引爆），
  //   落地布设 0.3s 后可引爆，持续 20 秒；有敌人时部署在最近敌人（最靠墙）附近一圈随机位置，无敌人时攻击范围内随机（B 雷威 +50%/级；C 连爆）
  const mineLv = combat.lv('cannon', '地雷阵');
  if (mineLv > 0) {
    combat.timers.mine = (combat.timers.mine || 0) + dt;
    if (combat.timers.mine >= SKILL_NUM.cannon['地雷阵'].period * combat._weakPeriod('cannon') * relicCd) {
      combat.timers.mine = 0;
      const energyBefore = combat.castEnergy('cannon', '地雷阵');
      const n = SKILL_NUM.cannon['地雷阵'].count + SKILL_NUM.cannon['地雷阵'].countPerBranch * combat.branchLv('cannon', '地雷阵', 'A');
      // 塔口坐标（统一 towerMuzzle）
      const ly = combat.ly();
      const mz = combat.towerMuzzle('cannon');
      const fx0 = mz.x, fy0 = mz.y;
      const range = combat.range('cannon', energyBefore);
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y, energyBefore));
      const topY = ly.areaY + ly.entryH + 10;
      const wallY = ly.wallY - 12;
      for (let i = 0; i < n; i++) {
        // 部署点：有敌人 → 最近敌人（y 最大）附近一圈随机；无敌人 → 攻击范围内随机
        let tx, ty;
        if (alive.length) {
          const near = alive.reduce((a, b) => (b.y > a.y ? b : a));
          const ang = Math.random() * Math.PI * 2;
          const rr = 30 + Math.random() * 150;   // ：部署圈半径 ×3（10~60 → 30~180px）
          tx = near.x + Math.cos(ang) * rr;
          ty = near.y + Math.sin(ang) * rr;
        } else {
          tx = 40 + Math.random() * 620;
          ty = fy0 - 30 - Math.random() * Math.max(60, range - 90);
        }
        tx = Math.max(25, Math.min(725, tx));
        ty = Math.max(topY, Math.min(wallY, ty));
        const dist = Math.hypot(tx - fx0, ty - fy0);
        combat.mines = combat.mines || [];
        const mine = {
          x: fx0, y: fy0, r: SKILL_NUM.cannon['地雷阵'].radius,
          dmg: combat.shotDmg('cannon', false, true, energyBefore) * SKILL_NUM.cannon['地雷阵'].damage * (1 + SKILL_NUM.cannon['地雷阵'].damagePerBranch * combat.branchLv('cannon', '地雷阵', 'B')), energyBefore,
          armed: 0, ttl: SKILL_NUM.cannon['地雷阵'].duration, chain: combat.branchLv('cannon', '地雷阵', 'C'),
          fly: { sx: fx0, sy: fy0, tx, ty, t: 0 },
        };
        const flyDur = dist / 200;   // 200px/s
        mine.fx = { type: 'mine', x: tx, y: ty, t: 0, dur: flyDur + SKILL_NUM.cannon['地雷阵'].duration, seed: Math.random() * 100, fly: { sx: fx0, sy: fy0, tx, ty, dur: flyDur } };
        combat.mines.push(mine);
        g.fx.push(mine.fx);
        combat.fxParticle(fx0, fy0 - 8, '#b5651d', 4, 22, 0.3, 90, 4);
      }
    }
  }
  // 炮·炮台：每12秒部署2门，基础持续6秒；B每级延长1秒，不再同时缩短部署间隔。
  const turret = combat.lv('cannon', '炮台');
  if (turret > 0) {
    combat.timers.turret = (combat.timers.turret || 0) + dt;
    const cd = Math.max(SKILL_NUM.cannon['炮台'].minPeriod, SKILL_NUM.cannon['炮台'].period - SKILL_NUM.cannon['炮台'].periodReductionPerBranch * combat.branchLv('cannon', '炮台', 'B')) * combat._weakPeriod('cannon') * relicCd;
    if (combat.timers.turret >= cd && combat.enemies().some((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y))) {
      combat.timers.turret = 0;
      const energyBefore = combat.castEnergy('cannon', '炮台');
      const n = SKILL_NUM.cannon['炮台'].count + combat.branchLv('cannon', '炮台', 'A');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y, energyBefore));
      if (!alive.length) return;   // 没有敌人时不部署炮台
      for (let i = 0; i < n; i++) {
        const near = alive[Math.floor(Math.random() * alive.length)];
        const px = near.x + (Math.random() - 0.5) * 90;
        const py = near.y + (Math.random() - 0.5) * 90;
        const ttl = SKILL_NUM.cannon['炮台'].duration + SKILL_NUM.cannon['炮台'].durationPerBranch * combat.branchLv('cannon', '炮台', 'B');
        combat.turrets = combat.turrets || [];
        const atkI = Math.max(SKILL_NUM.cannon['炮台'].minAttackInterval, SKILL_NUM.cannon['炮台'].attackInterval + SKILL_NUM.cannon['炮台'].attackIntervalPerBranch * combat.branchLv('cannon', '炮台', 'C'));
        const summon = { x: px, y: py, ttl, atkT: 0, atkI, dmg: combat.shotDmg('cannon', false, true, energyBefore) * SKILL_NUM.cannon['炮台'].damage, r: SKILL_NUM.cannon['炮台'].radius };
        TurretVisual.begin(summon);
        combat.turrets.push(summon);
        // 直接绑定炮台对象，位置重叠时也不会串用其他炮台的开火标记。
        g.fx.push({ type: 'turret', turret: summon, x: px, y: py, t: 0, dur: ttl, seed: Math.random() * 100 });
        combat.fxRing(px, py, '#b5651d', 40, 0.5, 3.5);
      }
    }
  }
}

function removeMineFx(combat, mine) {
  if (!mine || !mine.fx || !combat.game.fx) return;
  const i = combat.game.fx.indexOf(mine.fx);
  if (i >= 0) combat.game.fx.splice(i, 1);
}

function updateMines(combat, dt) {
  if (!combat.mines || !combat.mines.length) return;
  for (let i = combat.mines.length - 1; i >= 0; i--) {
    const m = combat.mines[i];
    if (m.fly) {
      const dx = m.fly.tx - m.fly.sx, dy = m.fly.ty - m.fly.sy;
      const dist = Math.hypot(dx, dy) || 1;
      m.fly.t += dt;
      const p = Math.min(1, (m.fly.t * 500) / dist);   // ：抛投速度 200→500px/s
      m.x = m.fly.sx + dx * p;
      m.y = m.fly.sy + dy * p;
      if (p >= 1) { m.x = m.fly.tx; m.y = m.fly.ty; m.fly = null; m.armed = 0.3; m.ttl = 20; }
      continue;   // 飞行期间不可引爆
    }
    m.ttl -= dt;
    m.armed -= dt;
    // 地雷强化3★：地雷持续 20 秒未被触发时自动引爆，造成 150% 伤害
    if (m.ttl <= 0) {
      if (combat.game.run.relic3('can_mine')) combat.explode(m.x, m.y, m.r, m.dmg * 1.5, 'cannon', 0, false, undefined, '地雷阵');   // 自动引爆归地雷阵
      removeMineFx(combat, m);
      combat.mines.splice(i, 1);
      continue;
    }
    if (m.armed > 0) continue;
    const hit = combat.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
    if (!hit) continue;
    removeMineFx(combat, m);
    combat.mines.splice(i, 1);
    // 雷场3★：地雷被引爆时，90 码内的其他地雷共鸣引爆（造成 50% 伤害，可继续连锁）
    if (combat.game.run.relic3('can_minefield')) {
      combat.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false, undefined, '地雷阵');   // 雷场3★主雷归地雷阵
      const q = [m];
      const visited = new Set([m]);
      while (q.length) {
        const cur = q.pop();
        for (let j = combat.mines.length - 1; j >= 0; j--) {
          const o2 = combat.mines[j];
          if (o2.fly || visited.has(o2)) continue;
          if (Math.hypot(o2.x - cur.x, o2.y - cur.y) <= 90) {
            visited.add(o2);
            removeMineFx(combat, o2);
            combat.mines.splice(j, 1);
            combat.explode(o2.x, o2.y, o2.r, o2.dmg * 0.5, 'cannon', 0, false, undefined, '地雷阵');   // 共鸣归地雷阵
            q.push(o2);
          }
        }
      }
    } else {
      combat.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false, undefined, '地雷阵');   // 标注
    }
    if (m.chain > 0) {
      // C 连爆 → 碎雷重做：爆炸后星状向四周 130px 内散射 5/6/7 片弹片，每片 30% 攻击伤害
      const nShard = SKILL_NUM.cannon['地雷阵'].shards[m.chain];
      const shardDmg = combat.shotDmg('cannon', true, true, m.energyBefore) * SKILL_NUM.cannon['地雷阵'].shardDmg;
      const R2 = SKILL_NUM.cannon['地雷阵'].shardR;
      const SPEED = SKILL_NUM.cannon['地雷阵'].shardSpeed;
      for (let k = 0; k < nShard; k++) {
        const ang = (Math.PI * 2 * k) / nShard + (Math.random() - 0.5) * 0.4;
        const tx2 = m.x + Math.cos(ang) * R2, ty2 = m.y + Math.sin(ang) * R2;
        const shard = {
          key: 'cannon', dmg: shardDmg, t: 0, dur: R2 / SPEED, sx: m.x, sy: m.y, tx: tx2, ty: ty2,
          scatter: true, hitR: 34,
          onHit: (o, dd) => { combat.damage(o, dd, 'cannon', undefined, '地雷阵'); combat.fxParticle(o.x, o.y, '#d89e63', 3, 18, 0.3, 80, 4); },   // 碎雷弹片归地雷阵
        };
        combat.shots.push(shard);
        combat.game.fx.push({ type: 'shot', kind: 'line', color: '#e6b980', x: m.x, y: m.y, t: 0, dur: R2 / SPEED, key: 'cannon', aim: true, scale: 0.8, tx: tx2, ty: ty2 });
      }
    }
  }
}

function updateTurrets(combat, dt) {
  if (!combat.turrets || !combat.turrets.length) return;
  const g = combat.game;
  for (let i = combat.turrets.length - 1; i >= 0; i--) {
    const tu = combat.turrets[i];
    tu.ttl -= dt;
    if (tu.ttl <= 0) {
      TurretVisual.advance(tu, 0);
      g.fx = g.fx.filter(f => !(f.type === 'turret' && f.turret === tu));
      // 增援3★：炮台消失时返还 2 点能量
      if (g.run.relic3('can_reinforce')) {
        const ct = combat.tower('cannon');
        if (ct) ct.energy = Math.min(ct.energy + 2, g.run.armoryEnergyMax('cannon'));
      }
      combat.turrets.splice(i, 1);
      continue;
    }
    TurretVisual.advance(tu, dt);
    tu.atkT += dt;
    if (tu.atkT >= tu.atkI) {
      tu.atkT -= tu.atkI;
      const tgt = combat.enemies().filter((o) => o.hp > 0).sort((a, b) => b.y - a.y)[0];
      if (tgt) {
        TurretVisual.fire(tu, tgt);
        // 炮群3★：多门炮台同时存在时，每门伤害 +10%/门
        const turretDmg = g.run.relic3('can_turret') ? tu.dmg * (1 + 0.1 * (combat.turrets.length - 1)) : tu.dmg;
        combat.damage(tgt, turretDmg, 'cannon', undefined, '炮台');   // 标注
        const splashDmg = turretDmg * SKILL_NUM.cannon['炮台'].splashDamage / SKILL_NUM.cannon['炮台'].damage;
        combat.explode(tgt.x, tgt.y, tu.r, splashDmg, 'cannon', 0, false, tgt, '炮台');   // 直伤目标不重复承受溅射；周围目标按40%结算
        combat.fxBeam(tu.x, tu.y, tgt.x, tgt.y, '#d89e63', 0.25, 3);
        // 炮口闪光、火星与后坐已在新图集中，不再重复叠加旧开火效果。
      }
    }
  }
}

module.exports = { hitCannon, missCannon, tickCannon, updateMines, updateTurrets };
