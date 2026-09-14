// Immutable revisions plus atomic hard-link publication: a stopped process cannot leave a lock.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export function createNodeJournal(root) {
  if(typeof root!=='string'||!path.isAbsolute(root))throw new Error('ABSOLUTE_STATE_ROOT_REQUIRED');
  const folder=key=>path.join(root,createHash('sha256').update(key).digest('hex'));
  async function latest(dir) {
    const files=(await fs.readdir(dir)).filter(f=>/^\d{12}\.json$/.test(f)).sort();
    if(!files.length)return {version:-1,value:null};
    const file=files.at(-1);
    return {version:Number(file.slice(0,12)),value:JSON.parse(await fs.readFile(path.join(dir,file),'utf8'))};
  }
  async function publish(dir,version,value) {
    if(version>=1e12)throw new Error('JOURNAL_REVISION_LIMIT');
    const temp=path.join(dir,'.pending-'+randomUUID());
    let handle;
    try {
      handle=await fs.open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=null;
      try{await fs.link(temp,path.join(dir,String(version).padStart(12,'0')+'.json'));return true;}
      catch(e){if(e.code==='EEXIST')return false;throw e;}
    }finally{if(handle)await handle.close();await fs.rm(temp,{force:true});}
  }
  async function change(key,decide) {
    const dir=folder(key);await fs.mkdir(dir,{recursive:true});
    for(let i=0;i<40;i++) {
      const before=await latest(dir),decision=decide(before.value);
      if(!decision.write)return decision.result;
      if(await publish(dir,before.version+1,decision.value))return decision.result;
    }
    throw new Error('JOURNAL_BUSY');
  }
  return {
    get:async key=>{const dir=folder(key);try{return (await latest(dir)).value;}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    claim:(key,value)=>change(key,prior=>prior&&prior.status!=='not_applied'?{result:false}:{write:true,value,result:true}),
    put:(key,value)=>change(key,()=>({write:true,value,result:true})),
    reset:(key,evidence)=>change(key,prior=>{if(prior?.status!=='uncertain'||!evidence)throw new Error('RESET_REQUIRES_REMOTE_EVIDENCE');return {write:true,value:{status:'not_applied',evidence},result:true};})
  };
}
