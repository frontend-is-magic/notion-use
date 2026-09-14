# 能力差异核对（2026-09-14）

核对对象：已安装 Notion 0.1.8 的四个 SKILL.md，以及当前工作空间真实可调用的 Notion 工具 schema。下面“已有”指本次实际可用的底层能力，不保证所有账号套餐均可用。

| 要求 | 原 Notion 插件现状 | notion-use 新增 |
| --- | --- | --- |
| 新建笔记、parent/data source、图标/封面字段 | 已有 create_pages；知识捕获 skill 已提供基本选址模板 | 只增加目录扫描→AI 语义分类→脚本创建、受众范围选择、新目录规则、同名检查 |
| 编辑、追加、覆盖 | 已有 update_page，实际 schema 支持 insert_content/update_content/replace_content | 追加/覆盖语义判定，未知意图默认追加，快照与锚点校验、子页保护、写后检查 |
| 获取/回复评论 | 已有 get_comments/create_comment | 范围映射、先修正文后回复、AI 前缀、最新人工轮次去重、失败续跑 |
| 原生解决/关闭评论线程 | 当前连接未暴露；公开 update comment 更新文本 | 明确报告“已处理并回复，原生未关闭”；保留 future capability adapter，不虚构 resolve API |
| 搜索/目录列表/身份 | 已有 fetch(self)、search、private/shared/team 列表；AI search 当前套餐不可用 | 按 self 结果选择搜索工具，真实分页、可见树覆盖说明、分类置信度与位置决策 |
| 会议、调研、知识捕获、任务数据库 | 已有四套官方业务 skill、数据库 CRUD | 不重建；只在最终 Notion 写入阶段应用本插件写作/执行规则 |
| 文风与模板 | 已有按报告/会议用途选模板 | 14 类文风与视觉组合、一句话开篇、去套话、正文阅读时长与折叠细节 |
| 图片上传和页面视觉 | 已有文件上传及 URL 形式的 icon/cover 字段；实测 file-upload 图标报 Invalid page icon URL | 自绘图标/封面→脚本上传稳定图片地址→原生属性绑定→回读；不把上传成功误认绑定成功 |
| 自动化 | 原 skill 多处要求用户确认、连接后重试 | 不要求手工步骤；合法授权自动恢复与状态报告；不绕过权限边界 |
| 触发隔离 | 原插件为 Notion 业务模板 | 四技能均增加目标平台门槛；飞书等输出任务零 Notion 写入 |

来源：本地 Notion 0.1.8 四个 skills 和当前 ALL_TOOLS metadata；官方 [Comment update](https://developers.notion.com/reference/update-a-comment)、[Working with comments](https://developers.notion.com/guides/data-apis/working-with-comments)、[File uploads](https://developers.notion.com/guides/data-apis/uploading-small-files)。公开 API 允许 file_upload 对象并不等于当前 MCP string 字段支持同样的引用。
