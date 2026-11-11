/** 电/冰周期技观察器：施法、真实命中、雷球空脉冲和冰墙收益；不改参数或随机数。 */
'use strict';
const SKILLS = require('../js/config/tower-skills.js');
const CONFIG = require('../js/config.js');
const TRACKED = new Set(['球形闪电', '雷暴', '极光电击', '冰花', '冬珠', '冰墙']);
function attach(g) {
  const c = g.combat, casts = [], objects = new WeakMap();
  let time = 0, current = null, currentShot = null;
  const utility = { seconds: 0, iceSlowMovingEnemySeconds: 0, iceSlowSiegeEnemySeconds: 0,
    frozenSiegeEnemySeconds: 0, paralyzedSiegeEnemySeconds: 0, eitherControlSiegeEnemySeconds: 0,
    shieldActiveSeconds: 0, depletedShieldSeconds: 0, shieldAbsorbed: 0, wallHeal: 0,
    nominalExpiryHeal: 0 };
  function tag(record) {
    if (!record) return;
    if (record.skill === '球形闪电') for (const s of c.shots) {
      if (s.ballLightning && !objects.has(s)) { objects.set(s, record); record.objects.push(s); }
    }
    if (record.skill === '冰花') for (const d of c.delayed) {
      if (d.key !== 'ice' || !d.fn || objects.has(d)) continue;
      objects.set(d, record); record.objects.push(d);
      const fn = d.fn;
      d.fn = (...args) => { const previous = current; current = record;
        try { return fn(...args); } finally { current = previous; } };
    }
    if (record.skill === '冬珠') for (const orb of c.frostOrbs || []) {
      if (!objects.has(orb)) { objects.set(orb, record); record.objects.push(orb); }
    }
  }
  const cast = c.castEnergy.bind(c);
  c.castEnergy = (key, skill) => {
    tag(current);
    const tower = c.tower(key), before = tower.energy;
    const result = cast(key, skill);
    current = TRACKED.has(skill) ? {
      id: casts.length, skill, tower: key, wave: g.run.wave, at: time, energyBefore: result,
      asked: CONFIG.SKILL_ENERGY[skill] || 0, paid: Math.max(0, before - tower.energy),
      inRange: g.enemies.filter(e => e.hp > 0 && c.inTowerRange(key, e.x, e.y, result)).length,
      desiredTargets: skill === '雷暴' ? SKILLS.electric['雷暴'].targetCount + SKILLS.electric['雷暴'].targetsPerBranch * c.branchLv(key, skill, 'A')
        + g.run.relicNum('s_elec_field') + g.run.relicValue('s_sr_elec_storm', 'targetAdd') : null,
      hitEvents: 0, effectiveDamage: 0, rawRequested: 0, targets: new Set(), objects: [],
      pulses: 0, pulsesWithHits: 0, pulseHits: 0, trailHits: 0, outsidePrimary: 0,
    } : null;
    if (current) casts.push(current);
    return result;
  };
  for (const method of ['tickIce', 'tickElectric']) {
    const tick = c[method].bind(c);
    c[method] = dt => {
      const previous = current; current = null;
      const wall = c.iceWall, hp = g.run.lineHp;
      try { return tick(dt); } finally {
        tag(current);
        if (method === 'tickIce' && wall && wall.ttl <= 0 && wall.heal > 0 && g.run.wave >= 25 && g.run.wave <= 39) {
          utility.nominalExpiryHeal += wall.heal;
          utility.wallHeal += Math.max(0, g.run.lineHp - hp);
        }
        current = previous;
      }
    };
  }
  const step = c.stepShot.bind(c);
  c.stepShot = (s, dt) => {
    const previous = current, oldShot = currentShot;
    const record = objects.get(s), timer = s.damageTimer || 0;
    current = record || null; currentShot = s;
    const hitsBefore = record ? record.pulseHits : 0;
    try { return step(s, dt); } finally {
      if (record && s.ballLightning && s.t < s.dur) {
        const ticks = Math.max(0, Math.round((timer + dt - s.damageTimer) / s.damageInterval));
        record.pulses += ticks;
        if (record.pulseHits > hitsBefore) record.pulsesWithHits += ticks;
      }
      current = previous; currentShot = oldShot;
    }
  };
  const damage = c.damage.bind(c);
  c.damage = (e, amount, source, kind, skill) => {
    let record = current && current.skill === skill ? current : null;
    // 一星冬珠固定一个驻场点；旧球跳伤时通常没有本帧的新施法上下文。
    if (skill === '冬珠' && !record) {
      const orb = (c.frostOrbs || []).find(o => objects.has(o) && Math.abs(o.dmg - amount) < 1e-7 && Math.hypot(e.x - o.x, e.y - o.y) <= o.r);
      if (orb) record = objects.get(orb);
    }
    if (!record || e.hp <= 0) return damage(e, amount, source, kind, skill);
    const bucket = () => (g.run.dmgStat[record.tower] && g.run.dmgStat[record.tower].skill[skill]) || 0;
    const before = bucket();
    const isPulse = kind === 'dot' || (kind && kind.kind === 'dot');
    if (record.skill === '极光电击' && record.hitEvents === 0 && !c.inTowerRange('electric', e.x, e.y, record.energyBefore)) record.outsidePrimary++;
    const result = damage(e, amount, source, kind, skill);
    record.hitEvents++; record.targets.add(e); record.rawRequested += amount;
    record.effectiveDamage += Math.max(0, bucket() - before);
    if (currentShot && currentShot.ballLightning) {
      if (isPulse) record.pulseHits++; else record.trailHits++;
    }
    return result;
  };
  const siege = g.siegeEnemies.bind(g);
  g.siegeEnemies = dt => {
    const observed = g.run.wave >= 25 && g.run.wave <= 39;
    const wall = c.iceWall, absorbed = wall ? wall.absorb : 0;
    if (observed) {
      utility.seconds += dt;
      if (wall && wall.ttl > 0) {
        utility.shieldActiveSeconds += dt;
        if (wall.absorb <= 0) utility.depletedShieldSeconds += dt;
      }
      for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        const atWall = e.y >= g.ly.wallY - Math.max(10, (e.size || 40) * .5);
        if (e._iceSlow && e._iceSlow.ttl > 0) utility[atWall ? 'iceSlowSiegeEnemySeconds' : 'iceSlowMovingEnemySeconds'] += dt;
        if (atWall) {
          if (e.frozen > 0) utility.frozenSiegeEnemySeconds += dt;
          if (e.paralyzed > 0) utility.paralyzedSiegeEnemySeconds += dt;
          if (e.frozen > 0 || e.paralyzed > 0) utility.eitherControlSiegeEnemySeconds += dt;
        }
      }
    }
    const result = siege(dt);
    if (observed && wall) utility.shieldAbsorbed += Math.max(0, absorbed - wall.absorb);
    return result;
  };
  return {
    afterUpdate(dt) { time += dt; },
    finish() {
      return { utility, casts: casts.map(record => {
        const { targets, objects: spawned, ...rest } = record;
        const pending = spawned.filter(o => c.shots.includes(o) || c.delayed.includes(o) || (c.frostOrbs || []).includes(o)).length;
        return { ...rest, uniqueTargets: targets.size, spawnedObjects: spawned.length, pendingObjects: pending,
          complete: record.skill === '球形闪电' || record.skill === '冰花' || record.skill === '冬珠' ? pending === 0 : true };
      }) };
    },
  };
}
module.exports = { attach };
