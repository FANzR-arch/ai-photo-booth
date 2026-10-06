# 任务：重做 36 个旧主题的封面

> 把下面整段交给 Codex，在 `ai-photo-booth` 项目根目录运行。做法和上次“儿童主题封面”一样，那次的脚本和迁移逻辑可以直接复用。

---

## 背景

2026-10-06 重写了 35 个写实主题的提示词，并为每个主题加了“神态：”一句（`config/styles/styles.json` 里的 cinema、business、editorial、film、festival、together-01～10、memory-01～10、self-01～10）。新提示词给每个主题设计了具体的故事瞬间、道具、光影和镜头。但旧封面问题很明显：
- memory-01～10 是同一个女生、同一件米色毛衣、同一个姿势，只换了背景。
- self 系列和 together 系列像证件照，打光平、姿势僵硬。
- cinema、business、cartoon 还是扁平的 SVG 示意插画。
- editorial、film、festival 是早期的四人拼版图。

请为这 35 个写实主题加上 cartoon，按**新提示词**重做封面。目标是让封面看起来像小红书爆款写真、商业摄影棚的样片：有氛围、有光影、有故事感。

先阅读：
- `config/styles/styles.json`：每个主题的 `prompt`（场景、光线、动作）和 `outfitPrompt`（服装）。封面画面以这两段为准，动作和道具必须出现。
- `docs/sources/portrait-covers/manifest.json`：旧封面清单的格式。
- `docs/sources/kids-covers/`：上次儿童封面的做法，脚本和迁移可以复用。

## 生图边界

- 使用你内置的图片生成能力。**不要调用项目里的 Seedream 接口**，也不要读取或修改 `.env`、`API.txt`。
- 人物全部是虚构的普通东亚成年人，不能像任何明星或网红，不同主题不能用同一张脸。
- 画面中不能有文字、logo、水印、边框或拼图。卷轴证书、书脊、招牌等都要画成没有可读文字的样子；生日蛋糕上不能出现数字。

## 美学要求（这次的重点）

1. 竖版 3:4，腰部以上半身构图，头顶完整。人物可以不居中，用三分法或侧向留白，但脸必须是视觉中心。
2. **光影要有设计**：按提示词做出主光方向、轮廓光、逆光、光斑、冷暖对比，不能是平均打光。
3. **调色要有风格**：胶片颗粒、电影青橙、日系通透、港风暖调、黑白银盐，按各主题提示词执行，同一系列之间也要有明显区别。
4. **动作要自然有生活感**：照提示词的“动作：”执行，例如捧马克杯、抱书、捧蛋糕、举证书、倚栏杆、托腮。手部自然，五指清晰，手不遮脸。
5. **神态按每个主题提示词里的“神态：”执行**，不要所有人都对着镜头露出同一种礼貌微笑。笑意要从眉眼自然流露，冷感主题（self-02、self-09、editorial、memory-02）不笑。表情幅度要克制：不张嘴大笑、不瞪眼、不嘟嘴。
   - **以下 8 个主题视线离开镜头**，要拍出抓拍感：memory-07 低头看着烛火、memory-03 目光落向书架、together-08 望向远处海面、memory-01 望着窗外晨光、memory-02 望着窗外雨景出神、memory-05 垂眸端详银杏叶、memory-06 垂眸望着杯中热气、self-03 仰脸迎着窗外阳光。
   - 其余主题看镜头，但眼神要有情绪，不要空洞地直视。
6. 皮肤保留真实质感，不要过度磨皮、塑料感或 AI 网红脸。衣服要有真实的织物纹理。
7. 人数与提示词一致：together 系列按下表人数，其余都是单人。

## 人物分配

人物年龄、性别分布要多样，避免同一系列看起来像同一个人。

