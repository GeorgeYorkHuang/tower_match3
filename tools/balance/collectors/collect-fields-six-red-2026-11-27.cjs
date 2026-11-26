'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../..');const frozen=require('../fixtures/freeze-runtime.cjs').freeze(root);
// Reuse only the memory canvas/platform adapter, never its legacy match-three collector.
const adapter=require('../fixtures/moving-battle-fixture.cjs');
const Main=require('../../../js/game/main'),Cards=require('../../../js/tower-cards'),Plan=require('../../../js/config/prologue'),{Meta}=require('../../../js/meta');
const routes=require('../scenarios/six-tower-current-routes.cjs').primary,policy=require('../fixtures/relic-only-policy.cjs');
const output=path.join(root,'docs','balance-fields-six-red-2026-11-27.json');
const originalNow=Date.now;let clock=0;Date.now=()=>1795737600000+clock*1000;
function rng(seed){let s=seed>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
function collect(field,seed,cadence,strategy,arm){clock=0;Math.random=rng(seed);const g=new Main();GameGlobal.game=g;g.meta=new Meta();g.meta.tutorial={version:1,done:true};g.menuStage=field;g.save.apply=()=>{};g.save.save=()=>{};g.newRun(false);g.run.rng=rng(seed^0x7342);g.run.effects.rng=g.run.rng;g.toast=()=>{};g.playSfx=()=>{};g.vibrate=()=>{};g.tickBossFx=()=>{};g.renderer.preloadBoss=()=>{};require('../../../js/game/prologue-tutorial').cancel(g);g.meta.prologue.cleared=Plan.order.slice();g.meta.encounters={global:true,shop:true,relic:true};let redCard=null;
if(arm==='six'){const T=require('../../../js/talents/model');for(const card of T.C.cards.filter(c=>c.series==='sanctum')){g.meta.relicStars[card.id]=1;g.meta.runCodex[card.id]=1;assert.equal(T.equip(g.meta,card.nativeSlot,card.id),null);}assert.equal(T.analyze(g.meta).count,6);}require('../../../js/talents/runtime').initialize(g.run,g.meta);

assert.equal(g.run.slotOrder.length,0);assert.equal(g.run.chapter.id,field);const wallByWave={};let minWall=2000,wallDamage=0,lowFrames=0,towerFrames=0;const nativeWall=g.run.applyWallDamage.bind(g.run);g.run.applyWallDamage=x=>{const actual=nativeWall(x);wallDamage+=actual;wallByWave[g.run.wave]=(wallByWave[g.run.wave]||0)+actual;return actual;};let terminal=null,next=0,battleSeconds=0,actions=0,draws=0,paid=0,used=0,relics=0,globals=0,minGold=g.run.gold,earned=0,peakEnemies=0,lastWave=0;const waves=[],bosses=[],bossSpawns=[],born=new WeakMap();
const reward=g.onKillReward.bind(g);g.onKillReward=e=>{if(e.isBoss&&born.has(e))bosses.push({wave:e.waveNo,id:e.bossId,seconds:clock-born.get(e)});return reward(e);};
g.finishRun=evacuated=>{terminal=evacuated&&g.run.lineHp>0?'victory':'wall_broken';g.state='collected';g.runSummary={victory:terminal==='victory'};};
const waveEnd=g.waveEnd.bind(g);g.waveEnd=()=>{if(g.run.lineHp<=0){terminal='wall_broken';g.state='collected';return;}return waveEnd();};
g.sfx.startBgm=()=>{};g.enterBattle();assert.equal(g.run.lineMaxHp,2000);
for(let frame=0;frame<60*3600&&!terminal;frame++){clock=frame/60;const r=g.run,d=Cards.state(r);
 if(g.state==='picking'){const group=g.pickQueue[g.pickIndex];if(group){const candidates=group.candidates.slice().sort((a,b)=>{const rank=c=>{const key=c.fromTower||group.tower;const list=routes[key]||[];const i=list.findIndex(([name])=>name===c.name);return i<0?100:i*4+(c.type==='branch'?(list[i][1]===c.branch?0:20):0);};return rank(a)-rank(b);});let ok=false;for(const c of candidates){if(r.applyChoice(group.tower,c).ok){g.nextPick();ok=true;break;}}assert(ok,'No legal upgrade choice');}}
 if(g.state==='relicpick'){g.relicPickChoice(policy.select(g,g.relicPick.candidates,routes,'build'));relics++;}
 if(g.state==='evacuation'){g.state='fighting';g.startNextWave();}
 if(g.state==='fighting'){
  if(d.animation){const a=d.animation;a.time+=1/60;const e=a.events[a.index];if(a.time>=(e&&e.type==='deal'?.095:.42)){a.time=0;a.index++;if(!a.events[a.index])delete d.animation;}}
  if(clock>=next&&!d.animation&&!g._chestBusy){let did=false;
   for(let i=0;i<d.unlocked;i++){const c=d.cards[i];if(!c)continue;if(strategy==='merge'&&c.star===1&&r.slotOrder.includes(c.key)&&r.effects.tower(c.key).energy>25&&d.cards.slice(0,d.unlocked).filter(c=>!c).length>=3)continue;let slot=r.slotOrder.indexOf(c.key);if(slot<0)slot=r.slotOrder.length;const result=Cards.use(r,i,slot);if(result.ok){used++;did=true;break;}}
   if(!did&&d.cards.slice(0,d.unlocked).filter(c=>!c).length>=3){const gold=r.gold;const result=Cards.draw(r);if(result.ok){draws++;paid+=gold-r.gold;did=true;}}
   if(did)actions++;next=clock+cadence;
  }
  if(r.chapter.features.globalSkills&&clock%1<1/60){const avg=r.slotOrder.reduce((n,k)=>n+r.effects.tower(k).energy,0)/Math.max(1,r.slotOrder.length);if(avg<50&&g.combat.castGlobal('shuffle'))globals++;if((g.enemies.length>=4||r.bossLock)&&g.combat.castGlobal('refill'))globals++;}
  const chest=g.fieldChests.find(c=>!c.hidden&&(c.t||0)>=.2);if(chest)require('../../../js/game/flows/board-chests').tap(g,{x:chest.x,y:chest.y});
 }
 const gold=r.gold,battle=g.state==='fighting';g.update(1/60);earned+=Math.max(0,r.gold-gold);minGold=Math.min(minGold,r.gold);if(battle){battleSeconds+=1/60;minWall=Math.min(minWall,r.lineHp);for(const key of r.slotOrder){towerFrames++;if(r.effects.tower(key).energy<20)lowFrames++;}}
 for(const e of g.enemies)if(e.isBoss&&!born.has(e)){born.set(e,clock);bossSpawns.push({wave:e.waveNo,id:e.bossId||e.bossArtKey,hp:e.maxHp,at:clock});}
 peakEnemies=Math.max(peakEnemies,g.enemies.length);
 if(r.wave!==lastWave){waves.push({wave:r.wave,seconds:clock,hp:r.lineHp,gold:r.gold,roster:r.slotOrder.slice(),levels:Object.fromEntries(r.slotOrder.map(k=>[k,r.effects.tower(k).level])),energy:Object.fromEntries(r.slotOrder.map(k=>[k,r.effects.tower(k).energy])),damage:JSON.parse(JSON.stringify(r.dmgStat)),spawnHp:g.wave.enemyTotalHp});lastWave=r.wave;}
 assert(Number.isFinite(r.lineHp));if(r.lineHp<=0){terminal='wall_broken';break;}
}
return{field,arm,redCard:redCard&&redCard.id,wallByWave,bossSpawns,seed,cadence,strategy,minWall:Math.max(0,minWall),wallDamage,lowEnergyRatio:lowFrames/Math.max(1,towerFrames),remaining:g.enemies.filter(e=>e.hp>0).map(e=>({type:e.type,boss:e.isBoss,id:e.bossId||e.bossArtKey,wave:e.waveNo,hp:e.hp,maxHp:e.maxHp,attack:e.attack})),terminal:terminal||'time_cap',wave:g.run.wave,cleared:g.run.clearedWaves,seconds:clock,battleSeconds,wallHp:Math.max(0,g.run.lineHp),wallMax:g.run.lineMaxHp,roster:g.run.slotOrder,levels:Object.fromEntries(g.run.slotOrder.map(k=>[k,g.run.effects.tower(k).level])),energy:Object.fromEntries(g.run.slotOrder.map(k=>[k,g.run.effects.tower(k).energy])),gold:g.run.gold,earned,spentOnDraws:paid,minGold,draws,used,actions,relics,globals,peakEnemies,cardGrowth:g.run.cardGrowth||{},heldCards:Cards.state(g.run).cards.filter(Boolean),damage:g.run.dmgStat,waves,bosses};}
const runs=[];const seeds=(process.argv[2]||'41,7301,10103,21107,50909,100903').split(',').map(Number);
function save(error){fs.writeFileSync(output,JSON.stringify({date:'2026-11-27',field:'lava/frost',name:'后两战场六红卡基准',method:'Native W1-60 card combat; 0.6s immediate actions; six equipped 1-star sanctum red relics initialized before battle versus no cards; no shop/revive; sample outcomes are not player win rates',seeds,sourceHashes:frozen.sourceHashes,runs,error:error||null},null,2));}
try{for(const field of ['lava','frost'])for(const arm of ['none','six'])for(const seed of seeds){const r=collect(field,seed,.6,'immediate',arm);runs.push(r);save();console.log(JSON.stringify({field,arm,seed,terminal:r.terminal,wave:r.wave,hp:Math.round(r.wallHp),seconds:Math.round(r.seconds)}));}}catch(e){save(e.stack);throw e;}finally{Date.now=originalNow;adapter.restore();frozen.restore();}
