/** 采集切波边界回归：波次时间/能量曝光同帧封账，整局与分波计数守恒。 */
'use strict';
const assert = require('assert');
const api = require('./moving-battle-fixture.cjs');
try {
  const result = api.collect({ field: 'ancient', profile: 'elements', seed: 41, maxWave: 4, maxSeconds: 130,
    configureGame(g) {
      return { beforeUpdate() { for (const key of g.run.slotOrder) g.combat.tower(key).energy = 0; } };
    },
  });
  assert(result.waves.length >= 2, '需要实际跨波');
  const near = (a, b, name) => assert(Math.abs(a - b) < 1e-6, `${name}: ${a} != ${b}`);
  near(result.waves.reduce((s, r) => s + r.seconds, 0), result.totals.seconds, '分波时间守恒');
  for (const wave of result.waves) for (const [key, r] of Object.entries(wave.towers)) {
    assert(r.zeroSeconds <= r.lowSeconds + 1e-7);
    assert(r.lowSeconds <= wave.seconds + 1e-7, key + '低能时间不能超过本波时间');
  }
  for (const key of result.keys) for (const metric of ['actualAttackEnergy', 'requestedAttackEnergy', 'actualSkillEnergy', 'requestedSkillEnergy', 'energySeconds', 'zeroSeconds', 'lowSeconds']) {
    near(result.waves.reduce((s, r) => s + (r.towers[key]?.[metric] || 0), 0), result.totals.towers[key][metric], key + '/' + metric);
  }
  assert(result.waves.every(r => !('_counters' in r)), '内部引用不写入结果');
  console.log('PASS same-frame wave time/energy boundaries, low/zero limits, campaign and wave sums, no internal references.');
} finally { api.restore(); }
