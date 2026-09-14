#!/usr/bin/env python3
"""Build one standalone web skill from the plugin source without duplicating its runtime."""
import argparse,json,re,zipfile
from pathlib import Path,PurePosixPath
root=Path(__file__).resolve().parents[1]
plugin=root/'plugins/notion-use'
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args()
files={'SKILL.md':(root/'web/SKILL.md').read_text()}
for asset in (root/'web').rglob('*'):
 if asset.is_file() and asset.name!='SKILL.md':files[str(asset.relative_to(root/'web'))]=asset.read_bytes()
for path in (plugin/'scripts').iterdir():
 if path.is_file() and path.suffix in {'.js','.mjs','.py'}:files['scripts/'+path.name]=path.read_text()
for path in (plugin/'references').glob('*.md'):files['references/'+path.name]=path.read_text()
execution=files['references/execution.md']
execution=execution.replace('通过 `.app.json` 引用现有 Notion 应用；不创建第二个 MCP 服务，也不打包会使 GitHub 导入变成 Desktop only 的 MCP 配置。','本网页技能包直接使用当前已连接的 Notion 应用。技能 ZIP 不提供插件的 `.app.json` 依赖安装机制；连接缺失时报告 NOTION_CONNECTION_UNAVAILABLE，不索取 token 或要求手工配置。')
files['references/execution.md']=execution
for path in (plugin/'skills').glob('*/SKILL.md'):
 text=path.read_text();text=re.sub(r'\A---\n.*?\n---\n','',text,count=1,flags=re.S)
 text=text.replace('../notion-rules/SKILL.md','notion-rules.md')
 files['references/workflows/'+path.parent.name+'.md']=text
# Validate local Markdown references and one unambiguous skill entry point.
for name,text in files.items():
 if not name.endswith('.md'):continue
 for target in re.findall(r'\]\(([^)]+)\)',text):
  if '://' in target or target.startswith('#'):continue
  parts=[]
  for part in (PurePosixPath(name).parent/PurePosixPath(target.split('#')[0])).parts:
   if part=='..':
    if not parts:raise ValueError('Reference escapes skill: '+target)
    parts.pop()
   elif part!='.':parts.append(part)
  if '/'.join(parts) not in files:raise ValueError(name+': missing '+target)
 if re.search(r'/Users/[^/\s]+|/home/[^/\s]+',text):raise ValueError('Machine-specific path: '+name)
out=Path(a.out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
 for name,text in sorted(files.items()):archive.writestr('notion-use/'+name,text)
with zipfile.ZipFile(out) as archive:
 assert archive.testzip() is None
 assert [n for n in archive.namelist() if n.endswith('/SKILL.md')]==['notion-use/SKILL.md']
print(json.dumps({'archive':str(out),'files':len(files),'entry':'notion-use/SKILL.md','status':'packaged_not_uploaded'},ensure_ascii=False))
