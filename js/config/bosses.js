'use strict';
module.exports={altar_rosea:{id:'altar_rosea',field:'ancient',wave:20,name:'缠根司祭·萝赛',hp:45000,armor:0.15,attack:198,speed:0.75,threshold:0.5,shieldPeriod:16,shieldPerLayer:1000,maxLayers:1,shieldDuration:5,shieldReduction:0,phaseStun:0.5,phaseSpeed:1.3,phaseAttackSpeed:1.1,summonHp:800,summonCount:3,adds:[[6,6,5,5,5],[6,6,6,5,5,5]]},
altar_galvin: {
  id: 'altar_galvin', field: 'ancient', wave: 40, name: '双生圣像·迦尔文',
  hp: 462300, armor: 0.25, attack: 252, speed: 0.74, genLv: 9,
  threshold: 0.60, twinHpRatio: 0.30, twinArmor: 0.125, twinSpeed: 0.96,
  controlResist: 0.5, phaseStun: 0.5, spawnInterval: 0.25,
  splitSeparation: 180, edgeInset: 75,
  echoPeriod: 10, echoTowerCount: 3, echoSlow: 0.10, echoDuration: 3,
  resonancePeriod: 10, resonanceMax: 3, resonanceAttackPerStack: 0.12,
  // Design text says ~350HP/s at full stacks: 0.25% max HP/s total, not per stack.
  resonanceHealPerStack: 0.0025 / 3,
  syncWindow: 8, survivorHealRatio: 0.15, syncChestTier: 'silver',
  adds: [[9,9,9,9,9,9,10,10,10,10,10], [9,9,9,9,9,9,9,9,10,10,10,10,10]],
}
};
