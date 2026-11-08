# 炮塔底板颜色调整 v3

使用内置 imagegen 编辑工具，将炮塔底板的橙红晶石面与边框改为低饱和灰铜色，保留金色角饰与凹槽结构。火焰红色底板不变。

最终素材：`assets/images/interface/chips/garden-v2/base_cannon-bronze-v3.png`，128×128 透明 PNG。

仅修改 `chip-skin.js` 中 `BASES.orange` 的显示资源。逻辑来源色仍为 `orange`，炮塔配色的普通块与特殊块共用新底板。

原橙色底板保留。删除 `BASES.orange` 覆盖赋值即可回退。

## 完整提示词

```text
Use case: precise-object-edit. Edit target: the attached square orange blank match-3 tile baseplate. Change ONLY its orange crystal FACE and colored glass RIM to a desaturated, medium-dark antique gunmetal bronze: cool grayish umber / pewter brown, clearly distinct from fire ruby red and yellow gold. Target center approximately #514f46 with subtle lighter gray-bronze bevels #858276, pleasant readable medium-dark backdrop for a separate brown cannonball icon. Remove all orange/amber/red light from the face and rim. Preserve exactly the same square silhouette, corner radius, delicate gold leaf corner fittings, layout, face empty space, gloss style and top-left lighting. Gold corner fittings may stay gold but very restrained. This is the cannon color in a six-color sacred garden fantasy match-3 game. No symbols, no text, no icons, no added elements. Single front-facing square tile filling the canvas almost edge to edge, truly transparent outside rounded corners. Preserve existing transparency. Match the supplied baseplate geometry exactly.
```
