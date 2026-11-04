// 商店与重掷数值；次数、限时效果与银币只存在于Run。
'use strict';
module.exports = {
  reroll: { first: 500, step: 500 },
  store: {
    repeatPurchaseCooldown: 5,
    items: [
      { id: 'atk', name: '战意药剂', desc: '伤害+30%20秒', cost: [180], max: 0, duration: 20, damage: 0.3, color: '#ffb76e' },
      { id: 'spd', name: '疾风药剂', desc: '攻速+30%20秒', cost: [160], max: 0, duration: 20, speed: 0.3, color: '#a4e9c5' },
      { id: 'energy', name: '能量药剂', desc: '全塔能量+20', cost: [120], max: 0, energy: 20, color: '#8cdbff' },
      { id: 'reset', name: '重置药剂', desc: '重置棋盘', cost: [250], max: 0, resetBoard: true, color: '#c7a5ff' },
      { id: 'repair', name: '修复药剂', desc: '恢复50%城墙生命', cost: [600], max: 1, heal: 0.5, color: '#b9ef9b' },
      { id: 'auto', name: '自动药剂', desc: '自动消除30秒', cost: [600], max: 1, duration: 30, durationClock: 'real', autoMatchInterval: 1, autoMatchClock: 'real', color: '#ffb3bf' },
    ],
  },
};
