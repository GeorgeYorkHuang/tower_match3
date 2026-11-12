'use strict';
const CONFIG = require('../../config.js');
const SCARLET_ICON=require('../../economy/diamond-shop.js').OFFERS.scarlet.icon;
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');


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
    const top = 288, bottom = 1492, maxScroll = 746;
    const scroll = Math.max(0, Math.min(maxScroll, s.shopScroll || 0));
    const names = ['每日碎片精选', '圣遗物宝箱', '钻石商店'];
    const active = scroll >= maxScroll - 1 ? 2 : scroll > 320 ? 1 : 0;
    names.forEach((name, i) => {
      const x = 40 + i * 226;
      fillRoundRect(ctx, x, 210, 218, 58, 15, i === active ? '#28513a' : '#f0e1b9');
      strokeRoundRect(ctx, x, 210, 218, 58, 15, '#a48b4c', 1.5);
      text(ctx, name, x + 109, 239, 23, i === active ? '#fff2c9' : '#304a30', 'center');
      push('shopSection', i, x, 210, 218, 58);
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
      text(ctx, subtitle, 690, y + 25, 17, '#5b563e', 'right');
    }
    function card(x, y, title, subtitle, price, diamond, drawIcon, key, data) {
      y -= scroll;
      if (y + 268.8 < top || y > bottom) return;
      fillRoundRect(ctx, x, y, 200, 268.8, 16, '#214a30');
      drawImg(ctx, 'assets/images/interface/shop/card-garden-v2.png', x, y, 200, 268.8);
      drawIcon(x + 100, y + 79);
      text(ctx, title, x + 100, y + 184, 22, '#29432c', 'center');
      text(ctx, subtitle, x + 100, y + 211, 17, '#665532', 'center');
      fillRoundRect(ctx, x + 15, y + 229, 170, 30, 10, '#31553a');
      text(ctx, key === 'adOffer' ? (price ? '今日已领取' : '观看广告 · 免费') : (diamond ? '💎 ' : '金币 ') + price, x + 100, y + 245, 19, '#fff0c4', 'center');
      hit(key, data, x, y, 200, 268.8);
    }
    heading(names[0], '每日刷新', 300);
    ((s.daily && s.daily.picks) || []).slice(0, 6).forEach((p, i) => {
      const def = CONFIG.relicRunDef(p.relic) || {name:p.relic,icon:'✦'};
      const shards = p.shards || 1;
      card(55 + i % 3 * 212, 364 + Math.floor(i / 3) * 286, def.name, '碎片 ×'+shards, p.price, false,
        (cx,cy) => { if (!drawImg(ctx, relicIconSrc(p.relic), cx-57.6,cy-57.6,115.2,115.2)) text(ctx,def.icon,cx,cy,48,'#ffffff','center'); },
        'shopShard', {relic:p.relic,shards,price:p.price,icon:def.icon,name:def.name});
    });
    heading(names[1], '金币购买 ', 948);
    ['wood','blue','purple','gold','star'].forEach((key,i) => {
      const cd=CONFIG.SHOP_CHEST[key], left=s.shopLeft && s.shopLeft[key] !== undefined ? s.shopLeft[key] : cd.daily;
      const src={wood:IMG_SRC.chestWood,blue:IMG_SRC.chestBronze,purple:IMG_SRC.chestSilver,gold:IMG_SRC.chestGold,star:IMG_SRC.chestStar}[key];
      card(55+i%3*212,1012+Math.floor(i/3)*286,cd.name,'剩余 '+left+'/'+cd.daily,cd.price,false,
        (cx,cy)=>drawChest(ctx,key,src,cx,cy,104),'shopChest',{key});
    });
    card(479,1298,'每日免费宝箱','青铜箱 · 每日1次',s.adDaily && s.adDaily.chest,false,
      (cx,cy)=>drawChest(ctx,'blue',IMG_SRC.chestBronze,cx,cy,104),'adOffer','chest');
    heading(names[2], '钻石兑换', 1596);
    card(55,1660,'金币兑换','获得1000金币',1,true,(cx,cy)=>drawImg(ctx,IMG_SRC.coin,cx-48,cy-48,96,96),'diamondOffer','gold');
    card(267,1660,'星辉宝箱','固定4片SSR',10,true,(cx,cy)=>drawChest(ctx,'star',IMG_SRC.chestStar,cx,cy,104),'diamondOffer','star');
    card(479,1660,'每日免费钻石','钻石 ×1 · 每日1次',s.adDaily && s.adDaily.diamond,true,
      (cx,cy)=>drawImg(ctx,IMG_SRC.diamond,cx-48,cy-48,96,96),'adOffer','diamond');
    card(55,1946,'猩红宝箱','红卡碎片 ×1～3',20,true,(cx,cy)=>drawImg(ctx,SCARLET_ICON,cx-52,cy-52,104,104),'diamondOffer','scarlet');
    ctx.restore();
    const thumb = (bottom-top)*(bottom-top)/(bottom-top+maxScroll);
    fillRoundRect(ctx,734,top,4,bottom-top,2,'rgba(50,72,45,0.12)');
    fillRoundRect(ctx,734,top+(bottom-top-thumb)*scroll/maxScroll,4,thumb,2,'#668254');
    return maxScroll;
  }

  function shopDetail(ctx, s, push) {
    const p = s.panel, item = p && p.item;
    if (!item) return;
    const w = 400, h = 600, x = (750 - w) / 2, y = Math.round((CONFIG.DESIGN.H - h) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, 750, CONFIG.DESIGN.H);
    push('panelBounds', null, x, y, w, h);
    const accent = item.color || '#f7c948';
    const cardBg = ctx.createLinearGradient(x, y, x, y + h);
    cardBg.addColorStop(0, '#29384b'); cardBg.addColorStop(1, '#151f2d');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
    ctx.shadowBlur = 0;
    // Follow the outer frame, excluding the rectangular image margins.
    const inset = 2, top = y + 14, right = x + w - inset, base = y + h - 6, radius = 24;
    ctx.beginPath();
    ctx.moveTo(x + inset + radius, top);
    ctx.lineTo(x + w * 0.435, top); ctx.lineTo(x + w * 0.5, y + 1); ctx.lineTo(x + w * 0.565, top);
    ctx.lineTo(right - radius, top); ctx.arcTo(right, top, right, top + radius, radius);
    ctx.lineTo(right, base - radius); ctx.arcTo(right, base, right - radius, base, radius);
    ctx.lineTo(x + inset + radius, base); ctx.arcTo(x + inset, base, x + inset, base - radius, radius);
    ctx.lineTo(x + inset, top + radius); ctx.arcTo(x + inset, top, x + inset + radius, top, radius);
    ctx.closePath(); ctx.clip();
    if (!drawImg(ctx, 'assets/images/interface/shop/detail-garden-v3.png', x, y, w, h)) fillRoundRect(ctx, x, y, w, h, 20, cardBg);
    ctx.restore();
    let drew = false;
    if (p.kind === 'adReward') {
      drew = item.adKey === 'chest' ? drawChest(ctx,'blue',IMG_SRC.chestBronze,x+w/2,y+116,142)
        : drawImg(ctx,IMG_SRC.diamond,x+w/2-60,y+56,120,120);
    } else if (p.kind === 'diamondStar') {
      drew = drawChest(ctx, 'star', IMG_SRC.chestStar, x + w / 2, y + 116, 142);
    } else if (p.kind === 'diamondScarlet') {
      drew=drawImg(ctx,SCARLET_ICON,x+w/2-75,y+41,150,150);
    } else if (p.kind === 'diamondGold') {
      drew = drawImg(ctx, IMG_SRC.coin, x + w / 2 - 60, y + 56, 120, 120);
    } else if (p.kind === 'shard') {
      const src = relicIconSrc(item.relic);
      if (src) drew = drawImg(ctx, src, x + w / 2 - 82.8, y + 31.2, 165.6, 165.6);
    } else if (p.kind === 'chest') {
      const cImg = { wood: IMG_SRC.chestWood, blue: IMG_SRC.chestBronze, purple: IMG_SRC.chestSilver, gold: IMG_SRC.chestGold, star: IMG_SRC.chestStar }[item.key];
      drew = drawChest(ctx, item.key, cImg, x + w / 2, y + 116, 142);
    }
    if (!drew) text(ctx, item.icon || '❔', x + w / 2, y + 116, 78, '#ffffff', 'center');
    const titleLines = (wrapText ? wrapText(ctx, item.name || '商品', w - 52, 30) : [item.name || '商品']).slice(0, 2);
    const titleY = titleLines.length > 1 ? y + 205 : y + 221;
    titleLines.forEach((ln, i) => text(ctx, ln, x + w / 2, titleY + i * 34, 30, '#fff0c8', 'center'));

    const chest = p.kind === 'chest' ? CONFIG.SHOP_CHEST[item.key] : null;
    const tier = chest && CONFIG.DEPTH_CHEST.tiers.find(t=>t.key===chest.tier);
    const shardRange = tier ? Object.entries(tier.fragments).map(([rar,range])=>`${{r:'蓝',sr:'紫',ssr:'金'}[rar]}碎片${range[0]===range[1]?range[0]:range.join('～')}`).join('、')+(tier.ssrChance?'；25%概率额外1金碎片':'') : '';
    const desc = p.kind === 'shard'
      ? '圣遗物碎片，可用于解锁或提升星级。'
      : (p.kind === 'chest'
        ? `${shardRange}。无金币、钻石。`
        : (item.desc || ''));
    const lines = (wrapText ? wrapText(ctx, desc, w - 64, 22) : [desc]).slice(0, 4);
    lines.forEach((ln, i) => text(ctx, ln, x + w / 2, y + 285 + i * 30, 22, '#4c4b36', 'center'));
    const extra = p.kind === 'adReward' ? '每日限领一次' : p.kind.startsWith('diamond') ? `消耗钻石 ${item.price}` : p.kind === 'shard' ? `碎片 ×${item.shards}　金币 ${item.price}`
      : (p.kind === 'chest' ? `剩余 ${item.left} 次　金币 ${item.price}` : `金币 ${item.price}`);
    text(ctx, extra, x + w / 2, y + 442, 22, '#45583c', 'center');

    const bw = w - 64, bh = 62, bx = x + 32, by = y + 502;
    const disabled = (p.kind === 'chest' && item.left <= 0) || (p.kind === 'skill' && item.owned);
    const buy = ctx.createLinearGradient(0, by, 0, by + bh);
    buy.addColorStop(0, disabled ? '#69717b' : '#ffe17a');
    buy.addColorStop(1, disabled ? '#3c444e' : '#c48616');
    fillRoundRect(ctx, bx, by, bw, bh, 13, buy);
    strokeRoundRect(ctx, bx, by, bw, bh, 13, disabled ? '#87909b' : '#fff1b4', 1.6);
    if (disabled) {
      text(ctx, p.kind === 'chest' ? '今日已售罄' : '已解锁', bx + bw / 2, by + bh / 2, 30, '#d6dce3', 'center');
    } else {
      push('shopBuy', null, bx, by, bw, bh);
      text(ctx, p.kind === 'adReward' ? '观看广告领取' : '确认购买', bx + bw / 2, by + bh / 2, 32, '#382600', 'center');
    }
  }

  return { menuShop, shopDetail };
}
module.exports = { createMenuShopScreen };
