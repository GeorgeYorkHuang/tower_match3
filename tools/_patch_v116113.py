# -*- coding: utf-8 -*-
"""v1.16.113 测试战场圣遗物验证增强补丁"""
import io

def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        assert old in s, f'anchor missing in {p}: {old[:70]!r}'
        s = s.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('patched', p)

R = r'F:\workspace\towerdefence\js\game\render.js'
M = r'F:\workspace\towerdefence\js\game\main.js'
C = r'F:\workspace\towerdefence\js\combat.js'

patch(R, [
    # FX_HANDLERS 加 floatText
    ("""  match: 'fxMatch'
};""", """  match: 'fxMatch',
  floatText: 'fxFloatText'   // v1.16.113 3★ 触发确认飘字
};"""),
    # fxFloatText 方法
    ("""      const h = FX_HANDLERS[f.type];
      if (h) this[h](ctx, f);
    });
  }""", """      const h = FX_HANDLERS[f.type];
      if (h) this[h](ctx, f);
    });
  }

  /** v1.16.113 文字飘字（3★ 触发确认）：上漂 + 渐隐 */
  fxFloatText(ctx, f) {
    const p = Math.min(1, f.t / (f.dur || 1));
    ctx.globalAlpha = Math.max(0, 1 - p);
    text(ctx, f.text, f.x, f.y - 34 * p, f.size || 22, f.color || '#ffd24a', 'center');
    ctx.globalAlpha = 1;
  }"""),
    # status() 圣遗物行 3★ 角标
    ("""        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 14, '#ffffff', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length}`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 16, 'rgba(255,255,255,0.55)', 'left');""",
    """        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 14, '#ffffff', 'center');
        }
        if (rc.star3) {   // v1.16.113 3★ 质变角标
          fillRoundRect(ctx, icx + 8, ry - 3, 18, 13, 6, '#ffb347');
          text(ctx, '★3', icx + 17, ry + 10, 10, '#5c3800', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length}`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 16, 'rgba(255,255,255,0.55)', 'left');"""),
    # testFieldLayer 状态条圣遗物行
    ("""    text(ctx, `⏩×${s.speed}`, 686, 89, 24, '#ffffff', 'center');
    // 行动区底""", """    text(ctx, `⏩×${s.speed}`, 686, 89, 24, '#ffffff', 'center');
    // v1.16.113 测试战场：本局圣遗物行（注入即显示；★3 角标 = 3★ 质变生效；点击查看详情）
    const rels = s.battleRelics || [];
    if (rels.length) {
      const rx = 130, ry = 116, rIcon = 24, rGap = 30, rMax = 10;
      const shown = rels.slice(0, rMax);
      shown.forEach((rc, i) => {
        const icx = rx + i * rGap + rIcon / 2;
        ctx.beginPath(); ctx.arc(icx, ry + rIcon / 2, 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(247,201,72,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(247,201,72,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
        const rSrc = relicIconSrc(rc.id);
        if (!(rSrc && drawImg(ctx, rSrc, rx + i * rGap + 1, ry + 1, rIcon - 2, rIcon - 2))) {
          text(ctx, rc.icon, icx, ry + rIcon / 2 + 2, 14, '#ffffff', 'center');
        }
        if (rc.star3) {
          fillRoundRect(ctx, icx + 8, ry - 3, 18, 13, 6, '#ffb347');
          text(ctx, '★3', icx + 17, ry + 10, 10, '#5c3800', 'center');
        }
      });
      text(ctx, `圣物 ×${rels.length} 点图标看详情`, rx + shown.length * rGap + 4, ry + rIcon / 2 + 3, 15, 'rgba(255,255,255,0.6)', 'left');
      this.relicBarHit = { x: rx, y: ry - 8, w: shown.length * rGap + 96, h: rIcon + 16 };
    } else {
      this.relicBarHit = null;
    }
    // 行动区底"""),
    # relicDetailLayer 副文案 + ★3 徽章
    ("""    text(ctx, `已获得 ×${relics.length} · 圣遗物获得即本局生效`, 375, y + 92, 18, '#8ea3b8', 'center');""", """    text(ctx, `已获得 ×${relics.length} · 获得即本局生效${relics.some((r) => r.star3) ? ' · ★3 质变生效中' : ''}`, 375, y + 92, 18, '#8ea3b8', 'center');"""),
    ("""      text(ctx, r.name, x + 110, ry + 26, 20, '#ffffff', 'left');
      const dd = String(r.desc || '');""", """      text(ctx, r.name, x + 110, ry + 26, 20, '#ffffff', 'left');
      if (r.star3) {   // v1.16.113 ★3 质变徽章
        fillRoundRect(ctx, x + w - 90, ry + 8, 42, 24, 12, '#ffb347');
        text(ctx, '★3', x + w - 69, ry + 26, 14, '#5c3800', 'center');
      }
      const dd = String(r.desc || '');"""),
])

