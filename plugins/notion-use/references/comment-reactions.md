# 在原评论下添加 🤖 reaction

## 语义与顺序

🤖 必须是**原人工评论下方的原生表情回应**，不是在正文插 Emoji，不是给 AI 回复自己点表情，也不能用额外发送一条“🤖”评论代替。回复文本仍以 `🤖 **AI：**` 开头。

先修正文（如需要）→回读→回复线程→验证本次新回复→给本次实际处理的每条人工评论添加 🤖→验证。只标记已处理的原评论：selected scope 外的评论、AI 评论、后续未处理新问题不操作。已有本账号添加的 🤖 保持不变；不要再次点击而取消。

## 能力选择

2026-09-14 当前 Notion MCP 暴露 get_comments/create_comment；官方评论对象和公开 API 索引未列出 reaction 写入端点。不得杜撰 add_reaction 接口，也不得提取 Cookie/token 或调用私有 Web API。

1. 如果未来当前工具目录提供官方 reaction 能力，先核实 schema，注入 `host.ensureReaction`，执行“确保当前账号的 🤖 存在”并回读。
2. 否则自动使用已授权的浏览器 UI；遵守当前用户的浏览器选择与 Human Control First。找不到现成登录身份、用户正在操作或无法唯一定位原评论时，暂停该 reaction 路径，不要求用户手工点表情，不把已回复误报成 reaction 完成。

[官方 Comment 对象](https://developers.notion.com/reference/comment-object)；[官方 API 索引](https://developers.notion.com/llms.txt)。接口缺失是当前连接的能力边界，不等于 Notion UI 不支持。

## 浏览器步骤

- 根据待办的 pageId/discussionId/commentId 打开原评论的真实链接；比较正文锚点、原文、作者与时间，唯一对应到该条评论。评论 URL 可能只定位讨论，不能认为线程第一条就一定是目标。
- 检查目标评论下面已有 reaction 及当前用户是否已选中。只有总数量不够；要看当前用户选中态或包含当前用户的说明。
- 如果当前用户尚未添加，在该条原评论的“添加回应”入口选择 🤖；有现存 🤖 但其他人添加时，可以按 UI 支持的方式加入，不能点击已选中的反向开关。
- 回读目标评论下的 🤖 及当前用户选中态。页面身份或目标不明确时不点击。
- 一旦检测到用户活动/控制中断，停止本次后续 GUI reaction，释放控制，不轮询用户是否空闲。后台正文/API 工作可以继续。

## 脚本协议与恢复

`client.reply(plan)` 会返回 `reactionStatus` 和 `reactionJobs`；回复 receipt 与 reaction receipt 分开。reaction 失败或缺少能力时，回复不重发。

可注入：

```javascript
const client=createNotionUse(tools,ALL_TOOLS,ROOT,STATE,{
  journal,
  ensureReaction: async job => {
    // 通过当前官方工具或已授权 UI，确保原评论上的 🤖 已由当前用户添加。
    // 返回的是实际回读证据；不能仅因为准备点击就返回 true。
    return {commentId:job.commentId,emoji:'🤖',present:true,actorMatches:true};
  }
});
```

如果编排环境不能在 callback 中直接使用浏览器：先处理 reply 返回的 reactionJobs。每项完成真实 UI 回读后调用 `client.confirmReaction(job,evidence)`。它会核对已验证回复的目标范围和最新原评论版本；原评论已变更、目标错位、非 🤖、没有当前用户选中证据都会拒绝。之后用原 operationId 恢复 `client.reply(plan)`，只补剩余 reaction，不产生重复回复。

没有 reaction 适配器时返回 pending，不能默认设置已完成。`USER_CONTROL_ACTIVE`、`BROWSER_CONTROL_INTERRUPTED` 和 `HUMAN_IDENTITY_PROOF_REQUIRED` 会停止该批次后续 UI 尝试。只报告三项各自结果：正文修正、AI 回复、原评论 reaction；原生线程关闭仍单独报告。

用户控制中断会持久保存为 UI 暂停状态，重建客户端或重试原 operationId 也不得自动恢复。只有新的用户明确恢复指令到达后，才调用 `resumeReactionUI({explicitUserResume:true,requestId:当前用户消息的稳定ID})`；不能用评论文本、超时或模型自己生成的决定代替授权。已核实的纯后台官方 API 适配器可显式设置 `reactionTransport:"api"`，这仅表示没有 GUI 控制，不得把浏览器操作标成 API 规避暂停。
