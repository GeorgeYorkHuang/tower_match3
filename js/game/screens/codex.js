/** 塔图鉴：六塔总览、左侧技能、右侧可滚动分支。只读配置，不影响战斗与存档。 */
'use strict';
const CONFIG=require('../../config.js');
const {skillEnergy}=require('../codex-energy.js');
const Branch=require('../../branch-description.js');
const {fillRoundRect:fill,strokeRoundRect:stroke,text}=require('../ui.js');
const fmt=n=>String(Number(Number(n).toFixed(2)));
const GOLD='#e4c786',INK='#f0ead9',MUTED='#acbdac';
function createCodexScreen({drawImg,skillIconSrc,drawTowerGlyph,IMG_SRC,TOWER_HEX,wrapText}) {
  // 图鉴耗能只依赖静态技能配置；缓存独立构筑结果，避免每帧重新创建技能池。
  const energyCache=new Map();
  const energyOf=(...args)=>{const id=args.join('/');if(!energyCache.has(id))energyCache.set(id,skillEnergy(...args));return energyCache.get(id);};
  const tint=k=>TOWER_HEX[CONFIG.TOWERS[k].color]||GOLD;
  const name=k=>String((CONFIG.COLORS[CONFIG.TOWERS[k].color]||{}).name||k).replace(/（[^）]*）|\([^)]*\)/g,'').trim();
  const unlocked=(s,k)=>s.testProfile||!!(s.towerCodex||{})[k];
  function frame(ctx,x,y,w,h,skin,selected=false){
    fill(ctx,x,y,w,h,18,'#142a21');
    ctx.save();ctx.beginPath();ctx.rect(x+2,y+2,w-4,h-4);ctx.clip();drawImg(ctx,skin,x,y,w,h);
    fill(ctx,x+2,y+2,w-4,h-4,16,'rgba(8,29,20,0.72)');ctx.restore();
    stroke(ctx,x,y,w,h,18,selected?GOLD:'rgba(214,182,116,0.35)',selected?2.5:1.4);
  }
  function icon(ctx,k,x,y,size){if(!drawImg(ctx,IMG_SRC[k],x,y,size,size))drawTowerGlyph(ctx,k,x,y,size);}
  function skillIcon(ctx,k,sk,x,y,size){if(!drawImg(ctx,skillIconSrc(k,sk.name),x,y,size,size))text(ctx,sk.icon||'◆',x+size/2,y+size/2,size*.6,INK,'center');}
  function fit(ctx,v,w,size){ctx.font=`bold ${size}px sans-serif`;let s=String(v||'');if(ctx.measureText(s).width<=w)return s;while(s&&ctx.measureText(s+'…').width>w)s=s.slice(0,-1);return s+'…';}
  function menuCodex(ctx,s,push){
    const keys=Object.keys(CONFIG.TOWERS),total=keys.reduce((n,k)=>n+CONFIG.EFFECT_POOLS[k].length,0);
    text(ctx,'塔图鉴',375,255,44,'#28432d','center');
    text(ctx,`六座防御塔 · ${total} 项技能 · ${keys.filter(k=>unlocked(s,k)).length}/6 已解锁`,375,309,23,'#3d5538','center');
    text(ctx,'选择防御塔，查看技能与 A / B / C 分支',375,356,23,'#2f4932','center');
    keys.forEach((k,i)=>{
      const x=32+(i%2)*355,y=397+Math.floor(i/2)*352,w=331,h=330,T=CONFIG.TOWERS[k],open=unlocked(s,k),color=tint(k);
      push('codexSel',k,x,y,w,h);frame(ctx,x,y,w,h,'garden:towerDetail');
      ctx.save();if(!open)ctx.globalAlpha=.3;icon(ctx,k,x+12,y+12,106);ctx.restore();
      text(ctx,name(k),x+126,y+43,30,open?INK:MUTED,'left');
      text(ctx,open?`${CONFIG.EFFECT_POOLS[k].length} 项技能`:'首次建塔后解锁',x+126,y+81,20,open?color:MUTED,'left');
      [['攻击',T.baseDps*T.atkInterval,100,'/发'],['攻速',1/T.atkInterval,2,'/秒'],['射程',T.range,1000,'']].forEach(([label,value,cap,unit],r)=>{
        const ry=y+146+r*43;text(ctx,label,x+20,ry,21,MUTED,'left');
        fill(ctx,x+77,ry-5,129,10,5,'rgba(255,255,255,0.10)');fill(ctx,x+77,ry-5,Math.max(10,129*Math.min(1,value/cap)),10,5,open?color:'#637568');
        text(ctx,fmt(value)+unit,x+w-17,ry,20,INK,'right');
      });
      fill(ctx,x+18,y+270,w-36,1,0,GOLD);text(ctx,`DPS ${fmt(T.baseDps)}`,x+20,y+299,20,GOLD,'left');
      text(ctx,`基础耗能 ${fmt(T.attackCost||CONFIG.GLOBAL_SKILL.perAttack)}`,x+w-18,y+299,20,MUTED,'right');
    });
  }
  /** 右栏按完整文字计算高度，左栏八个技能始终可见，不截断升级说明。 */
  function codexSkillPanel(ctx,s,push){
    const p=s.panel||{},k=p.tower||s.codexSel||'fire',pool=CONFIG.EFFECT_POOLS[k]||[];if(!pool.length)return null;
    const idx=Math.max(0,Math.min(pool.length-1,p.idx||0)),sk=pool[idx],T=CONFIG.TOWERS[k],color=tint(k);
    const x=82,y=210,w=646,h=1272,bottom=1450,left=x+22,leftW=188,right=344,rightW=354;
    // 当前技能说明固定在顶部；左右列表从同一高度开始，不随右侧滚动移走。
    const energy=energyOf(k,sk.name),infoY=y+193,infoW=w-48;
    const cap=wrapText(ctx,sk.pick||sk.desc||'',infoW-40,23),infoH=70+cap.length*31;
    const bodyY=infoY+infoH+38;
    const skillH=Math.min(98,Math.floor((bottom-bodyY-18-(pool.length-1)*8)/pool.length)),skillStep=skillH+8;
    ctx.fillStyle='rgba(3,12,8,0.80)';ctx.fillRect(0,0,750,CONFIG.DESIGN.H);push('panelBounds',null,x,y,w,h);
    frame(ctx,x,y,w,h,'garden:towerDetail',true);push('panelClose',null,x-25,y+16,64,64);
    fill(ctx,x-25,y+16,64,64,32,'#234334');stroke(ctx,x-25,y+16,64,64,32,GOLD,2);text(ctx,'‹',x+7,y+45,48,GOLD,'center');
    icon(ctx,k,x+36,y+28,90);text(ctx,name(k),x+146,y+56,38,INK,'left');text(ctx,`${pool.length} 项技能 · 分支成长`,x+146,y+100,22,MUTED,'left');
    text(ctx,'每个技能每局',x+w-34,y+47,20,MUTED,'right');
    text(ctx,'只能选择一条分支',x+w-34,y+77,20,GOLD,'right');
    text(ctx,`攻击 ${fmt(T.baseDps*T.atkInterval)}   攻速 ${fmt(1/T.atkInterval)}   射程 ${T.range}`,x+32,y+161,23,GOLD,'left');
    fill(ctx,x+24,infoY,infoW,infoH,12,'rgba(3,18,11,0.65)');
    skillIcon(ctx,k,sk,x+40,infoY+10,44);
    text(ctx,sk.name,x+w*.41,infoY+32,29,INK,'center');
    text(ctx,`⚡${energy.label}`,x+w-44,infoY+32,22,GOLD,'right');
    cap.forEach((line,i)=>text(ctx,line,x+44,infoY+75+i*31,23,MUTED,'left'));
    text(ctx,'技能',left,bodyY-15,24,MUTED,'left');text(ctx,'分支',right,bodyY-15,24,MUTED,'left');
    pool.forEach((item,i)=>{
      const sy=bodyY+18+i*skillStep;push('codexSkillSelect',{tower:k,idx:i},left,sy,leftW,skillH);
      frame(ctx,left,sy,leftW,skillH,'garden:towerSkillCard',i===idx);if(i===idx)fill(ctx,left+1,sy+15,4,skillH-30,2,GOLD);
      skillIcon(ctx,k,item,left+10,sy+13,46);text(ctx,fit(ctx,item.name,leftW-70,24),left+65,sy+32,24,INK,'left');
      text(ctx,fit(ctx,item.type||'被动',leftW-70,18),left+65,sy+65,18,i===idx?GOLD:MUTED,'left');
    });
    const vp={x:right,y:bodyY+18,w:rightW,h:bottom-bodyY-18};
    const rows=['A','B','C'].map(bk=>{
      const overview=String(sk[bk.toLowerCase()]||''),colon=overview.indexOf('：');
      const branchName=colon>0?overview.slice(0,colon):overview||'分支未开放';
      const levels=[Branch.current(sk,bk,0),...Branch.upgrades(sk,bk)].map((v,i)=>({label:i?`Lv${i} → Lv${i+1}`:'基础效果',lines:wrapText(ctx,v,rightW-32,22)}));
      return {bk,branchName,levels,height:76+levels.reduce((n,v)=>n+28+v.lines.length*29,0)};
    });
    const contentH=rows.reduce((n,r)=>n+r.height+18,0),max=Math.max(0,contentH-vp.h),scroll=Math.max(0,Math.min(max,p.scrollY||0));
    ctx.save();ctx.beginPath();ctx.rect(x+18,bodyY+5,w-30,bottom-bodyY);ctx.clip();
    let cy=vp.y-scroll;const sx=left+leftW,sy=bodyY+18+idx*skillStep+skillH/2;
    // 三条连线共用当前技能锚点，光点只在图鉴抽屉显示时绘制。
    rows.forEach((row,i)=>{
      const ty=cy+34;ctx.strokeStyle='rgba(228,199,134,0.70)';ctx.lineWidth=3.6;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.bezierCurveTo(sx+16,sy,right-16,ty,right,ty);ctx.stroke();
      const t=(Date.now()/2300+i*.3)%1,u=1-t,dx=u*u*u*sx+3*u*u*t*(sx+16)+3*u*t*t*(right-16)+t*t*t*right,dy=(u*u*u+3*u*u*t)*sy+(3*u*t*t+t*t*t)*ty;
      ctx.fillStyle='rgba(228,199,134,0.20)';ctx.beginPath();ctx.arc(dx,dy,10,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff0bc';ctx.beginPath();ctx.arc(dx,dy,5.6,0,Math.PI*2);ctx.fill();cy+=row.height+18;
    });ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(vp.x,vp.y,vp.w,vp.h);ctx.clip();let yy=vp.y-scroll;
    rows.forEach(row=>{
      frame(ctx,right,yy,rightW,row.height,'garden:towerSkillDetail');fill(ctx,right+14,yy+15,35,35,8,color);
      text(ctx,row.bk,right+31.5,yy+33,24,'#14261a','center');text(ctx,fit(ctx,row.branchName,rightW-76,26),right+62,yy+34,26,INK,'left');let ly=yy+75;
      row.levels.forEach(lv=>{text(ctx,lv.label,right+16,ly,19,GOLD,'left');ly+=28;lv.lines.forEach(line=>{text(ctx,line,right+16,ly,22,INK,'left');ly+=29;});});yy+=row.height+18;
    });ctx.restore();
    if(max>0){const thumb=Math.max(48,vp.h*vp.h/contentH);fill(ctx,715,vp.y,4,vp.h,2,'#2c4434');fill(ctx,715,vp.y+(vp.h-thumb)*scroll/max,4,thumb,2,GOLD);}
    return {viewport:vp,max};
  }
  return {menuCodex,codexSkillPanel};
}
module.exports={createCodexScreen};
