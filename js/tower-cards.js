'use strict';
const CONFIG=require('./config.js');
const RULES={cost:50,baseSlots:8,maxSlots:10,energy:[0,5,20,80],growth:[0,0,3,10],growthCap:30,doubleSeconds:60};
function pool(run){
 const chapter=run.chapter;
 if(!chapter||!chapter.isPrologue)return Object.keys(CONFIG.TOWERS);
 return [...new Set((chapter.colors||[]).map(color=>(CONFIG.COLORS[color]||{}).tower).filter(key=>CONFIG.TOWERS[key]))];
}
function state(run){return run.cardDraft||(run.cardDraft={cards:Array(10).fill(null),unlocked:8,draws:0});}
function merge(cards,events){let changed=true;while(changed){changed=false;for(const key of Object.keys(CONFIG.TOWERS))for(let star=1;star<3;star++){const ids=[];cards.forEach((c,i)=>{if(c&&c.key===key&&c.star===star)ids.push(i);});if(ids.length>=3){if(events)events.push({type:'merge',before:cards.map(c=>c&&({...c})),ids:ids.slice(0,3),key,star:star+1});cards[ids[0]]={key,star:star+1};cards[ids[1]]=cards[ids[2]]=null;changed=true;}}}return cards;}
function draw(run,options={}){const d=state(run);if(d.animation)return{ok:false,reason:'卡牌入槽中'};const cost=d.draws>=3?RULES.cost:0;if(run.gold<cost)return{ok:false,reason:'银币不足'};const events=[],cards=d.cards.slice(),keys=pool(run),rng=run.rng||Math.random;if(!keys.length)return{ok:false,reason:'本章暂无可抽取卡片'};for(let n=0;n<3;n++){const key=keys[Math.min(keys.length-1,Math.floor(rng()*keys.length))];let i=cards.findIndex((c,i)=>i<d.unlocked&&!c);if(i<0){if(options.allowDiscard)continue;return{ok:false,reason:'卡槽不足，请先使用塔卡'};}events.push({type:'deal',before:cards.map(c=>c&&({...c})),index:i,key,star:1});cards[i]={key,star:1};merge(cards,events);}run.gold-=cost;d.cards=cards;d.draws++;d.animation={events,index:0,time:0};return{ok:true};}
// Talent scales only the card's native energy; relic adds a flat bonus afterward.
function cardEnergy(run,card){
 const talent=require('./talents/runtime.js').bonus(run,card.key).charge||0;
 const relic=typeof run.relicNum==='function'?run.relicNum('r_'+card.key+'_energy'):0;
 return RULES.energy[card.star]*(1+talent)+relic;
}
function growth(run,key){return Math.min(RULES.growthCap,Math.max(0,(run.cardGrowth||{})[key]||0));}
function doubleRemaining(run,key){return Math.max(0,(run.cardDouble||{})[key]||0);}
function tick(run,dt){if(!run.cardDouble)return;for(const key of Object.keys(run.cardDouble))run.cardDouble[key]=Math.max(0,run.cardDouble[key]-Math.max(0,dt));}
function use(run,index,slot){const d=state(run);if(d.animation)return{ok:false,reason:'卡牌入槽中'};const card=d.cards[index];if(!card)return{ok:false};if(!pool(run).includes(card.key))return{ok:false,reason:'本章未开放该塔卡片'};// 塔位满后，未激活塔卡只按剩余颜色映射充能；单份能量不得复制给两个技能。
if(!run.slotOrder.includes(card.key)&&run.slotOrder.length>=(run.towerSlots||CONFIG.TOWER_SLOTS)){
 let energyFull=false;const charge=cardEnergy(run,card),noGlobal=run.chapter&&run.chapter.isPrologue&&!run.chapter.features.globalSkills;
 if(noGlobal){const towers=run.slotOrder.map(k=>run.effects.tower(k)).filter(t=>t&&t.level>0&&t.energy<run.armoryEnergyMax(t.key));energyFull=!towers.length;for(const t of towers)t.energy=Math.min(run.armoryEnergyMax(t.key),t.energy+charge/towers.length);}
 else{const color=CONFIG.TOWERS[card.key].color;const gains=run._chargeUnusedColor(color,charge);energyFull=!gains||!(gains.shuffleGain>0||gains.refillGain>0);}
 d.cards[index]=null;return{ok:true,built:false,key:card.key,global:!noGlobal,energyFull};
}
if(!Number.isInteger(slot)||slot<0||slot>=(run.towerSlots||CONFIG.TOWER_SLOTS))return{ok:false,reason:'本章塔位已满'};const target=run.slotOrder[slot];if(target&&target!==card.key)return{ok:false,reason:'请拖到同类塔充能'};if(!target&&run.slotOrder.includes(card.key))return{ok:false,reason:'该塔已建造，请拖到原塔充能'};if(!target&&slot!==run.slotOrder.length)return{ok:false,reason:'请从左侧空塔位依次建塔'};const tower=run.effects.tower(card.key),charge=cardEnergy(run,card),growthBefore=growth(run,card.key),growthGain=Math.min(RULES.growth[card.star]||0,RULES.growthCap-growthBefore);let energyFull=false;if(!target){tower.unlock();run.slotOrder.push(card.key);run._globalMap=null;tower.energy=Math.min(run.armoryEnergyMax(card.key),50+charge);tower._activationDelay=1;}else{const cap=run.armoryEnergyMax(card.key);energyFull=tower.energy>=cap;tower.energy=Math.min(cap,tower.energy+charge);}d.cards[index]=null;
if(card.star===3){run.cardDouble=run.cardDouble||{};run.cardDouble[card.key]=RULES.doubleSeconds;}
if(growthGain>0){run.cardGrowth=run.cardGrowth||{};run.cardGrowth[card.key]=growthBefore+growthGain;}

if(run.gsState&&run.gsState.charge){run.slotOrder.slice(0,2).forEach(k=>{const t=run.effects.tower(k);t.energy=Math.min(run.armoryEnergyMax(k),t.energy+30);});run.gsState.charge=false;}
return{ok:true,built:!target,key:card.key,energyFull,growthGain,growthTotal:growthBefore+growthGain,doubleSeconds:card.star===3?RULES.doubleSeconds:0};}
module.exports={RULES,pool,state,merge,draw,use,cardEnergy,growth,doubleRemaining,tick};
