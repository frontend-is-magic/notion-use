/* Evaluate this file in Codex functions, injecting the already connected Notion tools.
   No tokens, network clients, background agents or credential stores. */
(globalThis.NotionUse = (() => {
  const fail = (code, detail = '') => { throw Object.assign(new Error(code + (detail ? ': ' + detail : '')), {code}); };
  const idOf = x => String(x || '').match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i)?.[0].replace(/-/g, '').toLowerCase();
  const decode = x => x.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const attrs = x => Object.fromEntries([...x.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
  const unpack = r => {
    if (r?.isError) { const message=(r.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(' ').replace(/https?:\/\/[^\s\"<>]+/g,'[URL]').slice(0,1600); fail('PROVIDER_ERROR',message); }
    if (r?.structuredContent) return r.structuredContent;
    if (Array.isArray(r?.content)) {
      const s = r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      try { return JSON.parse(s); } catch { return {text:s}; }
    }
    return r;
  };
  const body = p => {
    const m = (p.text || '').match(/<content>\n?([\s\S]*?)\n?<\/content>/);
    if (m) return m[1];
    if (/<blank-page>/.test(p.text || '')) return '';
    fail('UNSUPPORTED_PAGE_SHAPE');
  };
  const complete = p => {
    if (p.truncated || p.unknown_block_count > 0 || p.unknown_block_ids?.length || /<unknown\b/.test(p.text || '')) fail('INCOMPLETE_PAGE');
    return p;
  };
  const links = content => [...content.matchAll(/<(page|database|folder)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(m => ({kind:m[1], ...attrs(m[2]), title:decode(m[3]), tag:m[0]}));
  const plain = s => s.replace(/```[\s\S]*?```/g,'').replace(/<[^>]+>/g,'').replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[*_`#]/g,'');
  function reading(content) {
    // Count only expanded narrative; toggles and code are separately reported.
    let depth=0, fence=false, visible=[], hidden=0;
    for (const line of content.split('\n')) {
      if (/^\s*<details\b/.test(line)) depth++;
      if (/^\s*```/.test(line)) { fence=!fence; continue; }
      if (depth || fence) hidden += line.length; else visible.push(line);
      if (/^\s*<\/details>/.test(line)) depth--;
      if (depth<0) fail('INVALID_TOGGLE');
    }
    if (depth || fence) fail('UNCLOSED_BLOCK');
    const text=plain(visible.join('\n'));
    const cjk=(text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)||[]).length;
    const words=(text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,' ').match(/[\p{L}\p{N}]+/gu)||[]).length;
    return {minutes:Math.round((cjk/400+words/220)*100)/100,cjk,words,foldedOrCodeChars:hidden};
  }
  const textUnits = text => {
    const clean=plain(text).replace(/https?:\/\/\S+/g,'');
    const cjk=(clean.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)||[]).length;
    const words=(clean.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,' ').match(/[\p{L}\p{N}]+/gu)||[]).length;
    return cjk+words;
  };
  const textOnlyTypes=new Set(['summary','brief','meeting-minutes','checklist','index','changelog']);
  function illustrationAudit(content,options={}) {
    if((options.textOnly && options.explicitTextOnly) || textOnlyTypes.has(options.documentType) || options.isCategory)
      return {required:false,sections:[],errors:[],warnings:[]};
    const sections=[{scope:'main',content:''}];let depth=0,fold,fence=null;
    for(const line of content.split('\n')) {
      const mark=line.match(/^[\t ]*(`{3,}|~{3,})/);
      if(fence || mark){(depth?fold:sections[0]).content+=line+'\n';if(!fence)fence=mark[1];else if(mark&&mark[1]===fence&&line.trim()===fence)fence=null;continue;}
      if(/^\s*<details\b/.test(line)){if(!depth){fold={scope:'appendix-'+sections.length,content:''};sections.push(fold);}depth++;continue;}
      if(/^\s*<\/details>/.test(line)){depth--;continue;}
      if(/^\s*<summary>/.test(line))continue;
      (depth?fold:sections[0]).content+=line+'\n';
    }
    const excluded=new Set([options.cover,options.icon].filter(Boolean)),seen=new Set();
    const results=sections.map(section=>{
      const source=section.content.replace(/<!--[\s\S]*?-->/g,'');
      const tokens=/(^[\t ]*(`{3,}|~{3,})([^\n]*)\n[\s\S]*?^[\t ]*\2[^\n]*(?:\n|$))|((?<!\\)!\[[^\]]*\]\(([^\n)]+)\))|(<image\b[^>]*\bsrc=["']([^"']+)["'][^>]*(?:\/>|>[\s\S]*?<\/image>))|((?<![\\`])(`+)(?!`)[^\n]*?\9(?!`))/gm;
      let offset=0,units=0,gap=0,maxGap=0;const figures=[];
      const addText=text=>{const count=textUnits(text);units+=count;gap+=count;maxGap=Math.max(maxGap,gap);};
      for(const match of source.matchAll(tokens)) {
        addText(source.slice(offset,match.index));offset=match.index+match[0].length;
        let key;
        if(match[8]) {
          // Inline code is an example, not rendered image content.
        } else if(match[1]) {
          if(match[3].trim()==='mermaid') {
            const diagram=match[1].replace(/^[^\n]*\n/,'').replace(/[\t ]*(`{3,}|~{3,})[^\n]*\n?$/,'').trim();
            if(diagram)key='mermaid:'+diagram;
          }
        } else {
          const url=(match[5]||match[7]||'').trim().split(/\s+["']/)[0];
          if(/^(https?:\/\/|file-upload:\/\/)/.test(url) && !excluded.has(url))key=url;
        }
        if(key && !seen.has(key)){seen.add(key);figures.push({key,at:units});gap=0;}
      }
      addText(source.slice(offset));
      const minimum=section.scope==='main'?Math.max(1,Math.ceil(units/5000)):(units>=2000?Math.ceil(units/5000):0);
      const maximum=Math.max(minimum,Math.floor(units/2000));
      const target=Math.max(minimum,Math.min(maximum,Math.round(units/3000)));
      const errors=[],warnings=[];
      if(figures.length<minimum)errors.push('INLINE_ILLUSTRATIONS_REQUIRED');
      if(maxGap>5000)errors.push('ILLUSTRATION_GAP_TOO_LONG');
      if(figures.length>maximum && !options.densityOverrideReason)warnings.push('DENSITY_JUSTIFICATION_REQUIRED');
      return {scope:section.scope,units,figures:figures.length,minimum,target,maximum,maxGap,errors,warnings};
    });
    return {required:true,sections:results,errors:results.flatMap(r=>r.errors.map(code=>({scope:r.scope,code}))),warnings:results.flatMap(r=>r.warnings.map(code=>({scope:r.scope,code})))};
  }
  function requireIllustrations(content,options={}) {
    const audit=illustrationAudit(content,options);
    if(audit.errors.length)fail(audit.errors[0].code,audit.errors[0].scope);
    if(audit.warnings.length)fail(audit.warnings[0].code,audit.warnings[0].scope);
    return audit;
  }
  function lint(d) {
    if (!d.title?.trim() || !d.content?.trim()) fail('EMPTY_DOCUMENT');
    const first=d.content.trim().split('\n')[0];
    if (/^[#<\-]/.test(first) || first.length>220) fail('ONE_SENTENCE_SUMMARY_REQUIRED');
    if (/\bopen(?:=|\s|>)/.test((d.content.match(/<details[^>]*>/g)||[]).join(''))) fail('TOGGLE_MUST_BE_CLOSED');
    for (const m of d.content.matchAll(/<summary>[^<]*<\/summary>\n([\s\S]*?)<\/details>/g)) {
      if (m[1].split('\n').some(l=>l.trim() && !l.startsWith('\t'))) fail('TOGGLE_CHILD_NOT_INDENTED');
    }
    if (/^#\s+/.test(first) || d.content.startsWith('# '+d.title)) fail('DUPLICATE_TITLE');
    const r=reading(d.content);
    if (d.concise && !d.shortForm && (r.minutes<3 || r.minutes>10)) fail('READING_TIME_OUTSIDE_3_10',String(r.minutes));
    if (!d.icon || !d.cover || d.icon==='none' || d.cover==='none') fail('VISUALS_REQUIRED');
    if (!d.visuals?.aiGenerated || !d.visuals?.inspected || !d.visuals?.prompt) fail('VISUAL_PROVENANCE_REQUIRED');
    if (!/^https:\/\//.test(d.cover) || !/^https:\/\//.test(d.icon)) fail('STABLE_VISUAL_URL_REQUIRED');
    r.illustrations=requireIllustrations(d.content,d);
    return r;
  }
  function choose(candidates, {explicitId, visibility='private'}={}) {
    const available=candidates.filter(x=>x.accessible!==false && idOf(x.id||x.url));
    if (explicitId) { const c=available.find(x=>idOf(x.id||x.url)===idOf(explicitId)); if (!c) fail('EXPLICIT_PARENT_NOT_FOUND'); return c; }
    const ranked=available.filter(x=>x.visibility===visibility).sort((a,b)=>(b.confidence||0)-(a.confidence||0)||String(a.path||a.title).localeCompare(String(b.path||b.title))||String(a.id).localeCompare(String(b.id)));
    return ranked[0] || null;
  }
  function preserve(oldContent, next, targeted=false) {
    for (const l of links(oldContent)) if (!next.includes(l.tag)) fail('CHILD_CONTENT_PRESERVATION_REQUIRED',l.title);
    for (const l of links(next)) if (!oldContent.includes(l.tag)) fail('CHILD_MOVE_NOT_AUTHORIZED',l.title);
    if (/<synced_block_reference|<meeting-notes/.test(oldContent)) {
      if(!targeted)fail('SPECIAL_BLOCK_REQUIRES_TARGETED_EDIT');
      for(const m of oldContent.matchAll(/<(synced_block_reference|meeting-notes)\b[^>]*>[\s\S]*?<\/\1>/g))if(!next.includes(m[0]))fail('SPECIAL_BLOCK_CHANGE_NOT_SUPPORTED');
    }
    return next;
  }
  function editArgs(p, plan) {
    complete(p); const old=body(p);
    if (plan.baseContent !== old) fail('STALE_SNAPSHOT');
    const args={page_id:plan.pageId,allow_async:false,allow_deleting_content:false};
    if (plan.icon) args.icon=plan.icon;
    if (plan.cover) args.cover=plan.cover;
    if (plan.mode==='append' || plan.mode==='prepend') {
      if (!plan.content?.trim()) fail('EMPTY_EDIT');
      if (links(plan.content).length) fail('CHILD_MOVE_NOT_AUTHORIZED');
      return {...args,command:'insert_content',position:{type:plan.mode==='append'?'end':'start'},content:plan.content};
    }
    if (plan.mode==='replace') {
      if (!plan.explicitReplace) fail('EXPLICIT_REPLACE_REQUIRED');
      return {...args,command:'replace_content',new_str:preserve(old,plan.content)};
    }
    if (plan.mode==='patch') {
      if (!plan.updates?.length) fail('EMPTY_EDIT');
      let after=old;
      for (const u of plan.updates) {
        if (!u.old_str || after.split(u.old_str).length!==2) fail('ANCHOR_NOT_UNIQUE');
        after=after.replace(u.old_str,u.new_str);
      }
      preserve(old,after,true);
      return {...args,command:'update_content',content_updates:plan.updates,properties:{}};
    }
    fail('INVALID_EDIT_MODE');
  }
  function discussions(raw) {
    const xml=raw.text || raw.comments || (typeof raw.discussions==='string'?raw.discussions:'') || '';
    if (Array.isArray(raw.discussions)) return raw.discussions;
    if (typeof xml!=='string') fail('UNSUPPORTED_COMMENTS_SHAPE');
    const out=[];
    for (const d of xml.matchAll(/<discussion\b([^>]*)>([\s\S]*?)<\/discussion>/g)) {
      const a=attrs(d[1]), comments=[];
      for (const c of d[2].matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
        const ca=attrs(c[1]); comments.push({id:ca.id||ca.url,author:ca.author||ca.author_id||idOf(ca['user-url']),text:decode(c[2].trim()),...ca});
      }
      out.push({...a,id:a.url||a.id,block_id:a.block_id||String(a.url||a.id||'').split('/')[3],resolved:a.resolved==='true',comments});
    }
    if (!out.length && /<discussion\b/.test(xml)) fail('UNSUPPORTED_COMMENTS_SHAPE');
    return out;
  }
  const aiText = s => /^\s*🤖\s*(?:\*\*)?AI[：:](?:\*\*)?/.test(plain(s));
  const sourceId=c=>{let h=2166136261;for(const ch of (c.text||'')){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return c.id+'@'+(h>>>0).toString(16);};
  function pending(ds, scope={}, coverage={}) {
    const result=[];
    for (const d of ds) {
      if (d.resolved) continue;
      if (scope.discussionIds && !scope.discussionIds.includes(d.id)) continue;
      if (scope.blockIds && !scope.blockIds.includes(d.block_id)) continue;
      const cc=d.comments || []; let lastAI=-1;
      cc.forEach((c,i)=>{if(aiText(c.text||''))lastAI=i;});
      const covered=coverage[d.id];
      const human=(covered?cc:cc.slice(lastAI+1)).filter(c=>!aiText(c.text||'') && (!covered || !covered.includes(sourceId(c))) && (!scope.authorIds || scope.authorIds.includes(c.author)));
      if(human.length) result.push({discussionId:d.id,comments:human,sourceKey:human.map(sourceId).join('|')});
    }
    return result;
  }
  const normalized=s=>s.split('\n').map(l=>l.trimEnd()).filter(l=>l.trim()&&l.trim()!=='<empty-block/>').join('\n');
  const location=p=>JSON.stringify([p.path||null,(p.text||'').match(/<ancestor-path>([\s\S]*?)<\/ancestor-path>/)?.[1]||'',p.parent||null,p.teamspace_id||null]);
  function createClient(call, {journal, pause=async()=>{}, now=()=>Date.now(), ensureReaction, reactionTransport='ui'}={}) {
    let self, specLoaded=false;
    const api=async(name,args) => unpack(await call(name,args));
    async function preflight() { self=await api('fetch',{id:'self'}); return self; }
    async function markdown() {if(!specLoaded){await api('fetch',{id:'notion://docs/enhanced-markdown-spec'});specLoaded=true;}}
    async function fetchPage(id) { return complete(await api('fetch',{id,include_discussions:true})); }
    async function search(query, extra={}) {
      if(!self)await preflight();
      const access=self.self?.current_tool_access||self.current_tool_access||{};
      return api(access.ai_search?.status==='available'?'ai_search':'search',{query,...extra});
    }
    async function paginate(name, args={}) {
      const items=[],seen=new Set();let cursor;
      do { const r=await api(name,{...args,...(cursor?{cursor}:{})}); items.push(...(r.results||r.pages||r.teams||[]));
        const next=r.next_cursor||r.nextCursor;
        if(r.has_more && !next)fail('PAGINATION_INCOMPLETE');
        if(next && seen.has(next))fail('PAGINATION_LOOP');
        if(next)seen.add(next); cursor=next;
      }while(cursor);
      return items;
    }
    async function scan({roots, maxDepth=3,maxPages=80}={}) {
      if(!self)await preflight();
      const initial=roots || (await paginate('list_private_pages',{limit:100})).map(x=>({...x,visibility:'private'}));
      const queue=initial.map(x=>({...x,depth:0})),nodes=[],seen=new Set(),unvisited=[];
      while(queue.length){const x=queue.shift(),id=idOf(x.id||x.url);if(!id||seen.has(id))continue;seen.add(id);
        if(nodes.length>=maxPages){unvisited.push(x);continue;}
        try {const p=await fetchPage(id),content=body(p),kids=links(content);nodes.push({...x,id,url:p.url,title:p.title,content,children:kids,location:location(p),lastEdited:p.page_last_edited_at});
          for(const k of kids) {if(k.kind!=='page')continue;const child={...k,parentId:id,visibility:x.visibility,depth:x.depth+1,path:(x.path||x.title||'')+'/'+k.title};if(x.depth<maxDepth)queue.push(child);else unvisited.push(child);}
        }catch(e){unvisited.push({...x,error:e.code||'FETCH_FAILED'});}
      }
      return {workspaceId:self.self?.workspace?.id,checkedAt:now(),nodes,unvisited,complete:unvisited.length===0,coverage:'visible page tree only; databases and inaccessible content are not enumerated'};
    }
    async function settle(r) {
      const task=r.async_task|| (r.type==='async_task'?r:null);
      if(!task)return r;
      const id=task.id||task.task_id;if(!id)fail('ASYNC_TASK_ID_MISSING');
      for(let i=0;i<6;i++){const s=await api('get_async_task',{task_id:id});if(s.status==='succeeded')return s.result||s;if(['failed','cancelled'].includes(s.status))fail('ASYNC_FAILED');await pause(Math.min(1000*2**i,8000));}
      fail('ASYNC_PENDING',id);
    }
    async function receipt(key) {
      if(!journal || !key)fail('DURABLE_JOURNAL_REQUIRED');
      const prior=await journal.get(key);
      if(prior?.status==='verified')return {...prior.result,reused:true};
      if(prior && prior.status!=='not_applied')fail('RECONCILE_REQUIRED',key);
      return null;
    }
    async function once(key, fn) {
      const done=await receipt(key);if(done)return done;
      if(!await journal.claim(key,{status:'pending',startedAt:now()}))fail('OPERATION_ALREADY_CLAIMED');
      try {const result=await fn();await journal.put(key,{status:'verified',result});return result;}
      catch(e){await journal.put(key,{status:'uncertain',code:e.code||'UNKNOWN',at:now()});throw e;}
    }
    async function checkParent(plan) {
      if(!plan.parentId){if(!plan.privateRoot || plan.visibility!=='private')fail('EXPLICIT_PARENT_REQUIRED');return;}
      if(typeof plan.parentLocation!=='string')fail('PARENT_LOCATION_SNAPSHOT_REQUIRED');
      const parent=await fetchPage(plan.parentId);
      if(location(parent)!==plan.parentLocation)fail('PARENT_LOCATION_CHANGED');
      return parent;
    }
    async function create(plan) {
      const done=await receipt(plan.operationId);if(done)return done;
      lint(plan); await markdown(); await checkParent(plan);
      if(['public','shared'].includes(plan.visibility) && !plan.existingSharedParent)fail('PUBLICATION_NOT_SUPPORTED');
      if(plan.visibility==='team' && (!plan.parentId || !plan.teamEvidence))fail('TEAM_PARENT_EVIDENCE_REQUIRED');
      if(plan.isCategory && !plan.content.includes('<summary>目录规则</summary>'))fail('CATEGORY_RULES_REQUIRED');
      return once(plan.operationId,async()=>{
        const r=await settle(await api('create_pages',{allow_async:false,...(plan.parentId?{parent:{page_id:plan.parentId}}:{}),pages:[{properties:{title:plan.title},content:plan.content,icon:plan.icon,cover:plan.cover}]}));
        const page=(r.pages||r.results||[])[0]||r; const id=idOf(page.id||page.url);if(!id)fail('CREATED_ID_UNAVAILABLE');
        const fresh=await fetchPage(id),content=body(fresh);
        if(!fresh.icon||!fresh.cover)fail('VISUAL_READBACK_FAILED',id);
        if(normalized(content)!==normalized(plan.content))fail('CONTENT_READBACK_FAILED',id);
        const parent=await checkParent(plan);
        if(parent && !links(body(parent)).some(l=>idOf(l.url)===id))fail('PARENT_CHILD_READBACK_FAILED',id);
        return {status:'verified',id,url:fresh.url,reading:reading(content)};
      });
    }
    async function edit(plan) {
      const done=await receipt(plan.operationId);if(done)return done;
      await markdown();const p=await fetchPage(plan.pageId),args=editArgs(p,plan);
      if(!p.icon&&!args.icon || !p.cover&&!args.cover)fail('VISUALS_REQUIRED');
      let expected=plan.baseContent;
      if(plan.mode==='patch')for(const u of plan.updates)expected=expected.replace(u.old_str,u.new_str);
      else if(plan.mode==='append')expected+='\n'+plan.content;
      else if(plan.mode==='prepend')expected=plan.content+'\n'+expected;
      else expected=plan.content;
      if(plan.mode==='replace' || plan.enforceIllustrations || ((plan.mode==='append'||plan.mode==='prepend') && textUnits(plan.content)>=500))requireIllustrations(expected,{...plan,cover:plan.cover||p.cover?.external?.url,icon:plan.icon||p.icon?.external?.url});
      return once(plan.operationId,async()=>{
        await settle(await api('update_page',args));const fresh=await fetchPage(plan.pageId),content=body(fresh);
        if(normalized(content)!==normalized(expected))fail('CONTENT_READBACK_FAILED');
        preserve(plan.baseContent,content,true);
        if(!fresh.icon||!fresh.cover)fail('VISUAL_READBACK_FAILED');
        return {status:'verified',id:idOf(plan.pageId),url:fresh.url,reading:reading(content)};
      });
    }
    async function comments(pageId,scope={}) {
      const page=await fetchPage(pageId);
      const raw=await api('get_comments',{page_id:pageId,include_all_blocks:true,include_resolved:false});
      const ds=discussions(raw),coverage={};
      if(journal)for(const d of ds){const record=await journal.get('coverage:'+idOf(pageId)+':'+d.id);if(record?.sourceIds)coverage[d.id]=record.sourceIds;}
      return {page,raw,coverage,pending:pending(ds,scope,coverage)};
    }
    async function reply(plan) {
      const done=await receipt(plan.operationId);if(done)return completeReactions(done);
      const scope={...plan.scope,discussionIds:[plan.discussionId]};
      const snapshot=await comments(plan.pageId,scope);
      const pendingTarget=snapshot.pending.find(x=>x.discussionId===plan.discussionId);
      const target=pendingTarget?{...pendingTarget,comments:pendingTarget.comments.map(c=>({...c}))}:null;
      if(!target)return {status:'skipped_no_new_human_comment'};
      if(target.sourceKey!==plan.sourceKey)fail('COMMENT_CHANGED');
      if(!plan.text?.trim())fail('EMPTY_REPLY');
      if(aiText(plan.text))fail('PREFIX_MUST_BE_ADDED_ONCE');
      const text='🤖 **AI：**'+plan.text.trim();
      const originalThread=discussions(snapshot.raw).find(d=>d.id===plan.discussionId);
      const before={...originalThread,comments:originalThread.comments.map(c=>({...c}))};
      const oldIds=new Set(before.comments.map(c=>c.id));
      const replyResult=await once(plan.operationId,async()=>{
        const created=await api('create_comment',{page_id:plan.pageId,discussion_id:plan.discussionId,markdown:text});
        const createdId=created.id||created.comment_id||created.comment?.id;
        const check=await api('get_comments',{page_id:plan.pageId,discussion_id:plan.discussionId,include_all_blocks:true,include_resolved:true});
        const after=discussions(check).find(d=>d.id===plan.discussionId);
        const tailId=v=>String(v||'').match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi)?.at(-1)?.replace(/-/g,'');
        const newIndex=after?.comments.findIndex(c=>!oldIds.has(c.id) && (!createdId || c.id===createdId || (tailId(c.id)&&tailId(c.id)===tailId(createdId))) && plain(c.text||'').trim()===plain(text).trim()) ?? -1;
        if(newIndex<0 || after.comments.slice(newIndex+1).some(c=>target.comments.some(h=>h.id===c.id)))fail('COMMENT_READBACK_FAILED');
        let baseline=snapshot.coverage[plan.discussionId];
        if(!baseline){let lastAI=-1;before.comments.forEach((c,i)=>{if(aiText(c.text||''))lastAI=i;});baseline=before.comments.slice(0,lastAI+1).filter(c=>!aiText(c.text||'')).map(sourceId);}
        const sourceIds=[...new Set([...baseline,...target.comments.map(sourceId)])];
        await journal.put('coverage:'+idOf(plan.pageId)+':'+plan.discussionId,{sourceIds});
        return {status:'replied',nativeResolved:false,discussionId:plan.discussionId,replyOperationId:plan.operationId,pageId:plan.pageId,replyId:after.comments[newIndex].id,reactionTargets:target.comments.map(c=>({commentId:c.id,sourceId:sourceId(c)}))};
      });
      return completeReactions(replyResult);
    }
    const reactionKey=job=>'reaction:'+idOf(job.pageId)+':'+job.commentId+':'+job.sourceId;
    async function confirmReaction(job,evidence) {
      const original=await journal.get(job.replyOperationId);
      if(original?.status!=='verified' || original.result?.pageId!==job.pageId || original.result?.discussionId!==job.discussionId || !original.result.reactionTargets?.some(t=>t.commentId===job.commentId&&t.sourceId===job.sourceId))fail('REACTION_NOT_IN_VERIFIED_REPLY');
      if(evidence?.commentId!==job.commentId||evidence.emoji!=='🤖'||evidence.present!==true||evidence.actorMatches!==true)fail('REACTION_EVIDENCE_REQUIRED');
      const raw=await api('get_comments',{page_id:job.pageId,discussion_id:job.discussionId,include_all_blocks:true,include_resolved:true});
      const current=discussions(raw).find(d=>d.id===job.discussionId)?.comments.find(c=>c.id===job.commentId);
      if(!current||sourceId(current)!==job.sourceId||aiText(current.text||''))fail('REACTION_SOURCE_CHANGED');
      await journal.put(reactionKey(job),{status:'verified',commentId:job.commentId,emoji:'🤖',at:now()});
      return {commentId:job.commentId,status:'verified'};
    }
    const uiControlKey='control:notion-reaction-ui';
    async function resumeReactionUI(authorization) {
      if(authorization?.explicitUserResume!==true || !authorization.requestId)fail('EXPLICIT_USER_RESUME_REQUIRED');
      await journal.put(uiControlKey,{status:'resumed',requestId:authorization.requestId,at:now()});
    }
    async function completeReactions(result) {
      const targets=result.reactionTargets||[];
      if(!targets.length)return {...result,reactionStatus:'not_recorded',reactionJobs:[]};
      const completed=[],jobs=[];const control=await journal.get(uiControlKey);let guiStopped=reactionTransport!=='api' && control?.status==='suspended';
      for(const target of targets) {
        const job={...target,pageId:result.pageId,discussionId:result.discussionId,replyOperationId:result.replyOperationId,emoji:'🤖'};
        const previous=await journal.get(reactionKey(job));
        if(previous?.status==='verified'){completed.push({commentId:job.commentId,status:'verified'});continue;}
        if(guiStopped){jobs.push({...job,reason:'USER_CONTROL_ACTIVE'});continue;}
        if(typeof ensureReaction!=='function'){jobs.push({...job,reason:'REACTION_CAPABILITY_UNAVAILABLE'});continue;}
        try {
          const raw=await api('get_comments',{page_id:job.pageId,discussion_id:job.discussionId,include_all_blocks:true,include_resolved:true});
          const current=discussions(raw).find(d=>d.id===job.discussionId)?.comments.find(c=>c.id===job.commentId);
          if(!current||sourceId(current)!==job.sourceId||aiText(current.text||''))fail('REACTION_SOURCE_CHANGED');
          const evidence=await ensureReaction({...job,commentText:current.text,commentUrl:current.url,authorId:current.author});
          completed.push(await confirmReaction(job,evidence));
        } catch(e) {if(['USER_CONTROL_ACTIVE','BROWSER_CONTROL_INTERRUPTED','HUMAN_IDENTITY_PROOF_REQUIRED'].includes(e.code)){guiStopped=true;await journal.put(uiControlKey,{status:'suspended',reason:e.code,at:now()});}jobs.push({...job,reason:e.code||'REACTION_UNVERIFIED'});}
      }
      return {...result,reactionStatus:jobs.length?'pending':'verified',reactions:completed,reactionJobs:jobs};
    }
    return {preflight,search,scan,paginate,fetchPage,create,edit,comments,reply,confirmReaction,resumeReactionUI};
  }
  return {idOf,unpack,body,links,reading,textUnits,illustrationAudit,requireIllustrations,lint,choose,preserve,editArgs,discussions,pending,sourceId,normalized,location,createClient};
})());
