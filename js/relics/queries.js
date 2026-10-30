// 圣遗物查询接口；以配置上下文作为 this，不依赖主循环或渲染。
'use strict';
module.exports = {
  relicColor(id) {
    const T = { fire: '#e74c3c', ice: '#5dade2', poison: '#52be80', electric: '#f4d03f', boomerang: '#a569bd', cannon: '#b5651d' };
    for (const k in this.RELIC_RUN.tower) {
      if (this.RELIC_RUN.tower[k].some((d) => d.id === id)) return T[k];
    }
    return '#f7c948';
  },

  relicDef(id) {
    const RR = this.RELIC_RUN;
    for (const k in RR.tower) { const d = RR.tower[k].find((x) => x.id === id); if (d) return d; }
    return RR.common.find((x) => x.id === id) || null;
  },

  relicRarity(id) { return this.RELIC_RARITY[id] || 'r'; },

  relicAttr(id) {
    if (this.RELIC_ATTR.attack.includes(id)) return 'attack';
    if (id.startsWith('fire') || id.startsWith('cannon') || id.startsWith('boo')) return 'attack';
    return 'control';
  },

  randomShardId(attr) {
    const cats = Object.keys(this.RELIC_RUN.tower);
    let pool = [];
    if (attr === 'attack') pool = this.RELIC_RUN.tower.fire.concat(this.RELIC_RUN.tower.cannon, this.RELIC_RUN.tower.boomerang);
    else if (attr === 'control') pool = this.RELIC_RUN.tower.ice.concat(this.RELIC_RUN.tower.poison, this.RELIC_RUN.tower.electric);
    else {
      pool = [];
      cats.forEach((k) => { pool = pool.concat(this.RELIC_RUN.tower[k]); });
    }
    pool = pool.concat(this.RELIC_RUN.common);
    if (!pool.length) return null;
    // 稀有度加权：抽取目标稀有度后从池中筛
    const roll = Math.random(); const w = this.KILL_DROP.rarityWeight;
    const target = roll < w.ssr ? 'ssr' : roll < w.ssr + w.sr ? 'sr' : 'r';
    const tier = pool.filter((d) => this.relicRarity(d.id) === target);
    const pick = (tier.length ? tier : pool)[Math.floor(Math.random() * (tier.length ? tier.length : pool.length))];
    return pick.id;
  },

  randomShardCardId(rar, random = Math.random) {
    const pool = [];
    const push = (list) => list.forEach((d) => { if (this.relicRarity(d.id) === rar) pool.push(d.id); });
    Object.keys(this.RELIC_RUN.tower).forEach((k) => push(this.RELIC_RUN.tower[k]));
    push(this.RELIC_RUN.common);
    return pool.length ? pool[Math.floor(random() * pool.length)] : null;
  },

  relicRunDef(id) {
    const cats = this.RELIC_RUN.tower;
    for (const k in cats) {
      const d = cats[k].find((x) => x.id === id);
      if (d) return d;
    }
    return this.RELIC_RUN.common.find((x) => x.id === id) || null;
  },

  relicNum(id, star) {
    const d = this.relicRunDef(id);
    if (!d) return 0;
    const txt = (star >= 2 && d.star2) ? d.star2 : d.desc;
    let v = 0;
    const re = /([0-9]+(?:\.[0-9]+)?)/g; let mm;
    while ((mm = re.exec(txt || ''))) v = parseFloat(mm[1]);
    return v;
  },

  relicTowerKey(id) {
    const cats = this.RELIC_RUN.tower;
    for (const k in cats) {
      if (cats[k].find((x) => x.id === id)) return k;
    }
    return null;
  },

};
