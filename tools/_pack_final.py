# -*- coding: utf-8 -*-
"""精确核算 packOptions.ignore 后最终代码包大小（含 js / 根文件）"""
import os, json, fnmatch

ROOT = r'F:\workspace\towerdefence'
cfg = json.load(open(os.path.join(ROOT, 'project.config.json'), encoding='utf-8'))
rules = cfg.get('packOptions', {}).get('ignore', [])

def ignored(rel):
    for r in rules:
        v = r['value'].replace('\\', '/')
        if r['type'] == 'folder':
            if rel == v or rel.startswith(v + '/'):
                return True
        else:
            if fnmatch.fnmatch(rel, v):
                return True
    return False

total = 0
count = 0
details = []
for root, dirs, files in os.walk(ROOT):
    # 排除 .git 与 .sessions
    dirs[:] = [d for d in dirs if d not in ('.git', '.sessions', 'node_modules')]
    for f in files:
        p = os.path.join(root, f)
        rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
        if rel.startswith('system-reminder') or rel.startswith('agent'):
            continue
        if ignored(rel):
            continue
        s = os.path.getsize(p)
        total += s
        count += 1
        if s > 100 * 1024:
            details.append((s, rel))

print('FINAL PACK: %d files, %.2f MB (limit 4 MB)' % (count, total / 1048576))
for s, r in sorted(details, reverse=True)[:20]:
    print('  %.2f MB %s' % (s / 1048576, r))
