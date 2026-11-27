# 椰子酱电商工作台

适合在一台电脑上使用的中文工作台。**聊天**可连续交流、翻译、写文案和看图。**做图**可结合主图框、产品图和参考图，保存模板、比较版本并下载 PNG。

## 安装与使用

1. **Windows x64** 下载并运行 `YezijianWorkbench-0.4.1-windows-x64.exe`，按安装提示完成。便携版解压整个 ZIP，再打开其中的 `YezijianWorkbench.exe`。桌面包自带运行环境，需要联网访问 OpenAI。
2. **macOS Apple Silicon** 解压 ZIP，打开「YezijianWorkbench.app」。测试包是临时签名版本，系统可能要求在隐私与安全性设置中确认打开。
3. 首次点击「配置 API Key」或右上角「设置」，粘贴 OpenAI API Key，点「验证并保存」。设置验证聊天模型的访问权限。做图权限由 OpenAI 项目决定，部分项目需要先完成组织验证。
4. 在「聊天」发送消息或添加图片。后续可以直接追问此前的图片。左侧打开历史，标题旁可重命名或删除。
5. 在「做图」上传需要的主图框、产品图和参考图。选择参考图用途，填写制作要求与尺寸，再点「生成图片」。在预览下选择一版，即可下载该版或填写修改要求继续编辑。点「存为模板」保存主图框、常用要求和尺寸，下次新建任务可从「套用模板」选取。
6. 聊天、素材、模板和结果保存在本机。Windows 默认数据目录是 `%APPDATA%\椰子酱电商工作台`。需要移到 D 盘时，等当前任务完成，在「设置」点「更改数据位置」，选择 D 盘或其中的文件夹，再确认迁移。下一次启动会使用新位置，工作台成功打开后才清理已迁移的旧文件。密钥也会迁移。应用的启动配置和少量浏览器缓存仍使用原来的系统目录。
7. 桌面版连接 OpenAI 时沿用系统代理。更改 Windows 系统代理后，退出并重新打开工作台再验证。

原始照片可能经尺寸压缩后发给 OpenAI。输出比例不一致时，PNG 可带透明边缘以保留画面。模型重绘可能影响原图字样或产品细节，下载前可放大核对。

## 开发与打包

使用 Node.js 24。在仓库根目录执行：

```sh
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

打开终端显示的本机地址。可将 `OPENAI_API_KEY` 写入被 Git 忽略的 `.env.local`，或在应用设置中输入。不要填写到 `.env.example`。

```sh
npm test
npm run lint
npm run desktop:start
npm run dist:mac      # 在 Apple Silicon Mac 构建
npm run dist:all-win  # 在 Windows x64 构建 NSIS 安装包和 ZIP
npm run smoke:desktop
node tests/browser/workbench-desktop.cjs
```

`smoke:desktop` 检查打包后的服务、数据库和原生处理模块。最后一条命令运行 Electron 安装产物界面的模拟服务验收，可在命令末尾追加已安装的可执行文件路径。两类测试都使用独立数据目录。

GitHub Actions 的「Desktop packages」提供 Windows 和 macOS 构建记录、校验值及 GUI 验收截图。Windows 便携版见 `desktop-windows-x64`，解压到目标盘后打开 `YezijianWorkbench.exe`。安装版见 `installer-windows-x64`。验证范围与进展见 [交付记录](docs/releases/unreleased.md)。

### Mac 打包版读取开发 Key

平时双击打开并在设置中配置。若要用开发目录的 `.env.local` 验收，先退出正在运行的工作台，再从仓库根目录启动：

```sh
node --env-file=.env.local -e 'require("child_process").spawn(process.argv[1], { stdio: "inherit" })' \
  "$PWD/dist-desktop/mac-arm64/YezijianWorkbench.app/Contents/MacOS/YezijianWorkbench"
```

配置文件不会打入程序包。

## 许可

基于 [灵矩绘境 · MxPage](https://github.com/ziguishian/MxPage) 构建，保留其版权声明，按 [MIT 许可](LICENSE) 分发。
