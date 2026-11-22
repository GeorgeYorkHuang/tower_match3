'use strict';
const plan=require('../config/prologue.js');
const messages={match:'第一章第4波遇到四消后解锁',global:'第二章第5波学习全局技能后解锁',shop:'第二章第8波遇到商店后解锁',relic:'第三章第5波遇到圣遗物后解锁'};
function unlocked(meta,key,test){return !!test||!!(meta&&meta.encounters&&meta.encounters[key]);}
// 图鉴学习不受章节限制；只记录本局实际建造的塔，测试档不回写。
function learnBuiltTowers(g){
 if(g.testProfile||!g.meta||!g.run)return false;
 let changed=false;
 for(const key of g.run.slotOrder||[]){
  const tower=g.run.effects&&g.run.effects.tower(key);
  if(!tower||tower.level<=0||!require('../config.js').TOWERS[key])continue;
  if(!g.meta.towerLearned(key)){g.meta.learnTower(key);changed=true;}
 }
 if(changed)g.save.save();
 return changed;
}
function visit(g){learnBuiltTowers(g);if(g.testProfile||!g.meta||!g.run)return;const c=g.run.chapter;if(!c||!c.isPrologue)return;const index=plan.order.indexOf(c.id),w=g.run.wave;const base=plan.chapters[c.id];g.run.chapter={...base,features:{...base.features,globalSkills:base.features.globalSkills&&(index>1||w>=5),battleShop:base.features.battleShop&&(index>1||w>=8)}};let changed=false;const e=g.meta.encounters||(g.meta.encounters={});for(const [key,yes]of Object.entries({match:index===0&&w>=4,global:index===1&&w>=5,shop:index===1&&w>=8,relic:index===2&&w>=5})){if(yes&&!e[key]){e[key]=true;changed=true}}if(changed)g.save.save();}
module.exports={messages,unlocked,visit,learnBuiltTowers};
