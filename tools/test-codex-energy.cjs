/** 图鉴费用回归：比对六塔真实出手的收费请求，并检查周期/命中技能分类和绘制。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const CONFIG = require('../js/config.js');
const SKILLS = require('../js/config/tower-skills.js');
const { skillEnergy } = require('../js/game/codex-energy.js');
const { createCodexScreen } = require('../js/game/screens/codex.js');
const fixture = require('./tower-balance-fixture.cjs');
const close = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

try {
  let launches = 0;
  for (const [key, skills] of Object.entries(SKILLS)) {
    for (const [name, definition] of Object.entries(skills)) {
      if (definition.attackEnergyFactor == null) continue;
      for (const branch of ['A', 'B', 'C']) {
        for (let rank = 0; rank <= 3; rank++) {
          const reference = skillEnergy(key, name, branch, rank);
          for (const full of [false, true]) {
            const w = fixture.setup(key, [[name, branch]], rank, 'dense', 41);
            const muzzle = w.combat.towerMuzzle(key);
            for (const enemy of w.game.enemies) { enemy.x = muzzle.x; enemy.y = muzzle.y - 100; }
            w.tower.energy = w.run.armoryEnergyMax(key) * (full ? 1 : 0.2);
            let requested;
            const spend = w.run.spendAttackEnergy;
            w.run.spendAttackEnergy = function(tower, fee) {
              requested = fee;
              return spend.call(this, tower, fee);
            };
            w.combat.attackOnce(key);
            close(requested, full ? reference.max : reference.min);
            launches++;
          }
        }
      }
    }
  }

  // 从真实施放路径核对分类，旧费用表里的活电/风痕不能误显示为付费周期技。
  for (const [key, pool] of Object.entries(CONFIG.EFFECT_POOLS)) {
    const source = fs.readFileSync(path.join(__dirname, '../js/combat/towers', key + '.js'), 'utf8');
    const periodic = new Set([...source.matchAll(/castEnergy\('[^']+', '([^']+)'\)/g)].map(match => match[1]));
    for (const skill of pool) {
      const cost = skillEnergy(key, skill.name);
      assert.equal(cost.kind === 'cast', periodic.has(skill.name), `${key}/${skill.name} 施放分类`);
      if (cost.kind === 'cast') close(cost.min, CONFIG.SKILL_ENERGY[skill.name]);
    }
  }
  close(skillEnergy('fire', '多重火球').min, 0.616);
  close(skillEnergy('cannon', '重炮').min, 1.76);
  assert.equal(skillEnergy('electric', '活电').label, '无额外耗能');
  assert.equal(skillEnergy('boomerang', '风痕').label, '无额外耗能');
  assert.equal(skillEnergy('electric', '电磁过载', 'C', 3).amount, '0.4–0.52');
  assert.equal(skillEnergy('cannon', '军火库', 'C', 3).amount, '0.8–1.04');

  // 运行真实图鉴绘制，检查卡片/详情均使用新费用且分支费用行未溢出。
  let labels = [];
  const measure = (value, size) => [...String(value)].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? size : size * 0.58), 0);
  const fontSize = font => Number(font.match(/([\d.]+)px/)[1]);
  const ctx = new Proxy({
    font: '20px sans-serif',
    fillText(value, x, y) { labels.push({ value: String(value), x, y, size: fontSize(this.font) }); },
    measureText(value) { return { width: measure(value, fontSize(this.font)) }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const screen = createCodexScreen({
    drawImg: () => true, skillIconSrc: () => '', drawTowerGlyph() {},
    IMG_SRC: {}, TOWER_HEX: {}, MENU_TAB_THEME: { codex: {} },
    lighten: () => '', hexA: () => '',
    wrapText(_ctx, value, width, size) {
      const lines = [''];
      for (const ch of String(value)) {
        if (measure(lines[lines.length - 1] + ch, size) > width) lines.push('');
        lines[lines.length - 1] += ch;
      }
      return lines;
    },
  });
  for (const [key, pool] of Object.entries(CONFIG.EFFECT_POOLS)) {
    labels = [];
    screen.menuCodex(ctx, { codexSel: key, towerCodex: { [key]: 1 } }, () => {});
    for (const skill of pool) assert(labels.some(item => item.value === `⚡${skillEnergy(key, skill.name).label}`));
    for (const item of labels.filter(item => item.value.startsWith('⚡') && !item.value.includes('基础'))) {
      assert(measure(item.value, item.size) <= 190, `${item.value} 卡片费用越界`);
    }
    for (let idx = 0; idx < pool.length; idx++) {
      labels = [];
      screen.codexSkillPanel(ctx, { panel: { tower: key, idx } }, () => {});
      const energy = skillEnergy(key, pool[idx].name);
      assert(labels.some(item => item.value.includes(`⚡${energy.label}`)));
      if (energy.kind === 'attack') {
        const rows = labels.filter(item => item.value.startsWith('耗能：'));
        assert.equal(rows.length, 3);
        for (const row of rows) assert(measure(row.value, row.size) <= 530, `${row.value} 分支费用越界`);
      }
    }
  }
  console.log(`PASS ${launches} real attack fees; all 48 skill classifications and codex card/detail rendering.`);
} finally {
  fixture.restore();
}
