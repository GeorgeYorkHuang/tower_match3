/**
 * main.js —— 游戏主循环与状态机（渲染层入口）
 * 状态机：fighting（波内消除+战斗）→ 波末结算 → picking（三选一）→ 下一波 / gameover
 */
const CONFIG = require('../config.js');
const { Run } = require('../run.js');
const { Renderer, layout } = require('./render.js');
const { CombatSystem } = require('../combat.js');

/* 环境防御：新版小游戏基础库已不暴露全局 canvas，需用 wx.createCanvas() 获取主画布 */
let _c = null;
if (typeof canvas !== 'undefined') _c = canvas;
else if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) _c = GameGlobal.canvas;
else if (typeof wx !== 'undefined' && wx.createCanvas) {
  try { _c = wx.createCanvas(); } catch (e) { _c = null; } // 首次调用返回主画布
}
const ctx = _c ? _c.getContext('2d') : null;
if (ctx && (!_c.width || !_c.height)) {
  // canvas 尺寸为 0（部分环境/真机异常）时按系统屏幕信息初始化
  try {
    const info = (typeof wx !== 'undefined' && wx.getSystemInfoSync) ? wx.getSystemInfoSync() : null;
    if (info) {
      _c.width = info.windowWidth * (info.pixelRatio || 1);
      _c.height = info.windowHeight * (info.pixelRatio || 1);
    }
  } catch (e) {}
}
if (!ctx) {
  if (typeof console !== 'undefined') {
    console.error('[消消防线] 运行环境诊断：', JSON.stringify({
      hasCanvas: typeof canvas !== 'undefined',
      hasGameGlobalCanvas: (typeof GameGlobal !== 'undefined' && !!GameGlobal.canvas),
      hasWx: typeof wx !== 'undefined',
      hasSharedCanvas: (typeof GameGlobal !== 'undefined' && !!GameGlobal.sharedCanvas),
      canCreateCanvas: (typeof wx !== 'undefined' && typeof wx.createCanvas),
      canCreateAudio: (typeof wx !== 'undefined' && typeof wx.createInnerAudioContext),
    }));
    console.error(
      '[消消防线] 未找到 canvas：本游戏只能在微信小游戏主域（主包 game.js 入口）运行。\n' +
      '  可能原因：项目根被配置为开放数据域(openDataContext)，或主游戏代码被放进了子域目录。\n' +
      '  排行榜子域请使用 sharedCanvas 单独编写，不要加载主游戏代码。'
    );
  }
  module.exports = null;
} else if (typeof console !== 'undefined' && console.info) {
  console.info('[消消防线] 启动：canvas', _c.width + 'x' + _c.height,
    'scale', (Math.min(_c.width / CONFIG.DESIGN.W, _c.height / CONFIG.DESIGN.H)).toFixed(3));
}
const LOGIC_W = CONFIG.DESIGN.W;      // 750
const LOGIC_H = CONFIG.DESIGN.H;      // 1334
const WAVE_DUR = CONFIG.WAVE.seconds; // 40s
const GAME_VERSION = 'v1.12.0';        // 设置弹层版本信息
const { SaveManager } = require('../save.js');
const { WaveDirector } = require('../wave.js');
const { Match3Controller } = require('../match3.js');

/* 塔位图标字符（加载失败时的兜底） */
const TOWER_ICON = { fire: '🔥', ice: '❄', poison: '☠', electric: '⚡', boomerang: '🌀' };

/* 音效 */
const AUDIO = { bgm: 'audio/bgm.mp3', shot: 'audio/bullet.mp3', boom: 'audio/boom.mp3' };
function createAudio(src, loop, vol) {
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext) return null;
  try {
    const a = wx.createInnerAudioContext();
    a.src = src; a.loop = !!loop; a.volume = vol;
    return a;
  } catch (e) { return null; }
}

class GameMain {
  constructor() {
    this.scale = Math.min(_c.width / LOGIC_W, _c.height / LOGIC_H); // 等比 contain：完整显示且铺满（背景延伸填充剩余区）
    this.renderer = new Renderer();
    this.ly = layout();
    this.restartBtn = {};
    this.pickHits = {};
    this.funcHits = [];
    this.towerInfo = null;       // 塔详情弹层：{slotIdx, key, name, level, exp, expNeed, expRatio, dps, skills}
    this.towerInfoHits = {};     // 详情弹层命中：{bg, close}
    this.funcLayer = null;       // 底部功能弹层：{type:'shop'|'setting'|'tome'|'help', confirming?, version?}
    this.funcLayerHits = {};     // 功能弹层命中：{bg, close, confirm?}
    this.toasts = [];
    this.selected = null;
    this.swapped = false;
    this.waveClear = null;
    this.waveClearBtn = {};
    // 开局引导：先消先得（消除 3 连 → 获得对应塔上槽）
    this.toasts.push({ msg: '滑动相邻方块消除 3 连 · 获得对应塔', color: '#9fb2c3', ttl: 3.2 });
    // 打击特效与音效
    this.fx = [];
    this.anim = null; // 三消动画（消除+下落）
    this._bgmStarted = false;
    this._lastShotSfx = 0;
    this._lastBoomSfx = 0;
    this.bgm = createAudio(AUDIO.bgm, true, 0.3);
    this.fxShot = createAudio(AUDIO.shot, false, 0.12);
    this.fxBoom = createAudio(AUDIO.boom, false, 0.4);
    // 波次导演 / 三消控制器 / 存档 / 战斗系统（save 绑定 game，run 重建时仍读写当前局）
    this.wave = new WaveDirector(this, this.ly);
    this.match3 = new Match3Controller(this);
    this.combat = new CombatSystem(this);
    this.save = new SaveManager(this);
    this.saveData = this.save.load();
    // 局外数据（主界面）：金币 / 圣物 / 宝箱 / 每日精选
    this.meta = this.save.applyMeta(this.saveData);
    // 主界面状态
    this.menuTab = 'battle';     // battle / shop / relic（v1.4 移除 config 页签）
    this.menuPanel = null;       // 子面板：{ type:'relicDex' }
    this.menuHits = [];          // 主界面命中区（渲染时重建）
    this._rewardedAd = null;     // 激励视频广告实例（惰性创建）
    this._postPick = null;       // 升级三选一完成后回到的状态（'waveclear' / null=战斗）
    // 战斗内圣物宝箱三选一：精英掉落入队，逐次弹层（暂停战斗）
    this.pendingRelicPicks = []; // [{ candidates: [{id,name,icon,desc}×3] }]
    this.relicPick = null;       // 当前圣物三选一弹层
    this.relicPickHits = [];     // 圣物三选一候选命中区
    this.newRun(false);
    this.bindTouch();
    this.lastTs = 0;
    requestAnimationFrame(this.loop.bind(this));
  }

