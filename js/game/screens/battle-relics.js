/** 局内圣遗物三选一与详情：品质卡框、依次弹出和一次性揭示特效，奖励由流程层处理。 */
'use strict';
const CONFIG = require('../../config.js');
const PickLayout = require('./pick-layout.js');
const RelicPickFx = require('../fx/relic-pick.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// 仅负责局内圣遗物三选一/详情绘制；奖励、重掷、暂停与关闭归原游戏逻辑。
// 命中区由调用方传入，不缓存Run、Meta或候选数据。
function createBattleRelics({ drawImg, IMG_SRC, TOWER_TINT, relicIconSrc }) {
  function relicPickLayer(ctx, pick, onPick, elapsed, gold) {
    if (!pick || !pick.candidates) return;
    const baseBox = PickLayout.geometry('relic', pick);
    const box = {...baseBox,y:baseBox.y-150,h:baseBox.h+150}, {x,y,w,h}=box;
    // 弹出动画：从宝箱中心(375,560) 0.5s 从小到大（easeOutBack 轻微回弹）
    const pe = Math.min(1, (elapsed || 0) / 500);
    const es = 1 + 2.70158 * Math.pow(pe - 1, 3) + 1.70158 * Math.pow(pe - 1, 2);
    const sc = pe >= 1 ? 1 : Math.min(1, Math.max(0.2, es));
    const al = pe >= 1 ? 1 : Math.min(1, pe * 1.6);
    ctx.save();
    ctx.globalAlpha = al;


    // 全屏遮罩：中心暖光、四角压暗（比纯黑更有"显现"感）
    const mask = ctx.createRadialGradient(375, 560, 60, 375, 560, 900);
    mask.addColorStop(0, 'rgba(30,20,6,0.78)');
    mask.addColorStop(1, 'rgba(8,6,10,0.92)');
    ctx.fillStyle = mask;
    PickLayout.backdrop(ctx, box);
    // Only the panel animates; its bounded scale can never cover the exposed tower strip.
    ctx.translate(375, y + h / 2); ctx.scale(sc, sc); ctx.translate(-375, -y - h / 2);
    // 主窗口：暗金渐变底 + 双层金描边
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2a2112'); bg.addColorStop(0.5, '#241b0e'); bg.addColorStop(1, '#1d1a10');
    fillRoundRect(ctx, x, y, w, h, 20, bg);
    strokeRoundRect(ctx, x - 3, y - 3, w + 6, h + 6, 23, '#c8860a', 3);
    strokeRoundRect(ctx, x, y, w, h, 20, '#ffd34d', 1.5);
    // 顶部金色光柱
    const beam = ctx.createLinearGradient(375, y - 6, 375, y + 120);
    beam.addColorStop(0, 'rgba(255,211,77,0.0)');
    beam.addColorStop(0.4, 'rgba(255,211,77,0.34)');
    beam.addColorStop(1, 'rgba(255,211,77,0.0)');
    ctx.fillStyle = beam;
    ctx.fillRect(375 - 90, y - 6, 180, 126);
    // 圣物纹章（菱形宝石）
    const gx = 375, gy = y + 44;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(Math.PI / 4);
    const gem = ctx.createLinearGradient(-12, -12, 12, 12);
    gem.addColorStop(0, '#fff2b3'); gem.addColorStop(0.5, '#ffd34d'); gem.addColorStop(1, '#c8860a');
    ctx.fillStyle = gem;
    ctx.fillRect(-12, -12, 24, 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.restore();
    text(ctx, pick.opening ? '历练启程' : pick.rarity === 'ssr' ? '金色圣物显现' : '圣物显现', 375, y + 76, 38, '#ffd34d', 'center');
    text(ctx, pick.opening ? '开局额外选择1件圣遗物 · 本局生效' : pick.rarity === 'ssr' ? '金色SSR专属候选 · 重掷仍为金色' : '获得圣遗物本局生效 · 塔圣遗物仅对应塔在场时出现', 375, y + 112, 18, '#c9b27a', 'center');
    // 3 个候选卡片（纵向扩容：bh 240→300）
    const bw = 188, bh = 450, gap = 16;
    const startX = (750 - (bw * 3 + gap * 2)) / 2;
    const cy = y + 138;
    pick.candidates.forEach((c, i) => {
      const age = (elapsed || 0) - 220 - i * 200;
      onPick[i] = {hit:()=>false};
      if(age<=0)return;
      const progress=Math.min(1,age/360), u=progress-1;
      const pop=1+2.70158*u*u*u+1.70158*u*u;
      const cx = startX + i * (bw + gap);
      const rarity = CONFIG.relicRarity(c.id);
      const quality = RelicPickFx.style(rarity);
      ctx.save();ctx.globalAlpha*=Math.min(1,progress*2);
      ctx.translate(cx+bw/2,cy+bh/2);ctx.scale(Math.max(.2,pop),Math.max(.2,pop));ctx.translate(-cx-bw/2,-cy-bh/2);
      const tint = c.tint ? (TOWER_TINT[c.tint] || '#f7c948') : '#f7c948';
      // 卡底、双层边框和选择按钮统一跟随蓝/紫/金品质，塔色仅作图标底部柔光。
      const cg = ctx.createLinearGradient(0, cy, 0, cy + bh);
      cg.addColorStop(0, quality.top); cg.addColorStop(1, quality.bottom);
      fillRoundRect(ctx, cx, cy, bw, bh, 16, cg);
      RelicPickFx.reveal(ctx, { x: cx, y: cy, w: bw, h: bh }, age, rarity);
      RelicPickFx.frame(ctx, { x: cx, y: cy, w: bw, h: bh }, rarity);
      const glow = ctx.createRadialGradient(cx + bw / 2, cy + 76, 20, cx + bw / 2, cy + 76, 130);
      glow.addColorStop(0, tint + '38'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx + bw / 2, cy + 76, 130, 0, Math.PI * 2); ctx.fill();
      // 图标：双环发光（外环 tint 呼吸 + 内环白描）
      const dia = 100;
      const icx = cx + bw / 2, icy = cy + 76;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2);
      ctx.fillStyle = tint + '2e'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = quality.edge; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2 + 5, 0, Math.PI * 2); ctx.stroke();
      const cSrc = relicIconSrc(c.id);
      if (!(cSrc && drawImg(ctx, cSrc, icx - dia / 2, icy - dia / 2, dia, dia))) {
        text(ctx, c.icon, icx, icy + 4, 48, '#ffffff', 'center');
      }
      text(ctx, quality.label, cx + bw - 13, cy + 20, 15, quality.light, 'right');
      text(ctx, c.name, cx + bw / 2, cy + 158, 25, quality.light, 'center');
      // 效果描述（按宽度换行，最多 3 行，防出框）
      const d = c.desc || '';
      const maxW = bw - 20;
      const lines = [];
      let cur = '';
      for (const ch of d) {
        const test = cur + ch;
        const testW = test.length * 16 + (test.match(/[A-Za-z0-9.%+\-×]/g) || []).length * 4;
        if (testW > maxW && cur) { lines.push(cur); cur = ch; if (lines.length >= 3) break; }
        else cur = test;
      }
      if (lines.length < 3 && cur) lines.push(cur);
      lines.forEach((ln, li) => {
        text(ctx, ln, cx + bw / 2, cy + 190 + li * 22, 16, '#c9b27a', 'center');
      });
      // 选择按钮与卡框保持同一品质配色。
      const btnX = cx + 24, btnY = cy + bh - 62, btnW = bw - 48, btnH = 46;
      const btnG = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      btnG.addColorStop(0, quality.buttonTop); btnG.addColorStop(1, quality.buttonBottom);
      fillRoundRect(ctx, btnX, btnY, btnW, btnH, 12, btnG);
      strokeRoundRect(ctx, btnX, btnY, btnW, btnH, 12, quality.edge, 1.5);
      text(ctx, '选 择', btnX + btnW / 2, btnY + btnH / 2, 24, quality.light, 'center');
      onPick[i] = { hit: (px, py) => (elapsed||0)>=1000 && px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH };
      ctx.restore();
    });
    // 本局共享重掷计数，500银币起、每次+500，无窗口次数上限。
    const cost = pick.rerollCost || CONFIG.PICK_REROLL.first;
    const canPay = (gold || 0) >= cost;
    const ry = y + h - 96, rw = 300, rh = 44, rx = (750 - rw) / 2;
    const rbG = ctx.createLinearGradient(0, ry, 0, ry + rh);
    rbG.addColorStop(0, canPay ? '#4a3a18' : '#332c22');
    rbG.addColorStop(1, canPay ? '#33250f' : '#241f18');
    fillRoundRect(ctx, rx, ry, rw, rh, 14, rbG);
    strokeRoundRect(ctx, rx, ry, rw, rh, 14, canPay ? '#ffd34d' : '#5a5448', 1.5);
    if (canPay) {
      text(ctx, `重掷 · ${cost} 银币`, 375, ry + rh / 2 + 2, 22, '#ffd34d', 'center');

    } else {
      text(ctx, `银币不足（需 ${cost}）`, 375, ry + rh / 2 + 2, 20, '#9a8a6a', 'center');
    }
    onPick.reroll = { hit: (px, py) => (elapsed||0)>=1000 && px >= rx && px <= rx + rw && py >= ry && py <= ry + rh };
    // 底部提示
    text(ctx, '✦ 选择后立即生效 · 本局结束失效 ✦', 375, y + h - 24, 17, '#8a7a4a', 'center');
    ctx.restore();
  }

  /** 本局圣遗物：按稀有度排序的卡片滚动列表，重复卡合并计数。 */
  function relicDetailLayer(ctx, relics, page, onPick) {
    const w=680,h=1060,x=35,y=(LOGIC_H-h)/2;
    ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(0,0,750,LOGIC_H);
    fillRoundRect(ctx,x,y,w,h,22,'#142b20');
    drawImg(ctx,'assets/images/interface/skins/account-info-garden-v1.png',x,y,w,h);
    strokeRoundRect(ctx,x,y,w,h,22,'#c7aa65',2);
    text(ctx,'本局圣遗物',375,y+70,36,'#ffe4a1','center');
    const order={ur:0,ssr:1,sr:2,r:3};
    const groups=Object.values(relics.reduce((m,r)=>{if(!m[r.id])m[r.id]={...r,count:0};m[r.id].count++;return m;},{})).sort((a,b)=>(order[CONFIG.relicRarity(a.id)]??4)-(order[CONFIG.relicRarity(b.id)]??4));
    text(ctx,'已获得 '+groups.length+' 种 · 共 '+relics.length+' 件',375,y+113,22,'#bfccb5','center');
    onPick.bg={hit:(px,py)=>px<x||px>x+w||py<y||py>y+h};
    onPick.close={hit:(px,py)=>Math.abs(px-(x+w-46))<28&&Math.abs(py-(y+44))<28};
    text(ctx,'×',x+w-46,y+44,34,'#e3d09a','center');
    const vp={x:65,y:y+150,w:620,h:850},content=Math.ceil(groups.length/3)*228;
    onPick.viewport=vp;onPick.maxScroll=Math.max(0,content-vp.h);
    onPick.scroll=Math.max(0,Math.min(onPick.maxScroll,onPick.scroll||0));
    onPick.items=[];onPick.tip=null;delete onPick.next;delete onPick.prev;
    ctx.save();ctx.beginPath();ctx.rect(vp.x,vp.y,vp.w,vp.h);ctx.clip();
    groups.forEach((r,i)=>{
      const xx=vp.x+i%3*208,yy=vp.y+Math.floor(i/3)*228-onPick.scroll;
      if(yy+216<vp.y||yy>vp.y+vp.h)return;
      const color={ur:'#ef776a',ssr:'#e9c86b',sr:'#bb8af2',r:'#72b8ed'}[CONFIG.relicRarity(r.id)]||'#d6c184';
      fillRoundRect(ctx,xx,yy,190,178,14,'#1b3829');
      drawImg(ctx,'assets/images/interface/cards/relic-card-v1.png',xx,yy,190,178);
      fillRoundRect(ctx,xx+3,yy+3,184,172,12,'rgba(10,38,23,.72)');
      strokeRoundRect(ctx,xx,yy,190,178,14,color,2);
      const src=relicIconSrc(r.id);if(!(src&&drawImg(ctx,src,xx+39,yy+8,112,112)))text(ctx,r.icon||'◆',xx+95,yy+65,50,color,'center');
      const size=Math.min(24,162/Math.max(1,r.name.length));
      text(ctx,r.name,xx+95,yy+148,size,'#f9ebc4','center');
      text(ctx,'数量 ×'+r.count,xx+95,yy+201,24,color,'center');
      const top=Math.max(vp.y,yy),bottom=Math.min(vp.y+vp.h,yy+178);
      if(bottom>top)onPick.items.push({id:r.id,hit:(px,py)=>px>=xx&&px<=xx+190&&py>=top&&py<=bottom});
    });ctx.restore();
    if(onPick.maxScroll>0){const th=vp.h*vp.h/content;fillRoundRect(ctx,700,vp.y,5,vp.h,2,'#314333');fillRoundRect(ctx,700,vp.y+(vp.h-th)*onPick.scroll/onPick.maxScroll,5,th,2,'#d6be7d');}
    if(onPick.selected){const r=groups.find(r=>r.id===onPick.selected);if(r){
      ctx.fillStyle='rgba(0,0,0,.60)';ctx.fillRect(x,y,w,h);
      const lines=String(r.desc||'').match(/.{1,20}/g)||[],ph=150+lines.length*34,py=(LOGIC_H-ph)/2;
      fillRoundRect(ctx,95,py,560,ph,18,'#19382a');strokeRoundRect(ctx,95,py,560,ph,18,'#d5bc74',2);
      text(ctx,r.name+' ×'+r.count,375,py+42,29,'#ffe3a0','center');
      lines.forEach((line,i)=>text(ctx,line,375,py+92+i*34,24,'#e5eddc','center'));
      text(ctx,'点击关闭详情',375,py+ph-24,19,'#b2c5a5','center');onPick.tip={hit:()=>true};
    }}
  }
  return { relicPickLayer, relicDetailLayer };
}
module.exports = { createBattleRelics };
