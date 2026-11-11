'use strict';
const SKILL_NUM = require('../config/tower-skills.js');
const CONFIG = require('../config.js');
const GS_BALANCE = require('../config/global-balance.js');
const BoomerangTower = require('./towers/boomerang.js');
const IceTower = require('./towers/ice.js');
const { attackEnergyMultiplier } = require('./attack-energy.js');
const Incoming = require('./incoming-damage.js');
const CannonFlight = require('./cannon-flight.js');

function tickTower(combat, key, dt) {    const g = combat.game;
  const t = combat.tower(key);
  if (!t || t.level === 0) return;
  const cfg = CONFIG.TOWERS[key];
  let iv = combat.interval(key);
  // 回旋镖攻击节奏重做（无攻速属性）：投掷节奏 = 镖飞回 + 接镖硬间隔——
  //   未学「接镖」：接镖后 0.5 秒才投出下一镖；学「接镖」：接镖后立即投掷（C 续投加成）
  if (key === 'boomerang') return BoomerangTower.tickAttack(combat, dt);
  combat.atkTimers[key] = (combat.atkTimers[key] || 0) + dt;
  // 普通攻击按各塔实际攻击间隔推进。
  while (combat.atkTimers[key] >= iv) {
    combat.atkTimers[key] -= iv;
    combat.attackOnce(key);
  }
}