  /** 新建对局；enterBattle=true 时应用技能搭配/圣物并进入战斗，否则停留在主界面 */
  newRun(enterBattle) {
    this.run = new Run({ difficulty: CONFIG.DIFFICULTY.default });
    this.save.apply(this.saveData);
    this.waveTime = 0;
    this.enemies = [];
    this.pickQueue = [];
    this.pickIndex = 0;
    this.pickCell = null; // 点击交换选中格
    this.combat.reset();
    this._postPick = null;
    this.battleRelics = []; // v1.9：本局获得的圣物（精英三选一选择后入列，展示于经验条下方）
    if (enterBattle) {
      this.enterBattle();
    } else {
      this.state = 'menu';
      this._bgmStarted = false;
      if (this.bgm) { try { this.bgm.stop(); } catch (e) {} }
    }
  }

  /** 应用主界面配置进入战斗：塔参战 + 圣物城墙血量（v1.12：无默认技能，技能全部靠三选一获取） */
  enterBattle() {
    // 拥有塔参战（level≥1，塔位区可出战）
    this.run.slotOrder.forEach((k) => {
      const t = this.run.effects.tower(k);
      if (t && t.level === 0) t.level = 1;
    });
    // v1.12：不再默认激活任何技能——塔无获取技能时技能列表为空，
    // 所有技能通过「打怪经验 → 整体升级 → 三选一」获取（技能卡激活 / 分支卡续升）
    // 圣物·磐石印：城墙血量上限
    const b = this.meta.relicBonus();
    this.run.lineHp = Math.round(CONFIG.LINE.hp * (1 + 0.10 * b.wall));
    this.state = 'fighting';
    this.wave.start();
    this.toast('进入战斗 · 消灭全部怪物', '#7ef0a3');
    // 战斗 BGM（真机需在用户手势后播放）
    if (this.bgm && !this._bgmStarted) {
      try { this.bgm.play(); } catch (e) {}
      this._bgmStarted = true;
    }
  }

