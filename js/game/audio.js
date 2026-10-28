/**
 * audio.js —— 音效与背景音乐管理（CommonJS）
 * 微信小游戏 InnerAudioContext 封装：防抖播放（shot/boom）+ 循环 BGM + 统一音量
 * 由 main.js 的 SfxManager 实例持有；combat.js 通过 g.playSfx(kind, minGap) 调用
 */
// v1.17.21 素材统一进分包：audio 从主包迁至 assets 分包（assets/audio/）。
// 时序依赖：SfxManager 由 Game 构造函数创建，而 Game 在 wx.loadSubpackage('assets')
// success 之后才 new（见 js/loading.js），故此处引用分包内音频文件时分包必已加载完成。
// 后续新增音效一律放 assets/audio/，不要再在根目录建 audio/。
const AUDIO = { bgm: 'assets/audio/bgm.mp3', shot: 'assets/audio/bullet.mp3', boom: 'assets/audio/boom.mp3' };

function createAudio(src, loop, vol) {
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return null;
  try {
    const a = wx.createInnerAudioContext();
    a.src = src; a.loop = !!loop; a.volume = vol;
    return a;
  } catch (e) { return null; }
}

class SfxManager {
  constructor() {
    this.bgm = createAudio(AUDIO.bgm, true, 0.3);
    this.fxShot = createAudio(AUDIO.shot, false, 0.12);
    this.fxBoom = createAudio(AUDIO.boom, false, 0.4);
    this._bgmStarted = false;
    this._lastShotSfx = 0;
    this._lastBoomSfx = 0;
    this.enabled = true;   // v1.16.107 声音总开关（设置弹层可切换）
  }

  /** v1.16.107 声音开关：关闭时停 BGM，play/startBgm 一律不发声 */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.stopBgm();
  }

  /** 播放一次性音效（minGap 秒内防抖；kind 目前支持 shot / boom） */
  play(kind, minGap) {
    if (!this.enabled) return;   // v1.16.107 声音关闭不播放
    const now = Date.now();
    const last = kind === 'shot' ? this._lastShotSfx : this._lastBoomSfx;
    if (now - last < minGap * 1000) return;
    const a = kind === 'shot' ? this.fxShot : this.fxBoom;
    if (!a) return;
    try { a.stop(); a.play(); } catch (e) {}
    if (kind === 'shot') this._lastShotSfx = now; else this._lastBoomSfx = now;
  }

  startBgm() {
    if (!this.enabled) return;   // v1.16.107 声音关闭不启 BGM
    if (this.bgm && !this._bgmStarted) {
      this._bgmStarted = true;
      try { this.bgm.play(); } catch (e) {}
    }
  }

  stopBgm() {
    if (this.bgm) { try { this.bgm.stop(); } catch (e) {} }
    this._bgmStarted = false;
  }
}

module.exports = { SfxManager, AUDIO };
