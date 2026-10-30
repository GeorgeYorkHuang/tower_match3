'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
function draw(ctx, s, push, shell) {
  const type = s.panel.type;
  const info = type === 'accountInfo';
  const choose = type === 'testProfile';
  const y = shell(ctx, s, push, info ? '我的信息' : choose ? '测试档案' : '功能菜单', info ? 800 : 570, true, 560);
  text(ctx, s.testProfile ? '测试模式 · 独立本地存档' : '本地正常档案', 375, y + 108, 22, '#9fb2c3', 'center');
  if (info) {
    const device = s.deviceInfo || {};
    const rows = ['档案：' + (s.testProfile ? '测试档案' : '正常档案'), '金币：' + s.gold,
      '钻石：' + s.diamond, '最高波次：' + (s.bestWave || 0), '账号：本地档案，未绑定微信身份',
      '品牌：' + (device.brand || '未知'), '机型：' + (device.model || '未知'),
      '系统：' + (device.system || '未知'), '屏幕：' + (device.screen || '未知'),
      '窗口：' + (device.window || '未知') + ' · DPR ' + (device.pixelRatio || '未知')];
    rows.forEach((v,i) => {
      ctx.font = '20px sans-serif';
      const width = ctx.measureText(v).width;
      text(ctx,v,145,y+166+i*54, width > 460 ? Math.max(14, 20*460/width) : 20,'#d7e2ee','left');
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
