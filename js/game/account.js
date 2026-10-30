'use strict';
const ACCESS = require('../config/test-access.js');
const CONFIG = require('../config.js');
const GlobalSkills = require('../global-skills.js');
const { Meta } = require('../meta.js');
function switchProfile(game, testing, preset) {
  game.save.save();
  game.save.storageKey = testing ? ACCESS.testSaveKey : 'xxfx_save_v1';
  game.testProfile = !!testing;
  game.toasts = [];
  game.saveData = game.save.load();
  game.meta = Meta.fromJSON(game.saveData);
  if (testing && (!game.saveData || preset === 'fresh')) {
    game.meta = new Meta();
    if (preset !== 'fresh') {
      const m = game.meta;
      m.gold = 999999; m.diamond = 99999; m.starStones = 999;
      Object.values(CONFIG.RELIC_RUN.tower).concat([CONFIG.RELIC_RUN.common]).forEach(list =>
        list.forEach(d => { m.runCodex[d.id] = 1; m.relicStars[d.id] = 3; m.shards[d.id] = 999; }));
      Object.keys(CONFIG.TOWERS).forEach(k => { m.towerCodex[k] = 1; });
      ['match4','match5','chain'].forEach(slot => { m.skillUnlocks[slot] = CONFIG.MATCH_SKILL[slot].map(d => d.id); });
      m.skillUnlocks.match4.push('random');
      m.skillUnlocks.global = GlobalSkills.POOL.map(d => d.id);
    }
  }
  const dailyFirst = game.meta.dailyFirst ? JSON.parse(JSON.stringify(game.meta.dailyFirst)) : null;
  game.save.save();
  game.newRun(false);
  game.meta.dailyFirst = dailyFirst;
  game.save.save();
  game.menuPanel = null;
  game.sfx.setEnabled(game.meta.soundOn !== false);
  game.sfx.setMusicEnabled(game.meta.musicOn !== false);
  game.toast(testing ? '已进入独立测试档' : '已登出测试档 · 恢复正常档案', '#7ef0a3');
}
function promptPassphrase(game) {
  if (!ACCESS.enabled) { game.toast('测试入口已关闭', '#ff6b6b'); return; }
  if (typeof wx === 'undefined' || !wx.showModal) { game.toast('当前环境不支持口令输入', '#ff6b6b'); return; }
  wx.showModal({ title: '测试口令', editable: true, placeholderText: '请输入测试口令',
    success(res) {
      if (!res.confirm || game.state !== 'menu') return;
      if (String(res.content || '').trim() !== ACCESS.passphrase) { game.toast('口令不正确', '#ff6b6b'); return; }
      game.menuPanel = { type: 'testProfile' };
    },
  });
}
function handle(game, key) {
  if (key === 'accountPass') { promptPassphrase(game); return; }
  if (key === 'accountMusic') {
    game.meta.musicOn = game.meta.musicOn === false;
    game.sfx.setMusicEnabled(game.meta.musicOn);
    if (game.meta.musicOn) game.sfx.startBgm();
    game.save.save(); return;
  }
  if (key === 'accountInfo') { game.menuPanel = { type: 'accountInfo' }; return; }
  if (key === 'accountLogout') {
    if (game.testProfile) switchProfile(game, false);
    else { game.menuPanel = null; game.toast('当前为本地正常档案，暂无微信登录会话', '#9fb2c3'); }
    return;
  }
  if (key === 'profileResume') switchProfile(game, true);
  if (key === 'profileFresh') switchProfile(game, true, 'fresh');
}
function deviceInfo() {
  let info = {}, windowInfo = {};
  try { if (typeof wx !== 'undefined' && wx.getSystemInfoSync) info = wx.getSystemInfoSync() || {}; } catch (e) {}
  try { if (typeof wx !== 'undefined' && wx.getDeviceInfo) info = Object.assign(info, wx.getDeviceInfo()); } catch (e) {}
  try { if (typeof wx !== 'undefined' && wx.getWindowInfo) windowInfo = wx.getWindowInfo() || {}; } catch (e) {}
  info = Object.assign({}, info, windowInfo);
  return {
    brand: info.brand || '未知', model: info.model || '未知', system: info.system || '未知',
    screen: info.screenWidth && info.screenHeight ? `${info.screenWidth} × ${info.screenHeight}` : '未知',
    window: info.windowWidth && info.windowHeight ? `${info.windowWidth} × ${info.windowHeight}` : '未知',
    pixelRatio: info.pixelRatio || '未知',
  };
}
module.exports = { handle, switchProfile, deviceInfo };
