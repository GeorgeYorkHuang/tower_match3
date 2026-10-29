// 全局技能平衡参数：秒、像素、倍率（1.25 = +25%）。改参后重新编译。
module.exports = {
 forge: { duration:12, damageMultiplier:1.25 },
 haste: { duration:10, speedMultiplier:1.4 },
 volley: { count:3, damagePerShot:0.5, shotDelay:0.12 },
 resonance: { towerCount:3 },
 barrier: { shield:1200 },
 heal: { maxHpRatio:0.4 },
 reflect: { duration:8, damageRatio:0.6 },
 freeze: { duration:4, bossDuration:2 },
 tide: { slowRatio:0.6, duration:6 },
 pull: { distance:240 },
 chainstorm: { startGroup:2 },
 charge: { towerCount:2, energy:10 },
 gold: { duration:6, multiplier:2 },
};