| ID | 人物 |
|---|---|
| cinema | 约 28 岁男性，微卷短发 |
| business | 约 35 岁女性，及肩直发 |
| editorial | 约 25 岁女性，黑色长直发 |
| film | 约 30 岁男性，复古三七分 |
| festival | 约 26 岁女性，低马尾 |
| cartoon | 约 24 岁女性（原创 3D 卡通转绘，按 cartoon 提示词） |
| together-01 | 约 28 岁情侣 |
| together-02 | 两位约 24 岁的女性好友 |
| together-03 | 三位约 22 岁好友（两男一女） |
| together-04 | 约 65 岁的老夫妻 |
| together-05 | 一家三口：父母约 35 岁，女儿约 6 岁 |
| together-06 | 两位约 30 岁的男性好友 |
| together-07 | 母亲约 55 岁与女儿约 28 岁 |
| together-08 | 约 27 岁情侣 |
| together-09 | 约 40 岁夫妻 |
| together-10 | 四位约 25 岁的朋友 |
| memory-01 | 约 23 岁女性，短发 |
| memory-02 | 约 30 岁男性，戴眼镜 |
| memory-03 | 约 26 岁女性，长卷发 |
| memory-04 | 约 24 岁男性 |
| memory-05 | 约 32 岁女性，中长发 |
| memory-06 | 约 28 岁男性 |
| memory-07 | 约 22 岁女性，丸子头 |
| memory-08 | 约 22 岁男性毕业生 |
| memory-09 | 约 45 岁女性 |
| memory-10 | 约 27 岁女性，短发 |
| self-01～self-10 | **每个主题两张**：`-a` 女性、`-b` 男性，年龄在 22～45 岁之间分散，20 个人各不相同 |

合计 46 张：35 个写实主题加 cartoon，self 系列每个主题出两张。

## 落地步骤

1. **原图存档**：原图存到 `docs/sources/portrait-covers-2026-10/<id>.png`，self 系列存为 `<id>-a.png` 和 `<id>-b.png`。最终使用的提示词另存为同名的 `-prompt.txt`。
2. **封面**：用 sharp 居中裁成 3:4，缩放为 720×960 的 WebP（quality 88 左右，单张 160 KB 以内），文件名用**新名字** `assets/examples/<id>-v2.webp`，self 系列为 `<id>-v2-a.webp` 和 `<id>-v2-b.webp`。不要覆盖旧文件，避免设备缓存显示旧图。
3. **更新 `styles.json`**：只改这 36 个主题的 `exampleUrl`，self 系列同时改 `exampleUrls`。prompt、outfitPrompt 等字段一律不动。
4. **已安装设备的升级**：在 `config/styles/scene-quality-migration.json` 里给每个主题追加旧 `exampleUrl` 的哈希，算法是 `sha256(JSON.stringify(旧地址))`。追加到数组里，不覆盖已有条目。上次加入的 `exampleUrls` 同步逻辑同样适用于 self 系列，请确认它能生效。
5. **清单**：把新封面写入 `docs/sources/portrait-covers/manifest.json`（或者新建 `portrait-covers-2026-10/manifest.json` 并更新测试的读取路径）。字段沿用现有格式，`status` 写为 `"Original illustrations of fictional people, not verified Seedream results"`。旧原图保留不删。
6. **旧文件处理**：确认没有任何地方引用后，删除 `cinema.svg`、`business.svg`、`cartoon.svg`；`ThemePicker.tsx` 里 `bundled` 映射中对应的项一并清理。editorial、film、festival 的旧拼版图同样处理。anime 的拼版图保留不动。
7. **更新测试**：`tests/portrait-collection.test.ts` 中封面相关的断言（manifest 路径、sha256、self 的双图）改为指向新封面；新增断言：每个被重做的主题，在迁移文件里都有旧封面地址的哈希。

## 质检（逐张看图）

逐张检查 46 张，有任何一项不合格就重新生成：

- 动作或道具与提示词不符（例如 memory-03 没有抱书，memory-07 没有蛋糕，self-06 没有栏杆）
- 神态不符：上面 8 个主题却看着镜头，或者整个系列都是同一种对镜头的假笑
- 光影平淡，看不出提示词要求的光线设计
- 同一系列里出现相同的脸、相同的姿势或相同的服装
- 出现文字、数字、logo、水印
- 手指数量不对、手遮脸、肢体畸形
- 头顶被裁掉，或人数不对
- 塑料皮肤、AI 网红脸、过度磨皮

全部通过后，拼一张总览图 `docs/sources/portrait-covers-2026-10/overview.png`（每行 8 张，每张下方标 ID 和名称），再拼一张新旧对比图 `before-after.png`，方便给甲方看。

## 验收

- `npm test`、`npx tsc --noEmit`、`npm run build` 全部通过。
- 交付说明里写清：生成张数、重做了哪些及原因、总览图和对比图的路径。如果某个主题始终达不到要求，如实写明，不要用不合格的图凑数。