function attackOnce(combat, key) {
  const g = combat.game;
  // 普攻按基础费×预期输出倍率×各已激活技能能耗系数收费；伤害取扣费前能量档位。
  // 弹药箱3★：能量不足时从备用能量库借用
  const ammoT = combat.tower(key);
  if (!ammoT || ammoT.level === 0) return;
  const target = combat.pickTarget(key);
  if (!target) {
    // 回旋镖：无目标可投时复位等待标记，避免接镖流程空转
    if (key === 'boomerang') combat.bWait[key] = false;
    return;
  }
  // 本轮弹道沿用锁定目标时的射程。扣费、借能或返能只影响后续攻击，
  // 不能把已经选中的目标截到本轮散射/穿透弹道之外。
  const attackRange = combat.range(key);
  const shotStart = combat.shots.length;
  // 速射3★：速射期间每 10 次攻击免费 1 发（不耗能量）
  let freeShot = false;
  if (key === 'cannon' && g.run.relic3('can_rapid') && ammoT) {
    ammoT._rapidN = (ammoT._rapidN || 0) + 1;
    if (ammoT._rapidN >= 10) { ammoT._rapidN = 0; freeShot = true; }
  }
  const energyCost = ammoT ? g.run.attackCost(ammoT) * attackEnergyMultiplier(combat, key) : 0;
  if(key==='cannon'&&require('../talents/runtime.js').consume(g.run,key)){freeShot=true;if(g.toast)g.toast('圣庭·永动装填：本次普攻免能耗','#f0ca66');}
  const energyAtLaunch = ammoT.energy;
  const energyBefore = freeShot ? energyAtLaunch : g.run.spendAttackEnergy(ammoT, energyCost);
  const paid = Math.max(0, energyBefore - ammoT.energy);
  // 接镖 B 回能：回旋镖 30% 概率不耗能量（已在上面消耗，回补；按塔实际能耗回补）
  const regain = key === 'boomerang' && combat.branchLv('boomerang', '接镖', 'B') > 0 && Math.random() < SKILL_NUM.boomerang['接镖'].catchRegain;
  if (ammoT && regain) ammoT.energy = Math.min(ammoT.energy + paid, g.run.armoryEnergyMax(key));
  // 疾风回旋3★：攻速加成期间接镖 15% 概率不耗能量（攻速加成存在 = 实际攻击间隔 < 基础间隔）
  if (ammoT && key === 'boomerang' && g.run.relic3('boo_speed') && combat.interval(key) < CONFIG.TOWERS[key].atkInterval && Math.random() < 0.15) {
    // 两种免耗同时命中也只退本次实际扣除量，缺能时不能凭名义费用制造能量。
    if (!regain) ammoT.energy = Math.min(ammoT.energy + paid, g.run.armoryEnergyMax(key));
  }
  const cfg = CONFIG.TOWERS[key];
  const ly = combat.ly();
  // 发射点统一走 towerMuzzle（测试战场单塔大槽 / 正式战斗槽位），修复弹道从塔区中间凭空发出
  const mz = combat.towerMuzzle(key);
  const sx = mz.x, sy = mz.y;
  const tint = { fire: '#e74c3c', ice: '#7fd4ff', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' }[key] || '#ffd24a';
  const dur = cfg.shot.dur;
  let dmg = combat.shotDmg(key, false, false, energyBefore);
  const volley = g.run.gsState && g.run.gsState.volley;
  if (volley && volley[key]) {
    delete volley[key]; dmg *= GS_BALANCE.volley.damagePerShot;
    for (let i=1;i<GS_BALANCE.volley.count;i++) {
      const start = combat.shots.length;
      if (key === 'fire' && combat.lv('fire', '多重火球') > 0) combat._fireMultiShot(target, dmg, false, attackRange);
      else if (key === 'ice' && combat.lv('ice', '多重冰锥') > 0) combat._iceMultiShot(target, dmg, attackRange);
      else combat.addProjectile({key,target,dmg,t:0,dur,sx,sy}, {type:'shot',kind:cfg.shot.kind,color:tint,x:sx,y:sy,tx:target.x,ty:target.y,t:0,dur,key});
      for (let j = start; j < combat.shots.length; j++) {
        combat.shots[j].t = -i * GS_BALANCE.volley.shotDelay;
        if (combat.shots[j].visual) combat.shots[j].visual.t = combat.shots[j].t;
      }
    }
  }
  // 炮·双管齐射：基础25%概率双发，A提高双发率；B追发第三炮，C第二炮命中返能。
  const duelProb = key === 'cannon' ? (0.25 + 0.15 * combat.branchLv('cannon', '双管齐射', 'A') + combat.relicVal('can_double') / 100 + g.run.relicValue('s_can_splash', 'doubleChance') / 100) : 0;
  const duel = key === 'cannon' && combat.lv('cannon', '双管齐射') > 0 && Math.random() < duelProb;
  const duelB = key === 'cannon' ? combat.branchLv('cannon', '双管齐射', 'B') : 0;
  const triple = duel && duelB > 0 && Math.random() < SKILL_NUM.cannon['双管齐射'].thirdShotChance[duelB];
  // 火塔攻击级挂点（熔炉之息免费火柱 / 火焰弹射：每攻击一次判定一次，与弹道数量无关）
  const fireTriple = key === 'fire' && combat._fireAttackOnAttack(target, dmg);
  // 弹道（视觉）+ 命中（逻辑）
  // 普通弹仍保留原目标引用；炮弹在本函数末尾改为固定预判落点，不在飞行中换目标。
  const baseShot = { type: 'shot', kind: cfg.shot.kind, color: tint, x: sx, y: sy, tx: target.x, ty: target.y, t: 0, dur, key, target, fold: key === 'boomerang' && combat.lv('boomerang', '折返增伤') > 0 };
  const fireMulti = key === 'fire' && combat.lv('fire', '多重火球') > 0;
  const iceMulti = key === 'ice' && combat.lv('ice', '多重冰锥') > 0;
  const icePierce = key === 'ice' && !iceMulti && combat.lv('ice', '冰穿刺') > 0;
  if (fireTriple) {
    g.playSfx('shot', 0.25);
  } else if (icePierce) {
    IceTower.launchIcePiercingShot(combat, target, dmg, 1.15, undefined, undefined, attackRange);
    g.playSfx('shot', 0.25);
  } else if (fireMulti) {
    // 多重火球重做：一次普攻从塔口扇形飞出 n 枚火球——中心一枚锁定主目标，其余以目标方向为基准两侧扇形，
    //   全部为真实可见弹道、命中才结算（不再"普攻先命中再从目标处散射"）
    combat._fireMultiShot(target, dmg, false, attackRange);
    g.playSfx('shot', 0.25);
  } else if (iceMulti) {
    // 多重冰锥重做：同火塔——一次普攻扇形 n 枚冰锥，中心锁定主目标
    combat._iceMultiShot(target, dmg, attackRange);
    g.playSfx('shot', 0.25);
  } else {
    // ：大火球激活 → 火球弹体 ×2（扩大一倍）
    if (key === 'fire' && combat.lv('fire', '大火球') > 0) baseShot.scale = 2.0;
    // ：冰塔普攻弹道统一采用多重冰锥样式（冰蓝菱形 + 放大 1.15）
    if (key === 'ice') baseShot.scale = 1.15;
    g.fx.push(baseShot);
    g.playSfx('shot', 0.25);
  }
  // 塔口发射特效：攻击瞬间塔口喷发微火星 + 小闪光（直线/闪电类塔）
  if (cfg.shot.kind === 'line' || cfg.shot.kind === 'bolt') {
    combat.fxParticle(sx, sy - 4, tint, 3, 24, 0.25, 90, 4);
    combat.fxFlash(sx, sy, tint, 0.15);
  }
  // 冰塔开火专属特效：塔口冰晶迸发 + 冰蓝闪光
  if (key === 'ice') {
    combat.fxParticle(sx, sy - 6, '#eaf6ff', 5, 34, 0.28, 120, 5);
    combat.fxParticle(sx, sy - 6, '#7fd4ff', 3, 44, 0.32, 70, 4);
    combat.fxFlash(sx, sy, '#a9d6f5', 0.2);
  }
  if (key === 'boomerang') {
    BoomerangTower.launchAttack(combat, { key, target, dmg, dur, sx, sy, tint, baseShot, attackRange });
  } else if (!fireTriple && !fireMulti && !iceMulti && !icePierce) {
    baseShot.projectile = { key, target, dmg, t: 0, dur, sx, sy, visual:baseShot };
    combat.shots.push(baseShot.projectile);
  }
  if (duel) {
    // 双管齐射第二发（更短弹道）；C 回膛仅在这发实际命中后判定返能。
    // 双发3★：双发的第二发必定命中血量最低的敌人
    let duelTarget = target;
    if (g.run.relic3('can_double')) {
      duelTarget = combat.enemies().filter((o) => o.hp > 0).sort((a, b) => a.hp - b.hp)[0] || target;
    }
    const secondVisual = { ...baseShot, projectile:null, target: duelTarget, tx: duelTarget.x, ty: duelTarget.y, t: 0, dur: dur * 0.75 };
    g.fx.push(secondVisual);
    const duelC = combat.branchLv('cannon', '双管齐射', 'C');
    const onSecondHit = duelC > 0 ? (hitTarget) => {
      const tower = combat.tower('cannon');
      const maxEnergy = g.run.armoryEnergyMax('cannon');
      if (!tower || tower.energy >= maxEnergy) return;
      if (Math.random() < SKILL_NUM.cannon['双管齐射'].energyReturnChance[duelC]) {
        tower.energy = Math.min(maxEnergy, tower.energy + SKILL_NUM.cannon['双管齐射'].energyReturn);
        combat.fxParticle(hitTarget.x, hitTarget.y - 8, '#6fffd0', 5, 28, 0.35, 110, 4);
        g.fx.push({ type: 'floatText', text: '+1 能量', x: hitTarget.x, y: hitTarget.y - 30, t: 0, dur: 0.8, size: 17, color: '#6fffd0' });
      }
    } : null;
    const secondShot = { key, target: duelTarget, dmg, t: 0, dur: dur * 0.75, sx, sy, onAfterHit: onSecondHit, visual:secondVisual };
    secondVisual.projectile=secondShot;combat.shots.push(secondShot);

    if (triple) {
      const muzzle = combat.towerMuzzle('cannon');
      const tripleDur = dur * 0.9; // 第三炮稍慢抵达，形成追发节奏
      combat.fxFlash(sx, sy, '#ffd24a', 0.32);
      combat.fxRing(sx, sy, '#ffad33', 28, 0.36, 3.5);
      const thirdVisual = { ...baseShot, projectile:null, target: duelTarget, tx: duelTarget.x, ty: duelTarget.y, color: '#ffd24a', t: 0, dur: tripleDur, scale: 1.18, triple: true };
      g.fx.push(thirdVisual);
      const thirdShot = { key, target: duelTarget, dmg: dmg * SKILL_NUM.cannon['双管齐射'].thirdShotDamage, t: 0, dur: tripleDur, sx: muzzle.x, sy: muzzle.y, visual:thirdVisual };
      thirdVisual.projectile=thirdShot;combat.shots.push(thirdShot);
    }
  }
  const emitted = combat.shots.slice(shotStart);
  if(key==='cannon')for(const shot of emitted)CannonFlight.configure(combat,shot);
  Incoming.reserveAttack(combat,key,emitted);
}

module.exports = { tickTower, attackOnce };
