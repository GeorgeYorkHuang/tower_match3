'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const L = CONFIG.LAYOUT;
// 仅根据棋盘/动画快照绘制，不执行匹配、补落、扫描交换或奖励结算。
function createBoardLayer({ drawImg, IMG_SRC, BOARD_IMG, COLOR_FILL, ChipSkin, subBlockGlyph, easeOutCubic }) {
  function board(ctx, grid, selected, anim, shake, theme, hint) {
    ChipSkin.preload();   // 底板与共用图案预载；数量由ChipSkin资源清单维护。
    const { boardX, boardY, cell, boardRows, boardCols } = this.ly;
    // v1.17.29 棋盘抖动：消除震动时整体随机微移（随进度渐弱）
    let shP = -1;
    if (shake && shake.t) {
      shP = (Date.now() - shake.t) / shake.dur;
      if (shP < 1) ctx.save();
    }
    if (shP >= 0 && shP < 1) {
      const amp = shake.amp * (1 - shP);
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }
    // 三消棋盘区背景图（浅色魔法石台）；加载失败回退深色底板
    if (!drawImg(ctx, IMG_SRC.boardBg, 0, boardY, 750, L.boardArea.h)) {
      fillRoundRect(ctx, boardX - 6, boardY - 6, boardCols * cell + 12, boardRows * cell + 12, 10, '#1a2028');
    }

    /* 阶段 1：交换动画——两个方块从各自旧位置滑向新位置，其余方块原位不动 */
    if(anim&&anim.phase==='scan') {
      const plan=anim.scan,base=(plan.scanBase||anim.base).map(row=>row.slice()),moving=[];
      for(const sw of plan.scanSwaps||[]) {
        const t=Math.max(0,Math.min(1,(anim.progress-(sw.column/boardCols))/0.08));
        if(t>=1){const [r,c]=sw.from,[rr,cc]=sw.to,v=base[r][c];base[r][c]=base[rr][cc];base[rr][cc]=v;}
        else if(t>0)moving.push({...sw,t});
      }
      for(let r=0;r<boardRows;r++)for(let c=0;c<boardCols;c++){
        let rr=r,cc=c;
        for(const sw of moving){if(sw.from[0]===r&&sw.from[1]===c){rr=r+(sw.to[0]-r)*sw.t;cc=c+(sw.to[1]-c)*sw.t;}else if(sw.to[0]===r&&sw.to[1]===c){rr=r+(sw.from[0]-r)*sw.t;cc=c+(sw.from[1]-c)*sw.t;}}
        if(base[r][c])this.drawCell(ctx,boardX+cc*cell+2,boardY+rr*cell+2,cell,base[r][c],r,c,selected);
      }
      const front=boardX+Math.min(1,anim.progress)*boardCols*cell;
      const beam=ctx.createLinearGradient(front-22,0,front+10,0);beam.addColorStop(0,'rgba(255,255,255,0)');beam.addColorStop(0.7,'rgba(255,255,255,0.6)');beam.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=beam;ctx.fillRect(Math.max(boardX,front-22),boardY,Math.min(32,boardX+boardCols*cell-Math.max(boardX,front-22)),boardRows*cell);
      ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(front,boardY);ctx.lineTo(front,boardY+boardRows*cell);ctx.stroke();
      if(shP>=0&&shP<1)ctx.restore();return;
    }
    if (anim && anim.phase === 'swap') {
      const t = easeOutCubic(Math.min(1, anim.progress));
      const [r1, c1, r2, c2] = anim.swap;
      const g0 = anim.base || anim.swapGrid; // 交换后、尚未消除的棋盘
      const px = (r, c) => boardX + c * cell + 2;
      const py = (r, c) => boardY + r * cell + 2;
      for (let r = 0; r < boardRows; r++) {
        for (let c = 0; c < boardCols; c++) {
          const color = g0[r][c];
          if (!color) continue;
          let x = px(r, c), y = py(r, c);
          if (r === r1 && c === c1) { // 从 (r2,c2) 滑向 (r1,c1)
            x = px(r2, c2) + (x - px(r2, c2)) * t;
            y = py(r2, c2) + (y - py(r2, c2)) * t;
          } else if (r === r2 && c === c2) {
            x = px(r1, c1) + (x - px(r1, c1)) * t;
            y = py(r1, c1) + (y - py(r1, c1)) * t;
          }
          this.drawCell(ctx, x, y, cell, color, r, c, selected);
        }
      }
      if (hint && hint.length === 2 && !anim) {
      const pulse = 0.62 + 0.3 * Math.sin(Date.now() / 220);
      ctx.save(); ctx.globalAlpha = pulse; ctx.lineWidth = 4; ctx.strokeStyle = '#fff2a1';
      hint.forEach(([hr,hc]) => strokeRoundRect(ctx, boardX + hc * cell + 3, boardY + hr * cell + 3, cell - 6, cell - 6, 11, '#fff2a1', 4));
      ctx.globalAlpha = pulse * 0.75; ctx.strokeStyle = '#ffd34d';
      const ax = boardX + (hint[0][1] + hint[1][1] + 1) * cell / 2;
      const ay = boardY + (hint[0][0] + hint[1][0] + 1) * cell / 2;
      ctx.beginPath(); ctx.arc(ax, ay, cell * 0.13, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (shP >= 0 && shP < 1) ctx.restore();
      return;
    }

    /* 阶段 2：消除（0.5s 串行段）→ 下落（0.4s 串行段）——v5.6.3 拆分为两段：消除格在 clear 段全程淡出缩小，下落补位在 fall 段匀速滑落 */
    const g0 = (anim && (anim.base || anim.swapGrid)) ? (anim.base || anim.swapGrid) : grid; // 本级下落前棋盘
    const g1 = (anim && anim.final) ? anim.final : grid;                                    // 本级下落后棋盘
    if (anim && anim.phase === 'clear') {
      const fade = Math.min(1, anim.progress);   // v5.6.3 消除段 0.5s 全程淡出（原 progress/0.35）
      if (fade < 1) {
        for (let r = 0; r < boardRows; r++) {
          for (let c = 0; c < boardCols; c++) {
            if (!anim.cleared.has(r + ',' + c)) continue;
            const color = g0[r][c];
            if (!color || color.s === 'chest') continue;
            const cBase = (typeof color === 'object') ? (color.c || null) : color;   // v5.2 特殊块
            const x = boardX + c * cell + 2, y = boardY + r * cell + 2;
            const sz = (cell - 4) * (1 - fade * 0.35);
            const inset = (cell - 4 - sz) / 2;
            ctx.globalAlpha = 1 - fade;
            // v1.17.44 淡出层同样两层绘制，特殊块不会在消除瞬间「变回」普通块
            const isObjF = typeof color === 'object';
            const bcF = isObjF ? ChipSkin.baseColorOf(color) : cBase;
            if (drawImg(ctx, ChipSkin.BASES[bcF], x + inset, y + inset, sz, sz)) {
              const glyphF = isObjF ? ChipSkin.specialSrc(color) : ChipSkin.normalSrc(bcF);
              if (isObjF && color.s === 'split' && color.sub) subBlockGlyph(ctx, x + inset + sz / 4, y + inset + sz / 4, sz / 2);
              else if (glyphF) drawImg(ctx, glyphF, x + inset, y + inset, sz, sz);
            } else if (!cBase || !drawImg(ctx, BOARD_IMG[cBase], x + inset, y + inset, sz, sz)) {
              fillRoundRect(ctx, x + inset, y + inset, sz, sz, 8, COLOR_FILL[cBase] || '#333');
            }
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    if(theme==='lava'||theme==='frost') {
      const ice=theme==='frost';
      fillRoundRect(ctx,boardX-5,boardY-5,boardCols*cell+10,boardRows*cell+10,10,ice?'rgba(87,182,230,0.12)':'rgba(232,104,43,0.12)');
      strokeRoundRect(ctx,boardX-5,boardY-5,boardCols*cell+10,boardRows*cell+10,10,ice?'#80d8fa':'#e7894c',2);
    }
    // 下落层：clear 段显示消除前原位布局（未消除格保持原位、消除格由淡出层绘制）；fall 段显示最终布局 + 匀速下滑
    // （列整体同步下移——同列所有移动格下移相同格数、同速、同时到达，新补方块从各自对应高度出发）
    const v = CONFIG.FALL_SPEED * cell; // 固定下落速度（格/秒 × cell），与 durFall 0.4s 匹配：到位即结束
    // 预算：每列消除格数 colDrop、每列消除行 colClearedRows
    const colDrop = new Array(boardCols).fill(0);
    const colClearedRows = new Array(boardCols).fill(0).map(() => []);
    if (anim && anim.cleared) {   // v5.6.3 clear/fall 两段都需要下落预算
      for (const key of anim.cleared) {
        const [cr, cc] = key.split(',').map(Number);
        if (cc >= 0 && cc < boardCols && cr >= 0 && cr < boardRows) {
          colDrop[cc]++; colClearedRows[cc].push(cr);
        }
      }
    }
    const dropCellsOf = (srcRow, c) => {
      if (srcRow === -1) return colDrop[c]; // 新补方块：随整列下移 colDrop 格
      return colClearedRows[c].filter((cr) => cr > srcRow).length; // 未消除格：其下方消除格数
    };
    const inClear = !!(anim && (anim.phase === 'clear' || anim.phase === 'wait'));   // v5.6.4 等待段保持消除后原位（空位停留），fall 段才下落
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        let color = inClear ? (g0[r][c] || null) : g1[r][c];   // v5.6.3 clear 段画原位，fall 段画最终布局
        if (!color) continue;
        if (inClear && anim.cleared.has(r + ',' + c)) continue; // 消除格由淡出层绘制，不重复
        let x = boardX + c * cell + 2;
        let y = boardY + r * cell + 2;
        if (anim && anim.phase === 'fall' && anim.progress < 1) {   // v5.6.3 下落段独立计时
          const elapsed = anim.progress * anim.durFall; // 已流逝时间（秒）
          const srcRow = this._sourceRow(anim, g1, r, c);
          const dist = dropCellsOf(srcRow, c) * cell; // 同列内所有移动格距离一致
          const dy = Math.min(dist, v * elapsed);
          y = y - dist + dy; // 从来源位置（上移 dist）匀速下滑至目标位置
        }
        if(anim && anim.phase==='fall' && anim.gravityOrigins && anim.gravityOrigins[r][c]) {
          const path=anim.gravityOrigins[r][c].path;
          if(path && path.length>1) {
            const t=Math.min(1,anim.progress)*(path.length-1),i=Math.min(path.length-2,Math.floor(t)),f=t-i;
            x=boardX+(path[i].c+(path[i+1].c-path[i].c)*f)*cell+2;
            y=boardY+(path[i].r+(path[i+1].r-path[i].r)*f)*cell+2;
          } else { x=boardX+c*cell+2;y=boardY+r*cell+2; }
        }
        this.drawCell(ctx, x, y, cell, color, r, c, selected);
      }
    }
    if (hint && hint.length === 2 && !anim) {
      const pulse = 0.62 + 0.3 * Math.sin(Date.now() / 220);
      ctx.save(); ctx.globalAlpha = pulse; ctx.lineWidth = 4; ctx.strokeStyle = '#fff2a1';
      hint.forEach(([hr,hc]) => strokeRoundRect(ctx, boardX + hc * cell + 3, boardY + hr * cell + 3, cell - 6, cell - 6, 11, '#fff2a1', 4));
      ctx.globalAlpha = pulse * 0.75; ctx.strokeStyle = '#ffd34d';
      const ax = boardX + (hint[0][1] + hint[1][1] + 1) * cell / 2;
      const ay = boardY + (hint[0][0] + hint[1][0] + 1) * cell / 2;
      ctx.beginPath(); ctx.arc(ax, ay, cell * 0.13, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (shP >= 0 && shP < 1) ctx.restore();
  }

  function drawCell(ctx, x, y, cell, color, r, c, selected) {
    if (color && color.s === 'chest') {
      if (color.arriving && color.replaced) return this.drawCell(ctx,x,y,cell,color.replaced,r,c,selected);
      const size=cell-4;
      fillRoundRect(ctx,x,y,size,size,9,'#342b18');
      strokeRoundRect(ctx,x+1,y+1,size-2,size-2,8,'#f5d17a',1.6);
      if(!drawImg(ctx,IMG_SRC.chestClosed,x+3,y+3,size-6,size-6))text(ctx,'箱',x+size/2,y+size/2,26,'#f8da86','center');
      return;
    }
    if (color && color.s === 'obstacle') {
      const ice=color.theme==='frost';
      fillRoundRect(ctx,x,y,cell-4,cell-4,8,ice?'#29475d':'#49312c');
      strokeRoundRect(ctx,x+3,y+3,cell-10,cell-10,7,ice?'#a8e6ff':'#ff9a53',2);
      text(ctx,ice?'❄':'◆',x+(cell-4)/2,y+(cell-4)/2+7,24,ice?'#c9f3ff':'#ffb66b','center'); return;
    }
    const size = cell - 4;
    const isObj = color !== null && typeof color === 'object';   // v5.2 特殊块 {c,s,sub?}
    const base = isObj ? (color.s === 'rainbow' ? null : (color.c || color.tint || null)) : color;
    const bc = isObj ? ChipSkin.baseColorOf(color) : base;
    if (isObj && color.s === 'rainbow') {
      // Rainbow is a standalone icon, including the asset-loading fallback.
      if (!drawImg(ctx, ChipSkin.specialSrc(color), x, y, size, size)) {
        this._specialBlockMark(ctx, x, y, size, color);
      }
    } else if (drawImg(ctx, ChipSkin.BASES[bc], x, y, size, size)) {
      const glyph = isObj ? ChipSkin.specialSrc(color) : ChipSkin.normalSrc(bc);
      if (glyph) {
        const glyphSize = isObj && color.s === 'split' && color.sub ? size * 0.5 : size;
        const inset = (size - glyphSize) / 2;
        if (isObj && color.s === 'split' && color.sub) subBlockGlyph(ctx, x + inset, y + inset, glyphSize);
        else drawImg(ctx, glyph, x + inset, y + inset, glyphSize, glyphSize);
      }
    } else if (base && drawImg(ctx, BOARD_IMG[base], x, y, size, size)) {
      // Child mine keeps its white emblem even while only the old base asset is ready.
      if (isObj && color.s === 'split' && color.sub) subBlockGlyph(ctx, x + size / 4, y + size / 4, size / 2);
      // 其它回退：旧整图自带符号，不再叠图案
    } else {
      fillRoundRect(ctx, x, y, size, size, 8, COLOR_FILL[base] || (isObj ? '#2c3440' : '#333'));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y + size - 6, size, 6);
      if (isObj) this._specialBlockMark(ctx, x, y, size, color);
    }

    if (selected && selected[0] === r && selected[1] === c) {
      strokeRoundRect(ctx, x - 2, y - 2, size + 4, size + 4, 10, '#ffffff', 4);
    }
  }

  function _sourceRow(anim, grid, r, c) {
    const rows = grid.length;
    const base = anim.base || anim.swapGrid || anim.oldGrid || grid; // 本级连锁下落前的棋盘
    const oldCol = [];
    for (let row = rows - 1; row >= 0; row--) {
      if (base[row][c] && !anim.cleared.has(row + ',' + c)) oldCol.push(row);
    }
    const i = rows - 1 - r; // 最终列从底到顶编号
    if (i < oldCol.length) {
      const srcRow = oldCol[i];
      if (base[srcRow][c] === grid[r][c]) return srcRow;
    }
    return -1;
  }
  return { board, drawCell, _sourceRow };
}
module.exports = { createBoardLayer };
