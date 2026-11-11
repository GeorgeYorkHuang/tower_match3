'use strict';
const Mail=require('../economy/mail.js');
const ACCESS = require('../config/test-access.js');
const CONFIG = require('../config.js');
const GlobalSkills = require('../global-skills.js');
const { Meta } = require('../meta.js');
function switchProfile(game, testing, preset) {
  if (game.save.save() === false) { game.toast('保存失败，未切换档案', '#ff6b6b'); return false; }
  const previousKey = game.save.storageKey;
  const previous = { meta: game.meta, saveData: game.saveData, testProfile: game.testProfile, lastLoadStatus: game.save.lastLoadStatus };
  game.save.storageKey = testing ? ACCESS.testSaveKey : 'xxfx_save_v1';
  const targetData = game.save.load();
  if (['error', 'unsupported', 'unavailable'].includes(game.save.lastLoadStatus)) {
    game.save.storageKey = previousKey;
    game.save.lastLoadStatus = previous.lastLoadStatus;
    game.toast('目标档案读取失败，未切换档案', '#ff6b6b');
    return false;
  }
  game._passphraseRequest = (game._passphraseRequest || 0) + 1;
  game.testProfile = !!testing;
  game.toasts = [];
  game.saveData = targetData;
  game.meta = Meta.fromJSON(game.saveData);
  if (testing && (!game.saveData || preset === 'fresh')) {
    game.meta = new Meta();
    if (preset !== 'fresh') {
      const m = game.meta;
      m.gold = 999999; m.diamond = 99999;
      Object.values(CONFIG.RELIC_RUN.tower).concat([CONFIG.RELIC_RUN.common, CONFIG.RELIC_RUN.ur || []]).forEach(list =>
        list.forEach(d => { m.runCodex[d.id] = 1; m.relicStars[d.id] = 3; m.shards[d.id] = 999; }));
      Object.keys(CONFIG.TOWERS).forEach(k => { m.towerCodex[k] = 1; });
      ['match4','match5','chain'].forEach(slot => { m.skillUnlocks[slot] = CONFIG.MATCH_SKILL[slot].map(d => d.id); });
      m.skillUnlocks.global = GlobalSkills.POOL.map(d => d.id);
    }
  }
  // 继续已有测试档时也补齐新增卡表的解锁状态；保留已有星级，不覆盖测试进度。
  if (testing && preset !== 'fresh') {
    const m = game.meta;
    Object.values(CONFIG.RELIC_RUN.tower).concat([CONFIG.RELIC_RUN.common, CONFIG.RELIC_RUN.ur || []]).forEach((list) => {
      list.forEach((d) => {
        m.runCodex[d.id] = 1;
        if (!m.relicStars[d.id]) m.relicStars[d.id] = 1;
      });
    });
  }
  const dailyFirst = game.meta.dailyFirst ? JSON.parse(JSON.stringify(game.meta.dailyFirst)) : null;
  if (game.save.save() === false) {
    game.meta = previous.meta; game.saveData = previous.saveData; game.testProfile = previous.testProfile;
    game.save.storageKey = previousKey; game.save.lastLoadStatus = previous.lastLoadStatus;
    game.toast('测试档保存失败，已保留原档案', '#ff6b6b');
    return false;
  }
  game.newRun(false);
  game.meta.dailyFirst = dailyFirst;
  game.save.save();
  game.menuPanel = null;
  game.sfx.setEnabled(game.meta.soundOn !== false);
  game.sfx.setMusicEnabled(game.meta.musicOn !== false);
  game.toast(testing ? '已进入独立测试档' : '已登出测试档 · 恢复正常档案', '#7ef0a3');
}
function promptPassphrase(game) {
  if (typeof wx === 'undefined' || !wx.showModal) { game.toast('当前环境不支持口令输入', '#ff6b6b'); return; }
  const request = game._passphraseRequest = (game._passphraseRequest || 0) + 1;
  const storageKey = game.save.storageKey, panel = game.menuPanel;
  wx.showModal({ title: '兑换码', editable: true, placeholderText: '请输入兑换码',
    success(res) {
      if (!res.confirm || game.state !== 'menu' || game._passphraseRequest !== request || game.save.storageKey !== storageKey || game.menuPanel !== panel) return;
      const code=String(res.content||'').trim();
      if(ACCESS.enabled&&code===ACCESS.passphrase){game.menuPanel={type:'testProfile'};return;}
      const result=Mail.transact(game,meta=>Mail.redeem(meta,code));
      if(!result.ok){game.toast(result.reason==='used'?'该兑换码已使用':result.reason==='save'?'保存失败，请重试':['reward','disabled'].includes(result.reason)?'该兑换码暂不可用':'兑换码无效','#ff6b6b');return;}
      game.menuPanel={type:'accountMail',scrollY:0};game.toast('兑换成功，奖励已发送至邮箱','#9bdfa3');
    },
  });
}
function handle(game, key, data) {
  if (key === 'accountTutorial') { require('./tutorial.js').restart(game); return; }
  if (key === 'accountMail') { game.menuPanel = { type: 'accountMail',scrollY:0 }; return; }
  if(['accountMailClaim','accountMailClaimAll','accountMailDeleteRead'].includes(key)){
    if(!game.menuPanel||game.menuPanel.type!=='accountMail')return;
    const deleting=key==='accountMailDeleteRead',result=Mail.transact(game,meta=>deleting?Mail.deleteClaimed(meta):Mail.claim(meta,key==='accountMailClaim'?data:null));
    if(!result.ok){game.toast(result.reason==='save'?'保存失败，请重试':deleting?'暂无已领取邮件':'暂无可领取奖励','#b8c7ac');return;}
    game.toast(deleting?'已删除'+result.count+'封已领取邮件':require('../economy/mail-rewards.js').summary(result.rewards),'#bfe2aa');return;
  }
  if (key === 'accountPass' || key === 'accountRedeem') { promptPassphrase(game); return; }
  if (key === 'accountMusic') {
    game.meta.musicOn = game.meta.musicOn === false;
    game.sfx.setMusicEnabled(game.meta.musicOn);
    if (game.meta.musicOn) game.sfx.startBgm();
    game.save.save(); return;
  }
  if(key==='accountClear'){
    if(typeof wx==='undefined'||!wx.showModal){game.toast('当前环境不支持清档确认','#ffb3a0');return;}
    const storageKey=game.save.storageKey,previousMeta=game.meta;
    wx.showModal({title:'确认清除当前档案？',content:'将清除当前'+(game.testProfile?'测试':'正常')+'档案的章节、圣遗物、天赋和货币进度，无法恢复。另一档案不受影响。',confirmText:'确认清档',confirmColor:'#b64b36',success(result){
      if(!result.confirm||game.save.storageKey!==storageKey||game.meta!==previousMeta)return;
      game.meta=new Meta();
      if(game.save.save()===false){game.meta=previousMeta;game.toast('保存失败，已保留原档案','#ff6b6b');return;}
      game.saveData=game.meta.toJSON();game.menuStage=require('../config/prologue.js').order[0];game.menuTab='battle';game.menuPanel=null;game.newRun(false);game.state='menu';
      game.sfx.setMusicEnabled(game.meta.musicOn);game.toast('当前档案已清除','#ffe4a1');
    }});return;
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
