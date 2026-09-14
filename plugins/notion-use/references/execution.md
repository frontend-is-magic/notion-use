# 执行约定

## 平台路由门槛（先于任何 API 调用）

仅当用户当前请求的**目标平台**是 Notion 才使用本插件：显式写 Notion、提供需要操作的 notion.so/notion.site/app.notion.com 页面，或“继续补充这篇”等唯一指向本会话已选定 Notion 页面的承接请求。仅因当前已安装 Notion、内容提到 Notion、读取来源是 Notion、普通“创建文档/笔记”、存在评论，不构成触发依据。

明确要求飞书/Lark、Word、Google Docs、Markdown 文件等其他输出平台时本插件零动作，不调用 Notion API、不改变文风、不生成本插件封面。多平台任务只接管明确的 Notion 子任务。例如“把 Notion 文章整理成飞书文档”是读取 Notion 的来源任务，不触发 create-notion/notion-rules；“同时创建 Notion 和飞书两份文档”仅 Notion 那份使用本插件。

## 自动化边界

普通创建、分类、编辑、视觉生成、已授权的评论修复/回复无需对话确认。不要求用户选项、复制文本、上传图、打开页面或重试任务。分类候选在已授权且合适的受众范围中按最高置信度决定，不跨安全边界比较分数。删除文档（含删除子页标签、归档/进废纸篓）必须展示具体对象并获得用户确认；本插件运行时不提供删除入口。

“跳过权限审批”仅表示跳过多余的对话确认；不能绕过平台/OS/native approval、安全策略和独立身份验证。需要权限或报错时优先使用当前已安装的 automation-first，认证相关使用 credential-recovery；这两个可选技能在云端未安装时，遵守当前宿主的官方授权流程和本段边界，不请求用户安装技能，不引用开发者机器路径。自动执行任务范围内的合法恢复及一次重试，不能自批审批、切换身份、提高角色、公开共享、导出 Cookie/token。后台途径优先；用户活跃时禁止抢焦点；本插件无 GUI/定时后台任务。全部允许路径耗尽则返回真实状态而非向用户布置手工步骤。

## 复用范围

原 Notion 插件负责连接、权限与底层 search/fetch/create_pages/update_page/get_comments/create_comment/upload、数据库/任务/会议/研究模板。本插件只加有必要的编排与约束。以当前 ALL_TOOLS schema 为准；原插件 0.1.8 的部分文本禁止 insert_content，但本次实际 schema 已支持。不能照搬旧 skill 的过时字段或询问门禁。

首次内容搜索前 fetch(self)，ai_search 可用则使用它，否则 search；不通过购买计划或扩大 scope 获得功能。private/shared/team 列表不同于全文搜索，必须分页。只读已可见的工作空间内容。团队列表不是页面 ACL 证明：必须 fetch 实际父页并结合用户任务确认该团队位置。不会发布页面到公开互联网。

## 脚本与 API 的连接

`runtime.js` 是无依赖 JavaScript。AI 生成 plan，脚本负责请求、分页、匹配和回读。`codex-bridge.js` 接收当前宿主的官方 Notion 工具，不读取账号凭据。通过 `.app.json` 引用现有 Notion 应用；不创建第二个 MCP 服务，也不打包会使 GitHub 导入变成 Desktop only 的 MCP 配置。

先检查当前工具环境，自动选择下面一种已可用执行路径，不要求用户选择：

- 有官方 shell 工具：注入 `host.execute`，使用 Python 标准库 `journal.py`。
- 有官方 Node REPL 和可写工作目录：使用 `node-journal.mjs`；跨工具运行环境用 `createNodeJournalBridge`，没有 shell 也可运行。
- 有其他已授权原子持久化能力：注入 `{get,claim,put}` journal；`claim` 必须原子并持久化，不能用本轮 JS Map 冒充。
- 没有上述执行/存储能力：返回 `PERSISTENT_JOURNAL_UNAVAILABLE`，保留已准备内容，不声称完整自动化可运行。插件导入成功和具体聊天具备运行环境是两项独立事实。

