# -*- coding: utf-8 -*-
"""render.js 重构步骤3a：enemies() 拆分为 body / debuff(6 子方法) / bar（行为零变更）"""
import io

P = r"F:\workspace\towerdefence\js\game\render.js"
with io.open(P, "r", encoding="utf-8") as f:
    src = f.read()
lines = src.split("\n")

assert lines[755].startswith('  enemies('), repr(lines[755][:40])
assert lines[756].strip() == 'enemies.forEach((e) => {', repr(lines[756][:60])
assert lines[986] == '  }', repr(lines[986])

def dedent(blk):
    out = []
    for l in blk:
        out.append(l[2:] if l.startswith('  ') else l)
    return out

# 头部：尺寸计算 + 三调用（原 L758-762 + 新调用行）
head = lines[757:762]
head.append('      this.drawEnemyBody(ctx, e, x, y, size, isElite);')
head.append('      this.drawEnemyDebuffs(ctx, e, x, y, size);')
head.append('      this.drawEnemyBar(ctx, e, x, y, size);')

def method(name, doc, body):
    return ['  ' + name + ' {', '    // ' + doc] + body + ['  }']

# drawEnemyBody：L763-788（src/fallback + drawImg + 精英段）
body = method('drawEnemyBody(ctx, e, x, y, size, isElite)',
              '敌人本体：贴图 / 回退几何 / 精英染色与专属标识',
              dedent(lines[762:788]))

# debuff 子方法
frozen = method('drawDebuffFrozen(ctx, e, x, y, size)',
                '冻结：蓝描边框 + 冰晶外壳（v1.13.26）',
                dedent(lines[788:814]))
slow = method('drawDebuffSlow(ctx, e, x, y, size)',
              '寒霜：全身淡冰蓝霜罩 + 双环冰雾 + 寒气粒子 + 结晶（v1.13.30）',
              dedent(lines[814:845]))
paralyze = method('drawDebuffParalyze(ctx, e, x, y, size)',
                  '麻痹：头顶金色电花 + 跳动电光点（v1.13.21）',
                  dedent(lines[845:862]))
mark = method('drawDebuffMark(ctx, e, x, y, size)',
              '猎手标记：红色半透明瞄准环 + 十字准线（v1.16.42）',
              dedent(lines[862:879]))
dots = method('drawDebuffDots(ctx, e, x, y, size)',
              'DoT 图标：灼烧火焰帧动画 / 中毒毒泡+层数 / 兜底绿点',
              dedent(lines[879:937]))
vine = method('drawDebuffVine(ctx, e, x, y, size)',
              '毒藤：螺旋缠绕 + 叶片脉动（v1.16.1）',
              dedent(lines[937:971]))

# 血条
bar = method('drawEnemyBar(ctx, e, x, y, size)',
             '个体血条：实色当前血量 + 延迟尾条',
             dedent(lines[971:985]))

drawEnemyDebuffs = ['  drawEnemyDebuffs(ctx, e, x, y, size) {',
                    '    // 受击状态特效（debuff）：冻结 / 寒霜 / 麻痹 / 猎手标记 / DoT / 毒藤',
                    '    this.drawDebuffFrozen(ctx, e, x, y, size);',
                    '    this.drawDebuffSlow(ctx, e, x, y, size);',
                    '    this.drawDebuffParalyze(ctx, e, x, y, size);',
                    '    this.drawDebuffMark(ctx, e, x, y, size);',
                    '    this.drawDebuffDots(ctx, e, x, y, size);',
                    '    this.drawDebuffVine(ctx, e, x, y, size);',
                    '  }']

new_enemies = ['  /** 区B·敌人层：敌人本体绘制 + 受击状态特效（debuff）+ 血条（v1.16.43 重构拆分子方法） */',
               '  enemies(ctx, enemies) {',
               '    enemies.forEach((e) => {']
new_enemies += head
new_enemies += ['    });',
                '  }']

block = new_enemies + [''] + body + [''] + drawEnemyDebuffs + [''] + frozen + [''] + slow + [''] + paralyze + [''] + mark + [''] + dots + [''] + vine + [''] + bar

new_lines = lines[:755] + block + lines[987:]
src = "\n".join(new_lines)
with io.open(P, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("OK, new length:", len(new_lines))
