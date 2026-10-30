'use strict';
const assert=require('assert');
const {createRelicScroller}=require('../js/game/input/relic-scroll.js');
const motion=require('../js/config/relic-scroll.js');
let time=0;const scroll=createRelicScroller({now:()=>time});
const game=(position=0,max=10000)=>({state:'menu',menuTab:'relic',menuPanel:null,relicScroll:position,renderer:{_relicMaxScroll:max}});
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function launch(g,direction=1){
 time=0;scroll.begin(g,{x:375,y:1000});time=20;scroll.move(g,{x:375,y:1000-direction*20});
 time=40;scroll.move(g,{x:375,y:1000-direction*40});time=50;scroll.end(g);
}
let count=0;
const a=game();launch(a);near(a._relicScrollVelocity,1000);
const first=a.relicScroll;scroll.update(a,0.1);near(a._relicScrollVelocity,760);near(a.relicScroll,first+88);
const second=a.relicScroll;scroll.update(a,0.1);near(a._relicScrollVelocity,520);near(a.relicScroll-second,64);
assert(a.relicScroll-second<88);scroll.update(a,1);near(a._relicScrollVelocity,0);near(a.relicScroll,first+1000*1000/(2*motion.deceleration));count++;
const b=game(1000);launch(b,-1);near(b._relicScrollVelocity,-1000);const down=b.relicScroll;scroll.update(b,0.1);near(b.relicScroll,down-88);near(b._relicScrollVelocity,-760);count++;
for(const [pos,velocity,max,expected] of [[100,1000,105,105],[5,-1000,1000,0]]){
 const g=game(pos,max);g._relicScrollVelocity=velocity;scroll.update(g,0.2);near(g.relicScroll,expected);near(g._relicScrollVelocity,0);count++;
}
const held=game();time=0;scroll.begin(held,{x:375,y:1000});time=20;scroll.move(held,{x:375,y:980});time=200;scroll.end(held);near(held._relicScrollVelocity,0);count++;
const tap=game();scroll.begin(tap,{x:375,y:1000});time++;scroll.move(tap,{x:375,y:999});const d=scroll.end(tap);assert.strictEqual(d.moved,false);near(tap._relicScrollVelocity,0);count++;
const cancel=game();launch(cancel);scroll.cancel(cancel);const stopped=cancel.relicScroll;scroll.update(cancel,1);near(cancel.relicScroll,stopped);assert.strictEqual(cancel._relicDrag,null);count++;
const handoff=game();launch(handoff);scroll.begin(handoff,{x:375,y:800});near(handoff._relicScrollVelocity,0);const frozen=handoff.relicScroll;scroll.update(handoff,0.1);near(handoff.relicScroll,frozen);count++;
for(const mutate of [g=>g.menuTab='battle',g=>g.menuPanel={type:'relicInfo'},g=>g.state='fighting']){
 const g=game();launch(g);const prior=g.relicScroll;mutate(g);scroll.update(g,0.1);near(g.relicScroll,prior);near(g._relicScrollVelocity,0);assert.strictEqual(g._relicDrag,null);count++;
}
const fast=game();time=0;scroll.begin(fast,{x:375,y:1000});time=1;scroll.move(fast,{x:375,y:0});scroll.end(fast);near(fast._relicScrollVelocity,motion.maximumVelocity);count++;
const f1=game(),f2=game();launch(f1);launch(f2);for(let i=0;i<50;i++)scroll.update(f1,0.01);for(let i=0;i<10;i++)scroll.update(f2,0.05);near(f1.relicScroll,f2.relicScroll);near(f1._relicScrollVelocity,0);count++;
const isolated=game(333),prior=isolated.relicScroll;launch(game());scroll.update(isolated,0.1);near(isolated.relicScroll,prior);count++;
const reverse=game(1000);time=0;scroll.begin(reverse,{x:375,y:1000});
time=20;scroll.move(reverse,{x:375,y:960});time=40;scroll.move(reverse,{x:375,y:980});
time=50;scroll.end(reverse);near(reverse._relicScrollVelocity,-1000);count++;
console.log('PASS '+count+' inertial-scroll cases: release velocity, constant deceleration, both directions, bounds, held release, tap/cancel, handoff, page change, cap, frame independence and isolated state');
