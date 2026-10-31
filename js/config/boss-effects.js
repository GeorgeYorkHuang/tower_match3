// Boss表现参数，仅控制绘制；不参与技能计时、伤害、护甲或移动结算。
'use strict';
module.exports = {
  galvin: {
    echoPulse: 0.65, resonancePulse: 0.9, healPulse: 0.85,
    gold: '#ffe09a', violet: '#d4b4ff', green: '#bcefa5', urgent: '#ff997e',
    pipRadius: 3, pipGap: 13, countdownRadius: 16, urgentSeconds: 3,
  },
  vera: {
    summonCast: 0.9, summonBirth: 0.85, phasePulse: 1.0, maxBirthRings: 16,
    phaseRed: '#ff916d', seedRadius: 5,
    warning: 1.2, impact: 0.65, wardPulse: 1.1, leafPulse: 1.0,
    wardRadius: 76, wardHeight: 92, maxLeafRings: 64,
    gold: '#f6d987', green: '#b9eb9a', darkGreen: '#487656',
    crack: '#ffca85', hot: '#fff4d6', wallBand: 24,
    pathSegments: 10, leafCount: 6,
  },
};
