'use strict';

// 回旋镖风痕：沿固定曲线等距留痕，以战斗时钟每0.2秒结算伤害。
// 采样位置、出生时间和伤害跳数均独立于渲染帧率；不缓存跨局状态。
const Trajectory = require('./boomerang-trajectory.js');
const BALANCE = require('../config/tower-skills.js').boomerang['风痕'];
const EPSILON = 1e-8;

function pathSamples(shot) {
  const samples = [];
  const segments = BALANCE.pathSegments;
  const spacing = BALANCE.sampleDistance;
  let previous = Trajectory.position(shot, 0);
  let carried = 0;
  samples.push({ ...previous, p: 0 });
  // 先按固定参数细分曲线，再沿折线等距取点，不使用本帧移动距离决定落点。
  for (let i = 1; i <= segments; i++) {
    const current = Trajectory.position(shot, i / segments);
    const dx = current.x - previous.x, dy = current.y - previous.y;
    const length = Math.hypot(dx, dy);
    let used = 0;
    while (length > 0 && carried + length - used >= spacing) {
      used += spacing - carried;
      const portion = used / length;
      samples.push({
        x: previous.x + dx * portion,
        y: previous.y + dy * portion,
        p: (i - 1 + portion) / segments,
      });
      carried = 0;
    }
    carried += length - used;
    previous = current;
  }
  return samples;
}

function stage(combat, shot, progress) {
  if (!shot._windSamples) {
    shot._windSamples = pathSamples(shot);
    shot._windSampleIndex = 0;
    shot._windSampleTime = 0;
  }
  const previousTime = shot._windSampleTime;
  shot._windSampleTime = shot.t;
  const nextSample = shot._windSamples[shot._windSampleIndex];
  if (!nextSample || nextSample.p > progress + EPSILON) return;
  const frameStart = combat.windClock || 0;
  const pending = combat.pendingWindTrails || (combat.pendingWindTrails = []);
  const duration = BALANCE.duration + BALANCE.durationPerBranch * combat.branchLv('boomerang', '风痕', 'A');
  const dps = combat.shotDmg('boomerang', true) * BALANCE.damage
    * (1 + BALANCE.damagePerBranch * combat.branchLv('boomerang', '风痕', 'B'));
  const slow = BALANCE.slow[combat.branchLv('boomerang', '风痕', 'C')];
  while (shot._windSampleIndex < shot._windSamples.length) {
    const sample = shot._windSamples[shot._windSampleIndex];
    if (sample.p > progress + EPSILON) break;
    // 回填本帧内的真实出生时间，低帧率跨过多个采样点时也不会提前扣持续时间。
    const born = Math.round((frameStart + sample.p * shot.dur - previousTime) * 1e9) / 1e9;
    pending.push({
      x: sample.x, y: sample.y, r: BALANCE.radius, ttl: duration, dps, slow,
      born, expires: born + duration, nextTick: born + BALANCE.damageInterval,
    });
    shot._windSampleIndex++;
  }
}

function initialize(trail, now) {
  // 兼容脚本产生的风痕；正式弹道的风痕已带有精确时间。
  if (trail.born == null) trail.born = now;
  if (trail.expires == null) trail.expires = trail.born + trail.ttl;
  if (trail.nextTick == null) trail.nextTick = trail.born + BALANCE.damageInterval;
}

function activeAt(trail, time) {
  return trail.born <= time + EPSILON && trail.expires >= time - EPSILON;
}

function advance(combat, dt) {
  if (!(dt > 0)) return;
  const start = combat.windClock || 0;
  const end = start + dt;
  combat.windClock = end;
  const trails = combat.windTrails || (combat.windTrails = []);
  for (const trail of trails) initialize(trail, start);

  // 多枚飞镖在同帧提交的落点按出生时间入队；容量判断不受弹道遍历顺序影响。
  const pending = combat.pendingWindTrails || [];
  pending.sort((a, b) => a.born - b.born);
  for (const trail of pending) {
    let active = 0;
    for (const other of trails) {
      if (other.expires > trail.born + EPSILON) active++;
    }
    if (active < BALANCE.maxTrails) trails.push(trail);
  }
  pending.length = 0;
  if (!trails.length) return;

  const expireBurst = combat.game.run.relic3('boo_trail');
  const stackedDamage = combat.game.run.relic3('boo_wind');
  const interval = BALANCE.damageInterval;
  for (const trail of trails) {
    // 一次跨过多个结算点（低帧率/倍速）时补齐；到期边界的最后一跳仍然有效。
    while (trail.nextTick <= end + EPSILON && trail.nextTick <= trail.expires + EPSILON) {
      const tickTime = trail.nextTick;
      trail.nextTick += interval;
      for (const enemy of combat.enemies()) {
        const dx = enemy.x - trail.x, dy = enemy.y - trail.y;
        if (enemy.hp <= 0 || dx * dx + dy * dy > trail.r * trail.r) continue;
        let multiplier = 1;
        if (stackedDamage) {
          let layers = 1;
          for (const other of trails) {
            if (other === trail || !activeAt(other, tickTime)) continue;
            const ox = enemy.x - other.x, oy = enemy.y - other.y;
            if (ox * ox + oy * oy <= other.r * other.r && ++layers >= 3) break;
          }
          multiplier = 1 + 0.3 * layers;
        }
        // damage为每秒比例；每0.2秒结算一份，不能把每跳写成完整每秒伤害。
        combat.damage(enemy, trail.dps * interval * multiplier, 'boomerang', { kind: 'dot' }, '风痕');
        if (trail.slow) combat.applySlow(enemy, trail.slow, interval);
      }
    }
  }
  // 所有伤害跳结算后再回收，叠层判定可以准确访问同一时间仍有效的邻近风痕。
  for (let i = trails.length - 1; i >= 0; i--) {
    const trail = trails[i];
    trail.ttl = Math.max(0, trail.expires - end);
    if (trail.expires > end + EPSILON) continue;
    if (expireBurst) {
      combat.explode(trail.x, trail.y, trail.r, combat.shotDmg('boomerang', true) * 0.6,
        'boomerang', undefined, undefined, undefined, '风痕');
    }
    trails.splice(i, 1);
  }
}

module.exports = { stage, advance, pathSamples };
