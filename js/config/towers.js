// 塔基础定义与成长规则。对局等级、能量和冷却留在实例中。
'use strict';
module.exports = {
  TOWER_SLOTS: 4,               // 塔位一排 4 个 = 最先消除的 4 种颜色（先消先得）

  EXP: {
    perCell: 2,                              // 每个消除方块的基础经验（三消少量）
    shape: { '3': 1.0, '4': 1.5, L5: 1.5, '5': 2.0, '6+': 2.5 }, // 形状倍率（3连/直4/L5/直5/6+）
    base: 35, growth: 1.25,                  // v1.16.89 平滑升级曲线：exp(L) = 35 × 1.25^(L-1)（原 30×1.4 后期过陡）
    towerMaxLevel: 13,                     // Lv1 建塔 + 3 个技能槽 ×（激活 1 次 + 分支升级 3 次）
    // 击杀经验（打怪为主渠道；精英/Boss 更多；三消经验=每块 2×块数×形状倍率，明显低于击杀）
    kill: { normal: 15, runner: 10, tank: 22, elite: 30, boss: 90 },
    waveBonus: 5,                            // 波末全塔额外经验（少量）
  },

  TOWERS: {
    fire:      { color: 'red',    baseDps: 28,   perLv: 10, range: 830, atkInterval: 1.25,     attackCost: 35 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 基础 35 伤害/发，0.8 发/秒；60 伤害/能量
    ice:       { color: 'blue',   baseDps: 26.4, perLv: 8,  range: 760, atkInterval: 1 / 1.1, attackCost: 24 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 基础 24 伤害/发，1.1 发/秒；60 伤害/能量
    poison:    { color: 'green',  baseDps: 28.8, perLv: 9,  range: 800, atkInterval: 1 / 1.8, attackCost: 16 / 60, shot: { kind: 'line',  dur: 1.0  } }, // 基础 16 伤害/发，1.8 发/秒；60 伤害/能量
    electric:  { color: 'yellow', baseDps: 30,   perLv: 9,  range: 840, atkInterval: 1.0,      attackCost: 30 / 60, shot: { kind: 'bolt',  dur: 0.5  } }, // 基础 30 伤害/发，1 发/秒；60 伤害/能量
    boomerang: { color: 'purple', baseDps: 18.2, perLv: 9, range: 880, atkInterval: 1 / 0.7, attackCost: 26 / 60, shot: { kind: 'arc',   dur: 2.4  } }, // 基础 26 伤害/发，目标速率 0.7 发/秒；实际节奏受飞行/接镖流程约束
    cannon:    { color: 'orange', baseDps: 36,   perLv: 10, range: 930, atkInterval: 1 / 0.6, attackCost: 60 / 60, shot: { kind: 'mortar', dur: 1.5  } }, // 基础 60 伤害/发，0.6 发/秒；60 伤害/能量
  },

};
