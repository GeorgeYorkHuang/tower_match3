/**
 * talent-gallery.js —— 天赋滚动弹窗：绘制红卡镶嵌卡片列表和按塔汇总的整体加成。
 * 负责内容裁剪、可见按钮命中及滚动条显示，不直接修改装配存档。
 */
'use strict';
const T = require('../../talents/model.js'),
  L = require('./talent-layout.js');
const { mini, wrap, button } = require('./talent-art.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

// 只登记按钮当前可见的部分，滚出弹窗后不能继续响应点击。
function clipHit(push, vp, key, data, x, y, w, h) {
  const left = Math.max(x, vp.x),
    top = Math.max(y, vp.y),
    right = Math.min(x + w, vp.x + vp.w),
    bottom = Math.min(y + h, vp.y + vp.h);
  if (right > left && bottom > top) push(key, data, left, top, right - left, bottom - top);
}

function drawCard(ctx, s, def, x, y, push, drawImg, vp) {
  const { w, h } = L.card,
    current = s.talent.state.slots[s.panel.slot] === def.id,
    star = T.owned(s.talentMeta, def.id);
  fillRoundRect(ctx, x, y, w, h, 14, '#ecdfb6');
  drawImg(ctx, 'assets/images/interface/cards/relic-detail-v1.png', x, y, w, h);
  strokeRoundRect(ctx, x, y, w, h, 14, current ? '#ffe6a1' : '#ba725a', current ? 3 : 1.5);
  const titleSize=Math.min(19,250/Math.max(1,def.name.length));
  text(ctx,def.name,x+w/2,y+28,titleSize,'#263f2e','center');
  fillRoundRect(ctx,x+10,y+49,w-20,145,10,'#183b2a');
  drawImg(ctx,def.icon,x+18,y+66,110,110);
  mini(ctx,def,x+164,y+73,96);
  text(ctx,'圣遗物',x+73,y+183,13,'#d4dfbe','center');
  text(ctx,'覆盖范围',x+212,y+183,13,'#d4dfbe','center');
  text(ctx,'持有 '+ '★'.repeat(star),x+17,y+211,15,'#76613a','left');
  if(s.testProfile)[2,3].forEach((level,i)=>button(ctx,(key,data,bx,by,bw,bh)=>clipHit(push,vp,key,data,bx,by,bw,bh),'talentTestStar',{id:def.id,star:level},'★'.repeat(level),x+139+i*65,y+199,60,25,star!==level));
  const tier=(s.panel.cardTiers||{})[def.id]||star||1;
  for(let level=1;level<=3;level++){
    const tx=x+14+(level-1)*88,selected=level===tier;
    fillRoundRect(ctx,tx,y+232,84,47,9,selected?'#385c43':'#d6c99f');
    strokeRoundRect(ctx,tx,y+232,84,47,9,selected?'#e4c97e':'#b1a479',1);
    text(ctx,'★'.repeat(level),tx+42,y+246,17,selected?'#ffe9a3':'#6b5c3b','center');
    text(ctx,'覆盖'+[0,4,8,12][level]+'格',tx+42,y+267,14,selected?'#e8efd0':'#40553b','center');
    clipHit(push,vp,'talentCardTier',{id:def.id,tier:level},tx,y+232,84,47);
  }
  fillRoundRect(ctx,x+12,y+288,w-24,195,10,'rgba(248,239,211,.97)');
  const body=tier===1?'覆盖天赋4格，激活固定塔攻击点与绿色属性点。':tier===2?(def.purpleList.map(p=>p.name+'：'+p.desc).join('\n')||'仅提供覆盖属性，无紫天赋。'):def.gold.name+'（'+def.gold.mode+'）：'+def.gold.desc;
  const locked=tier>star;
  const wrapLines=(value,size)=>{ctx.font='bold '+size+'px sans-serif';const rows=[];let line='';for(const token of (value.match(/[+−-]?\d+(?:\.\d+)?[%％]?|[^\n]|\n/gu)||[])){if(token==='\n'){rows.push(line);line='';}else if(ctx.measureText(line+token).width>w-44&&line){rows.push(line);line=token;}else line+=token;}if(line)rows.push(line);return rows;};
  let font=17;while(font>14&&wrapLines(body,font).length*(font+4)>(locked?156:176))font--;
  const rows=wrapLines(body,font);
  rows.forEach((line,i)=>text(ctx,line,x+22,y+305+i*(font+4),font,tier===3?'#72551f':tier===2?'#674183':'#2d4935','left'));
  if(locked)text(ctx,'升至'+'★'.repeat(tier)+'后生效',x+w/2,y+471,13,'#8a7c59','center');

  button(
    ctx,
    (key, data, bx, by, bw, bh) => clipHit(push, vp, key, data, bx, by, bw, bh),
    'talentEquip',
    { slot: s.panel.slot, id: def.id },
    current ? '已镶嵌' : '预览替换',
    x + 19,
    y + h - 54,
    w - 38,
    40,
    !current
  );
}

function gallery(ctx, s, push, drawImg, frame) {
  const p = s.panel,
    b = L.gallery,
    vp = L.galleryViewport,
    list = L.galleryList(s.talentMeta, p.slot),
    metrics = L.scroll(s.talentMeta, p),
    offset = Math.max(0, Math.min(metrics.max, p.scrollY || 0));
  frame(ctx, push, drawImg, b, '镶嵌 · '+L.towerNames[T.C.cards.find(c=>c.nativeSlot===p.slot).tower]+'专属槽');
  button(ctx, push, 'talentUnequip', p.slot, '卸下', 76, 1236, 160, 48, !!s.talent.state.slots[p.slot]);
  button(ctx, push, 'talentUndo', null, '撤销上次', 254, 1236, 190, 48, !!p.undo);
  text(ctx, '槽位 ' + (p.slot + 1), 625, 1260, 20, '#ffe3a1', 'right');
  button(ctx, push, 'talentClose', null, '返回', b.x + b.w - 125, b.y + 13, 104, 42);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  // 两列布局，内容只在固定视口内滚动，不移动弹窗标题与边框。
  list.forEach((d, i) => {
    const x = vp.x + (i % 2) * (L.card.w + L.card.gap),
      y = vp.y + Math.floor(i / 2) * (L.card.h + L.card.rowGap) - offset;
    if (y + L.card.h > vp.y && y < vp.y + vp.h) drawCard(ctx, s, d, x, y, push, drawImg, vp);
  });
  if (!list.length) text(ctx, '此槽仅接受对应塔红卡，暂无可镶嵌卡片', 375, vp.y + 100, 24, '#e4ddc2', 'center');
  ctx.restore();
  if (metrics.max > 0) {
    const track = vp.h,
      thumb = Math.max(44, (track * track) / (track + metrics.max));
    fillRoundRect(ctx, b.x + b.w - 14, vp.y, 4, track, 2, '#52654c');
    fillRoundRect(
      ctx,
      b.x + b.w - 14,
      vp.y + ((track - thumb) * offset) / metrics.max,
      4,
      thumb,
      2,
      '#dfc87f'
    );
  }
}
// 布尔值区分百分比与直接数值；负面时长在汇总中单独以秒显示。
const statLabels = [
  ['attack', '攻击力', false],
  ['speed', '攻速', true],
  ['charge', '塔卡充能', true],
  ['damage', '伤害', true],
  ['skill', '技能伤害', true],
  ['dot', '负面效果', true],
  ['duration', '负面时长', false],
];

function summary(ctx, s, push, drawImg, frame) {
  const b = L.summary,
    vp = L.summaryViewport,
    metrics = L.scroll(s.talentMeta, s.panel),
    offset = Math.max(0, Math.min(metrics.max, s.panel.scrollY || 0));
  frame(ctx, push, drawImg, b, '天赋整体加成');
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  let y = vp.y - offset;
  L.summaryItems(s.talentMeta).forEach((item) => {
    if (y + item.h > vp.y && y < vp.y + vp.h) {
      text(ctx, item.name, vp.x + 18, y + 28, 26, '#ffe3a1', 'left');
      statLabels.forEach(([key, label, percent], i) => {
        const value = item.bonus[key] || 0,
          amount = percent
            ? Math.round(value * 1000) / 10 + '%'
            : key === 'duration'
              ? Math.round(value * 100) / 100 + '秒'
              : value;
        text(
          ctx,
          label + ' +' + amount,
          vp.x + 18 + (i % 2) * 286,
          y + 68 + Math.floor(i / 2) * 31,
          19,
          '#e5edcf',
          'left'
        );
      });
      let py = y + 214;
      item.lines.forEach((line) => {
        text(
          ctx,
          line.name,
          vp.x + 18,
          py,
          20,
          line.kind === 'gold' ? '#f2cc72' : line.kind === 'exclusive' ? '#7fc9a6' : '#d8b0fc',
          'left'
        );
        py = wrap(ctx, line.desc, vp.x + 18, py + 31, vp.w - 36, 18, '#e1e8d0') + 12;
      });
    }
    y += item.h + 18;
  });
  ctx.restore();
  if (metrics.max > 0) {
    const thumb = (vp.h * vp.h) / (vp.h + metrics.max);
    fillRoundRect(ctx, 682, vp.y, 4, vp.h, 2, '#52654c');
    fillRoundRect(ctx, 682, vp.y + ((vp.h - thumb) * offset) / metrics.max, 4, thumb, 2, '#dfc87f');
  }
}

module.exports = { gallery, summary };
