# 接口约定 v2

更新：2026-10-05。程序内无付款环节；原 `/api/sessions/:id/orders` 与 `/api/orders/:id/simulate` 已删除。

同源 JSON API；错误 HTTP 4xx/5xx + `{error:string}`。所有设备和管理 API 限本机地址，手机只允许 pickup 相关接口。不开 CORS，拒绝不匹配的 Origin，写操作要求 application/json。设备访问 http://localhost:4377。`/api/admin/*`（auth 接口除外）需要工作台登录。

## 拍照亭

- GET /api/health -> Health
- GET /api/styles -> Style[]（只返回 enabled，不暴露 prompt / outfitPrompt）
- POST /api/sessions {styleId,purpose?} -> Session
- GET /api/sessions/:id -> Session
- POST /api/sessions/:id/photo {dataUrl,orientation,clothingMode?} -> Session（只接受 JPEG/PNG，经 Sharp 解码重编码，最大 12MB）
- POST /api/sessions/:id/generate {clothingMode?} -> Session（幂等，运行中/已完成不得重复调用；failed 允许显式重试，unknown 不重试）。生成开始时会话获得 pickupUrl。
- POST /api/sessions/:id/end {} -> {ok:true}（停止设备显示；有效期内取图链接仍可用）
- GET /api/sessions/:id/images/:imageId/preview -> 预览 JPEG，仅本机
- GET /api/sessions/:id/original -> 拍摄原照片 JPEG；仅本机，no-store
- POST /api/sessions/:id/frame {frame,caption?} -> {frame,caption}（相纸边框与文字，文字最多 80 字符）

## 打印

- GET /api/printing -> 打印功能状态
- POST /api/sessions/:id/print {imageId} -> PrintJob（每张生成照片只提交一次；已有未失败任务直接返回）
- GET /api/sessions/:id/print/:imageId -> {job:PrintJob|null}

## 手机取图

- GET /api/pickup/:token -> PickupData `{expiresAt,mode,images:{id,downloadUrl}[],original?:{downloadUrl}}`
- GET /api/pickup/:token/images/:imageId -> 带相纸装饰的成片 JPEG；缺少权限 404，过期 410
- GET /api/pickup/:token/original -> 拍摄原照片 JPEG

## 工作台

- GET /api/admin/auth/status -> {configured,defaultPassword,authenticated,idleTimeoutMs} · POST /api/admin/auth/login · logout · touch（未设置过密码时只接受默认密码 88888888；scrypt 保存）
- POST /api/admin/auth/password {currentPassword,newPassword} -> status（需已登录；新密码 8–128 位且不能是默认密码；成功后其他登录全部失效，当前登录保留）
- POST /api/admin/auth/setup {password}（旧版首次设置接口，保留兼容；工作台已不使用）
- GET /api/admin -> {health,styles:Style[],sessions:Session[]}（最近 100 条会话）
- GET /api/admin/config · PUT /api/admin/config {apiKey?,model}（生成进行中拒绝修改；密钥只返回掩码）
- GET /api/admin/test-mode · PUT /api/admin/test-mode {testEntries,simulatedGeneration}
- GET /api/admin/printer · GET /api/admin/printer/options?queue= · PUT /api/admin/printer PrinterSettings
- PUT /api/admin/styles/:id {name,prompt,outfitPrompt?,description,size,exampleUrl,enabled} -> Style（修改提升版本；exampleUrl 仅 /examples/ 或 /admin-examples/）
- POST /api/admin/examples {dataUrl} -> {url}（验证图片后保存为管理上传示例）

## 类型

类型定义以 `packages/shared/types.ts` 为准。

- Health: `{mode,generation,testMode,configured,model,imageCount,pickupBaseUrl,lanUrls}`；mode 为启动方式，generation 为新会话实际使用的出图方式。
- Session: `{id,styleId,styleName,purpose?,orientation?,clothingMode?,frame?,caption?,status:'created'|'photographed'|'generating'|'ready'|'partial'|'failed'|'unknown'|'ended',mode,createdAt,expiresAt,completedAt?,images:{id,previewUrl}[],error?,elapsedMs?,requestId?,promptVersion?,pickupUrl?,originalUrl?}`

后台使用 Node 24 node:sqlite + Fastify、Sharp。data 不静态暴露。新照片自生成完成起保存 10 分钟，服务每秒清理；停机期间到期的在下次启动时清理。配置读取 GENERATION_MODE=demo|seedream、SEEDREAM_API_KEY、SEEDREAM_MODEL、PICKUP_BASE_URL、PORT=4377；也可在工作台保存 API。每次固定生成 1 张；旧 IMAGE_COUNT 不再生效。无密钥不回退模拟出图。服务启动时 generating 转 unknown，不自动重试。
