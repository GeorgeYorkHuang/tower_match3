/** 指引回归：真实经验升级触发、遮罩镂空/暗区拦截、分支互斥、主页解锁点击与重载。 */
'use strict';
const assert=require('assert');
const fixture=require('./moving-battle-fixture.cjs');
const Main=require('../js/game/main.js');
const {Meta}=require('../js/meta.js');
const PLAN=require('../js/config/prologue.js');
const Guide=require('../js/game/prologue-tutorial.js');
const MenuGuide=require('../js/game/unlock-guide.js');
const Spotlight=require('../js/game/spotlight.js');
let fills=[],words=[];
const ctx=new Proxy({fillRect(x,y,w,h){fills.push({x,y,w,h});},fillText(s){words.push(String(s));}},{get:(o,k)=>k in o?o[k]:()=>{}});
function game(id){const g=new Main();g.meta=new Meta();g.menuStage=id;g.saveData=null;g.save.save=()=>true;g.newRun(false);g.state='fighting';g.run.wave=1;Guide.begin(g);return g;}
try{
 for(const id of PLAN.order.slice(1)){
  const g=game(id);g.run.applyMatch('red','3',3);
  const exp=g.run.exp,level=g.run.expLevel;
  for(let n=0;n<10;n++)Guide.tick(g);
  assert.equal(g.run.exp,exp);assert.equal(g.run.expLevel,level);assert.equal(g.run.effects.pendingTotal(),0);
  assert.equal(g._prologueTutorial.current,null,'开局无真实升级时不能直接出现选技能/分支指引');
  g.run.gainExp(g.run.expNeed());assert(g.flushUpgrades());Guide.tick(g);
  if(id===PLAN.order[1])assert.equal(g._prologueTutorial.current.event,'skill');
  else{
   assert.equal(g._prologueTutorial.current,null,'首次技能激活窗口不是分支引导');
   const group=g.pickQueue[g.pickIndex],card=group.candidates[0];
   assert(g.run.applyChoice(group.tower,card).ok);g.nextPick();
   g.run.gainExp(g.run.expNeed());g.flushUpgrades();
   const active=g.run.effects.tower(card.fromTower),branches=active._choices().filter(item=>item.type==='branch');
   g.pickQueue[g.pickIndex].candidates=branches.slice(0,3);Guide.tick(g);
   assert.equal(g._prologueTutorial.current.event,'branch');
   assert(g._prologueTutorial.current.body.includes('另外两个本局不能再选'));
   const selected=branches[0];assert(g.run.applyChoice(g.pickQueue[g.pickIndex].tower,selected).ok);
   active.pending=1;
   assert(!g.run.applyChoice(card.fromTower,{...selected,branch:selected.branch==='A'?'B':'A'}).ok);
   assert(active._choices().filter(c=>c.name===card.name&&c.type==='branch').every(c=>c.branch===selected.branch));
  }
 }
 const g=game(PLAN.order[1]);g.run.applyMatch('red','3',3);g.run.gainExp(g.run.expNeed());g.flushUpgrades();Guide.tick(g);
 g.pickHits={0:{cardRect:{x:70,y:350,w:184,h:520}},1:{cardRect:{x:270,y:350,w:184,h:520}},2:{cardRect:{x:470,y:350,w:184,h:520}}};
 fills=[];Guide.draw(ctx,g);
 assert(fills.length>3,'必须绘制四周遮罩而非只有描边');
 assert(Guide.tap(g,{x:5,y:10}),'暗区必须拦截');
 assert(!Guide.tap(g,{x:80,y:400}),'高亮卡片允许原点击逻辑处理');
 assert(!Guide.allowSwap(g,0,0,0,1),'暗区的棋盘滑动也必须拦截');
 const holes=Guide.targets(g);
 for(const hole of holes)assert(!fills.some(f=>f.x<=hole.x+hole.w/2&&f.x+f.w>=hole.x+hole.w/2&&f.y<=hole.y+hole.h/2&&f.y+f.h>=hole.y+hole.h/2),'遮罩不能盖住目标中心');
 const rect={x:50,y:50,w:100,h:100};fills=[];Spotlight.draw(ctx,[rect],'测试','说明');
 assert(!fills.some(f=>Spotlight.inside({x:100,y:100},f)));

 const home={state:'menu',menuTab:'battle',menuStage:PLAN.order[0],meta:new Meta(),save:{save:()=>true},menuHits:[]};
 home.meta.encounters.global=true;
 home.menuHits=[{key:'globalCfg',data:{index:0},rect:{x:70,y:1200,w:250,h:100}}];
 assert.equal(MenuGuide.target(home).item.id,'feature:global');
 MenuGuide.draw(ctx,home);assert(MenuGuide.tap(home,{x:10,y:10}));assert(!home.meta.unlockGuideSeen['feature:global']);
 assert(!MenuGuide.tap(home,{x:100,y:1230}));assert(home.meta.unlockGuideSeen['feature:global']);
 home.meta=Meta.fromJSON(home.meta.toJSON());assert.equal(MenuGuide.target(home),null);
 home.meta.learnTower('fire');home.menuHits=[{key:'tab',data:'codex',rect:{x:500,y:1500,w:100,h:100}}];
 assert(!MenuGuide.target(home).viewing);MenuGuide.tap(home,{x:550,y:1550});assert(!home.meta.unlockGuideSeen['tower:fire']);
 home.menuTab='codex';home.menuHits=[{key:'codexSel',data:'fire',rect:{x:20,y:230,w:120,h:70}}];
 assert(MenuGuide.target(home).viewing);MenuGuide.tap(home,{x:50,y:250});assert(home.meta.unlockGuideSeen['tower:fire']);
 const old=new Meta();old.encounters.shop=true;const raw=old.toJSON();delete raw.unlockGuideSeen;
 assert(Meta.fromJSON(raw).unlockGuideSeen['feature:shop'],'旧档已知解锁不应一次重复弹出');
 home.testProfile=true;assert.equal(MenuGuide.target(home),null);
 const native=game(PLAN.order[1]);native.run.applyMatch('red','3',3);native.run.gainExp(native.run.expNeed());native.flushUpgrades();native.update(.016);native.render();
 assert(native.pickHits[0].cardRect);assert(native._prologueTutorial.spotlight,'真实绘制必须产生遮罩与卡片坐标');
 native.towerInfo={};assert(!Guide.tap(native,{x:5,y:5}),'已有弹窗需要正常关闭，不能被指引锁死');
 // 首遇圣遗物只须确认，不依赖开箱；也不能挡住同时发生的升级三选一。
 const relic=game(PLAN.order[2]);
 relic._prologueTutorial.saved.done.push('branch');relic.run.wave=5;
 Guide.tick(relic);Guide.draw(ctx,relic);
 assert(relic._prologueTutorial.current.acknowledge);
 const confirm=relic._prologueTutorial.spotlight.skip;
 assert(Guide.tap(relic,{x:confirm.x+10,y:confirm.y+10}));
 assert(relic._prologueTutorial.saved.done.includes('relic'));
 assert(!relic._prologueTutorial.saved.skipped,'确认不能跳过本章');
 assert(Guide.allowSwap(relic,0,0,0,1),'确认后无需打开宝箱便恢复操作');
 const restored=Meta.fromJSON(relic.meta.toJSON());
 assert(restored.prologue.tutorials[PLAN.order[2]].done.includes('relic'));
 const overlap=game(PLAN.order[2]);overlap._prologueTutorial.saved.done.push('branch');overlap.run.wave=5;
 Guide.tick(overlap);Guide.draw(ctx,overlap);assert(overlap._prologueTutorial.spotlight);
 overlap.run.applyMatch('red','3',3);overlap.run.gainExp(overlap.run.expNeed());assert(overlap.flushUpgrades());
 assert.equal(overlap.state,'picking');
 assert(!Guide.tap(overlap,{x:80,y:400}),'已有指引不能拦截升级窗口');
 Guide.draw(ctx,overlap);assert.equal(overlap._prologueTutorial.spotlight,null);
 overlap.state='relicpick';assert(!Guide.tap(overlap,{x:80,y:400}));
 overlap.state='fighting';Guide.draw(ctx,overlap);assert(overlap._prologueTutorial.spotlight,'回到战斗可继续确认');
 const charge=game(PLAN.order[0]);charge.run.applyMatch('red','3',3);
 charge._prologueTutorial.saved.done.push('match','tower');charge._prologueTutorial.current=null;
 charge.run.wave=1;Guide.tick(charge);assert.equal(charge._prologueTutorial.current,null,'没有补能事件时不提前讲解能量');
 Guide.action(charge,'swap',{settled:[{tower:'fire',gotTower:true,ammoGain:40}]});Guide.tick(charge);
 assert.equal(charge._prologueTutorial.current,null,'首次建塔的初始能量不算补能');
 const board=JSON.stringify(charge.run.board.grid);
 Guide.action(charge,'swap',{settled:[{tower:'fire',gotTower:false,ammoGain:6}]});Guide.tick(charge);
 assert.equal(charge._prologueTutorial.current.id,'energy');assert.equal(charge.run.wave,1);
 assert.equal(JSON.stringify(charge.run.board.grid),board,'充能讲解不能重置棋盘');
 Guide.draw(ctx,charge);assert.equal(Guide.targets(charge)[0].y,charge.ly.slotY);
 assert(charge._prologueTutorial.current.body.includes('130%'));
 const ok=charge._prologueTutorial.spotlight.skip;Guide.tap(charge,{x:ok.x+10,y:ok.y+10});
 assert(charge._prologueTutorial.saved.done.includes('energy'));assert(!charge._prologueTutorial.saved.skipped);
 console.log('PASS natural upgrades, branch locks, spotlight/input, unlock reload, relic acknowledgement, concurrent choices and first actual recharge tutorial.');
}finally{fixture.restore();}
