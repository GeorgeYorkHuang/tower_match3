// 离线自动回放采集：真实棋盘、动画、移动出怪、攻城和Boss；不改写游戏配置或用户存档。
const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  assert = require('assert');
const root = path.resolve(__dirname, '..');
let simTime = 0;
const originalRandom = Math.random,
  originalNow = Date.now;
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function withRandom(random, fn) {
  const prior = Math.random;
  Math.random = random;
  try {
    return fn();
  } finally {
    Math.random = prior;
  }
}
Date.now = () => 1794182400000 + simTime * 1000;
// 只提供离线内存画布与存储；不接触微信、真实账号、音频设备或网络。
const gradient = { addColorStop() {} };
const ctx = new Proxy(
  {
    measureText: (s) => ({ width: String(s).length * 12 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: () => ({ data: [16, 40, 24, 255] }),
  },
  { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => ((o[k] = v), true) },
);
const canvas = { width: 750, height: 1626, getContext: () => ctx };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
global.wx = {
  createCanvas: () => canvas,
  getWindowInfo: () => ({ windowWidth: 750, windowHeight: 1626, pixelRatio: 1 }),
  getStorageSync: () => '',
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
};
const Main = require(root + '/js/game/main.js');
const CONFIG = require(root + '/js/config.js');
const { Meta } = require(root + '/js/meta.js');
const KillHooks = require(root + '/js/relics/kill-hooks.js');
const names = {
  fire: '火',
  ice: '冰',
  poison: '毒',
  electric: '电',
  boomerang: '镖',
  cannon: '炮',
};
const routes = {
  fire: [
    ['火柱', 'A'],
    ['火雨', 'B'],
    ['烈焰墙', 'B'],
  ],
  ice: [
    ['冰冻', 'A'],
    ['冬珠', 'C'],
    ['冰墙', 'C'],
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
const profiles = {
  elements: ['fire', 'ice', 'poison', 'electric'],
  no_ice: ['fire', 'poison', 'electric', 'cannon'],
  wind_control: ['ice', 'poison', 'electric', 'boomerang'],
  artillery_control: ['fire', 'ice', 'electric', 'cannon'],
  summon_control: ['fire', 'ice', 'poison', 'cannon'],
  wind_artillery: ['fire', 'ice', 'boomerang', 'cannon'],
};
function empty() {
  return {
    seconds: 0,
    spawned: 0,
    spawnedHp: 0,
    kills: 0,
    arrivals: 0,
    wallDamage: 0,
    wallHeal: 0,
    iceAbsorbed: 0,
    normalRaw: 0,
    normalEffective: 0,
    normalOverkill: 0,
    hardControlEnemySeconds: 0,
    enemySeconds: 0,
    swaps: 0,
    matchCells: 0,
    clearedCells: 0,
    matchEnergy: 0,
    refillCasts: 0,
    forgeCasts: 0,
    supportBlasts: 0,
    supportEmptyBlasts: 0,
    supportLostTargets: 0,
    towers: {},
  };
}
function towerBucket(b, k) {
  return (
    b.towers[k] ||
    (b.towers[k] = {
      energySeconds: 0,
      lowSeconds: 0,
      zeroSeconds: 0,
      actualAttackEnergy: 0,
      actualSkillEnergy: 0,
      requestedAttackEnergy: 0,
      requestedSkillEnergy: 0,
      matchCells: 0,
      matchEnergy: 0,
      refillEnergy: 0,
      matchOverflow: 0,
      skillCasts: 0,
      unpaidSkillCasts: 0,
    })
  );
}
function damageSnapshot(run) {
  return JSON.parse(JSON.stringify(run.dmgStat));
}
function diffDamage(after, before) {
  const out = {};
  for (const [k, s] of Object.entries(after)) {
    const old = before[k] || { total: 0, normal: 0, dot: 0, skill: {} };
    out[k] = {
      total: s.total - old.total,
      normal: s.normal - old.normal,
      dot: s.dot - old.dot,
      skill: {},
    };
    for (const [name, v] of Object.entries(s.skill))
      out[k].skill[name] = v - (old.skill[name] || 0);
  }
  return out;
}

function collect({
  field = 'ancient',
  profile = 'elements',
  seed = 41,
  cadence = 2,
  maxWave = 60,
  maxSeconds = 2400,
  startWave = 1,
  startLevel = 1,
  windowEnd = null,
  fixedLevel = false,
}) {
  simTime = 0;
  const combatRandom = rng(seed ^ 0xc0b47);
  Math.random = combatRandom;
  let boardRandom = rng(seed ^ 0xb0a4),
    waveRandom = rng(seed ^ 0x77a9),
    spawnRandom = rng(seed ^ 0x5a9a);
  const g = new Main();
  GameGlobal.game = g;
  g.meta = new Meta();
  g.meta.tutorial = { version: 1, done: true };
  g.meta.globalSkills = { slots: ['refill', 'forge'] };
  g.menuStage = field;
  withRandom(boardRandom, () => g.newRun(false));
  g.run.rng = rng(seed ^ 0x7342);
  g.run.effects.rng = g.run.rng;
  g.fx = [];
  g.run.fxTarget = g.fx;
  g.toast = () => {};
  g.save.save = () => {};
  g.playSfx = () => {};
  g.vibrate = () => {};
  g.tickBossFx = () => {};
  g.renderer.preloadBoss = () => {};
  g.dmgNumbers = { step() {}, clear() {}, add() {}, push() {} };
  g.match3._specialsFx = () => {};
  g.match3._burst = () => {};
  g.match3._match5Show = () => {};
  g.pendingRelicPicks = [];
  g.runRelics = [];
  g.battleRelics = [];
  g.fieldChests = [];
  g.run.slotOrder = profiles[profile].slice();
  g.run.effects.setActiveKeys(g.run.slotOrder);
  const plan = {};
  for (const key of g.run.slotOrder) {
    const t = g.run.effects.tower(key);
    t.unlock();
    t.energy = CONFIG.GLOBAL_SKILL.startEnergy;
    plan[key] = routes[key].map(([name]) => ({ name, type: 'skill', fromTower: key }));
    for (let level = 1; level <= 3; level++)
      for (const [name, branch] of routes[key])
        plan[key].push({ name, type: 'branch', branch, fromTower: key });
    for (let i = 0; i < startLevel - 1; i++) {
      t.pending++;
      assert(g.run.applyChoice(key, plan[key][t.level - 1]).ok);
    }
  }
  const b = g.run.board;
  for (const method of ['trySwap', 'regen', 'init']) {
    const bound = b[method].bind(b);
    b[method] = (...a) => withRandom(boardRandom, () => bound(...a));
  }
  g.run._initGlobalMap();
  let totals = empty(),
    current = empty(),
    waveRows = [],
    terminal = null,
    lastDamage = {},
    waveStartedAt = 0;
  let seen = new WeakSet(),
    arrived = new WeakSet(),
    moves = [],
    swaps = 0,
    swapEnergy = 0,
    swapCells = 0;
  let peaks = { enemies: 0, fx: 0, ground: 0, turrets: 0, sticks: 0 };
  const upgradeLog = [];
  function both(fn) {
    fn(totals);
    fn(current);
  }
  function observe(e) {
    if (seen.has(e)) return;
    seen.add(e);
    both((row) => {
      row.spawned++;
      row.spawnedHp += e.maxHp || e.hp;
    });
  }
  g.flushUpgrades = () => {
    for (const key of g.run.slotOrder) {
      const t = g.run.effects.tower(key);
      while (t.pending > 0 && t.level < 13) {
        const choice = plan[key][t.level - 1];
        assert(choice, 'Upgrade plan exhausted');
        assert(g.run.applyChoice(key, choice).ok);
        upgradeLog.push({
          t: simTime,
          wave: g.run.wave,
          key,
          level: t.level,
          name: choice.name,
          branch: choice.branch || null,
        });
      }
    }
    return false;
  };
  if (fixedLevel) g.run.gainExp = () => 0; // 补充窗口固定同等投入，独立于完整成长回放。
  // 只保留真实击杀经验；本批排除圣物、掉落入盘、局外奖励与商店。
  g.onKillReward = (e) => KillHooks.experience(g.run, e, g.meta.relicBonus());
  const nativeOnKill = g.combat.onKill.bind(g.combat);
  g.combat.onKill = (e) => {
    observe(e);
    both((row) => row.kills++);
    return nativeOnKill(e);
  };
  const nativeDamage = g.combat.damage.bind(g.combat);
  g.combat.damage = (e, amount, key, kind, skill) => {
    observe(e);
    const before = Math.max(0, e.hp);
    nativeDamage(e, amount, key, kind, skill);
    // Boss跨形态的伤害溢出另由原生统计处理；过量率只统计普通/精英生命。
    if (!e.isBoss && before > 0) {
      const raw = Math.max(0, before - e.hp),
        effective = Math.min(before, raw);
      both((row) => {
        row.normalRaw += raw;
        row.normalEffective += effective;
        row.normalOverkill += raw - effective;
      });
    }
  };
  for (const method of ['fxParticle', 'fxRing', 'fxFlash', 'fxBeam']) g.combat[method] = () => {};
  const nativeSpend = g.run.spendAttackEnergy.bind(g.run);
  g.run.spendAttackEnergy = (t, cost) => {
    const before = t.energy,
      need = cost === undefined ? g.run.attackCost(t) : cost,
      result = nativeSpend(t, cost);
    both((row) => {
      const tb = towerBucket(row, t.key);
      tb.actualAttackEnergy += Math.max(0, before - t.energy);
      tb.requestedAttackEnergy += need;
    });
    return result;
  };
  const nativeCast = g.combat.castEnergy.bind(g.combat);
  g.combat.castEnergy = (key, name) => {
    const t = g.run.effects.tower(key),
      before = t.energy,
      cost = CONFIG.SKILL_ENERGY[name] || 0;
    const result = nativeCast(key, name);
    both((row) => {
      const tb = towerBucket(row, key);
      tb.actualSkillEnergy += Math.max(0, before - t.energy);
      tb.requestedSkillEnergy += cost;
      tb.skillCasts++;
      if (before < cost) tb.unpaidSkillCasts++;
    });
    return result;
  };
  const nativeMatch = g.run.applyMatch.bind(g.run);
  g.run.applyMatch = (...a) => {
    const result = nativeMatch(...a);
    both((row) => {
      row.matchCells += a[2];
      row.matchEnergy += result.ammoGain || 0;
    });
    return result;
  };
  const nativeBlast = g.run._blastReward.bind(g.run);
  g.run._blastReward = (step) => {
    const before = Object.fromEntries(
      g.run.slotOrder.map((k) => [k, g.run.effects.tower(k).energy]),
    );
    const cells = {},
      unique = new Set();
    for (const cell of step.clearedDetails || []) {
      const id = cell.r + ',' + cell.c;
      if (unique.has(id) || !cell.color) continue;
      unique.add(id);
      const key = CONFIG.COLORS[cell.color] && CONFIG.COLORS[cell.color].tower;
      if (key) cells[key] = (cells[key] || 0) + 1;
    }
    const result = nativeBlast(step);
    both((row) => {
      row.clearedCells += unique.size;
      for (const key of g.run.slotOrder) {
        const tb = towerBucket(row, key),
          count = cells[key] || 0,
          gained = Math.max(0, g.run.effects.tower(key).energy - before[key]);
        tb.matchCells += count;
        tb.matchEnergy += gained;
        tb.matchOverflow += Math.max(0, count * g.run._energyGain('3', 1) - gained);
        row.matchEnergy += gained;
      }
    });
    return result;
  };
  const nativeGlobal = g.combat.castGlobal.bind(g.combat);
  g.combat.castGlobal = (which) => {
    const before = Object.fromEntries(
      g.run.slotOrder.map((k) => [k, g.run.effects.tower(k).energy]),
    );
    const skill = g.run.globalSlots[which === 'shuffle' ? 0 : 1],
      result = nativeGlobal(which);
    if (result && skill === 'refill')
      both((row) => {
        for (const key of g.run.slotOrder)
          towerBucket(row, key).refillEnergy += Math.max(
            0,
            g.run.effects.tower(key).energy - before[key],
          );
      });
    return result;
  };
  let wall = g.run.lineHp;
  Object.defineProperty(g.run, 'lineHp', {
    configurable: true,
    get() {
      return wall;
    },
    set(value) {
      assert(Number.isFinite(value));
      const delta = Math.max(0, value) - Math.max(0, wall);
      if (delta < 0) both((row) => (row.wallDamage -= delta));
      else if (delta > 0) both((row) => (row.wallHeal += delta));
      wall = value;
    },
  });
  const siege = g.siegeEnemies.bind(g);
  g.siegeEnemies = (dt) => {
    for (const e of g.enemies) {
      observe(e);
      if (e.y >= g.ly.wallY - Math.max(10, (e.size || 40) * 0.5) && !arrived.has(e)) {
        arrived.add(e);
        both((row) => row.arrivals++);
      }
    }
    const shield = g.combat.iceWall,
      before = (shield && shield.absorb) || 0;
    siege(dt);
    const absorbed = shield ? Math.max(0, before - shield.absorb) : 0;
    both((row) => (row.iceAbsorbed += absorbed));
  };
  const delayed = g.combat.updateDelayed.bind(g.combat);
  g.combat.updateDelayed = (dt) => {
    for (const d of g.combat.delayed)
      if (
        d.skill === '炮火支援' &&
        d.t + dt >= d.delay &&
        !(d.target && d.target.hp > 0 && g.enemies.includes(d.target))
      )
        both((row) => row.supportLostTargets++);
    return delayed(dt);
  };
  const explode = g.combat.explode.bind(g.combat);
  g.combat.explode = (x, y, r, damage, key, knock, slow, exclude, skill) => {
    if (skill === '炮火支援') {
      const hit = g.enemies.some(
        (e) => e.hp > 0 && e !== exclude && Math.hypot(e.x - x, e.y - y) <= r,
      );
      both((row) => {
        row.supportBlasts++;
        if (!hit) row.supportEmptyBlasts++;
      });
    }
    return explode(x, y, r, damage, key, knock, slow, exclude, skill);
  };
  const oldPush = g.wave.pushEnemy.bind(g.wave);
  g.wave.pushEnemy = (...a) =>
    withRandom(spawnRandom, () => {
      const result = oldPush(...a);
      observe(g.enemies[g.enemies.length - 1]);
      return result;
    });
  const oldBuild = g.wave.buildPlan.bind(g.wave);
  g.wave.buildPlan = () => {
    waveRandom = rng((seed + 100003 * g.run.wave) >>> 0);
    spawnRandom = rng((seed ^ Math.imul(g.run.wave, 7777)) >>> 0);
    return withRandom(waveRandom, () => oldBuild());
  };
  const oldTick = g.wave.tick.bind(g.wave);
  g.wave.tick = (dt) => withRandom(waveRandom, () => oldTick(dt));
  const oldStart = g.wave.start.bind(g.wave);
  g.wave.start = (keep) => {
    current = empty();
    waveStartedAt = simTime;
    lastDamage = damageSnapshot(g.run);
    return withRandom(waveRandom, () => oldStart(keep));
  };
  function closeWave(reason) {
    waveRows.push({
      wave: g.run.wave,
      reason,
      startAt: waveStartedAt,
      endAt: simTime,
      wallHp: g.run.lineHp,
      wallMax: g.run.lineMaxHp || CONFIG.LINE.hp,
      remainingEnemies: g.enemies.filter((e) => e.hp > 0).length,
      levels: Object.fromEntries(g.run.slotOrder.map((k) => [k, g.run.effects.tower(k).level])),
      ...current,
      damage: diffDamage(damageSnapshot(g.run), lastDamage),
      boss: {
        locked: !!g.run.bossLock,
        id: g.run.bossEnemy && g.run.bossEnemy.bossId,
        hp: g.run.bossEnemy && g.run.bossEnemy.hp,
        maxHp: g.run.bossEnemy && g.run.bossEnemy.maxHp,
        phase:
          (g.run.bossEncounter && g.run.bossEncounter.phase) ||
          (g.run.bossEnemy && g.run.bossEnemy.phase),
        members:
          g.run.bossEncounter &&
          g.run.bossEncounter.members &&
          g.run.bossEncounter.members.map((e) => ({ hp: e.hp, maxHp: e.maxHp, phase: e.phase })),
      },
    });
  }
  g.finishRun = () => {
    g.runSummary = { victory: !!g.run.finalVictory };
    terminal = g.run.finalVictory ? 'victory' : 'wall_broken';
    g.state = 'collected';
  };
  const oldEnd = g.waveEnd.bind(g);
  g.waveEnd = () => {
    // 采样窗口最后一波必须清理残怪，不能把“投放后3秒可叠波”记成成功清场。
    if (windowEnd && g.run.wave >= windowEnd && !g.run.broken) {
      if (g.enemies.some((e) => e.hp > 0)) return;
      closeWave('window_cleared');
      terminal = 'window_complete';
      g.state = 'collected';
      return;
    }
    const reason = g.run.broken
      ? 'wall_broken'
      : g.run.bossLock
        ? 'boss_cleared'
        : !g.enemies.length
          ? 'cleared'
          : 'overlap';
    closeWave(reason);
    return oldEnd();
  };
  g.run.wave = startWave - 1;
  g.run.windStacks = field === 'frost' ? Math.floor((startWave - 1) / 15) : 0;
  g.run.lineMaxHp = CONFIG.LINE.hp;
  g.run.lineHp = CONFIG.LINE.hp;
  g.state = 'fighting';
  g.run.broken = false;
  g.run.runRelic = {};
  g.wave.start(false);
  let nextAction = 0,
    nextGlobal = 0,
    lastWave = g.run.wave;
  const dt = 1 / 60;
  for (let frame = 0; simTime < maxSeconds && !terminal && g.run.wave <= maxWave; frame++) {
    simTime = frame * dt;
    if (g.state === 'evacuation') {
      g.state = 'fighting';
      g.startNextWave();
    }
    if (g.state === 'fighting') {
      g.flushUpgrades();
      if (simTime >= nextAction && !g.anim && !g._chestBusy) {
        const move = g.match3._findAutoTripleMove();
        if (move) {
          const before = JSON.stringify(b.grid);
          if (g.match3.trySwap(...move[0], ...move[1])) {
            moves.push({
              at: simTime,
              move,
              board: crypto.createHash('sha1').update(before).digest('hex'),
            });
            swaps++;
            both((row) => row.swaps++);
            nextAction = simTime + cadence;
          }
        } else {
          b.regen();
          nextAction = simTime + cadence;
        }
      }
      if (simTime >= nextGlobal) {
        const meanEnergy =
          g.run.slotOrder.reduce((n, k) => n + g.run.effects.tower(k).energy, 0) / 4;
        if (meanEnergy < 50 && g.combat.castGlobal('shuffle')) both((row) => row.refillCasts++);
        if (g.enemies.length >= 4 || g.run.bossLock) {
          if (!(g.run.gsState.forge > 0) && g.combat.castGlobal('refill'))
            both((row) => row.forgeCasts++);
        }
        nextGlobal = simTime + 1;
      }
    }
    const isBattle = g.state === 'fighting';
    g.update(dt);
    if (isBattle) {
      both((row) => {
        row.seconds += dt;
        for (const key of g.run.slotOrder) {
          const e = g.run.effects.tower(key).energy,
            t = towerBucket(row, key);
          t.energySeconds += e * dt;
          if (e < 20) t.lowSeconds += dt;
          if (e <= 0) t.zeroSeconds += dt;
        }
        for (const e of g.enemies) {
          row.enemySeconds += dt;
          if (e.frozen > 0 || e.paralyzed > 0 || e._vineT > 0) row.hardControlEnemySeconds += dt;
        }
      });
    }
    for (const e of g.enemies) observe(e);
    peaks.enemies = Math.max(peaks.enemies, g.enemies.length);
    peaks.fx = Math.max(peaks.fx, g.fx.length);
    peaks.ground = Math.max(peaks.ground, g.combat.groundDots.length);
    peaks.turrets = Math.max(peaks.turrets, g.combat.turrets.length);
    peaks.sticks = Math.max(peaks.sticks, g.combat.poisonSticks.length);
  }
  if (!terminal) {
    terminal = simTime >= maxSeconds ? 'time_cap' : 'wave_cap';
    closeWave(terminal);
  }
  for (const t of Object.values(totals.towers)) {
    assert(Number.isFinite(t.energySeconds));
  }
  const output = {
    field,
    profile,
    keys: profiles[profile],
    seed,
    cadence,
    startWave,
    startLevel,
    windowEnd,
    fixedLevel,
    terminal,
    seconds: simTime,
    wave: g.run.wave,
    clearedWaves: g.run.clearedWaves,
    wallHp: Math.max(0, g.run.lineHp),
    wallMax: g.run.lineMaxHp,
    levels: Object.fromEntries(g.run.slotOrder.map((k) => [k, g.run.effects.tower(k).level])),
    totals,
    damage: damageSnapshot(g.run),
    killsByTower: { ...g.combat.kills },
    waves: waveRows,
    peaks,
    upgrades: upgradeLog,
    moves,
  };
  return output;
}

module.exports = {
  collect,
  profiles,
  routes,
  names,
  restore() {
    Math.random = originalRandom;
    Date.now = originalNow;
  },
};
if (require.main === module) {
  const field = process.argv[2] || 'ancient',
    profile = process.argv[3] || 'elements',
    cadence = Number(process.argv[4]) || 2;
  try {
    const result = collect({ field, profile, cadence, seed: 41, maxSeconds: 2400 });
    fs.writeFileSync(
      root + '/docs/moving-pilot-' + field + '-' + profile + '.json',
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        field,
        profile,
        terminal: result.terminal,
        wave: result.wave,
        seconds: result.seconds,
        hp: result.wallHp,
        swaps: result.moves.length,
        levels: result.levels,
        spawned: result.totals.spawned,
        kills: result.totals.kills,
        arrivals: result.totals.arrivals,
      }),
    );
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
}
