'use strict';
module.exports={altar_rosea:{id:'altar_rosea',field:'ancient',wave:20,name:'缠根司祭·萝赛',hp:52000,armor:0.15,attack:210,speed:0.75,threshold:0.5,shieldPeriod:14,shieldPerLayer:1800,maxLayers:1,shieldDuration:5,shieldReduction:0,phaseStun:0.5,phaseSpeed:1.3,phaseAttackSpeed:1.1,summonHp:800,summonCount:3,adds:[[6,6,5,5,5],[6,6,6,5,5,5]]},
altar_galvin: {
  id: 'altar_galvin', field: 'ancient', wave: 40, name: '双生圣像·迦尔文',
  hp: 540000, armor: 0.25, attack: 275, speed: 0.74, genLv: 9,
  threshold: 0.60, twinHpRatio: 0.32, twinArmor: 0.125, twinSpeed: 0.96,
  controlResist: 0.5, phaseStun: 0.5, spawnInterval: 0.25,
  splitSeparation: 180, edgeInset: 75,
  echoPeriod: 9, echoTowerCount: 3, echoSlow: 0.15, echoDuration: 4,
  resonancePeriod: 10, resonanceMax: 3, resonanceAttackPerStack: 0.12,
  // Design text says ~350HP/s at full stacks: 0.25% max HP/s total, not per stack.
  resonanceHealPerStack: 0.0025 / 3,
  syncWindow: 8, survivorHealRatio: 0.15, syncChestTier: 'silver',
  adds: [[9,9,9,9,9,9,10,10,10,10,10], [9,9,9,9,9,9,9,9,10,10,10,10,10]],
},
altar_vera: {
  id: 'altar_vera', field: 'ancient', wave: 60, tier: 'final', name: '裂坛圣母·薇拉',
  hp: 1800000, armor: 0.38, attack: 400, speed: 1.05, genLv: 13,
  thresholds: [0.70, 0.35], phaseNames: ['播种', '庇护', '裂坛'], phaseStun: 0.5,
  spawnInterval: 0.16, standoffRatio: 0.80, edgeInset: 75,
  summonPeriod: 10, summonCount: 3, summonHp: 11000, summonLv: 14,
  wardFirstDelay: 4, wardPeriod: 10, wardArmorStep: 0.20, wardArmorCap: 0.58, hasteMultiplier: 1.20,
  riftFirstDelay: 3, riftPeriod: 6, riftWallRatio: 0.04, phaseSpeedMultiplier: 1.30,
  adds: [
    [...Array(8).fill(13), ...Array(12).fill(14)],
    [...Array(10).fill(13), ...Array(14).fill(14)],
    [...Array(12).fill(13), ...Array(16).fill(14)],
  ],
}
};
