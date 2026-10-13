# 任务：为“等待生图”页面绘制插画素材（52 张 PNG）

> 在 `ai-photo-booth` 项目根目录运行。只生成图片和记录，不改任何代码。

---

## 背景

这是一台放在商场、景区的 AI 拍照机，横屏触摸屏（1920×1080）。顾客拍完照后要等 AI 出图，大约 30 秒，等待期间可以玩几个小游戏：
- 抽一支“上镜签”；
- 给自己的原照片贴贴纸；
- 翻牌配对；
- “抓拍”从小窗口里探头的小角色。

这些游戏现在用的是系统 emoji，看起来廉价，在不同电脑上的样子也不一样。请画一套风格统一的原创插画来替换。前端已经写好了按文件名读取图片的逻辑，图片放到指定路径就会自动生效；某个文件缺失时会退回 emoji。

先阅读：
- `packages/shared/wait-assets.ts`：所有素材的 id、中文名和对应 emoji。**文件名必须与这里的 id 完全一致**。
- `apps/web/src/studio-refresh.css` 开头的 `--sr-*` 颜色：界面主色是珊瑚橙 `#f04e23`，辅色是暖黄 `#ffc531`、薄荷绿 `#0f8466`，底色是暖白 `#fffaf6`。

## 生图工具与边界

- 使用你内置的图片生成能力（imagegen）。**不要调用项目里的 Seedream 接口**，也不要读取或修改 `.env`、`API.txt`。
- 全部原创，不能像任何现有 IP（三丽鸥、迪士尼、宝可梦、蜡笔小新、Line Friends、小黄鸭等都不行），也不要出现真实品牌或机构标志。
- 图里**不能有任何文字、字母、数字、签名、水印**。签纸上的签文由前端叠加，画面只画纸。
- 不要修改 `apps/`、`packages/`、`tests/`、`config/` 下的任何文件。

## 统一画风

- 柔和的“厚涂贴纸”插画：圆润造型、干净的轮廓，带轻微高光和柔和的体积感，介于扁平插画和 3D 软胶之间。
- 色彩明亮温暖，以珊瑚橙、暖黄、薄荷绿、樱花粉、奶油白为主，避免纯黑和高饱和荧光色。
- 可爱，但不能低幼到成年人觉得幼稚。情侣、生日两套贴纸要有一点精致感。
- 同一组素材之间的线条粗细、光源方向（左上）、饱和度、阴影方式要一致。最后一定要把同组素材放在一起检查。

## 素材清单

### 1. 贴纸（28 张）→ `assets/wait/stickers/{id}.png`

顾客把它们贴在自己的照片上，照片会被扫码带走或打印出来，所以质量要经得起放大。
- 512×512，透明背景 PNG，主体居中，四周留约 6% 空白。
- 模切贴纸样式：主体外围有一圈均匀的白色描边（约为图宽的 3%），描边外再加很淡的投影。
- 每张只画一个物体，不要背景。

| id | 画什么 |
|---|---|
| heart | 一颗饱满的珊瑚粉爱心，带高光 |
| hearts | 两颗一大一小、交叠的爱心 |
| rose | 一支红玫瑰，带两片叶子 |
| ring | 一枚金色钻戒，钻石闪光 |
| sparkle | 三颗大小不一的四角星闪光，暖金色 |
| bow | 一个缎面蝴蝶结，珊瑚红 |
| toast | 两只碰杯的香槟杯，有小气泡 |
| blossom | 一朵樱花，五瓣、粉白渐变 |
| crown | 一顶小金冠，镶红绿宝石 |
| loveletter | 一个封口贴着爱心的信封 |
| cake | 一个两层生日蛋糕，插三根蜡烛，没有文字 |
| balloons | 三只扎在一起的气球（橙、黄、薄荷） |
| popper | 一只礼花筒，喷出彩纸 |
| partyhat | 一顶条纹派对尖帽，顶上有绒球 |
| gift | 一个系丝带的礼物盒 |
| star | 一颗圆润的五角星，暖黄色，带一点微笑感但不画脸 |
| cupcake | 一个奶油纸杯蛋糕，顶上有樱桃 |
| confetti | 一簇飘散的彩带和彩纸 |
| sunglasses | 一副心形框墨镜 |
| butterfly | 一只蓝紫色蝴蝶 |
| rainbow | 一道彩虹，两端各有一朵云 |
| shootingstar | 一颗拖着尾巴的流星 |
| clover | 一片四叶草 |
| dino | 一只圆滚滚的小绿恐龙（全身、站立、无表情夸张） |
| rocket | 一枚卡通火箭，尾部有火焰 |
| unicorn | 一个独角兽头像，彩色鬃毛 |
| whale | 一只喷水的小蓝鲸 |
| lollipop | 一根彩虹旋涡棒棒糖 |

### 2. 抓拍小角色（18 张）→ `assets/wait/friends/{id}.png`

在“抓拍”游戏里从窗户下方探出头，孩子点它就算“拍到了”。
- 512×512，透明背景 PNG。
- 画**上半身**：从胸口往上，底边直接截断（会被窗台挡住），头部在上方 2/3。
- 正面朝前、开心的表情、举起一只手（或爪子、翅膀）打招呼。卡通拟人风格，大眼睛、圆脸。
- 不需要白色描边，但要有清晰的轮廓线，在暖黄色窗口背景上要看得清。

