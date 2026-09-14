#!/usr/bin/env python3
"""Consume one Notion upload envelope in memory via stdin. Never log handles/headers."""
import json, pathlib, subprocess, sys, termios

def main():
    path = pathlib.Path(sys.argv[1]).resolve()
    if not path.is_file() or path.stat().st_size > 20*1024*1024:
        raise ValueError('INVALID_UPLOAD_FILE')
    if sys.stdin.isatty():
        settings = termios.tcgetattr(sys.stdin)
        settings[3] &= ~termios.ECHO
        termios.tcsetattr(sys.stdin, termios.TCSANOW, settings)
    print('UPLOAD_READY', flush=True)
    envelope = json.loads(sys.stdin.readline())
    url = envelope['upload_url']
    from urllib.parse import urlparse
    host = urlparse(url).hostname or ''
    if not url.startswith('https://') or not (host.endswith('.notion.com') or host.endswith('.notion.so') or host in ('notion.com','notion.so')):
        raise ValueError('UNEXPECTED_UPLOAD_HOST')
    def quote(value):
        return '"'+str(value).replace('\\','\\\\').replace('"','\\"').replace('\n','\\n').replace('\r','\\r')+'"'
    config = 'url = '+quote(url)+'\nrequest = "POST"\n'
    config += ''.join('header = '+quote(k+': '+v)+'\n' for k,v in envelope.get('upload_headers',{}).items())
    config += 'form = '+quote('file=@'+str(path)+';type=image/png')+'\n'
    r = subprocess.run(['curl','--silent','--show-error','--max-time','60','--config','-'],input=config,text=True,capture_output=True)
    envelope.clear(); config = None
    if r.returncode:
        print(json.dumps({'status':'UPLOAD_TRANSPORT_FAILED','exitCode':r.returncode}));sys.exit(1)
    result=json.loads(r.stdout)
    # Only attached-file handles and non-secret status are returned.
    safe={k:result[k] for k in ('id','file_upload_id','status','markdown_source','suggested_markdown','object','code') if k in result}
    print(json.dumps(safe,ensure_ascii=False))
if __name__=='__main__':
    try: main()
    except Exception as e: print(json.dumps({'status':'UPLOAD_FAILED','errorType':type(e).__name__}));sys.exit(1)
