# 三消元素图标 · 圣坛花园 v2

使用内置 imagegen 工具分别生成六种元素图标，整理为 128×128 透明 PNG。图标主体最长边统一为 92 像素，保留留白以避开底板角饰。

## 素材与接入

- 新素材：`assets/images/interface/chips/garden-v2/glyph_<part>.png`。
- 火焰 flame、冰雪 snow、毒液 flask、闪电 bolt、回旋镖 blade、炮弹 bomb。
- 普通三消块通过 `chip-skin.js` 的 `GLYPH_DIR` 使用新版图标；特殊块仍使用各自的功能图案。
- 原版图标保留在 `assets/images/interface/chips/`。将 `GLYPH_DIR` 改回 `DIR` 可回退普通图标。
- 工作目录 `work/element-glyphs-v2/` 保存原始生成图、处理后的精灵及叠图预览。

## 完整生成提示词

每个图标使用下面的通用提示词，并附加对应 Subject 段。

```text
Use case: stylized-concept. Asset type: one transparent elemental emblem sprite for a fantasy garden match-3 game. This is an ICON ONLY that will be placed onto a separate colored square backing plate. Cohesive premium hand-painted 2.5D game UI, soft beveled sculptural shapes, polished enamel / luminous crystal, consistent top-left light, strong simple silhouette, chunky shapes readable at 48px. Orthographic front presentation, centered in a SQUARE canvas. Main object spans approximately 75-80% of canvas, balanced visual weight, clear alpha silhouette. Crisp bright edge highlights and thin darker inner edges for contrast over saturated jewel-color backgrounds. Genuine transparent background around and inside silhouette openings. No square, no tile, no frame, no badge disk, no pedestal, no scenery, no text, no letters, no numbers, no detached particles, no huge glow haze, no cast shadow outside the object, no additional surrounding objects.
```

### flame

```text
Subject: One bold upright magical flame, three flowing tapered tongues forming a single coherent teardrop silhouette. Rich warm orange flame body with bright golden-ivory inner core, subtle scarlet outer shading. Friendly sacred fire, elegant smooth contours, no wood, no candle, no braziers. The pale core must read clearly on a red crystal tile.
```

### snow

```text
Subject: One symmetrical six-armed frost snowflake made of bright icy-white crystalline branches with pale cyan bevels and slightly deeper blue inner facets. Strong chunky connected branches, a tiny central six-sided crystal, short clean two-pronged side branches. White highlights retain clear definition on a sapphire blue tile. No starburst glare, no thin hairline filigree.
```

### flask

```text
Subject: One small squat round glass poison potion bottle, front-facing, with a short narrow neck and a modest pale antique-gold stopper. Large round body full of luminous lime-green potion, subtle dark forest-green glass rims, a pale mint rim light and one simple curved specular highlight. Clean bright chartreuse center distinctly lighter than an emerald green tile. No skull, no label, no text, no floating bubbles outside the bottle.
```

### bolt

```text
Subject: One bold diagonal zigzag lightning bolt, top right to bottom left, broad continuous angular silhouette, polished warm ivory and lemon-gold enamel, pale near-white front face, deeper honey-gold beveled side edges. Three strong angular sections and sharp top and bottom points. Highly readable pale shape on a golden-yellow tile. No circular backing, no extra tiny bolts or sparks.
```

### blade

```text
Subject: One compact three-bladed magical returning boomerang, exactly three broad smoothly swept crescent blades arranged around one small dark amethyst central hub. Elegant purple-lavender crystal / enchanted silver edges, very pale lilac blade front faces with deep violet bevels, flowing aerodynamic contours. Strong pale highlights so it is distinct from its purple crystal tile. No thin handles, no gears, no circular disk behind the blades.
```

### bomb

```text
Subject: One chunky round iron cannonball bomb with a short unlit braided fuse curving to the upper right from a small restrained aged-brass collar. Main sphere is dark charcoal blued steel with broad cool silver reflections and a subtle pale rim highlight, clearly readable on medium-dark gray bronze. Restrained painterly metal, single spherical silhouette, no face, no eyes, no red or orange glow, no fire, no explosion, no burning sparks, no attached stand.
```
