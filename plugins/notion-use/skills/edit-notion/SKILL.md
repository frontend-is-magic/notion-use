---
name: edit-notion
description: 编辑已有 Notion 笔记时使用，识别追加、局部修改和明确的全文覆盖。只有目标明确为 Notion 或承接已确认 Notion 页面才触发；飞书/Lark/Word/Google Docs 等其他平台不触发。
---

> 路由前置：只接管 Notion 目标；普通“创建文档”、把 Notion 来源写到飞书等请求不得触发。先遵守 execution.md 的平台路由门槛。

# 编辑 Notion 笔记

先读 [共享执行约定](../../references/execution.md) 和 [notion-rules](../notion-rules/SKILL.md)。先 fetch 当前页面与目标段落，再作语义决策，不凭搜索摘要修改。

| 意图 | 模式 | 影响范围 |
| --- | --- | --- |
| 补充、追加、续写、补一段 | append / prepend | 文首或文末新增；插入指定章节用 patch |
| 修改某处、纠正、替换这一段、润色指定部分 | patch | 唯一精确 old_str → new_str |
| 重写整篇、覆盖全文、以这版全文替换 | replace | 用户明确的完整正文；设置 explicitReplace=true |
| 只说“写入这些内容”，未表示替换 | append | 默认追加并说明选择，不反问 |

AI 判断语义、否定句和指代；不要用关键词命中替代判断。`不是覆盖，是追加` 必须追加。读取对应目录规则，但小改动保留原文风格，不扩大成整页重写。

执行：
1. `client.fetchPage(pageId)`；检查截断/unknown blocks、评论锚点和原生子页面。保存 `NotionUse.body(page)` 为 plan.baseContent。
2. 生成 plan（operationId、pageId、mode、baseContent、content 或 updates、verify）；大段新增/重写先 lint。补齐缺失封面和图标需要生成、上传、回读；已有合格视觉不必重复生成。
3. `client.edit(plan)` 在写入前重新 fetch，脚本比较 baseContent，唯一匹配锚点并校验子页面不丢失。冲突时自动重新读取、重新生成一次语义计划；再次冲突报告 CONCURRENT_EDIT_BLOCKED，不覆盖他人修改。
4. 全文替换保留原始 `<page>`、`<database>`、`<folder>` 标签。`mention-page` 不能代替子页标签。脚本永远不设置 allow_deleting_content=true；需要删除页面或子页面时进入唯一的删除确认点。
5. 回读目标内容和层级，核对未涉及的段落。写后验证失败或响应丢失时先对账，不重发追加/覆盖。报告实际模式和验证结果。

全文替换不等于删除文档；但移除子页标签可能删除文档，必须保留。对 synced block、meeting notes 等特殊块做局部精确编辑，不能用整页覆盖绕开未知块。
