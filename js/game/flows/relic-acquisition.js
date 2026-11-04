const PickReroll = require('../../economy/pick-reroll.js');
// Workflow methods run on the current GameMain host; no game state is cached here.
const CONFIG = require('../../config.js');
const RelicKill = require('../../relics/kill-hooks.js');
const GS_BALANCE = require('../../config/global-balance.js');

module.exports = {
  onKillReward(e) {
    // v1.14 测试战场：无击杀奖励（不涨经验/不掉宝箱，专注技能验证）
    if (this.state === 'testfield') return;
    const b = this.meta.relicBonus();
    // 经验：整体经验池（v1.8：塔不再单独获取经验，统一按整体等级成长）；v1.16.78 经验之心：击杀经验 +N%（按星级）
    RelicKill.experience(this.run, e, b);
    // v1.12.1：战斗中击杀只积累升级待选（pending），不弹三选一打断战斗；
    // 升级三选一统一在波末「波次完成 → 继续」时结算（v1.8 设计：波末逐次结算）
    // 精英怪：概率掉落战场宝箱（寻宝罗盘加成；v1.16.78 赏金猎人 +N%）；v1.16.96 赏金猎人3★ 连续3波无宝箱必掉
    if (e.type === 'elite') {
      const chance = RelicKill.eliteChestChance(this.run, b);
      if (Math.random() < chance) {
        this.fieldChests.push({ x: e.x, y: e.y, t: 0, kind: 'elite' });
        this.run._waveChestDropped = true;
        this.toast('精英宝箱 · 消除棋盘相邻方块领取', '#f7c948');
      }
    }
    // Boss：掉落战场宝箱（棋盘相邻消除领取）+ 主界面宝箱计数（每 5 波）
    if (e.isBoss) {
      const waveNo = e.waveNo || this.run.wave || 0;
      const majorBoss = waveNo > 0 && waveNo % 20 === 0;
      const bountyMult = 1 + this.run.relicNum('s_sr_cm_bounty') / 100;
      const chestChance = Math.min(1, (majorBoss ? CONFIG.KILL_DROP.majorBossChestChance : CONFIG.KILL_DROP.miniBossChestChance) * bountyMult);
      const fieldChestDropped = !e.isFinalBoss && Math.random() < chestChance;
      if (fieldChestDropped) {
        this.fieldChests.push({ x: e.x, y: e.y, t: 0, kind: majorBoss ? 'majorBoss' : 'miniBoss' });
        this.run._waveChestDropped = true;
        this.toast(majorBoss ? '大Boss宝箱 · 消除棋盘相邻方块领取' : '小Boss宝箱 · 消除棋盘相邻方块领取', '#f7c948');
      }
      this.meta.chests += 1; // Boss 进度奖励计入主界面宝箱，与战斗宝箱概率独立
      if (e.isFinalBoss) this.toast('终极Boss宝箱已存入主界面', '#f7c948');
      this.save.save();
    }
    /* 碎片独立掉落表：精英5%×1；小Boss20%×2~4；大Boss保底2，另50%×3~6。 */
    const field = this.field || CONFIG.FIELDS.ancient;
    if (field.dropAttr && field.dropAttr !== 'none') {
      const KD = CONFIG.KILL_DROP;
      let n = 0;
      const waveNo = e.waveNo || this.run.wave || 0;
      const majorBoss = !!e.isBoss && waveNo > 0 && waveNo % 20 === 0;
      if (e.type === 'elite' && Math.random() < KD.eliteShardChance) n = 1;
      if (e.isBoss && majorBoss) {
        n = KD.majorBossShardBase;
        if (Math.random() < KD.majorBossShardBonusChance) n += KD.majorBossShardBonusMin + Math.floor(Math.random() * (KD.majorBossShardBonusMax - KD.majorBossShardBonusMin + 1));
      } else if (e.isBoss && Math.random() < KD.miniBossShardChance) {
        n = KD.miniBossShardMin + Math.floor(Math.random() * (KD.miniBossShardMax - KD.miniBossShardMin + 1));
      }
      if (n > 0) {
        const id = CONFIG.randomShardId(field.dropAttr);
        if (id) {
          // v1.17.20 碎片改「局内记账 → 局末入账」：此处不再直接 meta.addShard，
          //   否则失守时无法按 30% 折算收回（详见 settleRunShards）
          this.runShardGained += n;
          this.runShardDetail[id] = (this.runShardDetail[id] || 0) + n;   // v1.17 碎片明细（击杀掉落）
          this.toast(`🧩 圣遗物碎片 +${n}（局末结算）`, '#a86bff');
        }
      }
      // v1.17 击杀银币：单怪 (5~10 浮动) × 代际等级系数（Lv1=1，50波平均≈2倍）× 类型倍率（精英×3/Boss×8）× 战场银币倍率
      // 替代旧 1.06^w 波次通胀：收益成长改由怪物代际等级驱动（与血量曲线同源）
      const kg = Math.round((KD.killGold[0] + Math.random() * (KD.killGold[1] - KD.killGold[0]))
        * KD.goldLevelMult(e.genLv)
        * (e.isBoss ? KD.bossGoldMult : (e.type === 'elite' ? KD.eliteGoldMult : 1))
        * (field.goldMult || 1));
      const earned = kg * (this.run.gsState && this.run.gsState.gold > 0 ? GS_BALANCE.gold.multiplier : 1);
      this.run.gold += earned;
      if (earned > kg) this.fx.push({type:'floatText',text:'+'+earned,x:e.x,y:e.y,t:0,dur:0.8,size:20,color:'#ffe17c'});
    }
  },

  _relicRunTotal() {
    let n = 0;
    Object.values(CONFIG.RELIC_RUN.tower).forEach((l) => { n += l.length; });
    return n + CONFIG.RELIC_RUN.common.length + (CONFIG.RELIC_RUN.ur || []).length;
  },

  spawnRelicPick(mode) {
    const star3Mode = mode === 'star3';
    const cands = this._rollRelicCandidates(star3Mode);
    if (star3Mode && (!cands || !cands.length)) {
      this.toast('尚未拥有任何圣遗物，先解锁 1 个再来测试 3★', '#9fb2c3'); this._chestBusy = false; return;
    }
    if (!star3Mode && (!cands || !cands.length)) {
      this.toast('当前没有可用圣遗物候选', '#9fb2c3');
      this._chestBusy = false;
      return;
    }
    this.pendingRelicPicks.push({ candidates: cands, ...(star3Mode ? { star3: true } : {}) });
    this._chestBusy = false; // v1.16.74 动画完成解锁战斗输入
  },

  _rollRelicCandidates(star3Mode) {
    const RR = CONFIG.RELIC_RUN;
    const star3 = !!star3Mode;
    // 在场塔（本局已激活的塔色）+ 通用池；候选带 tint（塔色/金色）供弹层圆底配色
    const ownedKeys = this.run.slotOrder || [];
    const meta = this.meta;
    // 宝箱负责本局圣遗物构筑；已解锁与未解锁圣遗物均可进入候选池。碎片只由Boss击杀线发放。
    let pool = [];
    if (star3) {
      ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: k }); }); });
      RR.common.forEach((d) => { if (meta.starOf(d.id) >= 1) pool.push({ def: d, tint: 'common' }); });
      if (!pool.length) return null;
      // 3★ 模式：候选 = 已拥有池中随机 3 张（不重复），desc 取 star3
      const cands3 = [];
      const used3 = new Set();
      for (let i = 0; i < 3; i++) {
        const tier = pool.filter((p) => !used3.has(p.def.id));
        if (!tier.length) break;
        const pick = tier[Math.floor(Math.random() * tier.length)];
        used3.add(pick.def.id);
        cands3.push({ id: pick.def.id, name: pick.def.name, icon: pick.def.icon, desc: pick.def.star3 || pick.def.desc, run: true, tint: pick.tint });
      }
      return cands3;
    }
    ownedKeys.forEach((k) => { if (RR.tower[k]) RR.tower[k].forEach((d) => { pool.push({ def: d, tint: k }); }); });
    RR.common.forEach((d) => { pool.push({ def: d, tint: 'common' }); });
    if (!pool.length) return null;
    // 稀有度权重：依次抽 3 个稀有度，每个稀有度随机抽 1 张（已用不重复；稀有度无剩余时从全池补）
    const W = CONFIG.RELIC_PICK_WEIGHT;
    const promote = (rar) => {
      if (!this.run.relic3('s_sr_cm_bounty')) return rar;
      return rar === 'r' ? 'sr' : rar === 'sr' ? 'ssr' : rar;
    };
    const pickRar = () => promote((() => { const r = Math.random(); return r < W.r ? 'r' : r < W.r + W.sr ? 'sr' : 'ssr'; })());
    const cands = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const rar = pickRar();
      let tier = pool.filter((p) => CONFIG.relicRarity(p.def.id) === rar && !used.has(p.def.id));
      if (!tier.length) tier = pool.filter((p) => !used.has(p.def.id));
      if (!tier.length) break;
      const pick = tier[Math.floor(Math.random() * tier.length)];
      used.add(pick.def.id);
      cands.push({ id: pick.def.id, name: pick.def.name, icon: pick.def.icon, desc: pick.def.desc, run: true, tint: pick.tint });
    }
    return cands;
  },

  rerollRelicPick() {
    if (!this.relicPick) return false;
    const res = PickReroll.reroll(this.run, () => this._rollRelicCandidates(!!this.relicPick.star3));
    if (!res.ok) { this.toast(res.reason === 'gold' ? '银币不足（需' + res.cost + '）' : '暂无可用候选', '#ffb480'); return false; }
    const cost = res.cost;
    this.relicPick.rerolls = (this.relicPick.rerolls || 0) + 1;
    this.relicPick.candidates = res.result;
    this.relicPickHits = []; // 命中区随候选刷新
    this.toast(`已重掷 · 消耗 ${cost} 🪙`, '#f7c948');
    return true;
  },

  relicPickChoice(i) {
    const c = this.relicPick && this.relicPick.candidates[i];
    if (!c) return;
    if (c.run) {
      // 局内圣遗物（rougelike）：本局生效 + 图鉴解锁（跨局记录）
      this.runRelics.push(c.id);
      this.run.runRelic[c.id] = (this.run.runRelic[c.id] || 0) + 1;
      const wasLocked = this.meta.starOf(c.id) < 1;   // v1.17.20 记录「本局选中即解锁」，失败折算不回退
      this.meta.codexUnlock(c.id);
      if (wasLocked) this.runUnlocked.push(c.id);
      // v1.16.113 记录 3★ 生效标记：测试战场 3★ 注入 或 真实已升 3★
      const isStar3 = (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) || this.meta.starOf(c.id) >= 3;
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: isStar3 }); // v1.16.73 详情弹层需要 desc
      this.save.save();
      this.toast(isStar3 && this._relicReturnState === 'testfield' ? `★3 质变注入：${c.icon}${c.name}` : '获得圣遗物 ' + c.icon + c.name, '#ffb347');
    } else {
      this.meta.addRelic(c.id);
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: this.meta.starOf(c.id) >= 3 }); // v1.9：本局圣物展示；v1.16.73 带 desc
      this.save.save();
      this.toast('获得圣物 ' + c.icon + c.name, '#f7c948');
      this.run.relicFx(c.id, '已生效'); // v1.17 圣遗物生效提示（★星级 + 名称 + 圣遗物色）
    }
    this.relicPick = null;
    // v1.16.104 测试战场 3★ 模式：选中圣遗物按 3★ 质变注入（无需真实 3★ 解锁）
    if (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) {
      this.run._testStar3Mode = true;
      this.run._testStar3 = this.run._testStar3 || {};
      this.run._testStar3[c.id] = true;
    }
    this._lastPickStar3 = false;
    // v1.16.73 返回来源状态（测试战场添加圣遗物 → 回到 testfield；战场宝箱 → fighting）
    this.state = this._relicReturnState || 'fighting';
    this._relicReturnState = null;
    if (this.pendingRelicPicks.length) return; // 还有宝箱：下帧继续弹
    if (this.state === 'fighting' && this.run.effects.pendingTotal() > 0) this.flushUpgrades(); // 顺带处理升级待选
  }
};
