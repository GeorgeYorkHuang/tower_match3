// 商店与重掷数值；次数、限时效果与银币只存在于Run。
'use strict';
module.exports = {
  reroll: { first: 500, step: 500 },
  store: {
    repeatPurchaseCooldown: 5,
    items: [
      { id: 'atk', name: '战意药剂', desc: '伤害+30%20秒', cost: [180], max: 0, duration: 20, damage: 0.3, color: '#ffb76e' },
      { id: 'spd', name: '疾风药剂', desc: '攻速+30%20秒', cost: [160], max: 0, duration: 20, speed: 0.3, color: '#a4e9c5' },
      { id: 'energy', name: '能量补给', desc: '全塔能量+20', cost: [120], max: 0, energy: 20, color: '#8cdbff' },
      { id: 'wall', name: '城墙修复', desc: '恢复20%生命', cost: [200], max: 0, heal: 0.2, color: '#b9ef9b' },
      { id: 'burst', name: '爆发药剂', desc: '伤+60%速+40%', cost: [500], max: 1, duration: 15, damage: 0.6, speed: 0.4, color: '#ffcf6c' },
      { id: 'rescue', name: '紧急修复', desc: '恢复60%生命', cost: [600], max: 1, heal: 0.6, color: '#ffb3bf' },
    ],
  },
};
