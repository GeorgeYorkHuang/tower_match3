/**
 * test_audio.mjs —— SfxManager 音效模块单测（v1.13.11 模块化拆分）
 * 用假 wx.createInnerAudioContext 验证：实例创建 / 防抖播放 / BGM 启停
 */
import { SfxManager, AUDIO } from '../js/game/audio.js';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}`); }
}

// 假音频上下文：记录 play/stop 调用次数
function makeFakeAudio() {
  return { src: '', loop: false, volume: 1, played: 0, stopped: 0,
    play() { this.played++; }, stop() { this.stopped++; } };
}
const fakeCtxs = [];
global.wx = {
  createInnerAudioContext() { const a = makeFakeAudio(); fakeCtxs.push(a); return a; },
};

// 1. AUDIO 表完整
ok(AUDIO.bgm === 'audio/bgm.mp3' && AUDIO.shot === 'audio/bullet.mp3' && AUDIO.boom === 'audio/boom.mp3', 'AUDIO 表含 bgm/shot/boom');

// 2. 构造时创建 3 个音频上下文（bgm 循环 + fx）
const s = new SfxManager();
ok(fakeCtxs.length === 3, `构造创建 3 个音频上下文（实际 ${fakeCtxs.length}）`);
ok(fakeCtxs[0].loop === true && fakeCtxs[0].volume === 0.3, 'bgm 循环且音量 0.3');
ok(fakeCtxs[1].loop === false, 'shot 非循环');

// 3. play：首次播放立即生效
s.play('shot', 0.25);
ok(fakeCtxs[1].played === 1, '首次 shot 播放');

// 4. 防抖：minGap 内再次调用不重复播放（_lastShotSfx 已记录，Date.now 基本不变）
s.play('shot', 0.25);
ok(fakeCtxs[1].played === 1, 'shot 防抖生效（minGap 内不重复播放）');

// 5. boom 独立通道不受 shot 防抖影响
s.play('boom', 0.35);
ok(fakeCtxs[2].played === 1, 'boom 独立播放');

// 6. play 前置 stop（stop-then-play）
ok(fakeCtxs[1].stopped === 1, '播放前先 stop（避免重入）');

// 7. BGM 启动一次后不重复
s.startBgm();
ok(fakeCtxs[0].played === 1, 'bgm 首次播放');
s.startBgm();
ok(fakeCtxs[0].played === 1, 'bgm 幂等（_bgmStarted 防重入）');

// 8. BGM 停止
s.stopBgm();
ok(fakeCtxs[0].stopped === 1, 'bgm 停止');
s.startBgm();
ok(fakeCtxs[0].played === 2, 'stopBgm 后 startBgm 可再次播放');

// 9. 无 wx 环境安全降级
delete global.wx;
const s2 = new SfxManager();
s2.play('shot', 0.1); s2.startBgm(); s2.stopBgm();
ok(true, '无 wx 环境降级不抛错');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
