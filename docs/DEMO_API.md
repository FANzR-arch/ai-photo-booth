# API 配置

当前为现场拍照亭：真实 Seedream 生图 + 模拟支付。配置只由本机 Node 后端读取，顾客无需提供密钥。

复制 .env.example 为 .env，填写：

```dotenv
GENERATION_MODE=seedream
PORT=4377
SEEDREAM_API_KEY=在本机填写
SEEDREAM_MODEL=填写账户实际可用的模型ID
PICKUP_BASE_URL=
```

接口固定为 https://ark.cn-beijing.volces.com/api/v3/images/generations；模型权限以账户配置为准。密钥不进入前端，不写入 Git，不随新制作的 Windows 包分发。

每次生成一张，重试会再次调用 API；模拟支付、相纸文字编辑和下载不重新生成。上游结果未知时禁止重复提交。

确认照片页的 clothingMode 为 keep（默认保留原服装）或 theme（按主题换装），随照片上传和生成请求保存到会话。生成开始后，返回查看、重复提交和付款都不会改变该张照片的服装选择。旧客户端不传此字段时沿用会话值，历史会话默认 keep。

图片接口只接收一个 prompt；后端将人脸身份、主题视觉、动作表情、服装选择与输出比例组合后发送。主题的 outfitPrompt 仅在 theme 模式使用，keep 模式保留衣服款式、领口、层次、图案与主要配色，衣物可随新动作重新呈现。两种模式都允许按主题描述重新设计姿势、头部朝向、视线、表情、手势及合照站位；人脸身份与实际人数优先，动作不得改变五官结构或交换面孔。工作台将“主题视觉提示词”和“换装搭配提示词”分开编辑，动作写入视觉提示词，服装搭配不再锁定原姿态。

默认启动真实模式。缺少密钥或模型会停止启动；不会返回模拟图片冒充真实结果。仅 start-demo.cmd 显式进入独立的本地模拟环境。

成人礼海报有独立配置：styleId=coming-of-age、generationPreset=coming-of-age。创建会话默认 orientation=poster、clothingMode=theme；上传及生成时拒绝冲突配置。poster 表示固定 2:3 竖版，当前 HQ 对应 1216×1824；普通模板不接受 poster，完整场景模板仅接受其 sceneOrientation。生成使用该模板的完整 prompt，允许其中明确授权的造型、姿态和图内文字，不拼接普通肖像的禁字和可选服装规则。公共模板接口返回 preset 元数据但隐藏提示词。已有生成会话的快照不受影响。

PICKUP_BASE_URL 是手机可访问的网站根地址。现场使用固定局域网 IP 和端口，并让手机连接同一 Wi-Fi。配置修改后重启服务。

当前没有真实支付或每日费用上限，请在 Seedream 账户侧设置适当额度并由现场工作人员管理设备。

新导入模板携带 sourceCode、subjectCount、sceneOrientation。generationPreset=directed-portrait 使用完整场景提示词，固定其 3:4、4:3、2:3、4:5 或 3:2 比例；clothingMode 默认 theme，允许 keep。portrait4x5 和 landscape3x2 是新增画幅值。HQ 对应约 220 万像素的实测尺寸；照片归一化及输出质量设置见 README。双人模板暂不启用，不推断单人照片中的缺失伴侣。
