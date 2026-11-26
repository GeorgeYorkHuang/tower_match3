'use strict';
const CONFIG = require('../../config.js');
const Product=require('./shop-product.js');
const SCARLET_ICON=require('../../economy/diamond-shop.js').OFFERS.scarlet.icon;
const { roundRect, getPressPoint, fillRoundRect, strokeRoundRect, text, button } = require('../ui.js');


function createMenuShopScreen({ drawImg, relicIconSrc, IMG_SRC, panelShell, wrapText }) {
  const chestBounds = {"gold":{"y":45,"x":17,"w":231,"h":177},"bronze":{"y":47,"x":18,"w":223,"h":183},"star":{"y":69,"x":54,"w":151,"h":131},"silver":{"y":53,"x":27,"w":208,"h":165},"wood":{"y":65,"x":43,"w":172,"h":132}};
  function drawChest(ctx, key, src, cx, cy, size) {
    const tier = { blue: 'bronze', purple: 'silver' }[key] || key;
    const crop = chestBounds[tier];
    if (!crop) return false;
    const scale = size / Math.max(crop.w, crop.h);
    const w = crop.w * scale, h = crop.h * scale;
    return drawImg(ctx, src, cx - w / 2, cy - h / 2, w, h, crop);
  }
  function menuShop(ctx, s, push) {
    const top = 288, bottom = 1492, maxScroll = 844;
    const scroll = Math.max(0, Math.min(maxScroll, s.shopScroll || 0));
    const names = ['每日碎片精选', '圣遗物宝箱', '钻石商店'];
    const active = scroll >= maxScroll - 1 ? 2 : scroll > 480 ? 1 : 0;
    fillRoundRect(ctx,34,207,682,65,24,'#856a38');
    const rail=ctx.createLinearGradient(0,207,0,269);rail.addColorStop(0,'#9eac78');rail.addColorStop(1,'#4b6745');fillRoundRect(ctx,34,203,682,65,24,rail);strokeRoundRect(ctx,34,203,682,65,24,'#d9c68c',1.5);
    names.forEach((name,i)=>{const x=43+i*223,chosen=i===active;const down=getPressPoint(),pressed=down&&down.x>=x&&down.x<=x+218&&down.y>=209&&down.y<=260;
      fillRoundRect(ctx,x,213,218,49,18,chosen?'#173d29':'#5c6948');
      const face=ctx.createLinearGradient(0,209,0,258);face.addColorStop(0,chosen?'#4e7c50':'#e1d8ad');face.addColorStop(1,chosen?'#214b31':'#b1ae7e');fillRoundRect(ctx,x,209+(pressed?3:0),218,49,18,face);strokeRoundRect(ctx,x,209+(pressed?3:0),218,49,18,chosen?'#e5cd85':'#d7c99d',1.2);
      text(ctx,name,x+109,234+(pressed?3:0),22,chosen?'#fff0bf':'#34482e','center');push('shopSection',i,x,209,218,53);
    });
    const hit = (key, data, x, y, w, h) => {
      const y1 = Math.max(top, y), y2 = Math.min(bottom, y + h);
      if (y2 > y1) push(key, data, x, y1, w, y2 - y1);
    };
    ctx.save(); ctx.beginPath(); ctx.rect(25, top, 700, bottom - top); ctx.clip();
    function heading(title, subtitle, y) {
      y -= scroll;
      fillRoundRect(ctx, 40, y, 670, 48, 12, '#d6c89e');
      text(ctx, title, 58, y + 25, 25, '#29472f', 'left');

    }
    function lines(value,width,size){ctx.font=size+'px sans-serif';const out=[];let line='';for(const token of (String(value||'').match(/[+−-]?\d+(?:\.\d+)?[%％]?|./gu)||[])){if(ctx.measureText(line+token).width>width&&line){out.push(line);line=token;}else line+=token;}if(line)out.push(line);return out;}
    function card(x,y,title,subtitle,price,diamond,drawIcon,key,data,sold=false){
      y-=scroll;const xx=x+10,w=180,h=232,by=y+242,bh=40;
      if(by+bh<top||y>bottom)return;
      const unavailable=sold||(key==='adOffer'&&!!price),point=getPressPoint(),pressed=point&&point.x>=xx&&point.x<=xx+w&&point.y>=y&&point.y<=y+h;
      ctx.save();
      // 直接按PNG透明轮廓投影，避开素材外侧留白，不再叠加矩形底板。
      if(pressed)ctx.translate(1,1.5);
      ctx.save();roundRect(ctx,xx,y,w,h,17);ctx.clip();
      ctx.shadowColor='rgba(14,28,12,.52)';ctx.shadowBlur=pressed?1.5:3;ctx.shadowOffsetX=pressed?1:4;ctx.shadowOffsetY=pressed?1.5:5;
      if(!drawImg(ctx,'assets/images/interface/shop/product-garden-v4.png',xx,y,w,h)){fillRoundRect(ctx,xx,y,w,h,17,'#214a30');fillRoundRect(ctx,xx+4,y+156,w-8,72,10,'#ead8a7');}
      ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
      let titleSize=17;ctx.font=titleSize+'px sans-serif';while(titleSize>12&&ctx.measureText(title).width>w-24){titleSize--;ctx.font=titleSize+'px sans-serif';}
      text(ctx,title,xx+w/2,y+28,titleSize,'#fff0c4','center');
      const icx=xx+w/2,icy=y+97;ctx.save();ctx.translate(icx,icy);ctx.scale(.82,.82);ctx.translate(-icx,-icy);drawIcon(icx,icy);ctx.restore();
      const desc=lines(Product.brief(key,data,subtitle),w-28,16);
      desc.slice(0,2).forEach((line,i)=>text(ctx,i===1&&desc.length>2?line.slice(0,-1)+'…':line,xx+14,y+175+i*18,16,'#3c5034','left'));
      text(ctx,subtitle,xx+w/2,y+216,14,'#6c603d','center');
      if(unavailable){fillRoundRect(ctx,xx,y,w,h,17,'rgba(104,110,107,.64)');fillRoundRect(ctx,xx+25,y+94,w-50,43,12,'rgba(26,33,27,.85)');text(ctx,'售罄',xx+w/2,y+116,30,'#ff655d','center');}
      ctx.restore();ctx.restore();
      hit(key,data,xx,y,w,h);
      const label=unavailable?'已售罄':key==='adOffer'?'广告 · 免费':(diamond?'💎 ':'金币 ')+price;
      button(ctx,xx,by,w,bh,label,{bg:unavailable?'#737969':'#365829',capsule:true,raised:true,gloss:false,depth:4,baseColor:'#233d1c',shadowColor:'rgba(22,42,17,.28)',shadowBlur:5,shadowOffsetY:3,fontSize:18,color:'#fff2cc'});
      if(!unavailable)hit('shopQuickBuy',{key,data},xx,by,w,bh);
    }
    heading(names[0], '每日刷新', 300);
    ((s.daily && s.daily.picks) || []).slice(0, 6).forEach((p, i) => {
      const def = CONFIG.relicRunDef(p.relic) || {name:p.relic,icon:'✦'};
      const shards = p.shards || 1;
      card(55 + i % 3 * 212, 364 + Math.floor(i / 3) * 310, def.name, '碎片 ×'+shards, p.price, false,
        (cx,cy) => { if (!drawImg(ctx, relicIconSrc(p.relic), cx-57.6,cy-57.6,115.2,115.2)) text(ctx,def.icon,cx,cy,48,'#ffffff','center'); },
        'shopShard', {relic:p.relic,shards,price:p.price,icon:def.icon,name:def.name,purchased:!!p.purchased}, !!p.purchased);
    });
    heading(names[1], '金币购买 ', 984);
    ['wood','blue','purple','gold','star'].forEach((key,i) => {
      const cd=CONFIG.SHOP_CHEST[key], left=s.shopLeft && s.shopLeft[key] !== undefined ? s.shopLeft[key] : cd.daily;
      const src={wood:IMG_SRC.chestWood,blue:IMG_SRC.chestBronze,purple:IMG_SRC.chestSilver,gold:IMG_SRC.chestGold,star:IMG_SRC.chestStar}[key];
      card(55+i%3*212,1048+Math.floor(i/3)*310,cd.name,'剩余 '+left+'/'+cd.daily,cd.price,false,
        (cx,cy)=>drawChest(ctx,key,src,cx,cy,104),'shopChest',{key},left <= 0);
    });
    card(479,1358,'每日免费宝箱','青铜箱 · 每日1次',s.adDaily && s.adDaily.chest,false,
      (cx,cy)=>drawChest(ctx,'blue',IMG_SRC.chestBronze,cx,cy,104),'adOffer','chest');
    heading(names[2], '钻石兑换', 1668);
    card(55,1732,'金币兑换','获得1000金币',1,true,(cx,cy)=>drawImg(ctx,IMG_SRC.coin,cx-48,cy-48,96,96),'diamondOffer','gold');
    card(267,1732,'星辉宝箱','固定4片SSR',10,true,(cx,cy)=>drawChest(ctx,'star',IMG_SRC.chestStar,cx,cy,104),'diamondOffer','star');
    card(479,1732,'每日免费钻石','钻石 ×1 · 每日1次',s.adDaily && s.adDaily.diamond,true,
      (cx,cy)=>drawImg(ctx,IMG_SRC.diamond,cx-48,cy-48,96,96),'adOffer','diamond');
    ['scarletSanctum','scarletForge','scarletGale'].forEach((key,i)=>{
      const offer=require('../../economy/diamond-shop.js').OFFERS[key];
      if(require('../../field-access.js').reason(offer.unlockField,{fieldClears:s.fieldClears,prologue:s.prologue},!!s.testProfile))return;
      card(55+i*212,2042,offer.name,'红卡碎片 ×1～3',20,true,(cx,cy)=>drawImg(ctx,SCARLET_ICON,cx-52,cy-52,104,104),'diamondOffer',key);
    });
    ctx.restore();
    const thumb = (bottom-top)*(bottom-top)/(bottom-top+maxScroll);
    fillRoundRect(ctx,734,top,4,bottom-top,2,'rgba(50,72,45,0.12)');
    fillRoundRect(ctx,734,top+(bottom-top-thumb)*scroll/maxScroll,4,thumb,2,'#668254');
    return maxScroll;
  }

  function shopDetail(ctx,s,push){
    const p=s.panel,item=p&&p.item;if(!item)return;
    const w=570,h=900,x=90,y=(CONFIG.DESIGN.H-h)/2;
    ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(0,0,750,CONFIG.DESIGN.H);push('panelBounds',null,x,y,w,h);
    if(!drawImg(ctx,'assets/images/interface/shop/detail-garden-v4.png',x,y,w,h)){fillRoundRect(ctx,x,y,w,h,26,'#e8d6aa');fillRoundRect(ctx,x+10,y+10,w-20,275,20,'#1a4630');}
    text(ctx,'×',x+w-42,y+61,31,'#f9e9b6','center');push('panelClose',null,x+w-65,y+38,46,46);
    const cx=x+w/2,icy=y+151;let drew=false;
    if(p.kind==='shard'){const src=relicIconSrc(item.relic);if(src)drew=drawImg(ctx,src,cx-61,icy-61,122,122);}
    else if(p.kind==='chest'||p.kind==='diamondStar'||p.kind==='adReward'&&item.adKey==='chest'){
      const key=p.kind==='chest'?item.key:p.kind==='diamondStar'?'star':'blue';const src={wood:IMG_SRC.chestWood,blue:IMG_SRC.chestBronze,purple:IMG_SRC.chestSilver,gold:IMG_SRC.chestGold,star:IMG_SRC.chestStar}[key];drew=drawChest(ctx,key,src,cx,icy,126);
    }else if(p.kind==='diamondScarlet')drew=drawImg(ctx,SCARLET_ICON,cx-65,icy-65,130,130);
    else drew=drawImg(ctx,p.kind==='diamondGold'?IMG_SRC.coin:IMG_SRC.diamond,cx-56,icy-56,112,112);
    if(!drew)text(ctx,item.icon||'◆',cx,icy,65,'#ffe7a7','center');
    const wrap=(value,width,size)=>{ctx.font=size+'px sans-serif';const lines=[];let line='';for(const token of (String(value||'').match(/[+−-]?\d+(?:\.\d+)?[%％]?|./gu)||[])){if(ctx.measureText(line+token).width>width&&line){lines.push(line);line=token;}else line+=token;}if(line)lines.push(line);return lines;};
    wrap(item.name||'商品详情',w-110,30).slice(0,2).forEach((line,i)=>text(ctx,line,cx,y+240+i*33,30,'#fff0bf','center'));
    const paragraphs=Product.paragraphs(p);let font=22;
    const height=size=>paragraphs.reduce((n,line)=>n+wrap(line,w-108,size).length*(size+7)+15,0);
    while(font>18&&height(font)>410)font--;
    let ty=y+337;for(const paragraph of paragraphs){for(const line of wrap(paragraph,w-108,font)){text(ctx,line,x+54,ty,font,'#35472e','left');ty+=font+7;}ty+=15;}
    const disabled=p.kind==='shard'&&item.purchased||p.kind==='chest'&&item.left<=0||p.kind==='adReward'&&s.adDaily&&s.adDaily[item.adKey];
    const label=disabled?'今日已售罄':p.kind==='adReward'?'观看广告 · 免费领取':(p.kind.startsWith('diamond')?'💎 ':'金币 ')+item.price+' · 购买';
    button(ctx,x+88,y+h-111,w-176,62,label,{bg:disabled?'#787e69':'#365829',capsule:true,raised:true,gloss:false,depth:4,baseColor:'#233d1c',shadowColor:'rgba(22,42,17,.28)',shadowBlur:5,shadowOffsetY:3,fontSize:25,color:'#fff0bd'});
    if(!disabled)push('shopBuy',null,x+88,y+h-111,w-176,62);
  }

  return { menuShop, shopDetail };
}
module.exports = { createMenuShopScreen };
