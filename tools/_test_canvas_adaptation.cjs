const assert=require('assert'),fs=require('fs');const {ensureCanvasSize}=require('../js/game/canvas.js');const {toLogic}=require('../js/game/input/coordinates.js');const CONFIG=require('../js/config.js');
for(const [w,h,dpr] of [[360,780,3],[393,873,2.75],[375,667,3],[412,915,2.625]]){
 global.wx={getWindowInfo:()=>({windowWidth:w,windowHeight:h,pixelRatio:dpr})};const canvas={width:300,height:150};ensureCanvasSize(canvas);assert.equal(canvas.width,Math.round(w*dpr));assert.equal(canvas.height,Math.round(h*dpr));const scale=Math.min(canvas.width/CONFIG.DESIGN.W,canvas.height/CONFIG.DESIGN.H);const fn=function(cx,cy){return toLogic(this,canvas,cx,cy);};const host={scale,_touchSpace:'window'};
 for(const [x,y] of [[50,50],[375,900],[650,1450]]){const p=fn.call(host,x*scale/canvas.width*w,y*scale/canvas.height*h);assert(Math.abs(p.x-x)<1e-7);assert(Math.abs(p.y-y)<1e-7);}
 canvas.getBoundingClientRect=()=>({left:11,top:23,width:w,height:h});host._touchSpace='canvas';const p=fn.call(host,11+375*scale/canvas.width*w,23+900*scale/canvas.height*h);assert(Math.abs(p.x-375)<1e-7);assert(Math.abs(p.y-900)<1e-7);
}
console.log('PASS 4 aspect ratios/DPRs: nonzero canvas upgraded, wx and offset browser touches invert actual render scale.');
