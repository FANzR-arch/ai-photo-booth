# 接口约定 v1

同源 JSON API；错误 HTTP 4xx/5xx + `{error:string}`。所有设备和管理 API 限本机地址，手机只允许 pickup 与 download。不开 CORS，拒绝不匹配的 Origin，写操作要求 application/json。设备访问 http://localhost:4377。

- GET /api/health -> {mode:'demo'|'seedream',configured:boolean,model:string,imageCount:number,pickupBaseUrl:string,lanUrls:string[]}
- GET /api/styles -> Style[]（只返回 enabled，不暴露 prompt）
- POST /api/sessions {styleId} -> Session
- GET /api/sessions/:id -> Session
- POST /api/sessions/:id/photo {dataUrl} -> Session （只接受 JPEG/PNG，经 Sharp 解码重编码，最大 12MB）
- POST /api/sessions/:id/generate {} -> Session（幂等，运行中/已完成不得重复调用；failed 允许显式重试，unknown 不重试）
- POST /api/sessions/:id/end {} -> {ok:true}（停止设备显示，保留已购取图）
- GET /api/sessions/:id/images/:imageId/preview -> 带水印 JPEG，仅本机
- POST /api/sessions/:id/orders {imageIds:string[]} -> Order
- POST /api/orders/:id/simulate {outcome:'paid'|'failed'|'cancelled'} -> {order:Order,pickupUrl?:string}（paid 幂等且不可退回；仅本机；明确无真实收费）
- GET /api/pickup/:token -> {status:'paid',expiresAt:number,mode:string,images:{id:string,downloadUrl:string}[]}
- GET /api/pickup/:token/images/:imageId -> 已解锁高清 JPEG 下载；缺少权限 404，过期 410
- GET /api/admin -> {health:Health,styles:Style[],sessions:Session[],orders:Order[]}
- PUT /api/admin/styles/:id {name,prompt,enabled,exampleUrl,description,size} -> Style（prompt 修改提升版本；exampleUrl 仅 /examples/ 或本机上传的路径）
- POST /api/admin/examples {dataUrl} -> {url:string}（验证图片后保存为管理上传示例）

Style: {id,name,description,prompt?,version,enabled,exampleUrl,size,color}
Session: {id,styleId,styleName,status:'created'|'photographed'|'generating'|'ready'|'partial'|'failed'|'unknown'|'ended',mode,createdAt,expiresAt,images:{id,previewUrl}[],error?:string,elapsedMs?:number,requestId?:string,promptVersion?:number,pickupUrl?:string}
Order: {id,sessionId,imageIds:string[],amount:number,status:'pending'|'paid'|'failed'|'cancelled',createdAt:number}。amount 单位分；一张 990，两张 1990；只产出一张则全部也是 990。

后台使用 Node24 node:sqlite + Fastify、Sharp。data 不静态暴露。图片 24 小时过期，清理以服务运行/重启执行。模式读取 GENERATION_MODE=demo|seedream，SEEDREAM_API_KEY、SEEDREAM_MODEL、IMAGE_COUNT=1|2、PICKUP_BASE_URL、PORT=4377。demo 默认 2 张，Seedream 初测 1 张。无密钥不回退 demo。服务启动时 generating 转 unknown，明确不自动重试。
