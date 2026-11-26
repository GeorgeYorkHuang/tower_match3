/** 主页战场选择：章节标题、图标、切换箭头与战斗入口共用逻辑坐标。 */
'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text, getPressPoint, button } = require('../ui.js');

// Presentation only: dependencies are shared helpers, never a player save.
function createHomeScreen({ drawImg, skillRow }) {
  function menuBattle(ctx, s, push) {
    const stage = s.stage || 'ancient';
    const F = CONFIG.FIELDS[stage] || CONFIG.FIELDS.ancient;
    const isTest = stage === 'test';
    const stageOrder=require('../../field-access.js').selectable(s,s.testProfile),stageIndex=stageOrder.indexOf(stage);
    const canPrev=stageIndex>0,canNext=stageIndex<stageOrder.length-1;
    const tint = F.tint;
    // 图标、箭头、名称和入口整体下移 70，给上方章节标题留出空间。
    const iw = 338, ix = 375 - iw / 2, iy = 550;
    const nameY = iy + iw + 42;

    const chapterTitle = F.chapterTitle || (stage === 'abyss' ? '深渊挑战' : '测试战场');
    // 无底板章节标题：字号 29→44，以深绿描边与投影保证草地上的对比度。
    ctx.save();
    ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,28,17,0.70)'; ctx.fillText(chapterTitle, 377, 501);
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#284a30'; ctx.lineWidth = 4;
    ctx.strokeText(chapterTitle, 375, 498);
    const chapterGold = ctx.createLinearGradient(0, 476, 0, 520);
    chapterGold.addColorStop(0, '#fff5ca'); chapterGold.addColorStop(0.5, '#ffe29a'); chapterGold.addColorStop(1, '#d9ae52');
    ctx.fillStyle = chapterGold; ctx.fillText(chapterTitle, 375, 498);
    // 装饰随标题实际宽度向外排布，兼容四字的「圣庭战场」。
    const titleEdge = ctx.measureText(chapterTitle).width / 2 + 28;
    for (const dir of [-1, 1]) {
      const innerX = 375 + dir * titleEdge, outerX = innerX + dir * 66;
      const lineGold = ctx.createLinearGradient(innerX, 498, outerX, 498);
      lineGold.addColorStop(0, 'rgba(255,226,154,0.95)'); lineGold.addColorStop(1, 'rgba(225,195,117,0.12)');
      ctx.strokeStyle = lineGold; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(innerX, 498); ctx.lineTo(outerX, 498); ctx.stroke();
      ctx.save(); ctx.translate(innerX + dir * 13, 498); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f2d28b'; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore();
    }
    ctx.restore();

    // 命中区先注册箭头再注册战场本体：命中测试按 push 顺序取首个命中，
    // 箭头光晕圈与图标命中区重叠时保证箭头优先。
    const arR = 30, ay = iy + iw / 2, gap = 36;
    const aLx = ix - gap - arR, aRx = ix + iw + gap + arR;
    if(canPrev)push('stagePrev', null, aLx - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
    if(canNext)push('stageNext', null, aRx - arR - 7, ay - arR - 7, (arR + 7) * 2, (arR + 7) * 2);
    push('stage', { id: stage }, ix, iy, iw, iw + 62);

    const requirement = s.stageRequirement || '';
    const locked = !!requirement;

    const press=getPressPoint(),stagePressed=press&&press.x>=ix&&press.x<=ix+iw&&press.y>=iy&&press.y<=iy+iw+62;
    ctx.save();
    if(stagePressed){ctx.translate(375,iy+iw/2+5);ctx.scale(.97,.97);ctx.translate(-375,-iy-iw/2);}
    ctx.shadowColor='rgba(10,35,20,.35)';ctx.shadowBlur=stagePressed?3:6;ctx.shadowOffsetY=stagePressed?1:4;
    // 战场图标：无背景直出（放大 30% → 338px；锁定态整体压暗）
    ctx.globalAlpha = locked ? 0.4 : 1;
    const badge = drawImg(ctx, F.icon || (isTest ? 'assets/images/interface/home/icon_stage_test.png' : `assets/images/interface/home/icon_stage_${stage}.png`), ix, iy, iw, iw);
    ctx.globalAlpha = 1;
    if (!badge) {
      ctx.beginPath(); ctx.arc(375, iy + iw / 2, iw / 2, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
      text(ctx, isTest ? '🧪' : '🏰', 375, iy + iw / 2 + 12, 130, '#ffffff', 'center');
    }
    // 战场名（：54px 金色渐变 + 立体投影，与页面主标题「圣坛裂痕」同款工艺）
    ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(F.name, 375 + 3, nameY + 4);
    const ng = ctx.createLinearGradient(0, nameY - 27, 0, nameY + 27);
    ng.addColorStop(0, '#fff3c4'); ng.addColorStop(0.45, '#f7c948'); ng.addColorStop(1, '#d99e16');
    ctx.fillStyle = ng;
    ctx.fillText(F.name, 375, nameY);
    // 锁定态：未解锁战场显示 🔒 徽标 + 解锁条件（无面板版：徽标悬浮图标上方）
    if (locked) {
      fillRoundRect(ctx, 375 - 250, iy + 8, 500, 44, 22, 'rgba(0,0,0,0.65)');
      strokeRoundRect(ctx, 375 - 250, iy + 8, 500, 44, 22, '#f0b45c', 1.5);
      text(ctx, requirement, 375, iy + 36, 22, '#f0b45c', 'center');
      const lx=ix+iw/2,ly=iy+iw/2;
      ctx.save();ctx.strokeStyle='#f6d78b';ctx.lineWidth=5;ctx.beginPath();ctx.arc(lx,ly-12,18,Math.PI,0);ctx.stroke();
      fillRoundRect(ctx,lx-29,ly-12,58,46,9,'#f6d78b');
      fillRoundRect(ctx,lx-3,ly+1,6,18,3,'#4b3e29');ctx.restore();
    }

    ctx.restore();
    // ◀ ▶ 战场切换箭头（移到战场图标两侧、保持 36px 间距；垂直对齐图标中心）
    const arrow=(ax,dir)=>{
      const prev=dir==='‹',enabled=prev?canPrev:canNext,p=getPressPoint();
      const pressed=enabled&&p&&Math.abs(p.x-ax)<=arR+7&&Math.abs(p.y-ay)<=arR+7;
      ctx.save();ctx.globalAlpha=enabled?1:.28;
      ctx.shadowColor='rgba(10,55,30,.3)';ctx.shadowBlur=pressed?2:4;ctx.shadowOffsetX=pressed?1:2;ctx.shadowOffsetY=pressed?1:3;
      const offset=pressed?3:0,src='assets/images/interface/home/stage-arrow-'+(prev?'west':'east')+'.png';
      if(!drawImg(ctx,src,ax-32,ay-32+offset,64,64)){text(ctx,prev?'‹':'›',ax,ay+offset,52,'#64d899','center');}
      ctx.restore();
    };
    arrow(aLx, '‹');
    arrow(aRx, '›');
    // Capsule entry button and skill rows share their left/right edges.
    // 按钮 440→374（再缩短 15%）；配色固定金色，不随战场切换变色
    const ey = 1020, eh = 80, entryW = 374, entryX = (750 - entryW) / 2;
    if(!isTest&&s.firstGoldBonus&&s.firstGoldBonus.remaining>0)push('dailyBattleBonus',s.firstGoldBonus,entryX+entryW-27,ey-19,38,38);
    push('enter', null, entryX, ey, entryW, eh);
    button(ctx,entryX,ey,entryW,eh,'进入战斗',{bg:'#dfae2e',fontSize:36,capsule:true,raised:true,depth:5});
    if(!isTest&&s.firstGoldBonus&&s.firstGoldBonus.remaining>0){
      const bx=entryX+entryW-8,by=ey;ctx.save();ctx.shadowColor='rgba(64,37,9,.3)';ctx.shadowBlur=3;ctx.shadowOffsetY=2;
      ctx.beginPath();ctx.arc(bx,by,17,0,Math.PI*2);ctx.fillStyle='#b25232';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.strokeStyle='#ffe1a0';ctx.lineWidth=1.5;ctx.stroke();text(ctx,'!',bx,by,23,'#ffffff','center');ctx.restore();
    }
    // 技能配置行：单行双分区，随版面整体下移 150（1130→1280）
    skillRow(ctx, s, push, 55, 1280, 640, 170);
    // 移除主界面「测试战场 · 免三消直测技能」入口按钮（战场卡 ◀▶ 切换仍可进入测试战场）
  }
  return { menuBattle };
}
module.exports = { createHomeScreen };
