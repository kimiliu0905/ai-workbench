# 椰子酱电商工作台 0.4.0 交付记录

- 基线是 PR #1 的 `3d3d15a`，开发分支为 `codex/workbench-delivery`。
- 保留 Electron、Next.js、Prisma/SQLite 和已有做图历史。新加的迁移只给模板增加可空的主图框路径。
- 入口集中到聊天、做图和设置。新安装直接进入工作台；已设置共享口令的桌面安装继续使用原口令。设置中验证并保存 OpenAI Key。
- 聊天流式显示 Markdown，近期历史会携带之前发过的图片。做图以最后填写的尺寸及素材角色为准，所选版本可单独预览、保存、下载和继续编辑。
- 模板保存主图框、常用要求、参考图用途和尺寸。产品及参考图按新任务上传。PNG 等比缩放，必要时补透明边缘。
- Node 24 源码启动成功，438 项测试通过。Mac arm64 第一轮使用打包后的 Electron 主窗口及本机模拟 API，跑通配置、流式聊天、图片追问、无效 Key、超时、三图制作、模板复用及重启。Electron 下载写盘后的 PNG 实测为 873 × 947，保存与继续修改均验证使用所选旧版的实际内容。
- 在 900 × 650 窗口发现预览裁切，已修正预览与素材的容器约束。重打包发现 Next 文件追踪会将旧产物和源代码目录误带入独立运行目录，已加构建文件范围限制及打包产物检查。最终 Mac ZIP 仍需用修订版复验。
- Windows x64 的安装、GUI 验收和产物上传已写入 GitHub Actions。GitHub 应用连接器无法向该仓库写入，尚待 Mac 上的 GitHub CLI 完成授权，分支与工作流尚未推送。
- 实时 OpenAI 请求截至本次更新为聊天及看图 0 次，图像 0 次，费用 0 美元。待 Mac 本地配置 Key 后验收。
- 实时测试计划为 4 次聊天及看图、3 次图像编辑，预留失败用量，仍遵守用户给定的 20 次聊天、6 次图像和 5 美元上限。按 GPT-6 Luna 每百万输入 / 输出 token 0.10 / 0.50 美元及 GPT-Image 2.6 Flare 每百万图像输入 / 输出 token 8 / 30 美元估算，短聊天加三次 1024 级中档编辑先预留 1 美元，最终费用以实际用量为准。[Luna 定价](https://developers.openai.com/api/docs/models/gpt-6-luna) · [图像定价](https://developers.openai.com/api/docs/pricing) · [图像估算器](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)
- 真实图须实际检查商品、边框、文字和参考图角色。模拟图只验证应用流程和像素尺寸。
