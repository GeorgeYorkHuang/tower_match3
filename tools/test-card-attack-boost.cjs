'use strict';
const assert=require('node:assert/strict'),Cards=require('../js/tower-cards.js'),Damage=require('../js/combat/damage.js'),V=require('../js/game/fx/card-rarity.js');
const towers={fire:{key:'fire',level:1,energy:100},ice:{key:'ice',level:1,energy:100}};
const run={slotOrder:['fire','ice'],towerSlots:4,effects:{tower:k=>towers[k],towerDps:()=>100},armoryEnergyMax:()=>100,relicNum:()=>0,relic3:()=>false};
const cb={game:{run},tower:k=>towers[k],relicVal:()=>0,relicTowerDmg:()=>0,branchLv:()=>0};
function use(star,key='fire'){Cards.state(run).cards[0]={star,key};return Cards.use(run,0,run.slotOrder.indexOf(key));}
const base=Damage.shotDmg(cb,'fire',false),ice=Damage.shotDmg(cb,'ice',false);
assert.equal(use(2).growthGain,3);assert.equal(Cards.growth(run,'fire'),3);
assert(Math.abs(Damage.shotDmg(cb,'fire',false)/base-1.03)<1e-10);
assert.equal(use(3).growthGain,10);assert.equal(Cards.doubleRemaining(run,'fire'),60);
assert(Math.abs(Damage.shotDmg(cb,'fire',false)/base-2.26)<1e-10);
assert.equal(Damage.shotDmg(cb,'ice',false),ice);
const skill=Damage.shotDmg(cb,'fire',true);Cards.tick(run,59);assert.equal(Cards.doubleRemaining(run,'fire'),1);Cards.tick(run,1);
assert.equal(Cards.doubleRemaining(run,'fire'),0);assert(Math.abs(skill/Damage.shotDmg(cb,'fire',true)-2)<1e-10);
run.cardGrowth.fire=30;towers.fire.energy=100;assert.equal(use(3).ok,true);Cards.tick(run,20);assert.equal(Cards.doubleRemaining(run,'fire'),40);assert.equal(use(3).ok,true);assert.equal(Cards.doubleRemaining(run,'fire'),60);assert.equal(Cards.growth(run,'fire'),30);
assert.equal(use(2).ok,true);assert.equal(Cards.state(run).cards[0],null);assert.equal(Cards.growth(run,'fire'),30);Cards.tick(run,100);assert.equal(Cards.doubleRemaining(run,'fire'),0);assert.equal(Cards.doubleRemaining({},'fire'),0);
const maxRadius=star=>Math.max(...V.makeOrbs(star,[{x:0,y:0}]).map(o=>Math.hypot(o.dx,o.dy)));
assert(maxRadius(3)>maxRadius(2));assert(maxRadius(2)>maxRadius(1));
console.log('PASS purple +3%, gold +10%, attack x2 for 60s, expiry, refresh without x4, per-tower isolation, growth cap and full-energy use and wider quality bursts');
