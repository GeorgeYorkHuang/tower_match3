/**
 * runtime.js —— 天赋战斗效果：把装配结果应用到对局，处理属性加成及紫、金天赋触发。
 * 局内充能、待触发标记和持续伤害均保存在当前对局或怪物对象上。
 */
'use strict';
const T = require('./model.js');
const COLOR = {
  red: 'fire',
  orange: 'cannon',
  purple: 'boomerang',
  yellow: 'electric',
  blue: 'ice',
  green: 'poison',
};
const EMPTY = { attack: 0, speed: 0, charge: 0, damage: 0, skill: 0, dot: 0, duration: 0 };

// 开局时生成战斗快照，局内触发进度不写回天赋装配档案。
function initialize(run, meta) {
  const a = T.analyze(meta);
  run.talentState = {
    bonuses: a.bonuses,
    purple: a.purple.map((id) => T.get(id).purple.key),
    gold: a.gold.map((id) => T.get(id).gold.key),
    charge: {},
    ready: {},
  };
}

function bonus(run, key) {
  return (run && run.talentState && run.talentState.bonuses[key]) || EMPTY;
}

// 时长加成以秒直接相加；负面强度加成则在各自的效果入口处理。
function statusDuration(run, key, seconds) {
  return Math.max(0, seconds + (bonus(run, key).duration || 0));
}

function slowStrength(run, key, strength) {
  const extra = bonus(run, key).dot || 0;
  return extra > 0 ? Math.max(strength, Math.min(0.9, strength * (1 + extra))) : strength;
}

function gain(run, color, cells) {
  const state = run.talentState,
    key = COLOR[color];
  if (!state || !state.gold.includes(key)) return;
  state.charge[key] = (state.charge[key] || 0) + Math.max(0, cells || 0);
  // 满 12 格保留一次待触发机会，余数继续累计；ready 不叠加成多次储备。
  if (state.charge[key] >= 12) {
    state.ready[key] = true;
    state.charge[key] %= 12;
  }
}

function consume(run, key) {
  const state = run.talentState;
  if (!state || !state.gold.includes(key) || !state.ready[key]) return false;
  state.ready[key] = false;
  return true;
}

function beforeDamage(combat, e, dmg, key, kind, skill) {
  const run = combat.game.run,
    state = run.talentState;
  if (!state) return dmg;
  const b = bonus(run, key);
  let value = dmg;
  if (kind === 'dot') value *= 1 + b.dot;
  // 紫天赋按目标身上的负面状态或联动标记判断额外伤害。
  const p = state.purple,
    hasDot = (type) =>
      (e.dots || []).some((d) => d.type === type && d.ttl > 0) ||
      (e._talentDots || []).some(
        (d) => d.key === (type === 'burn' ? 'fire' : 'poison') && d.ttl > 0
      );
  if (p.includes('fire') && key === 'fire' && kind !== 'dot' && hasDot('poison')) value *= 1.15;
  if (p.includes('cannon') && key === 'cannon' && hasDot('burn')) value *= 1.15;
  if (p.includes('boomerang') && key === 'boomerang' && (e._talentCannon || 0) > 0) value *= 1.15;
  if (p.includes('electric') && key === 'electric' && (e._talentBoomerang || 0) > 0) value *= 1.15;
  if (p.includes('ice') && key === 'ice' && e.paralyzed > 0) value *= 1.15;
  if (
    p.includes('poison') &&
    key === 'poison' &&
    kind === 'dot' &&
    (e.frozen > 0 || (e._iceSlow && e._iceSlow.ttl > 0))
  )
    value *= 1.15;
  // 金天赋仅由普通命中消费，持续伤害和技能命中不会重复消费充能。
  if (kind === 'hit' && !skill) {
    if (key === 'cannon' && p.includes('boomerang')) e._talentCannon = 3;
    if (key === 'boomerang' && p.includes('electric')) e._talentBoomerang = 3;
    if (key !== 'cannon' && key !== 'boomerang' && consume(run, key)) {
      if (key === 'fire' || key === 'poison') {
        e._talentDots = e._talentDots || [];
        e._talentDots.push({
          key,
          ttl: statusDuration(run, key, key === 'fire' ? 3 : 4),
          dps: dmg * 0.1,
          tick: 0,
          transfer: true,
        });
      }
      if (key === 'electric') {
        const targets = [e].concat(
          combat
            .enemies()
            .filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100)
            .slice(0, 1)
        );
        targets.forEach((o) => {
          o.paralyzed = Math.max(o.paralyzed || 0, statusDuration(run, 'electric', 0.5));
          combat.applySlow(o, 0.5, 0.5, 'electric');
        });
      }
      if (key === 'ice')
        combat
          .enemies()
          .filter((o) => o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100)
          .forEach((o) => combat.applySlow(o, 0.3, 3, 'ice'));
      if (combat.fxRing) combat.fxRing(e.x, e.y, '#eccc75', 45, 0.35, 3);
    }
  }
  return value;
}

function tick(combat, e, dt) {
  for (const key of ['_talentCannon', '_talentBoomerang'])
    if (e[key] > 0) e[key] = Math.max(0, e[key] - dt);
  const dots = e._talentDots || [];
  for (let i = dots.length - 1; i >= 0; i--) {
    const d = dots[i],
      live = Math.min(Math.max(0, d.ttl), dt);
    d.ttl -= dt;
    if (live > 0 && e.hp > 0)
      combat.damage(e, d.dps * live, d.key, 'dot', d.key === 'fire' ? '圣印灼烧' : '圣种毒素');
    if (d.ttl <= 0) dots.splice(i, 1);
  }
}

// 只转移剩余有效时间，并关闭转移标记，防止死亡后无限连锁传播。
function onDeath(combat, e) {
  for (const d of e._talentDots || []) {
    if (!d.transfer || d.ttl <= 0) continue;
    const target = combat
      .enemies()
      .find((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100);
    if (!target) continue;
    target._talentDots = target._talentDots || [];
    target._talentDots.push({ ...d, transfer: false });
  }
  e._talentDots = [];
}

// 同一枚回旋镖只处理一次返程奖励，避免多次命中重复返还能量。
function returnHit(combat, shot) {
  if (shot._talentReturned) return;
  shot._talentReturned = true;
  const run = combat.game.run;
  if (!consume(run, 'boomerang')) return;
  const tw = combat.tower('boomerang');
  if (tw) tw.energy = Math.min(run.armoryEnergyMax('boomerang'), tw.energy + 4);
}

module.exports = {
  initialize,
  bonus,
  statusDuration,
  slowStrength,
  gain,
  consume,
  beforeDamage,
  tick,
  onDeath,
  returnHit,
};
