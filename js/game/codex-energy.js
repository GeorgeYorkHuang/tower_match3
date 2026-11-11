/** 塔图鉴耗能说明：用独立构筑调用战斗计费，展示单技能及分支的参考费用。 */
'use strict';
const CONFIG = require('../config.js');
const SKILLS = require('../config/tower-skills.js');
const { TowerBuild } = require('../effects.js');
const { attackEnergyMultiplier } = require('../combat/attack-energy.js');

const format = value => String(Number(value.toFixed(2)));
// 这两项虽保留旧版费用配置，实际是命中触发，没有调用周期技能扣费。
const HIT_TRIGGERED = new Set(['活电', '风痕']);

function skillEnergy(key, name, branch, rank = 0) {
  const definition = (SKILLS[key] || {})[name];
  if (!definition || definition.attackEnergyFactor == null) {
    const cost = HIT_TRIGGERED.has(name) ? 0 : (CONFIG.SKILL_ENERGY[name] || 0);
    return { kind: cost > 0 ? 'cast' : 'passive', min: cost, max: cost,
      label: cost > 0 ? `释放${format(cost)}/次` : '无额外耗能' };
  }

  // 不读取当前存档或战斗；技能等级直接沿用真实构筑的派生规则。
  const tower = new TowerBuild(key);
  const skill = tower.pool.find(item => item.name === name);
  skill.act = true;
  if (branch) skill.branches[branch] = rank;
  const run = {
    relicNum: () => 0,
    relicValue: () => 0,
    // 计费只比较能量占上限的比例；用0/1分别检查低能量和满能量。
    armoryEnergyMax: () => 1,
    electricOverload: () => {
      const overload = tower.pool.find(item => item.name === '电磁过载');
      return overload ? { level: overload.level, ...overload.branches } : { level: 0 };
    },
  };
  const combat = {
    game: { run },
    tower: towerKey => towerKey === key ? tower : null,
    lv: (towerKey, skillName) => towerKey === key ? tower.skillLv(skillName) : 0,
    branchLv: (towerKey, skillName, which) => towerKey === key ? tower.branchLv(skillName, which) : 0,
    relicVal: () => 0,
  };
  const base = CONFIG.TOWERS[key].attackCost || CONFIG.GLOBAL_SKILL.perAttack;
  tower.energy = 0;
  const low = base * attackEnergyMultiplier(combat, key);
  tower.energy = 1;
  const high = base * attackEnergyMultiplier(combat, key);
  const min = Math.min(low, high), max = Math.max(low, high);
  const amount = format(min) === format(max) ? format(min) : `${format(min)}–${format(max)}`;
  return { kind: 'attack', min, max, amount, label: `普攻${amount}/次` };
}

module.exports = { skillEnergy };
