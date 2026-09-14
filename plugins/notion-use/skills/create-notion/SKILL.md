---
name: create-notion
description: 创建或保存 Notion 笔记时使用，自动归类到私人、已有共享或团队位置。只有目标明确为 Notion 或承接已确认 Notion 任务才触发；创建飞书/Lark/Word/Google Docs 文档及仅把 Notion 当来源时不触发。
---

> 路由前置：只接管 Notion 目标；普通“创建文档”、把 Notion 来源写到飞书等请求不得触发。先遵守 execution.md 的平台路由门槛。

# 创建 Notion 笔记

先读 [共享执行约定](../../references/execution.md) 和 [notion-rules](../notion-rules/SKILL.md)。使用现有 Notion 连接；不重建账号认证、数据库 CRUD 或研究工作流。

1. 调用脚本 `client.preflight()`；读取当前身份、工作空间和能力。用户给了父页面则优先 `fetchPage`；否则先 `scan()` 获取私人目录树，按任务需要再枚举 shared pages、teams 并读取候选根。搜索只用于补充候选，不能冒充全量目录。默认扫描 3 层/80 页，`unvisited` 非空时沿候选分支继续扫描，直到实际父目录及祖先规则都已读取。数据库需读取 schema 和 data source，不作为普通 page parent。
2. AI 判断内容用途、受众与敏感性，输出候选 `{id,title,path,visibility,confidence,reasons}`。显式父目录优先；有明确团队协作目的时选已可见且已核验的团队父页，已有公共知识库语境时选共享父页，其余默认私人。`visibility=public` 仅指已共享位置，不是发布到互联网。不得创建公开分享、改变 ACL 或切换账号来实现分类。
3. 用 `NotionUse.choose` 在相同受众范围中选置信度最高项；分数是 AI 决策分，不是统计概率。置信度接近时看目录收录边界和当前任务链接，再按稳定路径顺序决定。无法核实共享范围时自动落到私人草稿，并明确说明实际位置。新目录只在已有分类不匹配且主题可持续复用，或用户明确指定不存在的目录时创建，避免每篇一层。
4. 大目录用带内容的普通 Notion 页面，不能用附件 `create_folder`。新目录按 `category-template.md` 同次写入用途、收录边界与默认折叠规则块，并生成图标、封面。现有目录规则只读，不擅自替换。
5. 查父页的同名子页并 fetch：内容相同则复用，用户明确要更新则转 edit-notion；同名但不同内容时使用能区分主题的标题。把当前父页的 `NotionUse.location(page)` 记入 plan.parentLocation；创建前和回读后由脚本核对位置未发生变化。
6. AI 写一句话总结、正文和折叠细节，按规则选择文风和画面。脚本 `lint` 校验；生成并上传图标、封面。AI 决策用 JSON 保存到本次 `work/`，记录选择理由和父 ID，不记录凭据。
7. 运行 `client.create(plan)`，由脚本完成 API 创建及回读。新目录与笔记分为两个独立 operationId；目录成功后笔记失败，只续写笔记。回读父页确认子页面关系，报告实际路径、链接和已验证范围。

无需让用户选目录、复制内容、上传图片或确认一般写入。身份、权限或平台能力无法自动满足时按共享约定处理；不声称成功。