插件根目录 ROOT 取当前技能真实安装/挂载路径，不使用开发者机器上的路径。STATE 取宿主为插件提供的可写数据目录；没有专用目录则使用当前可持久保存工作目录下的 `.notion-use-state`。不同云任务的临时文件系统可能不共享；状态缺失时先通过 Notion 远端内容/讨论对账，禁止假设旧操作尚未执行。只确认当前宿主实际承诺的持久化范围。

### Shell 宿主

在工具编排运行环境中加载 runtime.js 与 codex-bridge.js 后：

```javascript
const client=createNotionUse(tools,ALL_TOOLS,ROOT,STATE,{
  execute: actualShellTool
});
```

`actualShellTool` 适配当前官方 shell 工具，输入 `{cmd,max_output_tokens}`，返回 `{exit_code,output}`。Codex 已有 `tools.exec_command` 时可省略 execute。所有文件访问均走宿主允许的路径与权限。

### Node 宿主（无需 shell）

下面的 `runNode` 必须绑定当前可用 Node REPL 工具；工具名和 schema 从当前工具目录读取。ROOT 与 STATE 使用上面的宿主实际路径。

```javascript
// runNode(code) => 当前官方 Node REPL 工具返回值。
for (const file of ['runtime.js','codex-bridge.js']) {
  const code="var nuFs=await import('node:fs/promises'); nodeRepl.write('NU_SOURCE:'+JSON.stringify(await nuFs.readFile("+
    JSON.stringify(ROOT+'/scripts/'+file)+",'utf8')));";
  const result=await runNode(code);
  if(result.isError)throw new Error('PLUGIN_RUNTIME_UNAVAILABLE');
  const output=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  const match=output.match(/NU_SOURCE:([^\n]+)/);
  if(!match)throw new Error('PLUGIN_SOURCE_UNAVAILABLE');
  (0,eval)(JSON.parse(match[1]));
}
const journal=createNodeJournalBridge(runNode,ROOT+'/scripts/node-journal.mjs',STATE);
const client=createNotionUse(tools,ALL_TOOLS,ROOT,STATE,{journal});
```

如果当前 Notion 工具不是默认命名格式，给 host.bindings 传入从当前工具 schema 核实的 `{fetch:真实工具名, create_pages:真实工具名,...}`，不能猜名。Node 只处理本地文件和纯数据；所有 Notion 访问通过已连接应用由宿主执行，不把 token 注入脚本。

operationId 包含工作空间、目标父/页面和本次请求的稳定标识；同次重试不随机换 ID。记录只含状态、页面 ID/URL、阅读时长与已处理评论版本摘要，不含正文、上传授权、签名 URL 或账号凭据。Node 与 Python journal 不能同时操作同一个 STATE；跨宿主切换先完成远端对账，再使用该宿主自己的数据目录。

## Plan 契约

创建：`{operationId,parentId,parentLocation,privateRoot?,visibility:'private'|'shared'|'team',title,content,icon,cover,visuals:{aiGenerated:true,inspected:true,prompt},documentType?,densityOverrideReason?,concise?,shortForm?,isCategory?,verify:[exactAnchors]}`。parentLocation 必须从计划阶段 `NotionUse.location(await client.fetchPage(parentId))` 保存，或使用 scan 节点的 location；写前和写后重新比较，移动位置则重新分类。此快照核验目录位置，不等于完整 ACL 查询，接口未返回的共享权限不可推断。顶层私人分类显式 `privateRoot:true` 且不填 parentId。team 必须有实际父页证据 teamEvidence。public 标签只指已共享父页并需要 existingSharedParent；不调用发布 API。

编辑：`{operationId,pageId,baseContent,mode:'append'|'prepend'|'patch'|'replace',documentType?,enforceIllustrations?,densityOverrideReason?,content?,updates?:[{old_str,new_str}],explicitReplace?,icon?,cover?,verify?}`。baseContent 必须来自本次 fetch 的 body；AI 不手工重建快照。默认禁止子页面删除或移动；特殊块只做精准编辑。

