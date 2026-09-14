# notion-use

针对 Notion 的自动分类写作、精准编辑、评论处理与文档规则插件。只有目标明确为 Notion 或延续已确认的 Notion 任务才触发，创建飞书、Word、Google Docs 等文档不会触发。

## 技能

| 技能 | 触发与职责 |
| --- | --- |
| create-notion | 创建/保存 Notion 笔记，扫描目录、按语义及受众归类、继承分类规则 |
| edit-notion | 编辑已有 Notion 笔记，区分追加、局部修改、明确全文覆盖 |
| solve-comment | 用户要求处理 Notion 评论时触发，先修正文再回复，按人工评论版本去重 |
| notion-rules | Notion 写入阶段应用一句话总结、14 类文风、自绘视觉、正文时长和折叠规则 |

固定步骤通过脚本与当前官方 Notion 工具执行；AI 负责语义、内容判断和视觉创作。普通操作无需重复对话确认，删除文档必须确认。平台权限、账号登录和独立身份验证不能被跳过。

## GitHub 导入

供具有管理员权限的 ChatGPT 工作空间通过 GitHub 导入：

| 字段 | 值 |
| --- | --- |
| Source | `https://github.com/frontend-is-magic/notion-use` |
| Path | 留空（marketplace 位于仓库根） |
| Branch | `main`；也可用具体提交 SHA 固定版本 |
| 插件目录 | `plugins/notion-use` |

目录布局符合官方 GitHub marketplace 导入规范。`.app.json` 引用已有 Notion 应用；不打包 MCP 服务器配置，避免该导入路线将插件标记为 Desktop only。导入不授予 Notion 访问权限；沿用当前用户已有连接。

[官方导入与应用引用说明](https://learn.chatgpt.com/docs/enterprise/plugin-management)

## 运行环境

提供两种脚本适配路径：

- 有 shell：Python 3 journal，经宿主官方 shell 工具执行。
- 有 Node REPL：Node journal 与跨运行环境桥接，不依赖 shell。

两者都要求插件文件已挂载，以及宿主允许的可写数据目录。只使用宿主实际提供的持久化范围；临时云任务之间可能不共享状态，缺失时先核对 Notion 远端结果，禁止盲目重发。

若具体聊天没有脚本执行或持久化能力，返回明确的能力缺失状态。GitHub 导入结构通过校验不等于已在所有网页版 Chat/Work 环境验证；当前账号的网页导入与执行仍待实际确认。

详细接口与加载方式见 [执行约定](plugins/notion-use/references/execution.md)。

## 图像与评论边界

每篇新文档和新目录要求 AI 自绘图标与封面。使用当前宿主内置图像生成及已有授权的图片存储工具，不依赖开发者本机 CLI 或公司网络。当前 Notion MCP 的 icon 参数不接受 file-upload URI，需要稳定 HTTPS 图片地址；没有相应存储能力时报告限制，不声称已经绑定。

评论回复统一加 `🤖 **AI：**`。当前 Notion 连接没有原生关闭线程接口，因此区分“内容已处理/已回复”与“原生线程已关闭”。

## 验证

```sh
python3 scripts/check-package.py
node --test plugins/notion-use/tests/*.test.cjs
```

运行 Node 测试要求 Node.js 18 或更新版本。包布局验证要求 Python 3.9 或更新版本。测试使用临时目录和模拟 Notion 响应，不写入真实文档。
