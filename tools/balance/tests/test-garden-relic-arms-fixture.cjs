/** 红卡测试档回归：talentStar 只影响局内天赋快照（1★ 无紫金、3★ 六紫六金），不改共享配置。 */
'use strict';
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const frozen = require('../fixtures/freeze-runtime.cjs').freeze(root);
const api = require('../fixtures/moving-battle-fixture.cjs');
const routes = require('../scenarios/six-tower-current-routes.cjs');
const CONFIG = require('../../../js/config.js');

const route = 'primary';
Object.assign(api.routes, routes[route]);
const snapshot = JSON.stringify(CONFIG);
const base = { field: 'ancient', profile: 'elements', cadence: 2, maxWave: 2, maxSeconds: 120, stopAtFirstBreach: true };

try {
  // 红卡覆盖数值：每塔 6 白点 → +6 攻击（1★）；21 白点 → +21 攻击（3★）
  const one = api.collect({ ...base, seed: 1, talentStar: 1 });
  const three = api.collect({ ...base, seed: 1, talentStar: 3 });
  const plain = api.collect({ ...base, seed: 1 });

  assert(one.talentStar === 1 && three.talentStar === 3, 'talentStar 应写入结果');
  assert(!plain.talentBonuses, '无红卡臂不应带天赋快照');
  for (const key of one.talentSlots.length ? Object.keys(one.talentBonuses) : []) {
    assert.equal(one.talentBonuses[key].attack, 6, `${key} 1★ 攻击加成应为 6`);
    assert.equal(three.talentBonuses[key].attack, 21, `${key} 3★ 攻击加成应为 21`);
  }
  assert.equal(one.talentGold.length, 0, '1★ 不激活金天赋');
  assert.equal(one.talentPurple.length, 0, '1★ 不激活紫天赋');
  assert.equal(three.talentGold.length, 6, '3★ 应激活 6 个金天赋');
  assert.equal(three.talentPurple.length, 6, '3★ 应激活 6 个紫天赋');
  assert.equal(one.talentSlots.filter(Boolean).length, 6, '应装配 6 张圣庭红卡');
  assert.deepStrictEqual(one.talentSlots, three.talentSlots, '摆位固定为原生槽位');
  assert.equal(JSON.stringify(CONFIG), snapshot, '夹具不应改动共享配置');

  // talentOnly：只保留指定乘区，其余清零
  const atkOnly = api.collect({ ...base, seed: 1, talentStar: 1, talentOnly: ['attack'] });
  const dotOnly = api.collect({ ...base, seed: 1, talentStar: 1, talentOnly: ['charge', 'dot', 'skill'] });
  assert.equal(atkOnly.talentBonuses.fire.attack, 6, '仅攻击臂应保留 +6 攻击');
  assert.equal(atkOnly.talentBonuses.fire.charge, 0, '仅攻击臂应清零 charge');
  assert.equal(atkOnly.talentBonuses.fire.dot, 0, '仅攻击臂应清零 dot');
  assert.equal(dotOnly.talentBonuses.fire.attack, 0, '仅绿点臂应清零攻击');
  assert.equal(dotOnly.talentBonuses.fire.charge, 0.1, '仅绿点臂应保留 charge');
  assert.deepStrictEqual(atkOnly.talentOnly, ['attack']);
  assert.throws(() => api.collect({ ...base, seed: 1, talentStar: 2.5 }), /talentStar/);
  console.log('PASS 红卡测试档：1★/3★ 攻击与紫金天赋数量、摆位、talentOnly 隔离、配置隔离均符合预期。');
} finally {
  api.restore();
  frozen.restore();
}
