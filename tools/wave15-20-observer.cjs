/** W15–20只读观察器：逐波供能、收费、普攻弹体/直击/溅射与Boss阶段，不改变随机调用。 */
'use strict';
const CONFIG = require('../js/config.js');
const ENERGY = require('../js/config/energy-state.js');
const SKILLS = require('../js/config/tower-skills.js');
function attach(g, neutralKeys = []) {
  const c = g.combat, run = g.run, waves = {}, shots = new WeakMap(), launched = [];
  let frameWave = run.wave, attack = null, impact = null;
  const wave = (no = run.wave) => waves[no] || (waves[no] = {
    wave: no, seconds: 0, wallStart: run.lineHp, wallEnd: run.lineHp,
    bossSeconds: 0, bossPhase1Seconds: 0, bossPhase2Seconds: 0, bossShieldSeconds: 0,
    bossWallSeconds: 0, bossFirstHp: null, bossLastHp: null, bossLastShield: null,
    bossPhase: null, bossDamage: {}, towers: {},
  });
  const tower = (key, no = run.wave) => {
    const r = wave(no);
    return r.towers[key] || (r.towers[key] = {
      seconds: 0, energySeconds: 0, zeroSeconds: 0, low20Seconds: 0, low40Seconds: 0,
      rangeBlockedSeconds: 0, launches: 0, asked: 0, paid: 0, shortLaunches: 0,
      launchEnergy: 0, launchDamageState: 0, expectedFactor: 0, coefficient: 0,
      projectiles: 0, hitProjectiles: 0, missedProjectiles: 0, deadTargetMisses: 0,
      directHits: 0, splashHits: 0, directDamage: 0, splashDamage: 0,
      bossDirectDamage: 0, bossSplashDamage: 0, emittedDamage: 0,
      levels: [], injected: 0,
    });
  };
  function coefficient(key) {
    let result = 1;
    for (const [name, def] of Object.entries(SKILLS[key])) {
      if (def.attackEnergyFactor != null && c.lv(key, name) > 0) result *= def.attackEnergyFactor;
    }
    return result;
  }
  const spend = run.spendAttackEnergy.bind(run);
  run.spendAttackEnergy = (t, cost) => {
    const before = t.energy, value = spend(t, cost);
    if (attack && attack.key === t.key) {
      attack.asked = cost == null ? run.attackCost(t) : cost;
      attack.paid = Math.max(0, before - t.energy);
      attack.energy = value;
    }
    return value;
  };
  const hit = c.hit.bind(c);
  c.hit = (key, enemy, dmg, shot) => {
    const previous = impact;
    const meta = shot && shots.get(shot);
    if (meta) impact = { meta, target: enemy };
    try { return hit(key, enemy, dmg, shot); } finally { impact = previous; }
  };
  const attackOnce = c.attackOnce.bind(c);
  c.attackOnce = key => {
    if (!['fire', 'cannon'].includes(key)) return attackOnce(key);
    const t = c.tower(key), start = c.shots.length, previous = attack;
    attack = { key, asked: 0, paid: 0, energy: t ? t.energy : 0, wave: run.wave };
    try {
      const result = attackOnce(key);
      const created = c.shots.slice(start).filter(s => s.key === key);
      if (!created.length) return result;
      const r = tower(key, attack.wave), coeff = coefficient(key);
      r.launches++; r.asked += attack.asked; r.paid += attack.paid;
      if (attack.energy < attack.asked) r.shortLaunches++;
      r.launchEnergy += attack.energy;
      r.launchDamageState += ENERGY.evaluate(attack.energy).attack;
      r.coefficient += coeff;
      r.expectedFactor += attack.asked / CONFIG.TOWERS[key].attackCost / coeff;
      for (const s of created) {
        const meta = { key, wave: attack.wave, hit: false, finished: false };
        shots.set(s, meta); launched.push(meta); r.projectiles++; r.emittedDamage += s.dmg;
        if (s.onHit) {
          const original = s.onHit;
          s.onHit = (...args) => {
            const prev = impact; impact = { meta, target: args[0] };
            try { return original(...args); } finally { impact = prev; }
          };
        }
      }
      return result;
    } finally { attack = previous; }
  };
  const step = c.stepShot.bind(c);
  c.stepShot = (s, dt) => {
    const result = step(s, dt), meta = shots.get(s);
    if (!result && meta && !meta.finished) {
      meta.finished = true;
      if (!meta.hit) {
        const r = tower(meta.key, meta.wave);
        r.missedProjectiles++;
        if (s.target && (s.target.hp <= 0 || !g.enemies.includes(s.target))) r.deadTargetMisses++;
      }
    }
    return result;
  };
  const damage = c.damage.bind(c);
  c.damage = (enemy, amount, key, kind, skill) => {
    const no = run.wave, before = (run.dmgStat[key] || {}).total || 0;
    const originalHp = enemy.hp, boss = enemy.bossId === 'altar_rosea';
    const type = kind && typeof kind === 'object' ? kind.kind : kind;
    const primary = impact && impact.meta.key === key && !skill && (!type || type === 'hit');
    const direct = primary && impact.target === enemy;
    const result = damage(enemy, amount, key, kind, skill);
    const effective = Math.max(0, ((run.dmgStat[key] || {}).total || 0) - before);
    if (boss && originalHp > 0 && effective > 0) {
      const w = wave(no); w.bossDamage[key] = (w.bossDamage[key] || 0) + effective;
    }
    if (primary && originalHp > 0) {
      const meta = impact.meta, r = tower(key, no);
      const label = direct ? 'direct' : 'splash';
      r[label + 'Hits']++; r[label + 'Damage'] += effective;
      if (boss) r[direct ? 'bossDirectDamage' : 'bossSplashDamage'] += effective;
      if (direct && !meta.hit) { meta.hit = true; tower(key, meta.wave).hitProjectiles++; }
    }
    return result;
  };
  // 保持同帧补到60的参考方式，只改变指定塔能量；其他塔仍使用真实三消供能。
  const update = c.update.bind(c);
  c.update = dt => {
    for (const key of neutralKeys) {
      if (run.wave < 15) continue;
      const t = c.tower(key);
      if (t) { const value = Math.min(60, run.armoryEnergyMax(key)); tower(key).injected += Math.max(0, value - t.energy); t.energy = value; }
    }
    return update(dt);
  };
  return {
    beforeUpdate() { frameWave = run.wave; wave(frameWave); },
    afterUpdate(dt) {
      const w = wave(frameWave); w.seconds += dt; w.wallEnd = run.lineHp;
      const boss = run.bossEnemy;
      if (boss && boss.bossId === 'altar_rosea' && boss.hp > 0 && frameWave === 20) {
        w.bossSeconds += dt;
        w[boss.phase === 2 ? 'bossPhase2Seconds' : 'bossPhase1Seconds'] += dt;
        if (boss.shield > 0) w.bossShieldSeconds += dt;
        if (boss.y >= g.ly.wallY - Math.max(10, (boss.size || 40) * .5)) w.bossWallSeconds += dt;
        if (w.bossFirstHp == null) w.bossFirstHp = boss.hp;
        w.bossLastHp = boss.hp; w.bossLastShield = boss.shield || 0; w.bossPhase = boss.phase;
      }
      for (const key of run.slotOrder.filter(k => ['fire', 'cannon'].includes(k))) {
        const t = c.tower(key); if (!t) continue;
        const r = tower(key, frameWave); r.seconds += dt; r.energySeconds += t.energy * dt;
        if (t.energy <= 0) r.zeroSeconds += dt;
        if (t.energy < 20) r.low20Seconds += dt;
        if (t.energy < 40) r.low40Seconds += dt;
        if (!r.levels.includes(t.level)) r.levels.push(t.level);
        const muzzle = c.towerMuzzle(key), actual = c.range(key), full = Math.max(60, CONFIG.TOWERS[key].range - 50);
        let hasActual = false, hasFull = false;
        for (const e of g.enemies) if (e.hp > 0) {
          const distance = Math.hypot(e.x - muzzle.x, e.y - muzzle.y);
          if (distance <= actual) hasActual = true;
          if (distance <= full) hasFull = true;
        }
        if (hasFull && !hasActual) r.rangeBlockedSeconds += dt;
      }
    },
    finish() {
      return { waves: Object.values(waves), pendingProjectiles: launched.filter(s => !s.finished).length,
        launchedProjectiles: launched.length };
    },
  };
}
module.exports = { attach };
