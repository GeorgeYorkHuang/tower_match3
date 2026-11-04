'use strict';
// Fire attacks and impact callbacks. Mutable state stays on the supplied Combat/Run/Enemy.
const CONFIG = require('../../config.js');
const SKILL_NUM = require('../../config/tower-skills.js');
const enemySize = require('../../enemy-size.js');

function relicStar(run, id) {
  if (!run || run.relicRun(id) <= 0) return 0;
  if (run._testStar3 && run._testStar3[id]) return 3;
  return run.metaRef && run.metaRef.starOf ? run.metaRef.starOf(id) : 1;
}
function relicTier(run, id, effect = 'primary') {
  const values = (CONFIG.RELIC_REWORK && CONFIG.RELIC_REWORK.RELIC_VALUES[id] && CONFIG.RELIC_REWORK.RELIC_VALUES[id][effect])
    || (CONFIG.RELIC_VALUES && CONFIG.RELIC_VALUES[id] && CONFIG.RELIC_VALUES[id][effect]);
  return values ? (values[relicStar(run, id)] || 0) : 0;
}
function burnallCast(combat, key) {
  // 旧「焚天」连携已从新版卡表移除；保留周期技原伤害倍率。
  return 1;
}

function pillarFloorY(enemy) {
  return enemy.y + enemySize(enemy, CONFIG.LAYOUT.enemy) * 0.34;
}

function _attackFireOnHit(combat, e, dmg) {
  // 旧「焰雨三连」机制已移除；留空委托供兼容入口使用。
}

function _fireAttackOnAttack(combat, target, dmg) {
  return false;
}

function leaveFireGround(combat, x, y, dmg, ttl = 2, radius = 60) {
  combat.groundDots = combat.groundDots || [];
  combat.groundDots.push({ x, y, r: radius, ttl, dps: 0, key: 'fire', burnOnEnter: true, burnDmg: dmg, skill: '火山' });
  combat.fxRing(x, y, '#ff7043', radius, 0.45, 4);
  combat.fxParticle(x, y, '#ffb33d', 8, 44, 0.45, 130, 5);
}

function volcanoHit(combat, enemy, dmg) {
  // 旧「火舌」火山特效不在新版卡表中；火山效果留待新卡明确承载后再接入。
}

function volcanoSpark(combat, volcano, target) {
  return false;
}

function hitFire(combat, e, dmg) {
  const g = combat.game;
  const run = g.run;
  // v1.16.21：火焰鹰眼已重做为「烈焰墙」（周期技），此处不再有普攻乘区
  combat._attackFireOnHit(e, dmg);   // 兼容委托（新版无额外普攻触发）
  combat._fireAttackHit(e, dmg);     // 命中伤害段（灼烧判定/大火球/多重火球）
}

function _leaveMultiFireGround(combat, enemy, attackDmg, cLv) {
  if (!enemy || cLv <= 0) return;
  const balance = SKILL_NUM.fire['多重火球'];
  const ttl = balance.scatterBurnDuration[cLv] || 0;
  if (!(ttl > 0)) return;
  combat.groundDots = combat.groundDots || [];
  combat.groundDots.push({
    x: enemy.x, y: enemy.y, r: balance.scatterBurnRadius, ttl,
    dps: attackDmg * balance.scatterBurnDps, key: 'fire',
    seed: Math.random() * 100, skill: '多重火球',
  });
  combat.fxRing(enemy.x, enemy.y, '#ff7043', balance.scatterBurnRadius, 0.35, 3);
  combat.fxParticle(enemy.x, enemy.y, '#ff9f43', 5, 28, 0.35, 100, 4);
}

