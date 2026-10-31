'use strict';
const B=require('../config/bosses.js').altar_rosea;
function enabled(g){return g.menuStage===B.field&&g.run.wave===B.wave&&g.state!=='testfield';}
function entry(g,lv){const c=require('../config.js').ENEMY.levelOf(lv);return {lv,type:c.type,hp:c.hp,offset:0.5,isBoss:false};}
function setup(director){const g=director.game;if(!enabled(g))return false;g.run.bossLock=true;g.run.bossEnemy=null;director.plan=[{lv:6,type:'boss',hp:B.hp,offset:0.5,isBoss:true,bossId:B.id},...B.adds[0].map(lv=>entry(g,lv))];director.hasBoss=true;director.enemyTotalHp=B.hp+B.adds.flat().reduce((n,lv)=>n+entry(g,lv).hp,0)+B.summonCount*B.summonHp;g.run.bossWaveHp=director.enemyTotalHp;
 if(!g.run.roseaAnnounced && g.fx){
   g.run.roseaAnnounced=true;
   const y=((director.ly||{}).areaY||140)+((director.ly||{}).entryH||68)+100;
   g.fx.push({type:'floatText',text:'第20波 · 小BOSS登场',x:375,y,t:0,dur:3,size:32,color:'#f4cf72'});
   g.fx.push({type:'floatText',text:B.name+' · 藤甲破裂后集中输出',x:375,y:y+40,t:0,dur:3,size:20,color:'#e5d9f6'});
 }
 return true;}
function spawn(g,e,id){if(id!==B.id)return;e.bossId=id;e.bossName=B.name;e.phase=1;e.hp=e.maxHp=B.hp;e.armor=B.armor;e.attack=B.attack;e.speed*=B.speed/require('../config.js').ENEMY.levelOf(e.genLv).spd/0.8;e.shield=0;e.shieldLayers=0;e.shieldClock=0;e.shieldTtl=0;e.shieldMaxLayers=B.maxLayers;e.controlResist=0.5;g.run.bossEnemy=e;}
function tick(g,dt){const e=g.run.bossEnemy;if(!g.run.bossLock||!e||e.hp<=0)return;
 if(e._bossStun>0)e._bossStun=Math.max(0,e._bossStun-dt);
 if(e.phase===1&&e.hp/e.maxHp<=B.threshold){e.phase=2;e.shieldTtl=0;e.shield=0;e.shieldLayers=0;e.armor=0;e.speed*=B.phaseSpeed;e.attackInterval/=B.phaseAttackSpeed;e._bossStun=B.phaseStun;g.wave.plan.push(...B.adds[1].map(lv=>entry(g,lv)));for(let i=0;i<B.summonCount;i++)g.wave.plan.push({...entry(g,5),hp:B.summonHp,isSummon:true});g.wave.planDoneAt=null;g.fx.push({type:'ring',x:e.x,y:e.y,t:0,dur:0.5,color:'#edc96e',rMax:100});}
 if(e.phase===1){
   const hadShield=e.shield>0;
   e.shieldTtl=Math.max(0,(e.shieldTtl||0)-dt);
   if(e.shieldTtl<=0){e.shield=0;e.shieldLayers=0;}
   e.shieldClock+=dt;
   if(e.shieldClock>=B.shieldPeriod){
     e.shieldClock%=B.shieldPeriod;
     const remaining=B.shieldDuration-e.shieldClock;
     if(remaining>0){e.shield=B.shieldPerLayer;e.shieldLayers=1;e.shieldTtl=remaining;}
   }
   if(hadShield&&!e.shield)g.fx.push({type:'ring',x:e.x,y:e.y,t:0,dur:0.4,color:'#f2d682',rMax:75});
 }

}
function absorb(e,value){if(e.bossId!==B.id||!e.shield)return value;value*=1-B.shieldReduction;const used=Math.min(e.shield,value);e.shield-=used;e.shieldLayers=Math.ceil(e.shield/B.shieldPerLayer);return value-used;}
module.exports={enabled,setup,spawn,tick,absorb};