  /* ---------- 帧循环 ---------- */
  loop(ts) {
    try {
      const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 0.016;
      this.lastTs = ts;
      this.update(dt);
      this.render();
      this.pixelCheck();
      requestAnimationFrame(this.loop.bind(this));
    } catch (e) {
      console.error('[消消防线] 帧循环错误：', e && e.stack ? e.stack : e);
      // 一次渲染/逻辑异常不应卡死整局：继续调度帧循环（保留最后画面，触摸仍可响应）
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  /** 首帧渲染自检：读画布中心像素，判定内容是否真的画上去了 */
  pixelCheck() {
    if (this._pixelChecked) return;
    this._pixelChecked = true;
    try {
      const w = _c.width, h = _c.height;
      const img = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1);
      console.info('[消消防线] 画布中心像素采样：', Array.prototype.slice.call(img.data));
    } catch (e) {
      console.info('[消消防线] 画布像素采样不可用：', e && e.message);
    }
  }

  update(dt) {
    // toast 过期
    this.toasts = this.toasts.filter((t) => (t.ttl -= dt) > 0);
    // 特效推进
    this.fx = this.fx.filter((f) => { f.t += dt; return f.t < f.dur; });
    // 三消动画推进（交换 → 消除 → 逐级连锁，由 match3 控制器管理）
    this.match3.update(dt);
    // 主界面：宝箱开箱倒计时完成 → 发卡；每日精选跨天自动刷新
    if (this.state === 'menu') {
      this.tickChest(Date.now());
      this.meta.ensureDailyPicks(Date.now());
      return;
    }
    if (this.state === 'fighting') {
      // 战斗内圣物宝箱（精英掉落）三选一：有队列先弹层，暂停战斗推进
      if (this.pendingRelicPicks.length) {
        this.relicPick = this.pendingRelicPicks.shift();
        this.relicPickHits = [];
        this.state = 'relicpick';
        this.toast('圣物宝箱 · 三选一', '#f7c948');
        return;
      }
      this.waveTime += dt;
      // 陆续投放本波敌人（非一次性同屏）
      this.wave.tick(dt);
      this.stepEnemies(dt);
      // 波次完成标准 = 打完本波全部敌人（含未出场）；不再按波次时长提前结束
      if (!this.enemies.length && !this.wave.plan.length && this.waveTime > 3) {
        this.waveEnd();
      }
    }
  }

  /** 主界面宝箱倒计时推进：到点自动发卡 */
  tickChest(now) {
    const m = this.meta;
    if (!m.chestTimer) return;
    const remain = m.chestRemainSec(now);
    if (remain === 0) {
      const got = m.finishChest(now);
      if (got) this.toast(`宝箱开启：获得 ${got.icon}${got.name}`, '#f7c948');
      this.save.save();
    }
  }

  /** 敌人移动 + 塔真实攻击（A1：每塔独立攻击/技能行为，见 combat.js）+ 攻城攻击 + 打击特效 */
  stepEnemies(dt) {
    // 塔是唯一伤害源：无塔（槽位未解锁）→ 不结算伤害、不产生射击与击杀表现
    if (this.run.slotOrder.length === 0) {
      this.enemies.forEach((e) => this.moveEnemy(e, dt));
      return;
    }
    // A1 真实战斗：弹道命中 / DoT / 塔攻击调度 / 周期技 / 死亡触发
    this.combat.update(dt);
    // 血条延迟尾条推进：直接伤害后 hp 瞬掉、尾条缓慢收缩（视觉区分直接伤/持续伤）
    this.enemies.forEach((e) => {
      if (e.delayHp === undefined) e.delayHp = e.hp;
      e.delayHp = e.hp + (e.delayHp - e.hp) * Math.exp(-dt * 2.2);
    });
    // 移动：冰冻/减速影响移动速度；已到城墙攻击范围的停止前进
    this.enemies.forEach((e) => this.moveEnemy(e, dt));
    // 攻城：到达城墙攻击范围的怪物按攻击力×攻击频率持续扣城墙血（冰冻/麻痹停止攻击）
    const wallLine = this.ly.wallY - 10; // 城墙攻击范围（城墙顶）
    let wallHits = 0;
    for (const e of this.enemies) {
      if (e.y < wallLine) continue;
      if (e.frozen > 0 || e.paralyzed > 0) continue;
      e.attackT = (e.attackT || 0) + dt;
      if (e.attackT >= (e.attackInterval || 1)) {
        e.attackT -= (e.attackInterval || 1);
        this.run.lineHp -= e.attack;
        wallHits++;
        if (this.run.lineHp <= 0) {
          this.run.lineHp = 0;
          this.run.broken = true;
        }
      }
    }
    if (wallHits) this.fx.push({ type: 'hitwall', x: 375, y: wallLine, t: 0, dur: 0.3 });
    // 死亡清场（combat.update 已结算死亡技能，此处统一移除尸体）
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** 敌人移动：冰冻停止移动；减速乘系数；到达城墙攻击范围后停止前进（转入攻城） */
  moveEnemy(e, dt) {
    if (e.frozen > 0) return;
    if (e.y >= this.ly.wallY - 10) return;
    const mult = e.slow && e.slow.ttl > 0 ? e.slow.mult : 1;
    e.y += e.speed * mult * dt;
  }

  playSfx(kind, minGap) {
    const now = Date.now();
    const last = kind === 'shot' ? this._lastShotSfx : this._lastBoomSfx;
    if (now - last < minGap * 1000) return;
    const a = kind === 'shot' ? this.fxShot : this.fxBoom;
    if (!a) return;
    try { a.stop(); a.play(); } catch (e) {}
    if (kind === 'shot') this._lastShotSfx = now; else this._lastBoomSfx = now;
  }

  waveEnd() {
    // 真实战斗路径：城墙血已由「怪物攻城」实时扣减，跳过抽象漏怪模型扣血（skipLeak=true）
    const res = this.run.endWave(true);
    // 波末全塔少量经验（打怪为主渠道，波末是补充；v1.8 统一入整体池）
    const owned = this.run.slotOrder.length;
    if (owned > 0) this.run.gainExp(CONFIG.EXP.waveBonus * owned);
    // 波末金币 → 局外金币（圣物·招财符加成）
    const b = this.meta.relicBonus();
    this.meta.gold += Math.round(res.waveGold * (1 + 0.20 * b.gold));
    this.run.gold = this.meta.gold;
    this.save.save();
    if (res.broken) {
      this.state = 'gameover';
      if (this.bgm) { try { this.bgm.stop(); } catch (e) {} }
      return;
    }
    this.waveClear = {
      wave: this.run.wave,
      waveGold: res.waveGold,
      pending: 0,
    };
    this.state = 'waveclear';
  }

  /** 波次弹窗点击 → 有待升级先三选一，否则下一波 */
  waveClearNext() {
    this._postPick = 'waveclear';
    if (this.flushUpgrades()) return;
    this._postPick = null;
    this.state = 'fighting';
    this.wave.start();
  }

  /** 塔升级三选一：把全部待升级（pending）生成跨塔候选队列并进入 picking；无待升级返回 false */
  flushUpgrades() {
    if (this.state === 'picking') return true;
    const q = this.run.effects.buildUpgradeQueue(this.run.slotOrder.slice());
    if (!q.length) return false;
    this.pickQueue = q;
    this.pickIndex = 0;
    this.pickHits = {};
    this.state = 'picking';
    this.toast('塔升级 · 从已有塔技能中三选一', '#f7c948');
    return true;
  }

  nextPick() {
    this.pickIndex++;
    if (this.pickIndex < this.pickQueue.length) return;
    // 队列耗尽：仍有待升级 → 继续弹窗；否则回到战斗/波次流程
    const q = this.run.effects.buildUpgradeQueue(this.run.slotOrder.slice());
    if (q.length) {
      this.pickQueue = q;
      this.pickIndex = 0;
      this.pickHits = {};
      this.toast('塔升级 · 选择技能', '#f7c948');
      return;
    }
    this.pickQueue = [];
    this.pickIndex = 0;
    if (this._postPick === 'waveclear') {
      this._postPick = null;
      this.waveClearNext();
      return;
    }
    this.state = 'fighting';
    this.toast('升级完成', '#7ef0a3');
  }

  restart() {
    // 重开一局：塔等级/技能/棋盘重置（金币保留在 meta），塔位清空——由最先消除的 4 种颜色重新决定
    Object.keys(this.run.effects.towers).forEach((k) => this.run.effects.tower(k).resetRunBuild());
    this.run.slotOrder = [];
    this.run.board.regen();
    // v1.9：磐石印圣物加成在重开时同样生效（与 enterBattle 一致）
    this.run.lineHp = Math.round(CONFIG.LINE.hp * (1 + 0.10 * this.meta.relicBonus().wall));
    this.run.broken = false;
    this.run.pendingPeak = 0;
    this.run.picks = 0;
    this.run.firstSynergyWave = null;
    this.state = 'fighting';
    this.waveTime = 0;
    this.battleRelics = [];
    this.enterBattle();
  }

  /** 返回主界面（战斗结束/设置入口）：金币已同步 meta，停止战斗 */
  goMenu() {
    this.run.gold = this.meta.gold;
    this.state = 'menu';
    this.menuTab = 'battle';
    this.menuPanel = null;
    this.enemies = [];
    this.towerInfo = null;
    this.funcLayer = null;
    this.pickQueue = [];
    this.pickIndex = 0;
    this._postPick = null;
    this.pendingRelicPicks = [];
    this.relicPick = null;
    if (this.bgm) { try { this.bgm.stop(); } catch (e) {} }
    this._bgmStarted = false;
    this.save.save();
  }

  /* ---------- 击杀奖励：经验（圣物加成，v1.8 入整体池）/ 精英圣物掉落 / Boss 宝箱 ---------- */
  onKillReward(e) {
    const b = this.meta.relicBonus();
    // 经验：整体经验池（v1.8：塔不再单独获取经验，统一按整体等级成长）
    const base = CONFIG.EXP.kill[e.type] || CONFIG.EXP.kill.normal;
    const gained = Math.round(base * (1 + 0.20 * b.exp));
    const ups = this.run.gainExp(gained);
    // 触发升级 → 进入升级三选一（战斗暂停）
    if (ups > 0 && this.state === 'fighting') this.flushUpgrades();
    // 精英怪：概率掉落圣物宝箱（寻宝罗盘加成）→ 战斗内三选一（暂停战斗弹层）
    if (e.type === 'elite') {
      const chance = CONFIG.RELIC.dropChance * (1 + 0.10 * b.chest);
      if (Math.random() < chance) {
        // 候选：洗牌圣物表取 3 个不同圣物（优先低拥有数排序后洗牌）
        const pool = CONFIG.RELIC.list.slice()
          .sort((a, b) => (this.meta.relicCount(a.id) - this.meta.relicCount(b.id)))
          .slice(0, Math.max(3, CONFIG.RELIC.list.length));
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
        }
        const cands = pool.slice(0, 3).map((def) => ({
          id: def.id, name: def.name, icon: def.icon,
          desc: def.desc(this.meta.relicLevel(def.id) + 1),
        }));
        this.pendingRelicPicks.push({ candidates: cands });
        this.toast('精英掉落圣物宝箱 📦', '#f7c948');
        this.save.save();
      }
    }
    // Boss：掉落宝箱（每 5 波）
    if (e.isBoss) {
      this.meta.chests += 1;
      this.toast('Boss 掉落宝箱 📦', '#f7c948');
      this.save.save();
    }
  }

  /* ---------- 三消联动：圣物经验加成补差 + 塔额外攻击（多消不同特效） ---------- */
  onMatchBonus(ret) {
    if (!ret || !ret.settled) return;
    const b = this.meta.relicBonus();
    let ammoSum = 0, dmgSum = 0, frzSum = 0, towerHit = '';
    ret.settled.forEach((s) => {
      // 圣物·经验珠：三消经验补差（基础经验已由 applyMatch 进整体池；补差也入整体池 v1.8）
      if (b.exp > 0 && s.tower) {
        const t = this.run.effects.tower(s.tower);
        if (t && t.level > 0) this.run.gainExp(Math.max(1, Math.round(s.exp * 0.20 * b.exp)));
      }
      // v1.12 弹药/全局能量入账提示（汇总一次性 toast）
      if (s.ammoGain > 0) { ammoSum += s.ammoGain; towerHit = s.tower || towerHit; }
      if (s.dmgGain > 0) dmgSum += s.dmgGain;
      if (s.frzGain > 0) frzSum += s.frzGain;
      // 三消触发塔额外攻击一次；多消形状触发不同攻击特效（combat.bonusStrike）
      if (s.tower && s.shape && !s.gotTower && !s.penalized && this.state === 'fighting') {
        this.combat.bonusStrike(s.tower, s.shape);
      }
    });
    if (ammoSum > 0) {
      const tn = CONFIG.COLORS[CONFIG.TOWERS[towerHit] ? CONFIG.TOWERS[towerHit].color : ''] || {};
      this.toast(`🔫 弹药 +${ammoSum}（${tn.name || towerHit}）`, '#7ef0a3');
    }
    if (dmgSum > 0 || frzSum > 0) {
      const parts = [];
      if (dmgSum > 0) parts.push(`⚡ +${dmgSum}`);
      if (frzSum > 0) parts.push(`❄ +${frzSum}`);
      this.toast(`全局技能充能 ${parts.join(' ')}`, '#f7c948');
    }
    // 升级检查（三消经验也可能升级）
    if (this.state === 'fighting' && this.run.effects.pendingTotal() > 0) this.flushUpgrades();
  }

  /* ---------- 渲染 ---------- */
  render() {
    const s = (this.scale > 0 && isFinite(this.scale)) ? this.scale : 1;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = '#0d1117';
    // 背景铺满整个屏幕（逻辑坐标换算），模拟器/真机比例 ≠ 750:1334 时剩余区也填充，不留黑边
    ctx.fillRect(0, 0, Math.ceil(_c.width / s), Math.ceil(_c.height / s));
    if (this.state === 'menu') {
      this.menuHits = this.renderer.menuLayer(ctx, this.menuState(), this.menuHits);
      this.renderer.toast(ctx, this.toasts);
      return;
    }
    const st = this.sceneState();
    this.renderer.status(ctx, st);
    this.renderer.actionArea(ctx, st);
    // 底部功能键命中区由渲染器生成（renderer.funcHits），同步到 game 供触摸判定
    this.funcHits = this.renderer.funcHits || [];
    this.renderer.enemies(ctx, this.enemies);
    this.renderer.fx(ctx, this.fx);
    this.renderer.toast(ctx, this.toasts);
    if (this.state === 'picking') {
      const group = this.pickQueue[this.pickIndex];
      const pending = this.remainingPending(group.tower);
      this.renderer.pickLayer(ctx, group, pending, this.pickHits);
    }
    if (this.state === 'relicpick') {
      this.renderer.relicPickLayer(ctx, this.relicPick, this.relicPickHits);
    }
    if (this.state === 'waveclear') {
      this.waveClearBtn = this.renderer.waveClearLayer(ctx, st, this.waveClearBtn);
    }
    if (this.state === 'gameover') this.renderer.gameOver(ctx, st, this.restartBtn);
    // 塔详情弹层（任意状态下可查看）
    if (this.towerInfo) this.renderer.towerInfoLayer(ctx, this.towerInfo, this.towerInfoHits);
    // 底部功能弹层（商店/设置/图鉴/帮助）
    if (this.funcLayer) this.renderer.funcLayer(ctx, this.funcLayer, st, this.funcLayerHits);
  }

  sceneState() {
    const run = this.run;
    const eff = run.effects;
    // 4 槽：按先消先得顺序填已获塔，其余空位（null）
    const slots = [];
    for (let i = 0; i < CONFIG.TOWER_SLOTS; i++) {
      const key = run.slotOrder[i];
      if (!key) { slots.push(null); continue; }
      const t = eff.tower(key);
      // v1.11：详情仅展示经三选一获取/升级的技能（picked）；默认 3 技能不算"获取"，无 picked 时为空
      const skills = t.pool.filter((ef) => t.picked.has(ef.name)).map((ef) => {
        const p = (CONFIG.EFFECT_POOLS[key] || []).find((q) => q.name === ef.name) || {};
        return {
          name: ef.name, level: ef.level, desc: p.desc || '',
          branches: { A: ef.branches.A || 0, B: ef.branches.B || 0, C: ef.branches.C || 0 }, // v1.11 分支等级（实装状态）
        };
      });
      slots.push({
        key,
        name: CONFIG.COLORS[t.color].name,
        icon: TOWER_ICON[key] || '?',
        unlocked: true,
        level: run.expLevel,          // v1.8：整体等级（塔共享）
        exp: run.exp,
        expNeed: run.expNeed(),
        expRatio: run.expLevel > 0 ? Math.min(1, run.exp / run.expNeed()) : 0,
        dps: t.level > 0 ? eff.towerDps(key) : 0,
        atk: t.level > 0 ? Math.round(this.combat.shotDmg(key)) : 0,   // 单次攻击伤害（塔详情）
        interval: t.level > 0 ? this.combat.interval(key) : 0,         // 实际攻击间隔（含技能修正）
        ammo: t.ammo, ammoMax: CONFIG.GLOBAL_SKILL.ammoMax,            // v1.12 弹药（塔位条显示）
        skills,
      });
    }
    const enemyHp = this.enemies.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
    return {
      gold: run.gold,
      wave: run.wave,
      waveTime: this.waveTime,
      waveDuration: WAVE_DUR,
      state: this.state,
      anim: this.anim,
      waveClear: this.waveClear,
      lineHp: run.lineHp, lineMaxHp: CONFIG.LINE.hp,
      grid: run.board.grid,
      selected: this.selected || this.pickCell, // 滑动高亮 / 点击选中高亮
      towers: slots,
      synergies: eff.synergyStatus(),
      synDoneCount: eff.synergyDone.filter(Boolean).length,
      enemyCount: this.enemies.length + this.wave.plan.length,
      hasBoss: this.wave.hasBoss,
      enemyHpRatio: this.wave.enemyTotalHp > 0 ? enemyHp / this.wave.enemyTotalHp : 0,
      exp: run.exp, expNeed: run.expNeed(), expLevel: run.expLevel,   // v1.8：出怪区整体经验条
      expRatio: run.expLevel > 0 ? Math.min(1, run.exp / run.expNeed()) : 0,
      battleRelics: this.battleRelics || [],   // v1.9：本局获得的圣物（经验条下方图标展示）
      damageEnergy: run.damageEnergy, freezeEnergy: run.freezeEnergy,  // v1.12 全局技能能量（点）
      energyPerCell: CONFIG.GLOBAL_SKILL.energyPerCell,
    };
  }

  remainingPending(towerKey) {
    let n = 0;
    for (let i = this.pickIndex; i < this.pickQueue.length; i++) {
      if (this.pickQueue[i].tower === towerKey) n++;
    }
    return n;
  }

  /* ---------- 主界面状态 ---------- */
  menuState() {
    const m = this.meta;
    const keys = Object.keys(CONFIG.TOWERS).filter((k) => !CONFIG.TOWERS[k].p1);
    const towerName = (k) => (CONFIG.COLORS[CONFIG.TOWERS[k] && CONFIG.TOWERS[k].color] || {}).name || k;
    // 圣物卡片：仅展示已获取的（获取后才显示性能）；图鉴面板看全表
    const relics = CONFIG.RELIC.list.map((def) => {
      const owned = m.relicOwned(def.id);
      const lv = m.relicLevel(def.id);
      const cost = m.relicUpCost(def.id);
      return {
        id: def.id, name: def.name, icon: def.icon,
        owned,
        count: m.relicCount(def.id), level: lv,
        desc: def.desc(lv), descLv: def.desc(lv + 1),
        cost,
      };
    });
    const chestRemain = m.chestRemainSec(Date.now());
    const daily = m.ensureDailyPicks(Date.now());
    return {
      gold: m.gold,
      diamond: m.diamond,
      tab: this.menuTab,
      keys,
      towerName,
      towerUnlocks: m.towerUnlocks,
      relics,
      chests: m.chests,
      chestOpenSec: CONFIG.RELIC.chestOpenSec,
      chestRemain,
      chestOpening: !!m.chestTimer,
      daily,
      dailyPrice: CONFIG.DAILY.price,
      panel: this.menuPanel,
    };
  }

  /** 主界面触摸分发：命中 menuHits（渲染时重建）中第一个按键；面板打开时仅响应面板项 */
  onMenuTap(p) {
    if (this.menuPanel) {
      for (const it of this.menuHits) {
        // 面板打开时只响应 关闭
        if (it.key !== 'panelClose') continue;
        if (!it.hit(p.x, p.y)) continue;
        this.menuPanel = null;
        return;
      }
      return; // 面板打开时忽略底层按钮
    }
    for (const it of this.menuHits) {
      if (!it.hit(p.x, p.y)) continue;
      switch (it.key) {
        case 'tab':
          this.menuTab = it.data;
          this.menuPanel = null;
          return;
        case 'stage':
          this.toast('战场：远古战场（仅此一种）· 奖励已按当前配置', '#7cd6a6');
          return;
        case 'enter':
          this.menuPanel = null;
          this.newRun(true);
          return;
        case 'relicDex':
          // 圣物图鉴：查看全部圣物图标（未获取锁定，获取后显示性能）
          this.menuPanel = { type: 'relicDex' };
          return;
        case 'dailyPick': {
          // 每日精选圣物卡（金币购买）
          const d = it.data;
          if (this.meta.gold < d.price) { this.toast('金币不足', '#ff6b6b'); return; }
          this.meta.gold -= d.price;
          this.meta.addRelic(d.relic);
          this.run.gold = this.meta.gold;
          this.save.save();
          this.toast(`精选圣物 ${d.icon}${d.name} +1`, '#7ef0a3');
          return;
        }
        case 'dailyAd': {
          // 每日精选圣物卡（看广告免费领）
          const d = it.data;
          this.playRewardedAd(() => {
            this.meta.addRelic(d.relic);
            this.save.save();
            this.toast(`广告奖励圣物：${d.icon}${d.name} +1`, '#7ef0a3');
          }, '广告未配置，先用金币购买吧');
          return;
        }
        case 'adCard': {
          this.playRewardedAd(() => {
            const got = this.meta._randomRelicReward();
            this.save.save();
            this.toast(`广告奖励圣物：${got.icon}${got.name} +1`, '#7ef0a3');
          }, '广告未配置');
          return;
        }
        case 'diamondChest': {
          if (this.meta.diamond < CONFIG.DIAMOND.chestPrice) { this.toast('钻石不足（充值后续开放）', '#ff6b6b'); return; }
          this.meta.diamond -= CONFIG.DIAMOND.chestPrice;
          this.meta.chests += 1;
          this.save.save();
          this.toast('钻石兑换宝箱 📦', '#7ef0a3');
          return;
        }
        case 'diamondGold': {
          if (this.meta.diamond < 1) { this.toast('钻石不足（充值后续开放）', '#ff6b6b'); return; }
          this.meta.diamond -= 1;
          this.meta.gold += CONFIG.DIAMOND.goldPrice;
          this.run.gold = this.meta.gold;
          this.save.save();
          this.toast(`钻石兑换 ${CONFIG.DIAMOND.goldPrice} 金币`, '#7ef0a3');
          return;
        }
        case 'recharge':
          this.toast('充值功能开发中，敬请期待', '#9fb2c3');
          return;
        case 'relicUp': {
          const res = this.meta.upgradeRelic(it.data);
          if (res.ok) {
            this.run.gold = this.meta.gold;
            this.save.save();
            this.toast(`圣物升级 Lv${res.level}`, '#7ef0a3');
          } else if (res.reason === 'relic') {
            this.toast('升级需 1 个同名圣物', '#ff6b6b');
          } else {
            this.toast('金币不足', '#ff6b6b');
          }
          return;
        }
        case 'chest': {
          const m = this.meta;
          if (m.chestTimer) { this.toast(`宝箱开启中 ${m.chestRemainSec(Date.now())}s`, '#9fb2c3'); return; }
          const res = m.startChest(Date.now());
          if (res.ok) {
            this.save.save();
            this.toast(`宝箱开启中 ${CONFIG.RELIC.chestOpenSec}s`, '#f7c948');
          } else if (res.reason === 'none') {
            this.toast('暂无宝箱（Boss 掉落）', '#9fb2c3');
          }
          return;
        }
        default:
          return;
      }
    }
  }

  /** 圣物宝箱三选一：选择一项 → 获取圣物，回战斗；队列清空后检查升级待选 */
  relicPickChoice(i) {
    const c = this.relicPick && this.relicPick.candidates[i];
    if (!c) return;
    this.meta.addRelic(c.id);
    this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name }); // v1.9：本局圣物展示
    this.save.save();
    this.toast(`获得圣物 ${c.icon}${c.name}`, '#f7c948');
    this.relicPick = null;
    this.state = 'fighting';
    if (this.pendingRelicPicks.length) return; // 还有宝箱：下帧继续弹
    if (this.run.effects.pendingTotal() > 0) this.flushUpgrades(); // 顺带处理升级待选
  }

  /** 激励视频广告：配置广告位后播放，完整观看回调发奖；未配置/失败时提示 */
  playRewardedAd(onReward, noAdMsg) {
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd || !CONFIG.AD_REWARD.rewardedId) {
      this.toast(noAdMsg || '广告未配置', '#9fb2c3');
      return;
    }
    try {
      if (!this._rewardedAd) {
        this._rewardedAd = wx.createRewardedVideoAd({ adUnitId: CONFIG.AD_REWARD.rewardedId });
        this._rewardedAd.onClose((res) => {
          if (res && res.isEnded) onReward();
          else this.toast('需完整观看广告', '#9fb2c3');
        });
        this._rewardedAd.onError(() => { this.toast('广告加载失败', '#ff6b6b'); });
      }
      this._rewardedAd.show().catch(() => {
        if (this._rewardedAd.load) this._rewardedAd.load().then(() => this._rewardedAd.show()).catch(() => {});
      });
    } catch (e) {
      this.toast('广告未配置', '#9fb2c3');
    }
  }

  /* ---------- 触摸 ---------- */
  bindTouch() {
    const c = _c; // 获取到的主画布（可能是 wx.createCanvas() 返回）
    let startCell = null, lastCell = null;
    this.pickCell = null; // 点击交换：当前选中格（渲染高亮，直到下次点击/滑动）
    let moved = false;    // 是否已发生滑动（点击 vs 滑动判定）
    // 触摸处理（wx 全局通道与 canvas 事件通道共用；坐标在 toLogic 内做自适应归一化）
    const onStart = (e) => {
      const t = e && e.touches && e.touches[0];
      if (!t) return;
      const p = this.toLogic(t.clientX, t.clientY);
      // 主界面：分页 / 进入战斗 / 技能搭配 / 圣物配置 / 商店 / 圣物升级 / 宝箱
      if (this.state === 'menu') {
        this.onMenuTap(p);
        return;
      }
      // 塔详情弹层打开中：点关闭/遮罩关闭
      if (this.towerInfo) {
        const h = this.towerInfoHits;
        if (h.close && h.close.hit(p.x, p.y)) { this.towerInfo = null; return; }
        if (h.bg && h.bg.hit(p.x, p.y)) { this.towerInfo = null; return; }
        return; // 面板内点击不处理其它
      }
      // 底部功能弹层打开中：清档确认 / 返回主界面 / 关闭 / 遮罩关闭
      if (this.funcLayer) {
        const h = this.funcLayerHits;
        if (this.funcLayer.type === 'setting' && h.confirm && h.confirm.hit(p.x, p.y)) {
          if (this.funcLayer.confirming) {
            this.save.clear();
            this.saveData = null;
            this.meta = this.save.applyMeta(null);
            this.funcLayer = null;
            this.goMenu();
            this.toast('已清档', '#7ef0a3');
          } else {
            this.funcLayer.confirming = true;
          }
          return;
        }
        // 设置弹层底部按钮 =「返回主菜单」；其它弹层 =「关闭」
        if (h.close && h.close.hit(p.x, p.y)) {
          if (this.funcLayer.type === 'setting') this.goMenu();
          else this.funcLayer = null;
          return;
        }
        if (h.bg && h.bg.hit(p.x, p.y)) { this.funcLayer = null; return; }
        return; // 面板内点击不处理其它
      }
      // 底部功能键区：打开对应弹层
      if (this.funcHits.length) {
        for (const f of this.funcHits) {
          if (f.hit(p.x, p.y)) {
            this.funcLayer = { type: f.key, version: GAME_VERSION };
            return;
          }
        }
      }
      startCell = this.cellAt(p);
      lastCell = startCell;
      this.selected = startCell;
      this.swapped = false;
      moved = false;
      this._touchStart = { x: p.x, y: p.y };
      // 战斗中点全局技能按钮 → 释放技能（v1.12：左=全局伤害，右=全局冰冻）
      if (this.state === 'fighting') {
        const btns = this.renderer.globalBtns || [];
        for (const b of btns) {
          if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
            this.combat.castGlobal(b.key);
            return;
          }
        }
      }
      // 战斗中点塔位图标 → 查看技能/等级
      if (this.state === 'fighting') {
        const si = this.towerSlotAt(p);
        const slot = this.sceneState().towers[si] || null;
        if (si >= 0 && slot) {
          this.towerInfo = { ...slot, slotIdx: si };
          return;
        }
      }
      // 波次结束弹窗：点「继续」→ 三选一 / 下一波
      if (this.state === 'waveclear') {
        if (this.waveClearBtn.hit && this.waveClearBtn.hit(p.x, p.y)) this.waveClearNext();
        return;
      }
      // 弹层按钮判定
      if (this.state === 'picking') {
        const group = this.pickQueue[this.pickIndex];
        if (!group || !group.candidates || !group.candidates.length) return;
        for (let i = 0; i < group.candidates.length; i++) {
          if (this.pickHits[i] && this.pickHits[i].hit(p.x, p.y)) {
            const res = this.run.applyChoice(group.tower, group.candidates[i]);
            if (res.ok) {
              const cd = group.candidates[i];
              const nm = cd.name;
              const actTxt = cd.type === 'branch' ? `${nm}·分支${cd.branch} 强化` : (res.activated ? `激活技能：${nm}` : `替换特效：${nm}`);
              this.toast(actTxt, '#7ef0a3');
              this.nextPick();
            }
            return;
          }
        }
      }
      // 圣物宝箱三选一弹层：点候选 → 获取该圣物
      if (this.state === 'relicpick') {
        if (!this.relicPick || !this.relicPick.candidates) return;
        for (let i = 0; i < this.relicPick.candidates.length; i++) {
          if (this.relicPickHits[i] && this.relicPickHits[i].hit(p.x, p.y)) {
            this.relicPickChoice(i);
            return;
          }
        }
        return;
      }
      if (this.state === 'gameover') {
        if (this.restartBtn.hit && this.restartBtn.hit(p.x, p.y)) { this.restart(); return; }
        if (this.restartBtn.toMenu && this.restartBtn.toMenu.hit(p.x, p.y)) { this.goMenu(); return; }
      }
    };
    const onMove = (e) => {
      if (this.towerInfo) return; // 详情弹层打开时锁定交换
      if (this.funcLayer) return; // 功能弹层打开时锁定交换
      if (this.state !== 'fighting' || !startCell || this.swapped) return;
      if (this.anim) return; // 三消动画进行中锁定交换
      const t = e && e.touches && e.touches[0];
      if (!t) return;
      const p = this.toLogic(t.clientX, t.clientY);
      // 移动超过阈值视为滑动手势：取消点击选中，进入滑动交换
      if (this._touchStart && Math.hypot(p.x - this._touchStart.x, p.y - this._touchStart.y) > 8) {
        moved = true;
        this.pickCell = null;
      }
      const cell = this.cellAt(p);
      if (!cell) return;
      const [r1, c1] = startCell, [r2, c2] = cell;
      const adjacent = Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
      if (adjacent && (!lastCell || lastCell[0] !== r2 || lastCell[1] !== c2)) {
        if (this.match3.trySwap(r1, c1, r2, c2)) {
          startCell = cell; // 有效交换：锁定起点，动画结束后可再操作
        } else {
          startCell = cell; // 无效交换：从新格继续滑动
        }
      }
      lastCell = cell;
    };
    const onEnd = () => {
      // 点击交换：无滑动 + 战斗态 + 无动画 → 选中/交换/取消
      if (!moved && startCell && this.state === 'fighting' && !this.anim && !this.swapped) {
        const [r, c] = startCell;
        if (this.pickCell) {
          const [pr, pc] = this.pickCell;
          if (pr === r && pc === c) {
            this.pickCell = null; // 点同一格：取消选中
          } else if (Math.abs(pr - r) + Math.abs(pc - c) === 1) {
            this.match3.trySwap(pr, pc, r, c); // 相邻：点击交换
            this.pickCell = null;
          } else {
            this.pickCell = startCell; // 不相邻：重选
          }
        } else {
          this.pickCell = startCell; // 首次点击：选中
        }
      }
      if (this.state !== 'fighting') this.pickCell = null; // 非战斗态点击结束清选中
      startCell = null; lastCell = null;
      this.selected = null;
      moved = false;
      this._touchStart = null;
    };
    // 真机/官方推荐通道：wx 全局触摸事件（坐标=逻辑像素，与 windowWidth 同尺度）。
    // 小游戏主画布 canvas.addEventListener 在真机非同层渲染下可能不派发触摸事件，
    // 且其坐标可能为 canvas 物理像素系；故优先使用 wx 通道，canvas 仅作回退。
    if (typeof wx !== 'undefined' && wx.onTouchStart) {
      try {
        wx.onTouchStart(onStart);
        wx.onTouchMove(onMove);
        wx.onTouchEnd(onEnd);
        return;
      } catch (e) { /* 回退 canvas 通道 */ }
    }
    if (!c || !c.addEventListener) return;
    c.addEventListener('touchstart', onStart);
    c.addEventListener('touchmove', onMove);
    c.addEventListener('touchend', onEnd);
  }

  toast(text, color) {
    this.toasts.push({ text, color, ttl: 1.8 });
  }

  toLogic(cx, cy) {
    // 真机坐标单位自适应：wx 全局触摸事件为逻辑像素（与 windowWidth 同尺度）；
    // canvas 事件的坐标则可能是 canvas 物理像素（宽 = windowWidth×pixelRatio）。
    // 用坐标范围判定坐标源，统一归一化到 [0,1] 再映射 750×1334 逻辑画布。
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const info = wx.getSystemInfoSync();
        const w = info.windowWidth || info.screenWidth;
        const h = info.windowHeight || info.screenHeight;
        if (w > 0 && h > 0) {
          const cw = (_c && _c.width) || 0;
          const ch = (_c && _c.height) || 0;
          if (cw > 0 && cx > w) { // 坐标超出逻辑宽 → 按 canvas 物理像素归一化
            return { x: cx * LOGIC_W / cw, y: cy * LOGIC_H / (ch || cw) };
          }
          return { x: cx * LOGIC_W / w, y: cy * LOGIC_H / h };
        }
      } catch (e) {}
    }
    return { x: cx / this.scale, y: cy / this.scale };
  }

  /** 塔位命中检测：返回槽位索引（-1=不在塔位区） */
  towerSlotAt(p) {
    const { slotSize, slotGap, slotCount, slotY } = this.ly;
    const total = slotCount * slotSize + (slotCount - 1) * slotGap;
    const x0 = (750 - total) / 2;
    for (let i = 0; i < slotCount; i++) {
      const sx = x0 + i * (slotSize + slotGap);
      if (p.x >= sx && p.x <= sx + slotSize && p.y >= slotY && p.y <= slotY + slotSize) return i;
    }
    return -1;
  }

  cellAt(p) {
    const { boardX, boardY, cell, boardRows, boardCols } = this.ly;
    const c = Math.floor((p.x - boardX) / cell);
    const r = Math.floor((p.y - boardY) / cell);
    if (r >= 0 && r < boardRows && c >= 0 && c < boardCols) return [r, c];
    return null;
  }
}

module.exports = GameMain;
if (ctx) GameGlobal.game = new GameMain();
