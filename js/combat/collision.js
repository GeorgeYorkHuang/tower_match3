'use strict';
const CONFIG = require('../config.js');
const enemySize = require('../enemy-size.js');
// 普通怪保留原中心容差；Boss增加与显示同步的圆形体积。
function bodyRadius(enemy) { return enemy.isBoss ? enemySize(enemy, CONFIG.LAYOUT.enemy) / 2 : 0; }
function reach(enemy, skillRadius) { return skillRadius + bodyRadius(enemy); }
module.exports = { bodyRadius, reach };
