'use strict';
const RED=require('../config/red-relics.js');
function grant(game,enemy,random=Math.random){
 const field=game.menuStage,wave=enemy.waveNo||game.run.wave,pool=RED.cards(field),rule=RED.bossDrops[wave];
 if(!['ancient','lava','frost'].includes(field)||!enemy.isBoss||!rule||game.state==='testfield'||(game.run.chapter&&game.run.chapter.isPrologue)||!pool.length)return null;
 const key=field+':'+wave,paid=game.run._sanctumBossDrops||{};
 if(paid[key])return null;
 // 机会也按波次去重，未命中不能通过重复回调再次抽取。
 game.run._sanctumBossDrops={...paid,[key]:true};
 if(rule.chance<1&&random()>=rule.chance)return null;
 const card=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
 const n=rule.amounts[Math.min(rule.amounts.length-1,Math.floor(random()*rule.amounts.length))];
 game.runShardDetail=game.runShardDetail||{};
 game.runShardDetail[card.id]=(game.runShardDetail[card.id]||0)+n;
 game.runShardGained=(game.runShardGained||0)+n;
 return{id:card.id,n};
}
module.exports={grant};
