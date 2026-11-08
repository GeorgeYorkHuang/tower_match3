# 三消方块底板 · 圣坛花园 v2

使用内置 imagegen 工具生成一张六色底板图集，再拆分、缩放为游戏所用的 128×128 透明 PNG。

## 设计与接入

- 红、蓝、绿、黄、紫、橙六种来源色保持对应关系。
- 使用温润晶石、轻量倒角和金色叶纹护角；中央减少纹理，衬托原有元素图标。
- 仅替换底板路径；普通图标、特殊块图案、选择描边和三消规则保持原逻辑。
- 新资源路径：`assets/images/interface/chips/garden-v2/base_<color>.png`。
- 原版 `assets/images/interface/chips/base_<color>.png` 保留。将 `chip-skin.js` 的 `BASE_DIR` 改回 `DIR` 可回退。
- 原始图集和叠图预览保存在工作辅助目录 `work/chip-base-garden-v2/`。

## 完整生成提示词

```text
Use case: stylized-concept.
Asset type: ONE production sprite atlas for six blank match-3 tile baseplates in a hand-painted fantasy mobile tower-defense game "圣坛裂痕", sacred altar garden art direction.
Primary request: redesign the tile backing plates, WITHOUT the elemental icons. A cohesive polished set with quieter surfaces, excellent tiny-size readability, softly beveled jewel-glass faces and restrained antique gold ornamental corner brackets reminiscent of a sacred garden.
Composition: a precise 3 columns by 2 rows atlas, landscape 3:2 aspect ratio. Six identical size axis-aligned rounded SQUARE tile plates. Each cell is square; each plate fills 94% of its cell centered, equal transparent gutters. Row 1 left-to-right ruby red, sapphire blue, emerald green. Row 2 left-to-right golden yellow, amethyst purple, warm copper orange. All six use EXACT same silhouette, dimensions, border thickness and top-left illumination. Straight-on 2D UI sprite, no perspective or isometric angle.
Design: medium-dark richly colored translucent-looking crystal face, luminous but restrained bevel, narrow colored glass rim, small understated aged golden corner inlays with tiny engraved leaf curves confined to the four corners. Central 72% must be smooth unadorned calm color with very subtle gradient; reserve room for existing separate elemental symbols. Friendly sophisticated painted fantasy garden UI, rather than realistic fractured glass. Outer silhouette softly rounded square, clean alpha edges. Colors must remain clearly distinct at 64px.
Constraints: exactly six separate blank tiles in regular aligned grid, NO center icons, NO runes, NO text, NO labels, NO elemental imagery, NO cracks, NO scattered specks, NO sparkle stars, NO background, NO checkerboard painted into image, NO cast shadows outside tile silhouettes, NO connecting frames. Genuine transparent background outside all six plates and between tiles. Keep highlights localized to the border, not a diagonal white stripe across the central icon area. This is a game-ready baseplate atlas, not a presentation board.
```
