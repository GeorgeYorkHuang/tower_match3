# -*- coding: utf-8 -*-
"""design-cli +create 城墙下延版 + get 回读"""
import subprocess, json, re, io

WS = "cws_58797976200221954"
XML = ('<item type="IMAGE" path="/generated-assets/xiaoxiaofangxian/ui" '
       'title="城墙向下延伸版" '
       'brief="城墙两垛口+墙内墙体向下延伸版：垛口+砖面+墙体延续（浅米色仿石）；裁白边缩 750x60 落盘 images/ui/wall.jpg">'
       '<size width="750" height="60"/>'
       '<asset url="https://aka.doubaocdn.com/s/IrYlOW35a7"/>'
       '</item>')

def run(args, data=""):
    p = subprocess.run(["design-cli", "design-workspace"] + args + ["--canvas-workspace-id", WS] +
                       (["--input", "-"] if data else []),
                       input=data.encode("utf-8") if data else None, capture_output=True)
    return p.returncode, (p.stdout or b"").decode("utf-8", "replace"), (p.stderr or b"").decode("utf-8", "replace")

log = []
rc, out, err = run(["+create"], XML)
log.append(f"create rc={rc} out={out} err={err}")
if rc == 0:
    iid = re.search(r'item_id="([^"]+)"', json.loads(out)["xml_data"]).group(1)
    log.append(f"item_id={iid}")
    rc2, out2, err2 = run(["+get", "--item-ids", iid])
    log.append(f"get rc={rc2} out={out2} err={err2}")
io.open(r"F:\workspace\towerdefence\tools\_tmp_cli11_log.txt", "w", encoding="utf-8").write("\n".join(log))