| id | 角色 |
|---|---|
| adventure-dino | 小绿恐龙 |
| adventure-astronaut | 戴透明头盔的小宇航员，是小动物（比如小熊），不是真人小孩 |
| adventure-dragon | 小红飞龙，有小翅膀 |
| adventure-unicorn | 白色独角兽，彩色鬃毛 |
| adventure-whale | 蓝色小鲸鱼，头顶有一小股水花 |
| adventure-fairy | 戴花环的小精灵，是小兔子，有透明翅膀 |
| career-firetruck | 有大眼睛的红色消防车，车头朝前 |
| career-plane | 有大眼睛的白色小飞机，机头朝前 |
| career-scientist | 戴护目镜、穿白大褂、举着试管的小浣熊 |
| career-police | 有大眼睛的蓝白警车（车身不要写字） |
| career-doctor | 戴听诊器的小熊医生 |
| career-train | 有大眼睛的绿色小火车头 |
| animal-cat | 橘猫 |
| animal-dog | 柴犬风格的小狗 |
| animal-rabbit | 白兔 |
| animal-panda | 熊猫 |
| animal-fox | 小狐狸 |
| animal-penguin | 小企鹅 |

### 3. 场景素材（6 张）→ `assets/wait/`

| 文件 | 尺寸 | 画什么 |
|---|---|---|
| `studio.png` | 768×768，透明背景 | “AI 画室”：一个木画架，上面是一幅刚开始画的画（只看到几笔色块），旁边飘着画笔和闪光。用在“收到！照片已送进 AI 画室”这一刻 |
| `fortune-tube.png` | 512×768，透明背景 | 签筒：红漆圆筒，金色描边装饰，筒口插着 6–8 支竹签，竹签顶端是红色。**筒身不要写“签”字或任何字** |
| `card-back.png` | 600×800，不透明 | 翻牌游戏的牌背：珊瑚橙底色，中间是一个奶油色圆形里的简洁相机图案，四周是细密的小星星和点状花纹，四角圆润（圆角可以留给前端裁切，画面铺满即可） |
| `fortune-general.png` | 720×960，不透明 | 签纸（个人）：竖版的暖白宣纸质感，四周是朱红色细双线边框，顶部中央是一枚圆形的祥云纹样，底部有淡淡的金色云纹。**中间 60% 区域保持干净留白**，前端会在这里写签文 |
| `fortune-together.png` | 720×960，不透明 | 签纸（双人）：同上的结构，边框改成玫瑰粉和金色，顶部纹样换成两个交叠的小圆环，角落点缀樱花 |
| `fortune-celebration.png` | 720×960，不透明 | 签纸（庆祝）：同上的结构，边框改成金色，顶部纹样换成一束小烟花，角落点缀彩纸 |

## 透明背景的处理

如果生成工具不能直接输出透明背景：在纯白（贴纸）或纯品红 `#ff00ff`（小角色、场景）的背景上生成，再用项目里已安装的 `sharp` 写一个一次性脚本去掉背景，并裁切、缩放到上面的尺寸。脚本放在 `tmp/` 下，不要放进项目源码目录。

处理后逐张检查：
- 四个角的像素 alpha 必须为 0；
- 主体边缘没有白边或品红色残留；
- 贴纸的白色描边要完整保留，不能被当成背景去掉。

## 交付与检查

1. 生成全部 52 个文件，路径和文件名与上面完全一致。
2. 把每一组拼成一张检查图，放到 `docs/previews/`：
   - `wait-stickers-contact.png`：28 张贴纸，放在珊瑚橙和暖白两种底色上各排一次，用来检查描边和透明边缘；
   - `wait-friends-contact.png`：18 个角色，放在暖黄色窗口底色上；
   - `wait-scenes-contact.png`：6 张场景素材。
3. 自己打开检查图逐张看，不合格的重画。不合格包括：有文字、风格明显不一致、主体被裁切、透明边缘发脏、像现有 IP。
4. 在 `docs/sources/wait-assets.json` 记录每个文件的英文提示词和生成次数，格式参考 `docs/sources/art-preview-prompts.json`。
5. 最后用中文简短汇报：完成了多少张、哪些重画过、还有哪些你觉得不够好。

## 英文提示词模板（贴纸示例）

```
Die-cut sticker illustration of {object}, single object centered, soft painterly vector style with gentle volume and a small top-left highlight,
warm palette (coral #f04e23, warm yellow #ffc531, mint #0f8466, blossom pink, cream), clean rounded outline,
thick even white sticker border around the silhouette and a very soft drop shadow, transparent background,
cute but refined, original design, no text, no letters, no numbers, no logo, no watermark.
```

> 交付后整理（2026-10-13）：页面实际加载的是同名 `.webp`（体积约为 PNG 的 1/12），PNG 原稿保存在本机 `tmp/wait-assets-png/`，不进 git。以后重画时仍按本文件生成 PNG，再转成 WebP 替换。
