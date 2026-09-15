# 演示 API 配置说明

## 当前实现

当前是内部 Demo：API 配置直接放在运行电脑的项目内部 `.env` 文件中，由 Node 后端读取，用同一个 Seedream 账户完成演示生成。这里的“内部”指服务端本地配置，不是把真实密钥写进前端代码或公开仓库。

仓库不包含可直接使用的真实密钥。内部演示 ZIP 已带演示配置，无需同事再次填写；从 GitHub 克隆源码则需单独配置。无需顾客输入密钥。服务端将照片和选中主题的提示词发送给火山方舟，浏览器只访问本地拍照亭接口。

```dotenv
GENERATION_MODE=seedream
PORT=4377
IMAGE_COUNT=1
SEEDREAM_API_KEY=填写演示账户密钥
SEEDREAM_MODEL=doubao-seedream-5-0-pro-260628
PICKUP_BASE_URL=
```

模型 ID 以账户实际可用权限为准。接口为 `https://ark.cn-beijing.volces.com/api/v3/images/generations`。当前单次生成一张；再次提交会产生新的 API 调用。模拟付款和下载只解锁已生成文件，不重新生成。

## 边界

- 支付是模拟流程，没有实际扣款；API 生成是真实调用，可能产生费用。
- 当前没有每人配额、设备账号、预算上限和密钥托管平台，不适合开放给未知用户任意使用。
- `.env`、本地照片、SQLite 数据库、测试取图凭证不提交 GitHub。参考图库是项目演示素材，不是用户照片。
- 同一 Wi-Fi 取图需要电脑保持运行，并允许局域网访问端口；服务不自动修改防火墙。
- 本机网络权限拒绝会明确报错；不确定是否已完成的生成不会自动重试，避免重复请求。

## 启动

1. 安装 Node.js 24+，将 `.env.example` 复制为 `.env`，填写密钥与模型。
2. 双击 `start-photo-booth.cmd`，首次安装依赖并构建，保持启动窗口打开。
3. 打开 `http://localhost:4377`，允许摄像头。管理页是 `/admin`。
4. 完成模拟解锁后，手机连接同一 Wi-Fi 扫码。

`start-demo.cmd` 强制使用本地模拟图片处理，不调用 Seedream；它不代表真实 AI 效果。不要同时启动两个占用 4377 的服务。
