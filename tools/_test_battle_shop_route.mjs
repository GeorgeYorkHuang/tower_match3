/**
 * test_touch_wx.mjs —— 真机触摸通道测试（mock wx.onTouchStart 全局通道 + 逻辑像素坐标）
 * 验证：真机优先走 wx 全局触摸事件（非同层渲染下 canvas 事件可能不派发），
 * 坐标按 windowWidth/Height 逻辑像素归一化到 750×1334。
 * 运行：node tools/test_touch_wx.mjs
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k] == null ? store[k] : JSON.parse(JSON.stringify(store[k])); },
  setStorageSync(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
  // 真机：全局触摸通道（逻辑像素坐标）
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; },
  onTouchMove(fn) { wxHandlers.move = fn; },
  onTouchEnd(fn) { wxHandlers.end = fn; },
  onTouchCancel(fn) { wxHandlers.cancel = fn; },
};
const ctx2d = new Proxy({}, { get() { return () => undefined; }, set() { return true; } });
const canvasHandlers = {};
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: (t, fn) => { canvasHandlers[t] = fn; } };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;

const CONFIG=require('../js/config.js');
game.newRun(true);game.state='fighting';game.shopOpen=true;
const goldBefore=game.meta.gold,diamondBefore=game.meta.diamond;
const ctx=new Proxy({}, {get(t,k){if(k==='measureText')return ()=>({width:10});return ()=>undefined;},set(){return true;}});
function paint(){game.renderer.battleShop(ctx,{shopOpen:game.shopOpen,gold:game.run.gold,store:game.run.store});}
function click(index){paint();const r=game.renderer.shopItemRects[index];return game.dispatchTouch({x:r.x+r.w/2,y:r.y+r.h/2});}
let checks=0;
for(let i=0;i<CONFIG.STORE.items.length;i++) {
 const it=CONFIG.STORE.items[i];
 game.run.store[it.id]=0;game.run.gold=0;
 assert.equal(click(i),true);assert.equal(game.run.gold,0);assert.equal(game.run.store[it.id],0);checks++;
 game.run.gold=100000;const before=game.run.gold;
 if(it.id==='wall')game.run.lineHp=1;
 const towers=game.run.slotOrder.map(k=>game.run.effects.tower(k)).filter(t=>t&&t.level>0);
 if(it.id==='energy')towers.forEach(t=>t.energy=0);
 click(i);assert.equal(game.run.gold,before-it.cost[0]);assert.equal(game.run.store[it.id],1);
 if(it.id==='wall')assert.equal(game.run.lineHp,Math.min(game.run.lineMaxHp||CONFIG.LINE.hp,1+Math.round((game.run.lineMaxHp||CONFIG.LINE.hp)*0.3)));
 if(it.id==='energy')towers.forEach(t=>assert.equal(t.energy,Math.min(game.run.armoryEnergyMax(),15)));
 checks++;
 game.run.store[it.id]=it.max;const maxGold=game.run.gold;click(i);assert.equal(game.run.gold,maxGold);assert.equal(game.run.store[it.id],it.max);checks++;
}
paint();const panel=game.renderer.shopPanelRect;const money=game.run.gold;
game.dispatchTouch({x:panel.x+5,y:panel.y+5});assert.equal(game.shopOpen,true);assert.equal(game.run.gold,money);checks++;
game.dispatchTouch({x:panel.x-1,y:panel.y});assert.equal(game.shopOpen,false);assert.equal(game.run.gold,money);checks++;
assert.equal(game.meta.gold,goldBefore);assert.equal(game.meta.diamond,diamondBefore);checks++;
console.log('PASS '+checks+' real main battle-shop route checks: insufficient funds, one deduction, limits, instant effects, blank/outside clicks and meta currency isolation');
