'use strict';
const assert=require('assert');
const {bindTouch}=require('../js/game/input/touch.js');
function createGame(){
 const handlers={}, swaps=[];
 const game={state:'fighting',renderer:{},toLogic:(x,y)=>({x,y}),cellAt:p=>[0,Math.floor(p.x/20)],
  dispatchTouch:()=>false,match3:{trySwap:(...args)=>{swaps.push(args);return true;}}};
 const canvas={addEventListener:(name,fn)=>{handlers[name]=fn;}};
 bindTouch(game,canvas);
 return {game,handlers,swaps};
}
const previous=global.wx;delete global.wx;
try {
 const a=createGame(),b=createGame();
 const e=x=>({touches:[{clientX:x,clientY:10}]});
 assert.strictEqual(a.game._touchSpace,'canvas');
 a.handlers.touchstart(e(10));a.handlers.touchmove(e(30));a.handlers.touchmove(e(50));
 assert.strictEqual(a.swaps.length,1);
 // A second game instance must have an independent gesture closure.
 b.handlers.touchstart(e(10));b.handlers.touchmove(e(30));assert.strictEqual(b.swaps.length,1);
 a.handlers.touchcancel();a.handlers.touchmove(e(50));assert.strictEqual(a.swaps.length,1);
 a.handlers.touchstart(e(10));a.handlers.touchmove(e(30));a.handlers.touchend({touches:[]});
 assert.strictEqual(a.swaps.length,2);
 let menuHits=0;a.game.state='menu';a.game.dispatchTouch=()=>{menuHits++;return true;};
 a.handlers.touchstart(e(10));a.handlers.touchend(e(10));a.handlers.touchstart(e(10));
 assert.strictEqual(menuHits,2);
 console.log('PASS canvas fallback, one swap per touch, cancel recovery, independent game gestures and menu input');
} finally { if(previous===undefined)delete global.wx;else global.wx=previous; }
