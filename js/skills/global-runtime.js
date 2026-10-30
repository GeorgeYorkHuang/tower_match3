'use strict';
const BALANCE = require('../config/global-balance.js');
const { get } = require('./global-catalog.js');
// State belongs to the supplied run/combat, never to this module.
function tick(run,dt){const s=run.gsState;if(!s)return;for(const k of ['forge','haste','reflect','gold'])s[k]=Math.max(0,(s[k]||0)-dt);if(s.shieldWave!==run.wave){s.shield=0;s.shieldWave=run.wave;}}
function cast(combat,id){
 const g=combat.game,r=g.run,s=r.gsState||(r.gsState={}),def=get(id);if(!def)return false;
 const towers=r.slotOrder.filter(k=>{const t=r.effects.tower(k);return t&&t.level>0;});
 switch(id){
 case 'forge':s.forge=BALANCE.forge.duration;break;case 'haste':s.haste=BALANCE.haste.duration;break;
 case 'volley':s.volley=Object.fromEntries(towers.map(k=>[k,true]));break;
 case 'resonance':{const pool=towers.slice();for(let n=0;n<BALANCE.resonance.towerCount&&pool.length;n++){const i=Math.floor((r.rng||Math.random)()*pool.length);combat.castPeriodicNow(pool.splice(i,1)[0]);}break;}
 case 'barrier':s.shield=BALANCE.barrier.shield;s.shieldWave=r.wave;break;
 case 'heal':r.lineHp=Math.min(r.lineMaxHp||require('../config.js').LINE.hp,r.lineHp+(r.lineMaxHp||require('../config.js').LINE.hp)*BALANCE.heal.maxHpRatio);break;
 case 'reflect':s.reflect=BALANCE.reflect.duration;break;
 case 'freeze':g.enemies.filter(e=>e.hp>0).forEach(e=>{ e.frozen=Math.max(e.frozen||0,e.isBoss?BALANCE.freeze.bossDuration:BALANCE.freeze.duration); });break;
 case 'tide':g.enemies.filter(e=>e.hp>0).forEach(e=>combat.applySlow(e,BALANCE.tide.slowRatio,BALANCE.tide.duration));break;
 case 'pull':g.enemies.filter(e=>e.hp>0).forEach(e=>{e.y=Math.max(g.ly.areaY||0,e.y-BALANCE.pull.distance);e.attackT=0;combat.fxRing(e.x,e.y,def.color,35,0.6,3);});break;
 case 'chainstorm':s.chainstorm=true;break;case 'twins':s.twins=true;break;case 'charge':s.charge=true;break;case 'gold':s.gold=BALANCE.gold.duration;break;
 default:return false;
 }
 combat.fxFlash(375,800,def.color,0.35);combat.fxRing(375,800,def.color,240,0.5,6);
 if(g.toast)g.toast(def.name+' · 已释放',def.color);return true;
}

module.exports = { tick, cast };
