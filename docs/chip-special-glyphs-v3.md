# 四消特殊图标 · 高对比 v3

使用内置 imagegen 编辑工具，将乳白金边改为亮青色能量晶体与深蓝黑粗轮廓。六张素材为 128×128 透明 PNG，图案最长边由 92 像素提升到 100 像素。

- 素材目录：`assets/images/interface/chips/special-garden-v3/`。
- 图案：`glyph_row.png`、`glyph_col.png`、`glyph_cross.png`、`glyph_split.png`、`glyph_sub.png`、`glyph_rand.png`。
- 父子雷共用裁切范围和缩放，子雷只去掉外围四球。
- 技能页面、棋盘与消除动画通过同一资源查表使用新版。
- 原 v2 资源保留；把 `chip-skin.js` 中 `SPECIAL_DIR` 改回 `special-garden-v2/` 可回退。
- 工作辅助目录 `work/special-glyphs-v3/` 保存原始图、六色对照和混合盘面预览。

## 生成方式与完整提示词

每个素材单独调用内置 imagegen 编辑工具，以旧图作为编辑目标。子雷以新父雷作为编辑目标。

### 父雷

```text
Use case: precise-object-edit. Edit target: this special match-3 icon. Preserve its exact silhouette, proportions, emblem identity, center location, and components. RECOLOR and increase contrast for tiny gameplay readability: replace ALL ivory/cream enamel with vivid ELECTRIC CYAN / turquoise energy glass (#24e8ee), with bright narrow cyan highlights (#9cffff) and rich azure shaded facets. Replace ALL GOLD rims, borders, connecting arms and edge fittings with DARK NAVY-BLACK metal (#081527), with a broad, very clearly visible near-black outer silhouette edge, approximately 4% of the symbol width, and a thin lighter blue inner bevel. No ivory, no cream, no gold anywhere. Keep the small center jewel bright cyan-white, but no large white face. The result must be dominated by saturated cyan surfaces surrounded by substantial dark outline so it stands out on red blue green yellow purple bronze tiles. Clean bold high-contrast polished fantasy game UI. Preserve shape and structure exactly. No glowing background disk, no tile backing, no added frame or extra objects. No text, no particles, no cast shadow, genuine transparent background, preserve transparency. The reference is the parent split mine: keep its large central disk with plus engraving, four diagonal short arms, and all four small end spheres; do not change their relative sizes.
```

### 子雷

```text
Use case: precise-object-edit. This is the PARENT split mine. Produce its CHILD icon by removing ONLY the four small circular satellite spheres at NW NE SW SE ends. Preserve the large cyan central circular core, dark navy-black thick rim, engraved plus, center jewel, four short diagonal dark-blue connecting arms, exact lighting, scale, pixel position and silhouette of retained parts. Keep the four arms as short flat-capped stubs; remove only end circles and replace them with transparency. Do NOT enlarge or recenter or rescale the core. Keep the same square canvas. No other modifications, no new marks, no new colors, no new shapes, no background, no tile. Genuine transparent alpha and holes, original image geometry preserved.
```

### 其他四消图标通用提示词

```text
Use case: precise-object-edit. Edit this exact existing special match-3 symbol, keeping its silhouette, direction, number of parts, position and proportions. Replace ALL ivory/cream enamel faces with vivid ELECTRIC CYAN / turquoise energy crystal (#24e8ee), bright thin cyan highlights (#9cffff), and rich azure shaded facets. Replace ALL GOLD rims and edges with substantial DARK NAVY-BLACK metal (#081527), approximately 4% of full symbol width, with a narrow light blue inner bevel. The symbol must stand out when only 45px wide over red blue green yellow purple or bronze jewel tiles. Dark substantial outer contour plus saturated bright cyan interior, no cream, no ivory, no gold. Keep center gem icy cyan with narrow bright highlights. No extra text, no particles, no tile or badge backing, no background, preserve genuine alpha. Clean polished hand-painted fantasy game art. Preserve the geometry exactly.
```

#### row 的附加描述

```text
This is a horizontal LEFT-RIGHT double-headed arrow. Preserve the horizontal arrow and center diamond.
```

#### col 的附加描述

```text
This is a vertical UP-DOWN double-headed arrow. Preserve the vertical arrow and center diamond.
```

#### cross 的附加描述

```text
This is a four-way PLUS with arrowheads pointing UP DOWN LEFT RIGHT. Preserve all four arms and the center diamond.
```

#### rand 的附加描述

```text
This is a single dice cube in three-quarter view, with FIVE front pips. Keep the dice silhouette, camera and pip counts. Faces are saturated bright turquoise crystal, pips and cube edge bevels are dark navy-black, each pip crisply outlined. No ivory or gold surfaces.
```
