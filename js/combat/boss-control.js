'use strict';
// Shared hard-control budget: all writers (including global skills and relics) use these guarded fields.
const KEYS=['frozen','paralyzed','_vineT'];
function attach(e){if(!e.isBoss||e._bossControl)return;const state={remaining:1.5,immune:0,active:false,values:{}};e._bossControl=state;
for(const key of KEYS){state.values[key]=Math.max(0,Number(e[key])||0);Object.defineProperty(e,key,{enumerable:true,configurable:true,get(){return state.values[key];},set(value){value=Math.max(0,Number(value)||0);if(value>0&&(state.immune>0||(key==='frozen'&&e.immuneFreeze)))return;if(value>0)state.active=true;state.values[key]=Math.min(value,state.remaining);}});}}
function tick(e,dt){if(!e.isBoss)return;attach(e);const s=e._bossControl;dt=Math.max(0,dt);if(s.immune>0){s.immune=Math.max(0,s.immune-dt);for(const k of KEYS)s.values[k]=0;return;}
const held=KEYS.some(k=>s.values[k]>0);if(held){s.active=true;s.remaining=Math.max(0,s.remaining-dt);for(const k of KEYS)s.values[k]=Math.min(s.values[k],s.remaining);}
if(s.active&&(!held||s.remaining<=0)){s.active=false;s.remaining=1.5;s.immune=3;for(const k of KEYS)s.values[k]=0;}}
module.exports={attach,tick};

