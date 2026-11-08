'use strict';
const {core:C,effects}=require('./pixelfx-debuff-runtime.js');
const actors=new Map(),renders=new Map(),handled=new WeakMap();
function surface(w,h){if(typeof wx==='undefined')return null;const c=wx.createOffscreenCanvas?wx.createOffscreenCanvas({type:'2d',width:w,height:h}):wx.createCanvas();c.width=w;c.height=h;return c;}
function limit(map,max){while(map.size>max)map.delete(map.keys().next().value);}
function actorOf(img,crop){
 const key=(img.src||'image')+':'+[crop.x,crop.y,crop.w,crop.h].join(',');if(actors.has(key))return actors.get(key);
 const canvas=surface(48,48);if(!canvas)return null;const ctx=canvas.getContext('2d');ctx.drawImage(img,crop.x,crop.y,crop.w,crop.h,0,0,48,48);const rgba=ctx.getImageData(0,0,48,48).data;
 let left=48,right=-1,top=48,bottom=-1;for(let y=0;y<48;y++)for(let x=0;x<48;x++)if(rgba[(y*48+x)*4+3]>80){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)return null;const w=32,h=Math.max(2,Math.min(48,Math.round((bottom-top+1)*32/(right-left+1)))),data=new Uint8Array(w*h),pixels=new Uint32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=Math.round(left+x*(right-left)/(w-1)),sy=Math.round(top+y*(bottom-top)/(h-1)),i=(sy*48+sx)*4,j=y*w+x;data[j]=rgba[i+3]>80?1:0;pixels[j]=(rgba[i+3]<<24)|(rgba[i+2]<<16)|(rgba[i+1]<<8)|rgba[i];}
 const actor={mask:{w,h,data},pixels,x:-16,y:-h,w,h,k:2,head:[0,-h],chest:[0,-h/2]};
 // Match approved 80% ice-slow tint, per sprite alpha and luminance.
 const ice=ctx.getImageData(0,0,48,48),p=ice.data;for(let i=0;i<p.length;i+=4){if(!p[i+3])continue;const light=(p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722)/255,shade=.48+.52*light;p[i]=p[i]*.2+145*shade*.8;p[i+1]=p[i+1]*.2+211*shade*.8;p[i+2]=p[i+2]*.2+255*shade*.8;}const tinted=surface(48,48);tinted.getContext('2d').putImageData(ice,0,0);
 const value={actor,key,left,right,top,bottom,tinted};actors.set(key,value);limit(actors,96);return value;
}
function selected(e){const ids=[];const dots=e.dots||[];if(dots.some(d=>d.type==='burn'&&d.ttl>0))ids.push('status/burning');if(dots.some(d=>d.type==='poison'&&d.ttl>0))ids.push('status/poisoned');if(e.bleedT>0)ids.push('status/bleeding');if(e.frozen>0)ids.push('ice/freeze');if(e._vineT>0)ids.push('nature/root-snare');if(e.paralyzed>0)ids.push('lightning/electrified');return ids;}
function render(info,id,seconds){
 const mod=effects[id],phase=id==='nature/root-snare'?.9+(seconds%.6):id==='ice/freeze'?Math.min(1.4,.5+seconds%1):seconds%mod.meta.duration;
 const frameNo=Math.floor(phase*15),key=info.key+'|'+id+'|'+frameNo;if(renders.has(key))return renders.get(key);
 const W=128,H=128,ox=64,oy=96,frame=C.createFrame(W,H),inst=C.createFx(mod,{actor:info.actor,x:ox,y:oy});
 for(let t=0;t<frameNo/15;t+=1/30)inst.update(Math.min(1/30,frameNo/15-t));inst.draw(frame);
 if(id==='lightning/electrified')frame.light.fill(0);
 const bytes=C.composite(frame,new Uint8ClampedArray(W*H*4),null),canvas=surface(W,H),ctx=canvas.getContext('2d'),image=ctx.createImageData(W,H);image.data.set(bytes);ctx.putImageData(image,0,0);renders.set(key,canvas);limit(renders,160);return canvas;
}
function draw(ctx,img,crop,e,x,y,size,now){
 handled.set(e,false);const ids=selected(e),ice=e._iceSlowT>0&&!(e.frozen>0);if(!ids.length&&!ice){handled.set(e,true);return;}
 try{const info=actorOf(img,crop);if(!info)return;if(ice)ctx.drawImage(info.tinted,x,y,size,size);
 const scale=size*(info.right-info.left+1)/48/32,cx=x+(info.left+info.right+1)/96*size,feet=y+(info.bottom+1)/48*size;
 ctx.save();ctx.imageSmoothingEnabled=false;for(const id of ids)ctx.drawImage(render(info,id,now/1000),cx-64*scale,feet-96*scale,128*scale,128*scale);ctx.restore();handled.set(e,true);
 }catch(error){handled.set(e,false);}
}
function ready(e){return handled.get(e)===true;}
module.exports={draw,ready,selected};
