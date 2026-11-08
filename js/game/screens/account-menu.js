'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
function drawIcon(ctx,kind,x,y) {
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#f5d98c';ctx.fillStyle='#f5d98c';ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
  if(kind==='mail') {ctx.strokeRect(-13,-9,26,18);ctx.beginPath();ctx.moveTo(-13,-9);ctx.lineTo(0,2);ctx.lineTo(13,-9);ctx.stroke();}
  else if(kind==='gift') {ctx.strokeRect(-11,-4,22,17);ctx.strokeRect(-14,-9,28,6);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(0,13);ctx.moveTo(0,-9);ctx.bezierCurveTo(-20,-23,-17,-2,0,-9);ctx.bezierCurveTo(20,-23,17,-2,0,-9);ctx.stroke();}
  else if(kind==='music') {ctx.beginPath();ctx.moveTo(-5,8);ctx.lineTo(-5,-10);ctx.lineTo(10,-13);ctx.lineTo(10,5);ctx.stroke();ctx.beginPath();ctx.ellipse(-9,9,5,3,-0.4,0,Math.PI*2);ctx.ellipse(6,6,5,3,-0.4,0,Math.PI*2);ctx.fill();}
  else if(kind==='info') {ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(0,8);ctx.stroke();ctx.beginPath();ctx.arc(0,-7,1.5,0,Math.PI*2);ctx.fill();}
  else {ctx.beginPath();ctx.moveTo(-2,-12);ctx.lineTo(-12,-12);ctx.lineTo(-12,12);ctx.lineTo(-2,12);ctx.moveTo(-4,0);ctx.lineTo(13,0);ctx.moveTo(7,-6);ctx.lineTo(13,0);ctx.lineTo(7,6);ctx.stroke();}
  ctx.restore();
}
function draw(ctx, s, push, shell, drawImg) {
  const type = s.panel.type;
  if (type === 'accountMenu') {
    const x=30, y=176, w=248, h=380;
    push('panelBounds',null,x,y,w,h);
    ctx.save();
    ctx.shadowColor='rgba(14,37,22,0.35)'; ctx.shadowBlur=14; ctx.shadowOffsetY=5;
    fillRoundRect(ctx,x,y,w,h,18,'#e9dbb5');
    ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    strokeRoundRect(ctx,x,y,w,h,18,'#a58b4e',1.8);
    const rows=[['accountRedeem','兑换','gift'],['accountMail','邮箱','mail'],['accountMusic','音乐','music'],['accountInfo','信息','info'],['accountLogout','登出','exit']];
    rows.forEach(([key,label,icon],i)=>{
      const by=y+14+i*70, bx=x+12, bw=w-24;
      const grad=ctx.createLinearGradient(0,by,0,by+62);
      grad.addColorStop(0,key==='accountLogout'?'#765345':'#426b48');
      grad.addColorStop(1,key==='accountLogout'?'#573c32':'#284d35');
      fillRoundRect(ctx,bx,by,bw,62,12,grad);
      strokeRoundRect(ctx,bx,by,bw,62,12,'#c6ae70',1);
      fillRoundRect(ctx,bx+8,by+8,46,46,10,'rgba(255,238,192,0.12)');
      drawIcon(ctx,icon,bx+31,by+31);
      text(ctx,label,bx+112,by+32,25,'#fff0c6','center');
      if(key==='accountMusic') {
        fillRoundRect(ctx,bx+bw-40,by+23,28,16,8,s.musicOn?'#bed287':'#9b9382');
        ctx.fillStyle='#fff4d4'; ctx.beginPath();ctx.arc(bx+bw-(s.musicOn?20:32),by+31,5,0,Math.PI*2);ctx.fill();
      }
      push(key,null,bx,by,bw,62);
    });
    ctx.restore();
    return;
  }
  if(type==='accountMail'){require('./mail.js').draw(ctx,s,push,drawImg);return;}
  const info = type === 'accountInfo';
  const choose = type === 'testProfile';
  const y = shell(ctx, s, push, info ? '我的信息' : choose ? '测试档案' : '功能菜单', info ? 800 : 570, true, 560);
  text(ctx, s.testProfile ? '测试模式 · 独立本地存档' : '本地正常档案', 375, y + 108, 22, '#9fb2c3', 'center');
  if (info) {
    const device = s.deviceInfo || {};
    const rows = ['游戏版本：' + (s.gameVersion || '未知'), '档案：' + (s.testProfile ? '测试档案' : '正常档案'), '金币：' + s.gold,
      '钻石：' + s.diamond, '最高波次：' + (s.bestWave || 0), '账号：本地档案，未绑定微信身份',
      '品牌：' + (device.brand || '未知'), '机型：' + (device.model || '未知'),
      '系统：' + (device.system || '未知'), '屏幕：' + (device.screen || '未知'),
      '窗口：' + (device.window || '未知') + ' · DPR ' + (device.pixelRatio || '未知')];
    fillRoundRect(ctx,145,y+716,460,56,12,'#365c40');
    text(ctx,'重新体验新手引导',375,y+744,23,'#ffe4a1','center');
    push('accountTutorial',null,145,y+716,460,56);
    rows.forEach((v,i) => {
      ctx.font = '20px sans-serif';
      const width = ctx.measureText(v).width;
      text(ctx,v,145,y+154+i*48, width > 460 ? Math.max(14, 20*460/width) : 20,'#d7e2ee','left');
    });
    return;
  }
  const rows = choose ? [['profileResume','继续测试档 / 首次创建满配档'],['profileFresh','创建或重置新手测试档']] :
    [['accountPass','输入测试口令'],['accountMusic','音乐：' + (s.musicOn ? '开' : '关')],['accountInfo','我的信息'],['accountLogout','登出']];
  rows.forEach(([key,label],i) => {
    const by=y+142+i*86;
    fillRoundRect(ctx,135,by,480,66,14,'#263447');
    strokeRoundRect(ctx,135,by,480,66,14,'#526e94',1);
    text(ctx,label,375,by+34,24,'#eef4ff','center');
    push(key,null,135,by,480,66);
  });
  if(choose) text(ctx,'重置仅影响测试档，正常档案保留',375,y+400,20,'#9fb2c3','center');
}
module.exports = { draw };
