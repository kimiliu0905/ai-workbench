# 椰子酱电商工作台 0.4.0 交付记录

- 基线是 PR #1 的 `3d3d15a`，开发分支为 `codex/workbench-delivery`。
- 保留 Electron、Next.js、Prisma/SQLite 和已有做图历史。新加的迁移只给模板增加可空的主图框路径。
- 入口集中到聊天、做图和设置。新安装直接进入工作台；已设置共享口令的桌面安装继续使用原口令。设置中验证并保存 OpenAI Key。
- 聊天流式显示 Markdown，近期历史会携带之前发过的图片。做图以最后填写的尺寸及素材角色为准，所选版本可单独预览、保存、下载和继续编辑。
- 模板保存主图框、常用要求、参考图用途和尺寸。产品及参考图按新任务上传。PNG 等比缩放，必要时补透明边缘。
- Node 24 源码启动成功，现有测试 438 项通过。桌面交互和安装包验证进行中。
- 实时 OpenAI 请求截至本次更新为聊天及看图 0 次，图像 0 次，费用 0 美元。待 Mac 本地配置 Key 后验收。
- 实时测试计划为 4 次聊天及看图、3 次图像编辑，预留失败用量，仍遵守用户给定的 20 次聊天、6 次图像和 5 美元上限。按 GPT-6 Luna 每百万输入 / 输出 token 0.10 / 0.50 美元及 GPT-Image 2.6 Flare 每百万图像输入 / 输出 token 8 / 30 美元估算，短聊天加三次 1024 级中档编辑先预留 1 美元，最终费用以实际用量为准。[Luna 定价](https://developers.openai.com/api/docs/models/gpt-6-luna) · [图像定价](https://developers.openai.com/api/docs/pricing) · [图像估算器](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)
- 真实图须实际检查商品、边框、文字和参考图角色。模拟图只验证应用流程和像素尺寸。
