// 六塔固定靶测试夹具：读取真实战斗逻辑，按合法选择建塔，记录伤害与实扣能量。
// 仅供离线测试；固定随机数和时钟，调用方须在finally中restore。
/** Read-only production-combat benchmark; only local results/reports are written. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert'),
  { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..');
const CONFIG = require(root + '/js/config.js'),
  { Run } = require(root + '/js/run.js'),
  { Meta } = require(root + '/js/meta.js');
const { CombatSystem, initEnemyState } = require(root + '/js/combat.js'),
  { layout } = require(root + '/js/game/render.js');
const BossControl = require(root + '/js/combat/boss-control.js');
const names = {
  fire: '火',
  ice: '冰',
  poison: '毒',
  electric: '电',
  boomerang: '回旋镖',
  cannon: '炮',
};
const branches = ['A', 'B', 'C'];
let rng = 1,
  clock = 0;
const originalRandom = Math.random,
  originalNow = Date.now;
Math.random = () => {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  return rng / 4294967296;
};
Date.now = () => clock;
const steady = {
  fire: [
    ['多重火球', 'A'],
    ['大火球', 'B'],
    ['灼烧', 'C'],
  ],
  ice: [
    ['多重冰锥', 'C'],
    ['冰穿刺', 'A'],
    ['碎冰', 'B'],
  ],
  poison: [
    ['毒棒', 'B'],
    ['毒池', 'B'],
    ['毒性强化', 'A'],
  ],
  electric: [
    ['连锁', 'A'],
    ['活电', 'A'],
    ['麻痹', 'A'],
  ],
  boomerang: [
    ['多镖', 'A'],
    ['接镖', 'A'],
    ['风痕', 'B'],
  ],
  cannon: [
    ['炮台', 'B'],
    ['炮火支援', 'A'],
    ['地雷阵', 'A'],
  ],
};
const alternate = {
  fire: [
    ['火柱', 'A'],
    ['火雨', 'B'],
    ['烈焰墙', 'B'],
  ],
  ice: [
    ['冰花', 'B'],
    ['冬珠', 'C'],
    ['冰墙', 'C'],
  ],
  poison: [
    ['剧毒', 'A'],
    ['瘟疫', 'A'],
    ['毒爆', 'A'],
  ],
  electric: [
    ['球形闪电', 'B'],
    ['雷暴', 'A'],
    ['极光电击', 'B'],
  ],
  boomerang: [
    ['弹力镖', 'B'],
    ['风暴镖', 'B'],
    ['风眼涡旋', 'C'],
  ],
  cannon: [
    ['重炮', 'B'],
    ['双管齐射', 'A'],
    ['碎裂弹', 'C'],
  ],
};
function setup(key, choices, step, scenario, seed, energyMode = 'steady', talent = null) {
  rng = seed;
  clock = 0;
  const run = new Run({ seed }),
    meta = new Meta();
  run.metaRef = meta;
  run.slotOrder = [key];
  run.effects.setActiveKeys([key]);
  const tower = run.effects.tower(key);
  tower.unlock();
  tower.energy = 60;
  for (const [name, branch] of choices) {
    tower.pending++;
    let result = tower.applyChoice({ name, type: 'skill', fromTower: key }, { [key]: tower });
    assert(result.ok);
    for (let n = 0; n < step; n++) {
      tower.pending++;
      result = tower.applyChoice(
        { name, type: 'branch', branch, fromTower: key },
        { [key]: tower },
      );
      assert(result.ok);
    }
  }
  assert.equal(tower.level, 1 + choices.length * (1 + step));
  if (talent)
    run.talentState = {
      bonuses: {
        [key]: {
          attack: talent.attack || 0,
          speed: talent.speed || 0,
          charge: 0,
          damage: 0,
          skill: 0,
          dot: 0,
          duration: 0,
        },
      },
      purple: [],
      gold: [],
      ready: {},
      charge: {},
    };
  const ly = layout();
  const points =
    scenario === 'boss'
      ? [[375, 610]]
      : scenario === 'dense'
        ? Array.from({ length: 12 }, (_, i) => [322 + (i % 4) * 35, 570 + Math.floor(i / 4) * 35])
        : Array.from({ length: 6 }, (_, i) => [90 + (i % 3) * 280, 440 + Math.floor(i / 3) * 250]);
  const game = {
    meta,
    run,
    ly,
    state: 'fighting',
    fx: [],
    enemies: points.map(([x, y], i) =>
      initEnemyState({
        id: i + 1,
        x,
        y,
        hp: 1e10,
        maxHp: 1e10,
        type: 'normal',
        genLv: 1,
        isBoss: scenario === 'boss',
        speed: 0,
        armor: 0,
        immuneKnockback: true,
      }),
    ),
    playSfx() {},
    toast() {},
  };
  const combat = new CombatSystem(game);
  game.combat = combat;
  combat.reset();
  combat.towerMuzzle = () => ({ x: 375, y: ly.slotY + ly.slotSize / 2 });
  for (const method of ['fxParticle', 'fxRing', 'fxFlash', 'fxBeam']) combat[method] = () => {};
  let energy = 0,
    castEnergy = 0,
    events = 0,
    damage = 0,
    normal = 0,
    dot = 0,
    bySkill = {},
    measure = false,
    cc = 0,
    slow = 0,
    actualAttackEnergy = 0,
    actualSkillEnergy = 0,
    attackCount = 0,
    skillCastCount = 0,
    unpaidSkillCasts = 0,
    energySum = 0,
    measuredTime = 0;
  const energyBands = { zero: 0, low: 0, ramp: 0, neutral: 0, high: 0 };
  const spend = run.spendAttackEnergy.bind(run);
  run.spendAttackEnergy = (t, cost) => {
    const before = t.energy;
    const result = spend(t, cost);
    if (measure) {
      energy += cost === undefined ? run.attackCost(t) : cost;
      actualAttackEnergy += Math.max(0, before - t.energy);
      attackCount++;
    }
    return result;
  };
  const cast = combat.castEnergy.bind(combat);
  combat.castEnergy = (k, n) => {
    const t = combat.tower(k),
      before = t.energy,
      cost = CONFIG.SKILL_ENERGY[n] || 0;
    const result = cast(k, n);
    if (measure) {
      castEnergy += cost;
      actualSkillEnergy += Math.max(0, before - t.energy);
      skillCastCount++;
      if (cost > before) unpaidSkillCasts++;
    }
    return result;
  };
  const apply = combat.damage.bind(combat);
  combat.damage = (e, d, key, kind, skill) => {
    let hp = e.hp;
    apply(e, d, key, kind, skill);
    if (measure) {
      const dealt = hp - e.hp;
      assert(Number.isFinite(dealt) && dealt >= 0, 'non-finite/negative damage');
      events++;
      damage += dealt;
      if (skill) bySkill[skill] = (bySkill[skill] || 0) + dealt;
      const k = typeof kind === 'object' ? kind.kind : kind;
      if (k === 'dot' || k === 'true') dot += dealt;
      else if (!skill) normal += dealt;
    }
  };
  return {
    run,
    tower,
    game,
    combat,
    points,
    measure() {
      measure = true;
    },
    stats() {
      return {
        damage,
        normal,
        dot,
        bySkill,
        energy,
        castEnergy,
        events,
        cc,
        slow,
        actualAttackEnergy,
        actualSkillEnergy,
        attackCount,
        skillCastCount,
        unpaidSkillCasts,
        energyBands,
        meanEnergy: energySum / measuredTime,
      };
    },
    tick(dt) {
      if (energyMode === 'steady') tower.energy = 60;
      else if (energyMode === 'supply')
        tower.energy = Math.min(run.armoryEnergyMax(key), tower.energy + dt * 0.7);
      // Production tickStatus already advances the shared Boss control budget once.
      combat.update(dt);
      if (measure) {
        const E = tower.energy;
        energySum += E * dt;
        measuredTime += dt;
        energyBands[
          E <= 0 ? 'zero' : E < 20 ? 'low' : E < 40 ? 'ramp' : E <= 90 ? 'neutral' : 'high'
        ] += dt;
      }
      for (let i = 0; i < game.enemies.length; i++) {
        const e = game.enemies[i];
        e.x = points[i][0];
        e.y = points[i][1];
        if (measure) {
          if (e.frozen > 0 || e.paralyzed > 0 || e._vineT > 0) cc += dt;
          if (e.slow && e.slow.ttl > 0) slow += dt * (1 - e.slow.mult);
        }
      }
      game.fx = game.fx.filter((f) => (f.t += dt) < f.dur);
    },
  };
}
function simulate(
  key,
  choices,
  step,
  scenario,
  seed = 41,
  energyMode = 'steady',
  talent = null,
  options = {},
) {
  const s = setup(key, choices, step, scenario, seed, energyMode, talent),
    dt = Number(process.env.TOWER_BENCH_DT) || 1 / 30,
    warm = options.warmSeconds || 30,
    seconds = options.measureSeconds || 60;
  for (let f = 0; f < (warm + seconds) / dt; f++) {
    clock = f * dt * 1000;
    if (f === warm / dt) s.measure();
    s.tick(dt);
  }
  const st = s.stats();
  return {
    key,
    level: s.tower.level,
    choices: choices.map(([n, b]) => ({ name: n, branch: step ? b : null, branchLevel: step })),
    scenario,
    energyMode,
    dps: st.damage / seconds,
    normalDps: st.normal / seconds,
    dotDps: st.dot / seconds,
    actualAttackEnergyPerSecond: st.actualAttackEnergy / seconds,
    actualSkillEnergyPerSecond: st.actualSkillEnergy / seconds,
    attacksPerSecond: st.attackCount / seconds,
    skillCastsPerSecond: st.skillCastCount / seconds,
    unpaidSkillCasts: st.unpaidSkillCasts,
    meanEnergy: st.meanEnergy,
    energyBands: Object.fromEntries(
      Object.entries(st.energyBands).map(([k, v]) => [k, v / seconds]),
    ),
    skillDps: Object.fromEntries(Object.entries(st.bySkill).map(([k, v]) => [k, v / seconds])),
    attackEnergyPerSecond: st.energy / seconds,
    skillEnergyPerSecond: st.castEnergy / seconds,
    hardControlFraction: st.cc / seconds / s.points.length,
    slowEquivalent: st.slow / seconds / s.points.length,
    endEnergy: s.tower.energy,
    events: st.events,
  };
}
function average(rows) {
  const merged = { ...rows[0] };
  for (const key of [
    'dps',
    'normalDps',
    'dotDps',
    'attackEnergyPerSecond',
    'skillEnergyPerSecond',
    'hardControlFraction',
    'slowEquivalent',
    'endEnergy',
    'actualAttackEnergyPerSecond',
    'actualSkillEnergyPerSecond',
    'attacksPerSecond',
    'skillCastsPerSecond',
    'unpaidSkillCasts',
    'meanEnergy',
  ])
    merged[key] = rows.reduce((a, r) => a + r[key], 0) / rows.length;
  merged.dpsRange = {
    min: Math.min(...rows.map((r) => r.dps)),
    max: Math.max(...rows.map((r) => r.dps)),
  };
  merged.energyBands = {};
  for (const r of rows)
    for (const [k, v] of Object.entries(r.energyBands))
      merged.energyBands[k] = (merged.energyBands[k] || 0) + v / rows.length;
  merged.skillDps = {};
  for (const r of rows)
    for (const [k, v] of Object.entries(r.skillDps))
      merged.skillDps[k] = (merged.skillDps[k] || 0) + v / rows.length;
  return merged;
}
const growth = Object.entries(CONFIG.TOWERS).map(([key, t]) => ({
  key,
  name: names[key],
  baseDps: t.baseDps,
  rate: 1 / t.atkInterval,
  baseAttack: t.baseDps * t.atkInterval,
  dpsGrowth: t.perLv,
  attackGrowth: t.perLv * t.atkInterval,
  attackCost: t.attackCost,
  energyPerSecond: t.attackCost / t.atkInterval,
  levels: [1, 5, 9, 13].map((level) => ({
    level,
    dps: t.baseDps + t.perLv * (level - 1),
    attack: (t.baseDps + t.perLv * (level - 1)) * t.atkInterval,
  })),
}));

module.exports = {
  setClock(ms) { clock = ms; },
  setup,
  simulate,
  average,
  steady,
  alternate,
  growth,
  names,
  restore() {
    Math.random = originalRandom;
    Date.now = originalNow;
  },
};
