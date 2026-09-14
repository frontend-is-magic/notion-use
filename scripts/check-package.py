#!/usr/bin/env python3
"""Validate the GitHub-import layout and avoid accidental desktop-only or machine-bound bundles."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
market=json.loads((root/'.agents/plugins/marketplace.json').read_text())
assert len(market['plugins'])==1,'Import only the intended plugin'
entry=market['plugins'][0];plugin=(root/entry['source']['path']).resolve()
assert plugin.is_relative_to(root) and entry['name']=='notion-use'
manifest=json.loads((plugin/'.codex-plugin/plugin.json').read_text())
assert manifest['name']=='notion-use' and manifest['apps']=='./.app.json'
assert not manifest.get('mcpServers') and not manifest.get('hooks')
assert not (plugin/'mcp.json').exists() and not (plugin/'.mcp.json').exists()
apps=json.loads((plugin/'.app.json').read_text())
assert apps=={'apps':{'notion':{'id':'asdk_app_69c18c28f1188191bf5b8445c4ab0a2e','required':True}}}
for field in ['composerIcon','logo']:
 assert (plugin/manifest['interface'][field]).is_file()
assert sorted(p.name for p in (plugin/'skills').iterdir())==['create-notion','edit-notion','notion-rules','solve-comment']
for file in plugin.rglob('*'):
 if file.is_file() and file.suffix in {'.md','.js','.mjs','.cjs','.py','.json'}:
  assert not re.search(r'/Users/[^/\s]+|chenyu\.1218|@bytedance\.com|/home/[^/\s]+',file.read_text()),str(file)
print('GitHub import package: valid; Notion app reference only; no machine paths or desktop-only MCP configuration')
