#!/usr/bin/env python3
"""Locked task journal. Reset only after the agent verifies the remote write did not apply."""
import argparse, fcntl, hashlib, json, os, pathlib, tempfile
p=argparse.ArgumentParser()
p.add_argument('action',choices=['get','claim','put','reset'])
p.add_argument('--root',required=True);p.add_argument('--key',required=True);p.add_argument('--value',default='{}')
a=p.parse_args();root=pathlib.Path(a.root).resolve();root.mkdir(parents=True,exist_ok=True)
path=root/(hashlib.sha256(a.key.encode()).hexdigest()+'.json');value=json.loads(a.value)
def save(v):
    with tempfile.NamedTemporaryFile(mode='w',dir=root,delete=False) as f:
        json.dump(v,f);f.flush();os.fsync(f.fileno());temp=f.name
    os.replace(temp,path)
with (root/'.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    old=json.loads(path.read_text()) if path.exists() else None
    if a.action=='get': print(json.dumps(old))
    elif a.action=='claim':
        if old and old.get('status')!='not_applied': print('false')
        else: save(value);print('true')
    elif a.action=='reset':
        if not old or old.get('status')!='uncertain' or not value.get('evidence'):
            raise SystemExit('RESET_REQUIRES_UNCERTAIN_AND_REMOTE_EVIDENCE')
        save({'status':'not_applied','evidence':value['evidence']});print('true')
    else: save(value);print('true')
