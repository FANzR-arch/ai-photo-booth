# Seedream 接入与样片验证

## 已核实的本机交接

相邻 `../seedream-test/HANDOFF.md` 和 `result.json` 是早期接入证据：

- POST https://ark.cn-beijing.volces.com/api/v3/images/generations
- 模型：doubao-seedream-5-0-pro-260628
- 参数：size=1.5K，response_format=b64_json，watermark=false
- 不传 sequential_image_generation 或 stream。
- 已成功单张文生图，1872×1248，23.08 秒，input_images=0。

后续已完成人像图生图与下载验证，见 DEMO_STATUS.md；全主题人物相似度仍未逐项验收。

## 运行方式

本机 `.env` 保留了交接配置。密钥只在服务端使用，不输出、不提交、不进入前端。

- start-demo.cmd：固定演示模式、每次一张，不调用云端。
- npm start：读取 .env；GENERATION_MODE=seedream 时使用真实 API。
- 测试真人照片前，明确使用该照片的同意与调用预算，拍照亭固定只生成一张。

拍照亭每次只提交一张生成请求，旧 IMAGE_COUNT 配置不再控制张数。连接超时、5xx、解析或下载失败保留 unknown，避免重复计费；明确失败才允许用户修正后重试。

后台采用 JPEG Data URL 输入。运行主题与尺寸以 config/styles/styles.json 为准，共 21 个启用主题。

## 提示词与素材

既有 cinema/business/cartoon 保留原配置。新增 editorial/anime/film/festival 可直接选择；city/brand 保持关闭，需在后台用实际内容替换 {{占位内容}} 才能开启。修改提示词提升版本，生成保存当时快照。

`Seedream照片风格提示词.json` 保留交接草稿，不能直接当运行数据库使用。官方指南原文存于 sources/；通用提示词建议不代表此模型支持旧版组图能力。

展示素材由内置 imagegen 创作，只是风格意向；不能用它们替代真实 Seedream 人像样片验收。

## 限制与错误处理

单次请求最多 180 秒，JSON 上限 36 MiB，单图上限 24 MiB。优先 Base64；URL 回退限制交付域名、HTTPS 443 与公网 IPv4 DNS，固定连接解析地址，禁止重定向。上游错误正文不回传前端，使用状态与请求编号定位。

## 官方入口

- https://www.volcengine.com/docs/82379/1541523
- https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/resources/images/images.py