评论：`client.comments(pageId,scope)` 返回原始评论与 pending。`client.reply({operationId,pageId,discussionId,sourceKey,text,scope})` 在发送前保留 authorIds/blockIds 范围再次读取讨论。成功回复后记录已处理人工评论 ID 与内容摘要，不记录评论正文，其他作者未处理的问题会继续保留。正文修复是独立的 edit 操作，失败不发送“已修复”。

## 幂等、失败与并发

journal.claim 使用排他创建，在外部写入之前落盘。已 verified 返回原 receipt；pending/uncertain 返回 RECONCILE_REQUIRED，不盲目重发。用父页、目标页或讨论回读确认到底生效没有，再写 verified receipt；无法判断则保持 uncertain。已确认没有生效时，可由代理运行 `journal.py reset --root ... --key ... --value '{"evidence":"具体远端未生效证据"}'`，只重置 uncertain 记录；仍使用原 operationId，不另换 ID 绕过去重。追加内容、评论和新页面都是非幂等请求，不能只因网络失败就自动重试。读取可按服务 Retry-After 做有限重试；只认实际返回的状态和 schema。

写前正文快照比较用于发现大多数并发编辑；Notion 当前接口没有原子 compare-and-swap，检查与写入之间仍有竞争窗口。使用最小 patch，冲突后重新取证一次；不承诺跨客户端强事务。未知块/截断/权限不可见内容不能整页重写。异步任务只使用返回的 task id，成功后再进行依赖操作；等待预算耗尽返回 ASYNC_PENDING，不创建替代页面。

## 图标与封面上传

先用当前宿主内置图像生成能力生成 PNG，检查像素尺寸与视觉。通过原 Notion create_file_upload 获取只允许上传该文件的临时句柄。`upload.py <local.png>` 等待一行 JSON；代理通过内存 stdin 传递返回对象，TTY 可用时脚本关闭终端回显，将 curl 配置从 stdin 传递，不把 URL/header 放 argv 或文件。不打印、保存临时授权对象，失败仅输出状态码。一次句柄只发送一次；过期则重新申请对应文件上传句柄，禁止读取账号 token。

附件 markdown_source 可用于正文。**2026-09-14 实测：当前 MCP icon 不接受 file-upload://，返回 Invalid page icon URL；不能拿公开 REST 的 file_upload 对象格式套用到 MCP string 字段。** 对图标和封面直接使用已核验的稳定 HTTPS 图片地址。有已授权图片存储工具时，用该工具上传自绘、不含正文或敏感细节的素材；只上传实际生成的图像，不上传文档正文。图片存储使用当前连接的工具或官方接口，不假定本机 CLI 或公司内网可用。上传目录使用 `notion-use/<日期>/<任务短ID>`，身份取该工具已验证的当前身份；不能切换账号、注册图床或索取 token。

上传后用 GET 检查状态、Content-Type 和实际字节/尺寸，不输出 Set-Cookie 或授权响应头，再调用 create/update 的 icon/cover HTTPS URL。回读必须同时看到两个非空 native 元数据。不能使用临时签名 URL，不能把 CDN 上传成功当作 Notion 已绑定。已有合格、同主题的自绘素材可以复用，减少等待。没有可用图片存储能力时保留本地产物并报告 COVER_BINDING_UNAVAILABLE，不手动交接。
## 交付状态

明确区分：本地校验通过、API 已接收、异步完成、内容已回读、原生评论已关闭。只报告确已完成项。每次写入报告页面实际位置和链接；评论闭环报告正文修改和回复各自状态。请求创建的是介绍文档，不会自动 convert_page_to_skill 把页面标成 Notion 原生 Skill。

## 评论 reaction 与正文插图

回复完成后必须按 [comment-reactions.md](comment-reactions.md) 给选定原人工评论补 🤖 reaction。host.ensureReaction 接收已验证目标并返回实际回读证据；缺少接口时返回 reactionJobs，使用已授权 UI 完成后 confirmReaction。不能把回复成功等同 reaction 成功。

正文配图遵守 [visual-density.md](visual-density.md)。新建/重写默认执行 requireIllustrations；纯文字类型必须显式给 documentType，默认 knowledge 不豁免。
