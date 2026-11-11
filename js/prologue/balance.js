'use strict';
const CONFIG=require('../config.js');
function profile(g,base){const c=g.run&&g.run.chapter;if(!c||!c.isPrologue)return base;const m=c.enemyMultipliers,p=c.bossProfile;
return {...base,field:c.id,hp:base.hp*m.bossHp,attack:base.attack*m.bossAttack,speed:base.speed*m.speed,twinSpeed:base.twinSpeed*m.speed,
 shieldPerLayer:base.shieldPerLayer*(p.scaleShield?m.bossHp:1),summonCount:Math.ceil((base.summonCount||0)*(p.summonCount??1)),
 summonHp:c.enemyCurve?require('./enemy-curve.js').stats(c,g.run.wave,'runner').hp:base.summonHp,
 echoSlow:base.echoSlow*(p.attackSlow??1),survivorHealRatio:p.twinTimeoutHeal===false?0:base.survivorHealRatio,
 adds:base.adds.map(a=>a.slice(0,Math.max(1,Math.ceil(a.length*m.count)))),...(p.overrides||{})};}
function spawnScale(g,e){const c=g.run.chapter;if(!c||!c.isPrologue||e._prologueScaled)return;const m=c.enemyMultipliers;e._prologueScaled=true;
if(!e.bossId){const curve=require('./enemy-curve.js').stats(c,g.run.wave,e.isBoss?'boss':e.type);
if(curve){e.hp=e.maxHp=curve.hp;e.armor=curve.armor;if(e.delayHp!=null)e.delayHp=curve.hp;}
else{const ratio=e.isBoss?m.bossHp:m.hp;e.hp*=ratio;e.maxHp*=ratio;if(e.delayHp!=null)e.delayHp*=ratio;}
e.attack*=e.isBoss?m.bossAttack:m.attack;e.speed*=m.speed;}}
module.exports={profile,spawnScale};
