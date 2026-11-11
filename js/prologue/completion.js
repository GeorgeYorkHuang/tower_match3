'use strict';
// Mutates profile only; caller saves this reward and clear marker together after actual victory.
const Plan=require('../config/prologue.js');
const Progress=require('../prologue.js');
const Cards=require('../config/talents.js').cards;
function complete(meta,id,{victory=false,test=false,random=Math.random}={}){
 const chapter=Progress.chapter(id);
 if(!chapter)return {ok:false,reason:'chapter'};
 if(test)return {ok:false,reason:'test'};
 if(!victory)return {ok:false,reason:'victory'};
 if(Progress.reason(id,meta))return {ok:false,reason:'locked'};
 const current=Progress.normalizeProgress(meta.prologue);
 if(current.cleared.includes(id))return {ok:true,firstClear:false,redId:null};
 let redId=null;
 const next={...current,cleared:Plan.order.filter(key=>key===id||current.cleared.includes(key))};
 if(chapter.rewards.firstClearRed&&!current.redGiftGranted){
   const pool=Cards.filter(card=>!(Number((meta.relicStars||{})[card.id])>0||(meta.runCodex||{})[card.id]));
   if(pool.length){const roll=Number(random());if(!Number.isFinite(roll))return {ok:false,reason:'random'};
     redId=pool[Math.min(pool.length-1,Math.max(0,Math.floor(roll*pool.length)))].id;
   }
   next.redGiftGranted=true;next.redGiftId=redId;next.legacyGiftPending=false;
 }
 if(redId){meta.runCodex={...(meta.runCodex||{}),[redId]:1};meta.relicStars={...(meta.relicStars||{}),[redId]:1};}
 meta.prologue=next;
 return {ok:true,firstClear:true,redId};
}
module.exports={complete};
