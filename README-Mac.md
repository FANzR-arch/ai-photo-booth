# Mac 远程安装与联调

适用设备：Apple 芯片 Mac；本次客户设备为 MacBook Air M1 / 8GB / macOS 26.2，UGREEN Camera 4K，EPSON L805。客户已确认系统能正常打印，**应用自动打印尚未实现**。

仓库：https://github.com/FANzR-arch/ai-photo-booth ，分支 `main`。

把 [Mac AI 部署提示词](docs/Mac-AI-部署提示词.md) 的完整内容交给客户 Mac 上具备终端、文件操作能力的 AI 执行。不需要搬运 Windows 安装包、node_modules 或 .env。

## 首次安装

在 Mac 的“终端”运行；以下命令由现场 AI 检查环境后执行：

```bash
mkdir -p "$HOME/Applications"
git clone --branch main --single-branch https://github.com/FANzR-arch/ai-photo-booth.git "$HOME/Applications/ai-photo-booth"
cd "$HOME/Applications/ai-photo-booth"
bash install-mac.command
bash mac-booth.command
```

已有同名目录时，不要直接重复 clone 或覆盖。先确认是否为本仓库、是否有本地修改及正在运行的服务。私有仓库需有权限的 GitHub 账户登录；不要把访问令牌写进 URL、聊天或文件。

安装脚本下载官方 Node v24.15.0 darwin-arm64 压缩包，使用已核实的官方 SHA-256 校验，再在项目 `runtime/` 内解压；不安装 Homebrew、不修改系统 Node、不需要 sudo。随后从 npm 官方源按 package-lock.json 安装依赖，在 Mac 本机编译页面，并验证 sharp 图片处理和 SQLite 数据库可加载。

首次安装需要能访问 GitHub、nodejs.org 和 registry.npmjs.org。下载失败时保留错误，解决网络后重跑，不自动切换未知镜像，不关闭 TLS 校验。

如果安装中断，修复原因后在同一仓库再次运行 `bash install-mac.command`。已有 `.env` 和 `data/` 保留；只有不存在 `.env` 时才复制空白模板。

## 使用菜单

```bash
bash "$HOME/Applications/ai-photo-booth/mac-booth.command"
```

- **1 免费联调**：本地模拟处理，不调用 AI API。随机端口与独立数据目录，实际网址见终端；浏览器会在服务启动后打开。不是固定的 4377。页面里的照片效果不代表 AI 成片。
- **2 配置 API**：密钥输入隐藏，模型 ID 明文输入。只更新 .env 中的两项 Seedream 配置，权限为当前用户可读写；不测试或调用付费接口。已运行的服务需要停止再启动。此配置菜单不是顾客界面的管理员登录。
- **3 真实生图**：默认固定 localhost:4377，使用持久化 data。缺少密钥或模型会停止，不回退模拟。进入页面本身不会生成图片，点击生成会消耗 API 额度。支付仍然模拟。
- **4 设备诊断**：在 diagnostics/ 生成文本，包含系统版本、架构、Node/npm、打印队列、磁盘空间及精简服务状态；不包含密钥、照片、订单。随机端口联调不在固定端口健康检查范围内。

运行时保持终端打开，Ctrl+C 正常停止。脚本运行期间阻止系统因闲置睡眠，但不保证合盖、断电、退出登录后继续运行；保持开盖和供电。浏览器使用 Mac 默认浏览器，建议 Chrome。摄像头拍摄页面必须在本机 localhost 打开。

## 摄像头与打印

当前应用还没有摄像头选择器。M1 Mac 有内置摄像头：先在 Chrome `chrome://settings/content/camera` 选择 UGREEN，再授权 localhost 使用摄像头。如果仍选错，停止预览、关闭其他占用摄像头的软件后重新打开页面，并报告结果。

需要时到“苹果菜单 → 系统设置 → 隐私与安全性 → 摄像头”允许 Chrome 使用。系统“本地网络”权限或防火墙提示，只对确有需要的程序进行最小授权；不关闭整个防火墙。

系统能打印是已知条件。`lpstat -p -d` 只能检查打印队列，不等于验证应用自动打印。后续接入需要实际队列名、纸张规格、裁切/留白、驱动可用选项和缺纸/补打验收。顾客照片不要作为诊断附件。

## 后续更新

请让现场 AI 按下面顺序执行，不要在有人使用或生成进行中升级：

1. 记录当前 Git 提交、项目路径与实际运行方式。通过本项目终端 Ctrl+C 停止服务，确认已退出；不要 `killall node`。
2. 检查 `git status --short`。如果有现场修改，先展示文件名并处理保留方案，禁止 reset --hard、clean 或强制覆盖。
3. 将 `.env` 和整个 `data/`（存在时）备份到仓库外的受限目录，权限只给当前用户。数据库应在服务停止后备份。备份中的照片仍按原到期时间管理，避免把已经过期的照片长期留在备份；测试无须复制或上传照片。
4. 确认当前分支为 main、origin 指向本仓库后执行 `git pull --ff-only origin main`。遇到冲突或分叉停止，不自动合并。
5. 在项目目录执行 `bash scripts/macos/prepare.sh --update`，完成停止与备份检查后输入 `UPDATE`。它重装依赖并重新构建，保留配置和数据库；失败时不生成新的准备完成标记，不启动收费服务。
6. 联调通过后再按原模式启动。恢复服务需保持原端口、data 与取图网络地址。

需要回退时，停止服务，在独立目录检出记录的旧提交，并恢复**与该版本配套的配置和数据库备份**，重建依赖后再运行。不要仅回退代码而继续使用可能已经迁移的新数据库。

## 完成标准与当前限制

本阶段交付为“Mac 本地安装和有人看护联调”，不是无人值守商业上线。真实支付、受保护的管理员后台、应用自动打印、手机流量公网取图、登录后启动与故障恢复仍需要后续实现和验收。

目前手机取图要求同一 Wi-Fi；照片有到期清理机制。禁止通过公网隧道把整个本地服务开放给顾客来绕过这些限制。

准备环境、构建成功与系统打印成功均不代表端到端验收通过。必须分别记录 Mac 本机安装、真实摄像头、浏览器操作、手机取图、系统打印、应用打印和支付的验证状态。

2026-09-30 开发机验证：Windows 上构建及 100 项自动化测试通过，包含 Mac 配置保存、原配置保护和密钥不回显；Bash 脚本语法检查通过。Node 压缩包的 SHA-256 已从 nodejs.org 官方清单核实。尚未在客户 Mac 执行安装，也未验证 Mac 权限、硬件拍摄、驱动或浏览器实际表现；这些由现场联调确认。
