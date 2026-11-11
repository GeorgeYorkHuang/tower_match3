/** 圣遗物专项策略回归：只选真实候选、避开无关联技能卡，寻宝只做合法消除且恢复试算棋盘。 */
'use strict';
const assert = require('assert');
const api = require('./moving-battle-fixture.cjs');
const policy = require('./relic-only-policy.cjs');
const routes = require('./six-tower-current-routes.cjs');
const mock = { run: { slotOrder: ['fire', 'ice', 'poison', 'electric'], wave: 3, lineHp: 2000, lineMaxHp: 2000 },
  combat: { tower: () => ({ energy: 10 }) } };
try {
  let calls = 0;
  const random = Math.random;
  Math.random = () => { calls++; return .5; };
  try {
    assert.equal(policy.select(mock, [{ id: 's_ice_bloom', tint: 'ice' }, { id: 'r_ice_energy', tint: 'ice' }], routes.primary), 1);
    assert.equal(policy.select(mock, [{ id: 's_poison_nest', tint: 'poison' }, { id: 's_poison_curse', tint: 'poison' }], routes.primary), 1);
    assert.equal(policy.select(mock, [{ id: 's_ice_bloom', tint: 'ice' }, { id: 'r_ice_cap', tint: 'ice' }], routes.secondary), 0);
    assert.equal(policy.select(mock, [{ id: 's_ice_bloom', tint: 'ice' }, { id: 'r_ice_energy', tint: 'ice' }], routes.primary, 'first'), 0);
    assert.equal(calls, 0, '选择策略不消耗或窥视随机数');
  } finally { Math.random = random; }
  const options = { field: 'ancient', profile: 'elements', seed: 41, cadence: 2, maxWave: 6, maxSeconds: 145, relics: true,
    selectRelic: (g, candidates) => policy.select(g, candidates, routes.primary),
    configureGame(g) {
      const find = g.match3._findAutoTripleMove.bind(g.match3), board = g.run.board;
      const initial = find(); assert(initial);
      const [[r, c], [rr, cc]] = initial, a = board.grid[r][c], b = board.grid[rr][cc];
      board.grid[r][c] = b; board.grid[rr][cc] = a;
      const cells = board.findMatches().flatMap(m => m.cells);
      board.grid[r][c] = a; board.grid[rr][cc] = b;
      const blocked = new Set([...cells, ...initial].map(p => p.join(',')));
      const at = cells.flatMap(([mr, mc]) => [[mr - 1, mc], [mr + 1, mc], [mr, mc - 1], [mr, mc + 1]])
        .find(([cr, co]) => board.inRange(cr, co) && !blocked.has(cr + ',' + co) && typeof board.grid[cr][co] === 'string');
      assert(at); const [cr, co] = at, old = board.grid[cr][co];
      board.grid[cr][co] = { s: 'chest', id: -1, c: null };
      const before = JSON.stringify(board.grid), move = policy.chestMove(g, find);
      assert.equal(JSON.stringify(board.grid), before, '候选试算不修改棋盘');
      const result = board.trySwap(...move[0], ...move[1]);
      assert(result.ok && result.resolved.stepList.some(s => (s.chestsCollected || []).some(x => x.id === -1)), '实际交换正常相邻消除宝箱');
      // 恢复测试准备之前的盘面，随后走真实W2开箱链路。
      board.grid = JSON.parse(before); board.grid[cr][co] = old;
      g.match3._findAutoTripleMove = () => policy.chestMove(g, find);
      return null;
    },
  };
  Object.assign(api.routes, routes.primary);
  const r = api.collect(options);
  assert(r.relicChoices.length > 0, '必须实际领取W2圣物');
  for (const choice of r.relicChoices) {
    assert(choice.candidates.includes(choice.id)); assert.notEqual(choice.rarity, 'ur');
    assert.equal(GameGlobal.game.meta.starOf(choice.id), 1);
  }
  assert.equal(GameGlobal.game.meta.talents.slots.filter(Boolean).length, 0);
  assert.equal(GameGlobal.game.run.storeBuff().damageMultiplier, 1);
  console.log('PASS route-relevant/first choice, no RNG use, restored trial board, legal chest collection, native W2 candidates/unlock1star, no shop/talents.');
} finally { api.restore(); }