function _fireMultiShot(combat, e, dmg, fromTriple = false) {
  const g = combat.game;
  const balance = SKILL_NUM.fire['多重火球'];
  const big = combat.lv('fire', '大火球');
  const mz = combat.towerMuzzle('fire');
  const fsx = mz.x, fsy = mz.y;
  const n = balance.count + combat.branchLv('fire', '多重火球', 'A');
  const perDmg = dmg * balance.damage * (1 + SKILL_NUM.fire['多重火球'].condense[combat.branchLv('fire', '多重火球', 'B')]);   // 凝火 +15/30/50%
  const dur = CONFIG.TOWERS.fire.shot.dur;
  const tint = '#ff7043';
  // 以主目标方向为基准旋转 off 角度 → 扇形轨迹终点（中心弹 off=0 即锁定主目标）
  const aimOf = (tgt, off) => {
    const dx = tgt.x - fsx, dy = tgt.y - fsy;
    const cos = Math.cos(off), sin = Math.sin(off);
    return { tx: fsx + dx * cos - dy * sin, ty: fsy + dx * sin + dy * cos };
  };
  const R = combat.range('fire');                 // 射界半径（= 塔射程）
  const hitR = balance.hitRadius;                              // 散射火球碰撞半径（弹体较大）
  const cLv = combat.branchLv('fire', '多重火球', 'C');
  const strike = (o, d, ang) => {
    combat.damage(o, d, 'fire');
    if (!fromTriple) combat._attackFireOnHit(o, d);   // 三连弹本身不重复充入三连计数，避免循环触发
    combat.tryAttackDebuff('fire', o, d);   // v1.16.53 多重火球散射命中属普攻强化：统一灼烧判定
    combat.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
    combat.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
    combat.fxFlash(o.x, o.y, '#ffd24a', 0.2);
    // C 散射：每枚主火球命中后留下 40px 燃烧地面。
    _leaveMultiFireGround(combat, o, dmg, cLv);
    // 大火球叠加：每枚火球命中处按大火球口径爆炸溅射（选了大火球 → 火球变大火球）
    if (big > 0) {
      const bgr = SKILL_NUM.fire['大火球'].radius * (1 + SKILL_NUM.fire['大火球'].radiusPerBranch * combat.branchLv('fire', '大火球', 'A'));
      const bgs = dmg * SKILL_NUM.fire['大火球'].splashDamage * (1 + SKILL_NUM.fire['大火球'].damagePerBranch * combat.branchLv('fire', '大火球', 'B'));
      const bgIgnite = SKILL_NUM.fire['大火球'].ignitePerBranch * combat.branchLv('fire', '大火球', 'C');
      combat.enemies().forEach((o2) => {
        if (o2 === o || o2.hp <= 0) return;
        const d2 = Math.hypot(o2.x - o.x, o2.y - o.y);
        if (d2 <= bgr) {
          combat.damage(o2, bgs, 'fire');
          if (bgIgnite > 0 && Math.random() < bgIgnite) combat.applyBurn(o2, dmg, 'fire');
        }
      });
      combat.fxRing(o.x, o.y, '#ff7043', bgr, 0.4, 4);
      combat.fxParticle(o.x, o.y, '#ffab40', 8, bgr * 0.8, 0.5, 140, 5);
      combat.fxFlash(o.x, o.y, '#ff9f43');
    }
  };
  // 主目标只负责给整轮齐射提供方向。中心弹和侧弹统一由同一循环创建、同帧发射、同速沿线碰撞，
  // 因此每一枚火球命中时都会执行完全相同的基础命中、C 分裂和大火球联动。
  const maxOff = (n - 2) * balance.fanStep;   // 扇形半角（弧度）：5 枚 ±0.24 / 6 枚 ±0.32 / 7 枚 ±0.40
  const offsets = [];
  for (let i = 0; i < n - 1; i++) offsets.push(n > 2 ? (-maxOff + i * (2 * maxOff / (n - 2))) : 0);
  offsets.push(0); // 中心弹与侧弹走同一发射/命中路径；主目标仅决定此方向基准
  offsets.sort((a, b) => a - b);
  for (const off of offsets) {
    const ap = aimOf(e, off);
    const rayLen=Math.hypot(ap.tx-fsx,ap.ty-fsy)||1;
    ap.tx=fsx+(ap.tx-fsx)*R/rayLen; ap.ty=fsy+(ap.ty-fsy)*R/rayLen;
    const angle = Math.atan2(ap.ty - fsy, ap.tx - fsx);
    const onHit = (o) => strike(o, perDmg, angle);
    combat.addProjectile({ key: 'fire', scatter: true, dmg: perDmg, t: 0, dur, sx: fsx, sy: fsy, tx: ap.tx, ty: ap.ty, hitR, onHit }, { type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', aim: true, scale: 1.35, tx: ap.tx, ty: ap.ty });
  }
}

function _fireAttackHit(combat, e, dmg) {
  const g = combat.game;   // v1.16.114 修复：strike/大火球块依赖 g.fx/g.run，此前缺声明（学多重火球会 ReferenceError）
  // 普攻灼烧（v1.16.21→v1.16.53 统一判定）：基础 20%；学「点燃」+25%（A 炽焰每级 +15%）；强化攻击同吃此加成
  combat.tryAttackDebuff('fire', e, dmg);
  // 大火球：主目标 120%
  const big = combat.lv('fire', '大火球');
  const mainMult = big > 0 ? SKILL_NUM.fire['大火球'].mainDamage : 1;
  const multi = combat.lv('fire', '多重火球');
  // v1.16.130 多重火球发射已移至 attackOnce _fireMultiShot（一次普攻从塔口扇形飞出 n 枚，中心锁定主目标）；
  //   此处仅保留单发路径（无多重火球技能时的普攻命中）
  {
    combat.damage(e, dmg * mainMult, 'fire');                        // 单发（无多重火球时）
    fireEnergyReturn(combat, e);
    if (big > 0) volcanoHit(combat, e, dmg * mainMult);
  }
  // 大火球：爆炸范围溅射（扩大 +30%/级、强化 +20%/级、引燃 50%/75%/100% 概率点燃）
  // v1.16.21：多重火球叠加时每枚火球命中处已各自爆炸（见 strike）；此块仅处理未学多重火球的单发大火球
  if (big > 0 && multi <= 0) combat._fireSingleBlast(e, dmg);
}

function _fireSingleBlast(combat, e, dmg) {
  const r0 = SKILL_NUM.fire['大火球'].radius * (1 + SKILL_NUM.fire['大火球'].radiusPerBranch * combat.branchLv('fire', '大火球', 'A'));
  const splDmg = dmg * SKILL_NUM.fire['大火球'].splashDamage * (1 + SKILL_NUM.fire['大火球'].damagePerBranch * combat.branchLv('fire', '大火球', 'B'));
  const igniteProb = SKILL_NUM.fire['大火球'].ignitePerBranch * combat.branchLv('fire', '大火球', 'C');
  combat.enemies().forEach((o) => {
    if (o === e || o.hp <= 0) return;
    const d2 = Math.hypot(o.x - e.x, o.y - e.y);
    if (d2 <= r0) {
      combat.damage(o, splDmg, 'fire');
      if (igniteProb > 0 && Math.random() < igniteProb) combat.applyBurn(o, dmg, 'fire');
    }
  });
  // 大火球视觉：大爆炸环 + 火焰粒子
  combat.fxRing(e.x, e.y, '#ff7043', r0, 0.4, 4);
  combat.fxParticle(e.x, e.y, '#ffab40', 10, r0, 0.5, 160, 6);
  combat.fxFlash(e.x, e.y, '#ff9f43');
}

function _fireImpact(combat, o, d, ang) {
  const g = combat.game;
  combat.damage(o, d, 'fire');
  combat.tryAttackDebuff('fire', o, d);
  combat.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
  combat.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
  combat.fxFlash(o.x, o.y, '#ffd24a', 0.2);
  // 多重火球 C 散射：命中点留下燃烧地面。
  const cLv = combat.branchLv('fire', '多重火球', 'C');
  if (combat.lv('fire', '多重火球') > 0 && cLv > 0) {
    _leaveMultiFireGround(combat, o, d, cLv);
  }
  // 大火球爆炸（含爆核1★/2★ 半径扩大）
  if (combat.lv('fire', '大火球') > 0) combat._fireSingleBlast(o, d);
}

function fireEnergyReturn(combat, enemy) {
  // 新版 r_fire_energy 只强化对应颜色消除的充能，不再返还普攻能量。
}

function tickFire(combat, dt) {
  const g = combat.game;
  const run = g.run;
  run._fireClock = (run._fireClock || 0) + dt;
  run._burnallChainCd = Math.max(0, (run._burnallChainCd || 0) - dt);
  run._forgeEnergyCd = Math.max(0, (run._forgeEnergyCd || 0) - dt);
  if (combat.volcanoes && combat.volcanoes.length) {
    const remV = [];
    for (const v of combat.volcanoes) {
      v.ttl -= dt; v.next -= dt;
      if (v.ttl > 0) {
        if (v.next <= 0) {
          v.next += v.interval || 0.2;
          const target = combat.enemies().filter((o) => o.hp > 0).sort((a, b) => Math.hypot(a.x-v.x,a.y-v.y)-Math.hypot(b.x-v.x,b.y-v.y))[0];
          if (target) volcanoSpark(combat, v, target);
        }
        remV.push(v);
      }
    }
    combat.volcanoes = remV;
  }
  const pillarBalance = SKILL_NUM.fire['火柱'];
  // 火·火柱：每 10 秒（触发间隔保持原值，v1.13.10）随机 1 个敌人召唤火柱（150% 伤害·半径120；A 爆发+50%/级、B 扩展+40%/级、C 余烬地面 3 秒 30%/s）
  // v1.13.9：伤害延迟到地面圈画完（约 0.6s）后结算，动画与伤害节奏一致
  const pillar = combat.lv('fire', '火柱');
  if (pillar > 0) {
    combat.timers.firePillar = (combat.timers.firePillar || 0) + dt;
    const fireCdPct = relicTier(run, 'r_fire_cd') / 100;
    const pillarBaseCd = pillarBalance.period * combat._weakPeriod('fire') * (1 - fireCdPct);
    if (combat.timers.firePillar >= pillarBaseCd) {
      combat.timers.firePillar = 0;
      combat.castEnergy('fire', '火柱');
      const cycleDmg = burnallCast(combat, 'firePillar');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('fire', e.x, e.y));
      if (alive.length) {
        const tgt = alive[Math.floor(Math.random() * alive.length)];
        const pDmg = combat.shotDmg('fire', true) * pillarBalance.damage * (1 + pillarBalance.damagePerBranch * combat.branchLv('fire', '火柱', 'A')) * cycleDmg;
        const pR = pillarBalance.radius * (1 + pillarBalance.radiusPerBranch * combat.branchLv('fire', '火柱', 'B'));
        const emberLv = combat.branchLv('fire', '火柱', 'C');
        combat.pillarWaves = combat.pillarWaves || [];
        combat.pillarWaves.push({ t: pillarBalance.delay, x: tgt.x, y: tgt.y, r: pR, dmg: pDmg, ember: emberLv, e: tgt, cycleDmg });
        // 火柱视觉：地面火环（下层）→ 冲天火柱（上层，新 6 帧火龙卷）
        // 地面环锚在目标脚下而非身体中心，避免被怪物主体完全盖住。
        g.fx.push({ type: 'pillarBase', x: tgt.x, y: pillarFloorY(tgt), r: pR, t: 0, dur: 5, seed: Math.random() * 100 });
        g.fx.push({ type: 'pillar', x: tgt.x, y: pillarFloorY(tgt), r: pR, t: 0, dur: 5, seed: Math.random() * 100 });
        combat.fxParticle(tgt.x, tgt.y - 10, '#ffd24a', 4, 60, 0.5, 150, 5);
      }
    }
    // 延迟伤害结算：圈标记完成后火柱爆发
    if (combat.pillarWaves && combat.pillarWaves.length) {
      const remaining = [];
      for (const wv of combat.pillarWaves) {
        wv.t -= dt;
        if (wv.t <= 0) {
          combat.explode(wv.x, wv.y, wv.r, wv.dmg, 'fire', undefined, undefined, undefined, '火柱');   // v1.17.50 伤害统计标注
          if (wv.ember > 0) {
            combat.groundDots = combat.groundDots || [];
            combat.groundDots.push({ x: wv.x, y: wv.y, r: wv.r, ttl: pillarBalance.emberDuration, dps: combat.shotDmg('fire', true) * pillarBalance.emberDamagePerBranch * wv.ember, key: 'fire', skill: '火柱' });   // 余烬 15%/级（C1 15%→C3 45%）；v1.17.50 标注
          }
        } else {
          remaining.push(wv);
        }
      }
      combat.pillarWaves = remaining;
    }
  }
  // 火·烈焰墙（v1.16.21 重做，替换原「火焰鹰眼」）：每 15 秒在最近怪物处释放可穿越火墙（长220px·宽45px·持续6s）
  //   释放瞬间对墙区域敌人造成 50% 攻击伤害（A 神火 +20/40/60%）；墙持续期间每 0.5s 灼烧 + C 迟滞减速 10/20/30%
  const wallBalance = SKILL_NUM.fire['烈焰墙'];
  const wall = combat.lv('fire', '烈焰墙');
  const wallDmgBonus = relicTier(run, 's_sr_fire_wall');
  if (wall > 0) {
    combat.timers.fireWall = (combat.timers.fireWall || 0) + dt;
    const wallCdPct = relicTier(run, 'r_fire_cd') / 100;
    const wallCd = wallBalance.period * combat._weakPeriod('fire') * (1 - wallCdPct);
    if (combat.timers.fireWall >= wallCd) {
      combat.timers.fireWall = 0;
      combat.castEnergy('fire', '烈焰墙');
      const cycleDmg = burnallCast(combat, 'fireWall');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('fire', e.x, e.y));
      if (alive.length) {
        const tgt = alive.reduce((a, b) => (b.y > a.y ? b : a));   // 最近怪物 = 离塔/城墙最近（y 最大）
        const aLv = combat.branchLv('fire', '烈焰墙', 'A');   // 神火 +20/40/60%
        const bLv = combat.branchLv('fire', '烈焰墙', 'B');   // 引燃 范围 +20/40/60%
        const cLv = combat.branchLv('fire', '烈焰墙', 'C');   // 迟滞 减速 10/20/30%
        const w = wallBalance.width * (1 + SKILL_NUM.fire['烈焰墙'].range[bLv]);
        const h = wallBalance.height * (1 + SKILL_NUM.fire['烈焰墙'].range[bLv]);
        const wDmg = combat.shotDmg('fire', true) * wallBalance.impactDamage * (1 + SKILL_NUM.fire['烈焰墙'].dmg[aLv]) * (1 + wallDmgBonus / 100) * cycleDmg;
        const wallX = tgt.x;
        const wallXs = [wallX];
        if (run.relic3('s_sr_fire_wall')) wallXs.push(Math.max(w / 2, Math.min(750 - w / 2, wallX + (wallX < 375 ? w : -w))));
        wallXs.forEach((wx) => combat.enemies().forEach((o) => {
          if (o.hp > 0 && Math.abs(o.x - wx) <= w / 2 && o.y >= tgt.y - h / 2 && o.y <= tgt.y + h / 2) {
            o._fireWallBurnT = wallBalance.duration;
            combat.damage(o, wDmg, 'fire', { kind: 'dot' }, '烈焰墙');
          }
        }));
        combat.fireWalls = combat.fireWalls || [];
        const wallDuration = wallBalance.duration;
        wallXs.forEach((wx) => {
          combat.fireWalls.push({ x: wx, y: tgt.y, w, h, ttl: wallDuration, cLv, tick: 0, cycleDmg });
          g.fx.push({ type: 'fireWall', x: wx, y: tgt.y, w, h, t: 0, dur: wallDuration, seed: Math.random() * 100 });
        });
      }
    } else {
      // 墙持续（触发帧不扣 ttl，从下一帧开始计时）：每 0.5s 对墙内敌人灼烧；C 迟滞减速（10/20/30%）
      if (combat.fireWalls && combat.fireWalls.length) {
        const rem = [];
        for (const wl of combat.fireWalls) {
          wl.ttl -= dt;
          wl.tick -= dt;
          if (wl.ttl <= 0) continue;
          if (wl.tick <= 0) {
            wl.tick = wallBalance.tickInterval;
            combat.enemies().forEach((o) => {
              if (o.hp <= 0) return;
              if (Math.abs(o.x - wl.x) <= wl.w / 2 && o.y >= wl.y - wl.h / 2 && o.y <= wl.y + wl.h / 2) {
                o._fireWallBurnT = 0.6;
                combat.applyBurn(o, combat.shotDmg('fire', true) * (wl.cycleDmg || 1) * (1 + wallDmgBonus / 100), 'fire');
                if (wl.cLv > 0) {
                  const sm = 1 - SKILL_NUM.fire['烈焰墙'].slow[wl.cLv];
                  if (!o._genericSlow || o._genericSlow.mult > sm) combat.applySlow(o, 1 - sm, wallBalance.slowDuration);
                }
              }
            });
          }
          rem.push(wl);
        }
        combat.fireWalls = rem;
      }
    }
  }
  // 火·火雨：每 12 秒（触发间隔保持原值，v1.13.10）在索敌区域降下火雨
  // v1.16.21 机制重做：分 3 波结算伤害，每 0.5s 一波，每波对火雨圈内敌人造成 24% 伤害（B 猛烈 +40/80/120%·档位）；
  //   C 由「引燃」改为「扩张」范围 +20/40/60%；波内动画保留（3 批×2-5 颗独立落下），伤害在整波落地后结算一次并灼烧
  const rainBalance = SKILL_NUM.fire['火雨'];
  const fireRain = combat.lv('fire', '火雨');
  if (fireRain > 0) {
    combat.timers.fireRain = (combat.timers.fireRain || 0) + dt;
    const rainCdPct = relicTier(run, 'r_fire_cd') / 100;
    const rainCd = Math.max(0.1, rainBalance.period * combat._weakPeriod('fire') * (1 - rainCdPct) - relicTier(run, 's_fire_rain', 'interval'));
    if (combat.timers.fireRain >= rainCd) {
      combat.timers.fireRain = 0;
      combat.castEnergy('fire', '火雨');
      const cycleDmg = burnallCast(combat, 'fireRain');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('fire', e.x, e.y));
      if (alive.length) {
        const bLv = combat.branchLv('fire', '火雨', 'B');
        const cLv = combat.branchLv('fire', '火雨', 'C');
        const segR = rainBalance.baseRadius * (1 + SKILL_NUM.fire['火雨'].radius[cLv]);
        const perR = 80;                                        // 火雨点视觉落点半径
        const rainRelicDmg = relicTier(run, 's_sr_fire_rain') + relicTier(run, 's_fire_rain');
        const segDmg = combat.shotDmg('fire', true) * rainBalance.waveDamage * (1 + SKILL_NUM.fire['火雨'].segDmg[bLv]) * (1 + rainRelicDmg / 100) * cycleDmg;
        const waves = rainBalance.baseWaves + combat.branchLv('fire', '火雨', 'A') + relicTier(run, 's_sr_fire_rain', 'waveAdd');
        const gap = rainBalance.waveGap;
        const FALL = rainBalance.fallDuration;                                        // 单颗下落时长（与 render raindrop 同步）
        const tgt = alive[Math.floor(Math.random() * alive.length)];
        const px = tgt.x + (Math.random() - 0.5) * 20;
        const py = tgt.y + (Math.random() - 0.5) * 20;
        combat.rainWaves = combat.rainWaves || [];
        for (let w = 0; w < waves; w++) {
          const w0 = w * gap;
          // 区域圈 fx：整波持续（生成 0.1s + 下落 0.5s + 落地余焰）
          g.fx.push({ type: 'rain', x: px, y: py, r: segR, t: -w0, dur: rainBalance.spawnWindow + FALL + 0.25, seed: Math.random() * 100 });
          // 波内视觉：3 批，0.1s 内随机时刻生成，每批 2-5 颗，独立落下（伤害按整波在最后落地时刻结算一次）
          for (let b = 0; b < 3; b++) {
            const cnt = 2 + Math.floor(Math.random() * 4);   // 2-5 颗
            for (let k = 0; k < cnt; k++) {
              const ang = Math.random() * Math.PI * 2;
              const rr = Math.sqrt(Math.random()) * segR * 0.95;  // 圈内均匀采样
              const dx = px + Math.cos(ang) * rr;
              const dy = py + Math.sin(ang) * rr;
              const s = Math.random() * rainBalance.spawnWindow;            // 0.1s 内随机生成时刻
              g.fx.push({ type: 'raindrop', x: dx, y: dy - 260, tx: dx, ty: dy, t: -(w0 + s), dur: FALL + 0.25, r: perR, seed: Math.random() * 100 });
            }
          }
          // 每波一次结算：全部颗落地后（t = w0 + rainBalance.spawnWindow + FALL）对火雨圈内敌人造成 24% 伤害并灼烧
          // v1.16.96 天火3★：火雨最后一波升级为天火一击（单点 120% 伤害）
          combat.rainWaves.push({ t: w0 + rainBalance.spawnWindow + FALL, px, py, r: segR, dmg: segDmg });
        }
        combat.fxParticle(px, py, '#ffd24a', 3, 30, 0.4, 100, 4);
      }
    }
    // 延迟结算：每波在全部颗落地后对火雨圈内敌人结算 24% 伤害 + 灼烧（v1.16.21 由每颗结算改为每波结算）
    if (combat.rainWaves && combat.rainWaves.length) {
      const remaining = [];
      for (const wv of combat.rainWaves) {
        wv.t -= dt;
        if (wv.t <= 0) {
          // v1.16.96 天火3★：末波升级为天火一击——圈内最靠城墙敌人单点 120% 伤害（取代范围结算）
          {
            combat.enemies().forEach((o) => {
              if (o.hp > 0 && Math.hypot(o.x - wv.px, o.y - wv.py) <= wv.r) {
                const wasBurning = combat.hasDot(o, 'burn');
                combat.damage(o, wv.dmg, 'fire', undefined, '火雨');   // v1.17.50 标注
                combat.applyBurn(o, wv.dmg, 'fire');   // 灼烧（叠层 DoT）
                if (run.relic3('s_fire_rain') && wasBurning) {
                  const blastR = relicTier(run, 's_fire_rain', 'explosionRadius');
                  combat.explode(o.x, o.y, blastR, combat.shotDmg('fire', true) * relicTier(run, 's_fire_rain', 'burnExplosion') / 100, 'fire', undefined, undefined, undefined, '火雨');
                }
              }
            });
          }
          // 落地余焰（轻量，替代 explode 重特效）
          combat.fxParticle(wv.px, wv.py, '#ff7043', 5, wv.r * 0.5, 0.3, 120, 4);
          combat.fxRing(wv.px, wv.py, '#ff9f43', wv.r, 0.35, 3);
        } else {
          remaining.push(wv);
        }
      }
      combat.rainWaves = remaining;
    }
  }
}

module.exports = { tickFire, _attackFireOnHit, _fireAttackOnAttack, hitFire, _fireMultiShot, _fireAttackHit, _fireSingleBlast, _fireImpact };
