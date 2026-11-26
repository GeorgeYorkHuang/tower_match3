'use strict';
const ROOT='assets/images/monsters/bosses/miniboss-fields/';
function draw(ctx,load,e,x,y,size,now){
 if(e.bossArtKey!=='miniboss_bell'||!['ancient','lava','frost'].includes(e.minibossField))return false;
 const img=load(ROOT+e.minibossField+'-local-v1.png');if(!img||!img.width)return false;
 const clock=Math.max(0,Number(now)||0),t=(clock+(e.id||0)*53)%2400;
 const f=t<1800?0:t<1940?1:t<2060?2:t<2200?1:3;
 const phase=t/2400*Math.PI*2,cold=e.minibossField==='frost';
 ctx.save();try{
 ctx.translate(x+size/2+Math.sin(phase-.45)*size*.012,y+size/2+Math.sin(phase*2)*size*.008);
 ctx.rotate(Math.sin(phase)*(cold?.065:.045));
 const body=size*.76;
 ctx.drawImage(img,f*256,0,256,256,-body/2,-body/2,body,body);
 }finally{ctx.restore();}return true;
}
module.exports={draw};