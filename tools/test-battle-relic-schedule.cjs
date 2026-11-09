/** 验证方案B的12个节点、Boss去重、金色全流程、寻踪优惠及原奖励兼容。 */
const assert = require('assert');
const fixture = require('./moving-battle-fixture.cjs');
const Main = require('../js/game/main.js');
const { Meta } = require('../js/meta.js');
const CONFIG = require('../js/config.js');
const RULE = require('../js/config/battle-relic-drops.js');
const Drops = require('../js/relics/battle-drops.js');
const Chests = require('../js/game/flows/board-chests.js');
const Timing = require('../js/config/board-chests.js');
const Reroll = require('../js/economy/pick-reroll.js');
const Galvin = require('../js/bosses/galvin.js');
const savedRandom = Math.random;

function game(field = 'ancient') {
  const g = new Main();
  g.meta = new Meta();
  g.meta.tutorial.done = true;
  g.menuStage = field;
  g.saveData = null;
  g.save.save = () => {};
  g.toast = () => {};
  g.newRun(true);
  return g;
}
function enemy(wave, type = 'boss', extra = {}) {
  return { x: 375, y: 400, type, waveNo: wave, genLv: 1, isBoss: type === 'boss', ...extra };
}
function active(g, keys = ['fire', 'ice', 'poison', 'electric']) {
  g.run.slotOrder = keys;
  keys.forEach(key => { g.run.effects.tower(key).level = 1; });
}
function allGold(pick) {
  assert.equal(pick.rarity, 'ssr');
  assert(pick.candidates.length > 0);
  assert(pick.candidates.every(c => CONFIG.relicRarity(c.id) === 'ssr'));
  assert.equal(new Set(pick.candidates.map(c => c.id)).size, pick.candidates.length);
}
function openChest(g, chest) {
  Chests.tick(g, Timing.ground);
  Chests.tick(g, Timing.flight);
  assert.equal(g.run.board.grid[chest.r][chest.c].rarity, 'ssr');
  const board = g.run.board, row = chest.r > 0 ? chest.r - 1 : chest.r + 1;
  const colors = board.activeColors;
  board.grid = board.grid.map((line, r) => line.map((v, c) =>
    typeof v === 'string' ? colors[(r * 2 + c) % colors.length] : v));
  const col = Math.max(0, Math.min(board.cols - 3, chest.c - 1));
  for (let c = col; c < col + 3; c++) board.grid[row][c] = 'red';
  for (const c of [col - 1, col + 3]) if (c >= 0 && c < board.cols && typeof board.grid[row][c] === 'string') board.grid[row][c] = 'green';
  const result = board.resolve();
  assert(result.stepList.some(s => (s.chestsCollected || []).some(p => p.id === chest.id)));
  Chests.schedule(g, result.stepList);
  Chests.tick(g, 0);
  Chests.tick(g, Timing.open);
  Chests.tick(g, Timing.rewardFly);
  assert.equal(g.fieldChests.length, 0);
  allGold(g.pendingRelicPicks[0]);
}

