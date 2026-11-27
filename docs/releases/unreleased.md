# 椰子酱电商工作台 0.4.1

- 桌面工作台的 OpenAI 请求改用 Electron 网络栈，跟随操作系统的代理配置。
- 「设置」和「数据管理」新增「更改数据位置」。确认后会复制聊天、素材、模板、密钥与备份。成功启动新位置后清理已经迁走的旧数据。
- Mac 打包版在设置中通过 HTTPS 代理连接真实 OpenAI，并验证了现有 API Key。此项只查询模型权限。另用模拟 API 验证了流式聊天、做图和数据迁移。
- [Windows x64 实装验证](https://github.com/kimiliu0905/ai-workbench/actions/runs/46032577031/job/140620085620)通过。测试代理收到模型验证、聊天和图片编辑请求。工作台从 C 盘迁到 D 盘后保留了 Key、聊天、图片版本和备份，并清理了已迁移的旧文件。使用者自己的电脑仍需验证实际代理配置。
- [Windows 便携包](https://github.com/kimiliu0905/ai-workbench/actions/runs/46032577031/artifacts/15216192032) · [Windows 安装包](https://github.com/kimiliu0905/ai-workbench/actions/runs/46032577031/artifacts/15216012227)。两者都附 SHA-256 校验文件，构建提交为 `df3ba56`。

# 椰子酱电商工作台 0.4.0 交付记录

- 基线是 PR #1 的 `3d3d15a`，开发分支为 `codex/workbench-delivery`。
- 保留 Electron、Next.js、Prisma/SQLite 和已有做图历史。新加的迁移只给模板增加可空的主图框路径。
- 入口集中到聊天、做图和设置。新安装直接进入工作台；已设置共享口令的桌面安装继续使用原口令。设置中验证并保存 OpenAI Key。
- 聊天流式显示 Markdown，近期历史会携带之前发过的图片。做图以最后填写的尺寸及素材角色为准，所选版本可单独预览、保存、下载和继续编辑。
- 模板保存主图框、常用要求、参考图用途和尺寸。产品及参考图按新任务上传。PNG 等比缩放，必要时补透明边缘。
- Node 24 下源码启动、438 项测试、类型及语法检查、原有浏览器回归全部通过。
- Mac arm64 修订自测包对应源码提交 `3d597cc`。本机文件位于 `dist-desktop/verified/YezijianWorkbench-0.4.0-macos-arm64.zip`，SHA-256 见同目录。解压后的桌面模拟回归已通过，压缩包解压内容及 Git 提交均已扫描确认不含本次 Key。
- 打包服务通过干净 SQLite、Prisma、sharp、路由和项目读写的独立验证。打包清单已检查，旧产物、源码追踪带来的 Git 目录、开发缓存、数据库及密钥文件均已排除。ZIP 在仓库外解压并通过本地签名检查。
- 在解压后的 Electron 主窗口及本机模拟 API 中，验证了首次配置、无效 Key、流式 Markdown、文字和图片追问、超时、三图制作、模板复用与重启。也用单独临时 `.env.local` 验证打包进程能接收开发环境 Key，未发模型请求。
- 模拟下载通过 Electron 实际写盘，测得 `873 × 947` PNG。另将第 1 版下载与素材库文件逐字节比对，并确认编辑请求的第一张输入就是该文件。检查了常规窗口和 900 × 650 窗口，预览完整显示。截图、模拟 PNG 与验证日志在 `test-output/workbench/`。
- GitHub 授权已完成，开发分支已推送并建立[草稿 PR #2](https://github.com/kimiliu0905/ai-workbench/pull/2)。首轮 [Windows x64 工作流](https://github.com/kimiliu0905/ai-workbench/actions/runs/46011473703)已通过内置服务和实装桌面交互。[修订版构建与验收](https://github.com/kimiliu0905/ai-workbench/actions/runs/46011956739)两平台作业均已通过，对应代码 `3d597cc`。
- Mac 打包版通过 OpenAI 真实 API 完成首次配置、文字追问、连续看图追问、三图输入、原始版和独立新版本的生成与下载。四轮聊天及看图请求完成，首次设置尝试两次，图像编辑三次，三个实测文件均为 `1003 × 1003` PNG。记录在 `test-output/workbench/real/`；账单金额未核实。
- 实际看图确认第 1、2 版保留马克杯形态、杯把方向和主框的底部文字。第 3 版沿用了后续草稿中的部分背景色，已修正历史编辑请求，使它仅使用选中版本和本次修改说明。修订版再次从第 1 版编辑，保留了暖米色背景、商品和文字，按要求在右下方加一片绿叶。复验下载也是 `1003 × 1003` PNG，图像请求合计四次。
- 真实测试上限为聊天 20 次、图像 6 次及 5 美元。使用 Luna 与 Flare 的中档图像设置，本轮预算预留约 1 美元，实际费用以 OpenAI 项目用量为准。[Luna 定价](https://developers.openai.com/api/docs/models/gpt-6-luna) · [图像定价](https://developers.openai.com/api/docs/pricing) · [图像估算器](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs)
- Agent 的既有浏览器回归已改用新版「更多」菜单与「高级设置」入口。本机以及 [Windows、macOS、Ubuntu 回归工作流](https://github.com/kimiliu0905/ai-workbench/actions/runs/46015242122)均通过。
- Windows 在 GitHub 的 Windows 2025 x64 环境先检查内置服务、SQLite、Prisma 和 sharp，再运行真实 NSIS 安装器。安装版使用模拟 API，通过首次配置、对话流式显示、图片上传、旧版编辑和保存、下载写盘、模板复用及重启。模拟文件实测为 `873 × 947` PNG，截图与日志在本机 `test-output/workbench/windows-x64/` 和 `test-output/workbench/windows-verified-job.log`。
- [Windows 安装程序、便携包与 SHA-256](https://github.com/kimiliu0905/ai-workbench/actions/runs/46011956739/artifacts/15205024442)均已上传，试用时发 `YezijianWorkbench-0.4.0-windows-x64.exe`。试用安装程序没有 Windows 代码签名。
- 本机便携包位于 `dist-desktop/verified/windows-x64/YezijianWorkbench-0.4.0-windows-x64.zip`，已通过发布作业提供的 SHA-256 校验并检查内部 x64 程序。实装验收使用的是上述 GitHub 产物中的 NSIS 安装器。由于本机至产物存储的传输超时，安装器通过 GitHub 下载交付。
