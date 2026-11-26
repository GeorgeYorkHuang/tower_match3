'use strict';
const assert=require('node:assert/strict'),{Meta}=require('../js/meta.js'),Actions=require('../js/game/input/menu-actions.js');
const meta=new Meta();meta.gold=100000;meta.diamond=100;
const offer=meta.ensureDailyPicks().picks[0];let saves=0;
const game={meta,menuPanel:null,menuHits:[],save:{save(){saves++;return true;}},toast(){}};
function tap(key,data){game.menuHits=[{key,data,hit:()=>true}];Actions.onMenuTap(game,{x:100,y:500});}
const before=meta.gold;tap('shopShard',offer);assert.equal(meta.gold,before);assert.equal(game.menuPanel.type,'shopDetail');game.menuPanel=null;
tap('shopQuickBuy',{key:'shopShard',data:offer});assert.equal(meta.gold,before-offer.price);assert.equal(game.menuPanel,null);assert.equal(saves,1);
tap('shopQuickBuy',{key:'shopShard',data:offer});assert.equal(meta.gold,before-offer.price);assert.equal(saves,1);
const gold=meta.gold;tap('shopQuickBuy',{key:'shopChest',data:{key:'wood'}});assert.equal(meta.gold,gold-1000);assert.equal(game.menuPanel.type,'chestOpen');game.menuPanel=null;
const coins=meta.gold,diamonds=meta.diamond;tap('shopQuickBuy',{key:'diamondOffer',data:'gold'});assert.equal(meta.gold,coins+1000);assert.equal(meta.diamond,diamonds-1);
meta.gold=0;tap('shopQuickBuy',{key:'shopChest',data:{key:'wood'}});assert.equal(meta.gold,0);assert.equal(game.menuPanel,null);
console.log('PASS detail without charge, direct shard/chest/diamond purchase, duplicate daily limit and insufficient currency');