try {
  // 用最不利的随机值验证“必掉”，逐波喂入精英和Boss奖励入口。
  Math.random = () => 0.999;
  const expected = [2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  for (const field of RULE.fields) {
    const g = game(field);
    for (let wave = 1; wave <= 60; wave++) {
      g.run.wave = wave;
      Chests.grantFirstReward(g);
      g.onKillReward(enemy(wave, 'elite'));
      if (wave % 5 === 0) {
        g.onKillReward(enemy(wave, 'boss', { isFinalBoss: wave === 60 }));
        const before = [g.fieldChests.length, g.meta.chests, g.runShardGained];
        g.onKillReward(enemy(wave, 'boss', { isFinalBoss: wave === 60 }));
        assert.deepEqual([g.fieldChests.length, g.meta.chests, g.runShardGained], before);
      }
    }
    assert.deepEqual(g.fieldChests.map(c => c.waveNo), expected);
    assert.equal(g.fieldChests.filter(c => c.rarity === 'ssr').length, 2);
    assert.equal(g.meta.chests, 12, 'W60 still grants the out-of-run Boss chest');
    const red = Object.entries(g.runShardDetail).filter(([id]) => CONFIG.relicRarity(id) === 'ur');
    assert.equal(red.length, 1);
    assert.equal(red[0][1], 10);
  }

  Math.random = () => 0;
  const elite = game();
  elite.onKillReward(enemy(30, 'elite'));
  assert.equal(elite.fieldChests.length, 0);
  assert.equal(elite.runShardGained, 1, 'Elite fragments remain');
  assert(elite.run.gold > 0 && (elite.run.exp > 0 || elite.run.expLevel > 0), 'Elite silver and experience remain');

  const overlap = game();
  overlap.run.wave = 26;
  overlap.onKillReward(enemy(20));
  assert.equal(overlap.fieldChests[0].waveNo, 20);
  assert.equal(overlap.fieldChests[0].rarity, 'ssr', 'Cross-wave kills use enemy ownership');

  const gold = game();
  active(gold);
  gold.onKillReward(enemy(20));
  openChest(gold, gold.fieldChests[0]);
  gold.update(0);
  assert.equal(gold.state, 'relicpick');
  allGold(gold.relicPick);
  gold.run.gold = 100000;
  for (let i = 0; i < 5; i++) { assert(gold.rerollRelicPick()); allGold(gold.relicPick); }
  const picked = gold.relicPick.candidates[0].id;
  gold.relicPickChoice(0);
  assert.equal(gold.run.runRelic[picked], 1);

  // 两个宝箱可以先抽到相同候选：前一个选完后，后一个必须重新过滤并保留全金。
  const queued = game(); active(queued);
  queued.spawnRelicPick(undefined, { rarity: 'ssr' });
  queued.spawnRelicPick(undefined, { rarity: 'ssr' });
  queued.update(0);
  const taken = queued.relicPick.candidates[0].id;
  queued.relicPickChoice(0);
  queued.update(0);
  allGold(queued.relicPick);
  assert(!queued.relicPick.candidates.some(c => c.id === taken));
  // 点击时也做校验，不能通过旧候选或异常低品质候选拿到降级奖励。
  queued.relicPick.candidates[0] = { ...CONFIG.relicRunDef('r_fire_atk'), run: true };
  queued.relicPickChoice(0);
  assert.equal(queued.run.relicRun('r_fire_atk'), 0);
  allGold(queued.relicPick);

  const small = game(); active(small, ['fire']);
  small.run.runRelic.s_fire_burn = 1;
  small.run.runRelic.s_sr_cm_exp = 1;
  small.spawnRelicPick(undefined, { rarity: 'ssr' });
  allGold(small.pendingRelicPicks[0]);
  assert.equal(small.pendingRelicPicks[0].candidates.length, 1, 'Do not fill gold shortages with lower rarities');
  small.run.runRelic.s_fire_rain = 1;
  small.pendingRelicPicks = [];
  small.spawnRelicPick(undefined, { rarity: 'ssr' });
  allGold(small.pendingRelicPicks[0]);
  assert(small.pendingRelicPicks[0].candidates.every(c => c.tint !== 'fire'), 'Empty active pool can use other unowned gold relics');
  small.pendingRelicPicks = [];
  Object.values(CONFIG.RELIC_RUN.tower).flat().concat(CONFIG.RELIC_RUN.common).forEach(d => {
    if (CONFIG.relicRarity(d.id) === 'ssr') small.run.runRelic[d.id] = 1;
  });
  const silver = small.run.gold;
  small.spawnRelicPick(undefined, { rarity: 'ssr' });
  assert.equal(small.pendingRelicPicks.length, 0);
  assert.equal(small.run.gold - silver, RULE.emptyGoldSilver);

  for (const [star, expectedCost] of [[1, 425], [2, 375], [3, 325]]) {
    const g = game(); active(g);
    g.meta.relicStars.s_sr_cm_bounty = star;
    g.run.runRelic.s_sr_cm_bounty = 1;
    assert.equal(Reroll.cost(g.run, 'relic'), expectedCost);
    assert.equal(Reroll.cost(g.run), 500, 'Upgrade picks do not receive this discount');
    g.spawnRelicPick(); g.update(0);
    if (star === 3) assert(g.relicPick.candidates.every(c => CONFIG.relicRarity(c.id) !== 'r'));
    g.run.gold = expectedCost;
    assert(g.rerollRelicPick());
    assert.equal(g.run.gold, 0);
    assert.equal(g.run.pickRerolls, 1);
    assert.equal(Reroll.cost(g.run, 'relic'), expectedCost * 2);
    const ids = g.relicPick.candidates.map(c => c.id);
    assert.equal(g.rerollRelicPick(), false);
    assert.deepEqual(g.relicPick.candidates.map(c => c.id), ids);
  }

  // 原生双生Boss死亡流程：第一尊不发，最后一尊只发一份。
  const twins = game();
  twins.run.wave = 39; twins.wave.start(); twins.wave.spawnOne();
  const parent = twins.run.bossEnemy;
  const bodies = Galvin.split(twins, parent);
  bodies[0].hp = 0; twins.combat.onKill(bodies[0]);
  assert.equal(twins.fieldChests.length, 0);
  bodies[1].hp = 0; twins.combat.onKill(bodies[1]);
  assert.equal(twins.fieldChests.length, 1);
  assert.equal(twins.fieldChests[0].rarity, 'ssr');
  assert.equal(twins.meta.chests, 1);

  const abyss = game('abyss');
  assert.equal(Drops.scheduled(abyss), false);
  abyss.onKillReward(enemy(30, 'elite'));
  assert.equal(abyss.fieldChests.length, 1, 'Abyss keeps its old curve pending separate design');
  console.log('PASS: 12 fixed drops/2 gold across all normal maps; elite rewards; final/red rewards; overlap/double-Boss dedup; gold landing/open/reroll/queue; strict pool exhaustion; seek discounts; native twin deaths; abyss boundary.');
} finally {
  Math.random = savedRandom;
  fixture.restore();
}
