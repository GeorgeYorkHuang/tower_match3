# 四消特殊方块图标 · 圣坛花园 v2

使用内置 imagegen 工具分别生成行爆、列爆、十字爆、父分裂雷、子分裂雷、乱数六张图标。

## 父子关系与尺寸

- 父雷：象牙白圆形核心、十字刻印、蓝色中心、四个短臂与四个外围分裂球。
- 子雷：仅删除四个外围球，保留相同核心、刻印、中心和连接短臂。
- 父子雷使用相同的裁切区域及缩放比例，避免子雷独立裁切后核心被放大。
- 均整理为 128×128 透明 PNG，父雷整体最长边为 92 像素。

## 接入范围

- 新素材：`assets/images/interface/chips/special-garden-v2/glyph_<shape>.png`。
- 形状名：`row`、`col`、`cross`、`split`、`sub`、`rand`。
- 棋盘静止与消除淡出阶段使用相同图片和比例；子雷不再强制绘制旧三角符号或缩小一半。
- 主页技能槽与四消配置页复用棋盘图标，图片未就绪保留矢量兜底。
- 父子雷的矢量兜底也保留相同核心，仅区分四个外围球。
- 彩虹、普通元素和棋盘结算规则未改动；旧图标保留。

## 完整生成提示词

各主体使用以下通用提示词和对应 Subject；子雷基于父雷图进行编辑。

```text
Use case: stylized-concept. Asset type: single transparent emblem sprite for a fantasy garden match-3 special tile. Premium hand-painted 2.5D game UI, polished warm ivory enamel front faces, fine antique-gold bevels and subtle cool blue inner shadows, top-left lighting. Strong chunky silhouette legible at 48px on six jewel-color tile bases. Icon ONLY, orthographic front view, centered square canvas, balanced proportions. Main icon fits inside central 76% of canvas. Transparent outside the symbol and in all openings. No background square, no tile backing, no card, no badge frame around the icon, no text, no labels, no particles, no glow haze, no sparks. Rounded-polished material and simple bold readable shapes. Do not include a shadow outside the silhouette.
```

### split

```text
Subject: A magical splitting mine: one large front-facing ROUND ivory-enamel central core taking up 60% of the total emblem width, a fine golden concentric rim, a small engraved plus-shaped cross on its pale face with a tiny azure center. Four short sturdy diagonal golden connecting arms radiate toward the NW NE SW SE corners, each ending in ONE small ivory and gold satellite sphere, exactly four satellites. The four satellite spheres together are a minor part of the design, each diameter only 13% of emblem width. Central core is overwhelmingly dominant. All four short arms must remain visible between central body and satellites. Balanced symmetrical mechanical-magical garden relic. No pointed spikes, no skull, no burning fuse, no extra orbit rings. The child version will later remove ONLY the four small end spheres, so make the large central core distinctive and self-contained.
```

### row

```text
Subject: One wide horizontal double-headed arrow, pointing LEFT and RIGHT. Two broad ivory triangular arrowheads connected by one sturdy short golden-edged ivory bar, small pale-blue diamond inset at the exact center. Simple elegant polished enamel, no border surrounding symbol, no extra parallel lines. Width to height approximately 2.1:1. The horizontal direction must be immediately obvious.
```

### col

```text
Subject: One tall vertical double-headed arrow, pointing UP and DOWN. Two broad ivory triangular arrowheads connected by one sturdy short golden-edged ivory bar, small pale-blue diamond inset at the exact center. Simple elegant polished enamel, no border surrounding symbol, no extra parallel lines. Height to width approximately 2.1:1. The vertical direction must be immediately obvious.
```

### cross

```text
Subject: One symmetrical four-direction explosive cross: four broad ivory arrowheads pointing UP DOWN LEFT RIGHT connected by short solid bars, antique-gold beveled outline, tiny pale-blue diamond inset at the center. Clear thick PLUS silhouette with four equally sized arrowhead tips, no diagonal directions, no outer ring. Simple readable hand-painted enamel.
```

### rand

```text
Subject: One compact ivory six-sided die in a restrained three-quarter view, soft rounded corners, fine antique-gold beveled edges, blue-gray dimples on the faces. Front broad face shows exactly five dark-blue pips in a quincunx pattern; small top and right faces show a few additional pips. One solid cube only, no surrounding arrows, no sparkles, no base tile. Dice silhouette clearly communicates randomness at very small size.
```

### sub：基于父雷图的编辑

```text
Use case: precise-object-edit. Edit target: this parent splitting-mine game icon. Create its CHILD version by subtracting ONLY the four small ivory-and-gold satellite spheres at the NW NE SW SE ends. The large central circular ivory plate, its gold rim, engraved plus sign, central blue jewel, FOUR GOLD DIAGONAL SHORT CONNECTING ARMS, lighting, shading, center position, scale and camera must remain pixel-aligned with the reference. Keep the four short gold arms, now terminating as simple flat capped short stubs with no spheres. Do not remove the arms. Do not shrink or enlarge or move the central core. No new symbol, no new colors, no cracks, no background. Transparent background everywhere the four satellite spheres are removed. Same square canvas as input; genuine alpha. The child MUST be obviously the SAME object with just the four peripheral small spheres missing. Preserve every other element.
```