patch(M, [
    # testState 加 battleRelics
    ("""      panel: this.testPanel,
      synergies: run.effects.synergyStatus(),
    };""", """      panel: this.testPanel,
      synergies: run.effects.synergyStatus(),
      battleRelics: this.battleRelics || [],   // v1.16.113 测试战场圣遗物行
    };"""),
    # relicPickChoice star3 标记 + toast
    ("""      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc }); // v1.16.73 详情弹层需要 desc
      this.save.save();
      this.toast('获得圣遗物 ' + c.icon + c.name, '#f7c948');""", """      // v1.16.113 记录 3★ 生效标记：测试战场 3★ 注入 或 真实已升 3★
      const isStar3 = (this._relicReturnState === 'testfield' && this._lastPickStar3 && c) || this.meta.starOf(c.id) >= 3;
      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: isStar3 }); // v1.16.73 详情弹层需要 desc
      this.save.save();
      this.toast(isStar3 && this._relicReturnState === 'testfield' ? `★3 质变注入：${c.icon}${c.name}` : '获得圣遗物 ' + c.icon + c.name, '#ffb347');"""),
    ("""      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc }); // v1.9：本局圣物展示；v1.16.73 带 desc""", """      this.battleRelics.push({ id: c.id, icon: c.icon, name: c.name, desc: c.desc, star3: this.meta.starOf(c.id) >= 3 }); // v1.9：本局圣物展示；v1.16.73 带 desc"""),
    # onTestFieldTap relicBarHit
    ("""  onTestFieldTap(p) {
    const items = this.testHits || [];""", """  onTestFieldTap(p) {
    // v1.16.113 测试战场：点击圣遗物行 → 查看本局圣遗物详情（叠加弹层，战斗不暂停）
    if (!this.testPanel) {
      const rb = this.renderer.relicBarHit;
      if (rb && p.x >= rb.x && p.x <= rb.x + rb.w && p.y >= rb.y && p.y <= rb.y + rb.h) {
        this.relicDetail = { page: 0, from: 'testfield' };
        return true;
      }
    }
    const items = this.testHits || [];"""),
    # render() testfield 分支渲染详情层
    ("""      this.testHits = this.renderer.testFieldLayer(ctx, this.testState(), this.testHits, this.enemies, this.fx, this.combat);
      this.renderer.toast(ctx, this.toasts);
      if (this.state === 'relicpick') {""", """      this.testHits = this.renderer.testFieldLayer(ctx, this.testState(), this.testHits, this.enemies, this.fx, this.combat);
      this.renderer.toast(ctx, this.toasts);
      if (this.relicDetail) {   // v1.16.113 测试战场圣遗物详情弹层
        this.renderer.relicDetailLayer(ctx, this.battleRelics, this.relicDetail.page || 0, this.relicDetailHits);
      }
      if (this.state === 'relicpick') {"""),
    # dispatchTouch 关闭恢复来源状态
    ("""      if (h.close && h.close.hit(p.x, p.y)) { this.relicDetail = null; this.state = 'fighting'; return true; }""", """      if (h.close && h.close.hit(p.x, p.y)) {
        const from = this.relicDetail.from || 'fighting';   // v1.16.113 关闭后回到来源状态（testfield/fighting）
        this.relicDetail = null; this.state = from; return true;
      }"""),
])

patch(C, [
    # 三连触发飘字
    ("""        this.fxRing(e.x, e.y, '#ff9f43', 60, 0.5, 4);
      } else {""", """        this.fxRing(e.x, e.y, '#ff9f43', 60, 0.5, 4);
        if (g.fx) g.fx.push({ type: 'floatText', text: '焰雨·三连！', x: e.x, y: e.y - 46, t: 0, dur: 0.9, size: 22, color: '#ffd24a' });   // v1.16.113 触发确认飘字
      } else {"""),
])
print('all patches applied')
