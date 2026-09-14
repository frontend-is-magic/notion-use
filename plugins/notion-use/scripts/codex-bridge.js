/* Inject the current host's official Notion tools and journal; no account credentials. */
(globalThis.createNotionUse = function(tools, catalog, pluginRoot, stateRoot, host={}) {
  const q=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
  const names=Object.fromEntries(['fetch','search','ai_search','create_pages','update_page','get_comments','create_comment','get_async_task','list_private_pages','list_shared_pages','get_teams'].map(short=>{
    const explicit=host.bindings?.[short];
    const matches=explicit?catalog.filter(x=>x.name===explicit):catalog.filter(x=>x.name.endsWith('__notion_'+short)||x.name.endsWith('__notion_notion_'+short));
    if(matches.length>1)throw new Error('AMBIGUOUS_NOTION_CONNECTION');
    return [short,matches[0]?.name];
  }));
  const execute=host.execute || tools.exec_command;
  const safe=value=>{
    if(value.result){const r=value.result;return {...value,result:Object.fromEntries(['status','id','url','reading','nativeResolved','discussionId'].filter(k=>k in r).map(k=>[k,r[k]]))};}
    return value;
  };
  async function journalOp(action,key,value={}) {
    if(!execute)throw new Error('PERSISTENT_JOURNAL_UNAVAILABLE');
    if(!pluginRoot||!stateRoot)throw new Error('HOST_PATHS_REQUIRED');
    const r=await execute({cmd:['python3',q(pluginRoot+'/scripts/journal.py'),action,'--root',q(stateRoot),'--key',q(key),'--value',q(JSON.stringify(safe(value)))].join(' '),max_output_tokens:2000});
    if(r.exit_code!==0)throw new Error('JOURNAL_IO_FAILED');return JSON.parse(r.output);
  }
  const supplied=host.journal;
  if(supplied && ['get','claim','put'].some(k=>typeof supplied[k]!=='function'))throw new Error('INVALID_JOURNAL_ADAPTER');
  const journal=supplied?{get:k=>supplied.get(k),claim:(k,v)=>supplied.claim(k,safe(v)),put:(k,v)=>supplied.put(k,safe(v))}:
    {get:key=>journalOp('get',key),claim:(key,value)=>journalOp('claim',key,value),put:(key,value)=>journalOp('put',key,value)};
  return NotionUse.createClient(async(short,args)=>{
    if(!names[short] || typeof tools[names[short]]!=='function')throw new Error('CAPABILITY_UNAVAILABLE:'+short);
    return tools[names[short]](args);
  },{journal,pause:host.pause || (ms=>new Promise(resolve=>setTimeout(resolve,ms)))});
});

// Bridge from the tool-orchestration isolate into a host Node REPL. No shell or network required.
(globalThis.createNodeJournalBridge = function(runNode,modulePath,stateRoot) {
  if(typeof runNode!=='function'||!modulePath||!stateRoot)throw new Error('NODE_HOST_REQUIRED');
  const allowed=new Set(['get','claim','put','reset']);
  async function op(action,key,value) {
    if(!allowed.has(action))throw new Error('UNSUPPORTED_JOURNAL_OPERATION');
    const input=JSON.stringify({modulePath,stateRoot,action,key,value});
    const code=`var nuInput=${input}; var nuUrl=await import('node:url'); var nuModule=await import(nuUrl.pathToFileURL(nuInput.modulePath).href); var nuJournal=nuModule.createNodeJournal(nuInput.stateRoot); var nuResult=await nuJournal[nuInput.action](nuInput.key,nuInput.value); nodeRepl.write('NU_JOURNAL_RESULT:'+JSON.stringify(nuResult));`;
    const result=await runNode(code);
    if(result?.isError)throw new Error('JOURNAL_IO_FAILED');
    const output=typeof result==='string'?result:(result?.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');
    const match=output.match(/NU_JOURNAL_RESULT:([^\n]+)/);
    if(!match)throw new Error('JOURNAL_RESPONSE_INVALID');
    return JSON.parse(match[1]);
  }
  return {get:key=>op('get',key),claim:(key,value)=>op('claim',key,value),put:(key,value)=>op('put',key,value),reset:(key,evidence)=>op('reset',key,evidence)};
});
