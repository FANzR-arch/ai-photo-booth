# 任务：为 38 个儿童主题生成正式封面

> 把下面整段交给 Codex，在 `ai-photo-booth` 项目根目录运行。

---

## 背景

这是一个线下 AI 拍照亭项目（React + Fastify，Seedream 图生图）。2026-10-05 新增了 38 个儿童主题，ID 都以 `kids-` 开头，分在“童趣奇遇”和“小小职业”两个分类里。它们现在的封面是 `assets/examples/kids-*.svg` 临时卡片，只有 emoji 加文字。请换成真实感的原创示意图，让家长和孩子在触屏上一眼看懂主题。

先阅读：
- `config/styles/styles.json`：每个 `kids-*` 主题的 `prompt`（场景与动作）和 `outfitPrompt`（服装），封面画面要以这两段为准
- `packages/shared/kids-collection.ts`：主题所属分类
- `docs/儿童主题扩充.md`：主题设计说明
- `docs/sources/style-expansion-10.json`：此前用内置 imagegen 生成风格预览时的记录格式，可以参考

## 生图工具与边界

- 使用你内置的图片生成能力（imagegen）。**不要调用项目里的 Seedream 接口**，也不要读取或修改 `.env`、`API.txt`。Seedream 按次计费，而且需要真人参考照。
- 画中全部是**虚构儿童**，不要使用、模仿或检索任何真实儿童的照片。
- 原创设定，不能像任何现有 IP：迪士尼公主、艾莎、漫威/DC 英雄、奥特曼、高达、哈利·波特、乐高小人、小猪佩奇等都不行。服装、飞机、火车、球衣、赛车上也不能出现真实机构或品牌标志。

## 画面统一要求（每一张都要满足）

1. 竖版 3:4，人物位于画面中央，腰部以上的半身构图，头顶完整并留出空间，双肩完整入镜。这与拍照亭的实际成片构图一致。
2. 儿童的头身比例符合画面设定的年龄，不能拉长身形，也不能显得成熟或像小大人；肤质自然，不要过度磨皮，不要蜡像感。
3. 表情是轻松的闭唇微笑，或者略带笑意，眼神明亮。不要张嘴大笑，也不要夸张表情（实际成片同样是这种表情，封面不能过度承诺）。
4. 画中有两条手臂、两只手，五指清晰，手不遮脸。道具握持的方式要合理。
5. 画面里不能有任何文字、字母、数字、签名、水印、logo、边框，也不要拼图。宇航服徽章、证书、线索卡片都画成无字的样子。
6. 写实主题要做出高质量商业儿童摄影的质感。四个转绘主题（`kids-picturebook`、`kids-toyfigure`、`kids-crayon`、`kids-bricks`）要用各自的媒介来表现，材质一眼可辨。
7. 一张图只出现一个虚构儿童；亲子主题例外，是一位虚构大人加一个虚构孩子，按下表执行。
8. 场景、动作和服装按 `styles.json` 对应主题的 `prompt` 与 `outfitPrompt` 来画。下表只指定人物，以保证男孩女孩、年龄和发型分布均衡。

### 英文生图提示词模板

先把每个主题的 prompt/outfitPrompt 译成英文，再套进下面的模板：

```
Create one original image for a children's photo booth theme gallery.
Scene: {scene and lighting from prompt}. Style: {photographic quality / art medium}.
Subject: {subject from the table}, wearing {outfit from outfitPrompt}.
Pose: {pose from the 动作 part}.
Age-appropriate child head-to-body proportions, natural skin texture, gentle closed-lip smile, bright eyes.
Waist-up, centered, vertical 3:4, whole head with headroom, both shoulders, both arms and hands visible with five clear fingers.
Fully original design, no resemblance to existing franchise characters.
No text, letters, numbers, logos, watermark, signature, border or collage.
```

### 人物分配

**童趣奇遇**

| ID | 人物 |
|---|---|
| kids-dino | 约 6 岁东亚男孩，短碎发 |
| kids-space | 约 7 岁东亚女孩，齐耳短发 |
| kids-pirate | 约 5 岁东亚男孩，微卷短发 |
| kids-hero | 约 6 岁东亚女孩，高马尾 |
| kids-knight | 约 7 岁东亚男孩，短发 |
| kids-castle | **两张**：`-a` 约 5 岁女孩，长发，穿公主裙；`-b` 约 6 岁男孩，短发，穿王子礼服 |
| kids-fairy | **两张**：`-a` 约 6 岁女孩，穿花瓣纱裙，有透明薄翼；`-b` 约 5 岁男孩，穿叶片纹外套和背带 |
| kids-unicorn | 约 5 岁东亚女孩，双丸子头 |
| kids-ocean | 约 8 岁东亚男孩，短发 |
| kids-magic | 约 9 岁东亚女孩，戴圆框眼镜，及肩发 |
| kids-circus | 约 6 岁东亚男孩，短发 |
| kids-snow | 约 7 岁东亚女孩，长直发 |
| kids-candy | 约 4 岁东亚女孩，短发配小发夹 |
| kids-camping | 约 9 岁东亚男孩，短发 |
| kids-mecha | 约 8 岁东亚男孩，短发 |
| kids-panda | 约 6 岁东亚女孩，低双马尾 |
| kids-picturebook | 约 5 岁东亚女孩，齐刘海短发（绘本插画） |
| kids-toyfigure | 约 6 岁东亚男孩，短发（潮玩手办） |
| kids-crayon | 约 4 岁东亚男孩，圆寸（蜡笔画） |
| kids-bricks | 约 7 岁东亚女孩，马尾（积木拼搭） |
| kids-family-space | 30 多岁东亚父亲 + 约 6 岁女儿 |
| kids-family-hero | 30 多岁东亚母亲 + 约 5 岁儿子，保留真实身高差 |
| kids-family-bake | 30 多岁东亚父亲 + 约 6 岁儿子 |

**小小职业**

| ID | 人物 |
|---|---|
| kids-firefighter | 约 6 岁东亚男孩 |
| kids-pilot | 约 7 岁东亚女孩，低马尾 |
| kids-train | 约 5 岁东亚男孩 |
| kids-racer | 约 8 岁东亚女孩，短发 |
| kids-scientist | 约 7 岁东亚男孩，戴眼镜 |
| kids-doctor | 约 6 岁东亚女孩，双马尾 |
| kids-vet | 约 5 岁东亚男孩，怀里抱一只小狗 |
| kids-bakery | 约 5 岁东亚女孩 |
| kids-builder | 约 4 岁东亚男孩 |
| kids-detective | 约 8 岁东亚女孩，及肩发 |
| kids-football | 约 9 岁东亚男孩 |
| kids-ballet | **两张**：`-a` 约 6 岁女孩，穿粉色练功服和纱裙；`-b` 约 7 岁男孩，穿白 T 恤和深色练功裤 |
| kids-painter | 约 6 岁东亚女孩，戴贝雷帽 |
| kids-rockstar | 约 8 岁东亚男孩 |
| kids-graduate | 约 6 岁东亚女孩，戴学士帽 |

合计 41 张：38 个主题，其中 3 个双版本。

## 落地步骤

1. **原图存档**：生成的原图存到 `docs/sources/kids-covers/<id>.png`，双版本存为 `<id>-a.png` 和 `<id>-b.png`。每张图的最终英文提示词另存为同名的 `-prompt.txt`。
2. **封面**：用 `sharp` 居中裁成 3:4，缩放为 **720×960** 的 WebP（quality 88 左右），输出到 `assets/examples/<id>.webp`（双版本为 `<id>-a.webp`、`<id>-b.webp`）。单张控制在 150 KB 以内。
3. **清单**：写 `docs/sources/kids-covers/manifest.json`，格式参考 `docs/sources/style-expansion-10.json`。字段包括：`tool`、`status: "Original illustrations of fictional children, not verified Seedream results"`，以及每张图的 `id`、`subject`、`prompt`、`original`、`cover`、`sha256`（原图）、`coverSha256`。
4. **更新 `config/styles/styles.json`**，只改 `kids-*` 条目：
   - 单图主题：`exampleUrl` 改为 `/examples/<id>.webp`。
   - 双版本主题：`exampleUrl` 改为 `/examples/<id>-a.webp`，并新增 `"exampleUrls": ["/examples/<id>-a.webp", "/examples/<id>-b.webp"]`。前端 `ThemePicker` 已经支持两张图轮播。
   - 其他字段（prompt、outfitPrompt、name 等）一律不动。
5. **已安装设备的升级**：已经启动过的设备，SQLite 里存的还是 `.svg` 地址，只改 JSON 不会生效。请在 `config/styles/scene-quality-migration.json` 里给每个 `kids-*` 主题加上 `exampleUrl` 键，值是旧地址的哈希：`sha256(JSON.stringify("/examples/<id>.svg"))`（hex）。这里要按 JSON 字符串计算，包含引号。具体逻辑见 `apps/server/app.ts` 的 `sceneKeys`。合并时不要覆盖文件里已有的其他条目。后台人工换过封面的设备，哈希对不上，会保留人工设置的封面。
   - 注意：现有升级逻辑只同步 `exampleUrl`，不会同步 `exampleUrls`，所以已安装设备上的三个双版本主题只会显示 `-a`。请在 `app.ts` 的升级分支里补上：当 `exampleUrl` 因迁移被替换、并且内置样式带有 `exampleUrls` 时，同时写入 `exampleUrls`。再在 `tests/backend.test.ts` 里仿照已有的 scene-quality 升级用例，加一条测试覆盖这种情况。
6. **删除** `assets/examples/kids-*.svg`。
7. **更新测试** `tests/portrait-collection.test.ts` 中 “children themes …” 这条：
   - 把 `exampleUrl === /examples/<id>.svg` 和“非 AI 成片示例”这两项断言，改为检查 WebP 存在且尺寸为 720×960。
   - 对 `kids-castle`、`kids-fairy`、`kids-ballet` 断言 `exampleUrls` 有 2 张，并且 `exampleUrl === exampleUrls[0]`。
   - 断言每个 `kids-*` 在 `scene-quality-migration.json` 里都有旧 svg 地址的 `exampleUrl` 哈希。
   - 断言 manifest 里记录的 sha256 与原图一致，可参考同文件中 portrait-covers 的写法。
8. **文档**：更新 `docs/儿童主题扩充.md`，把“封面是 emoji 示意卡片”改为说明新封面的来源（内置 imagegen 生成的虚构儿童原创示意图，不是 Seedream 实测），并注明清单路径。

## 质检（必须逐张看图）

逐张打开 41 张封面检查，有任何一项不合格就重新生成：

- 出现文字、字母、数字、logo 或水印
- 手指数量不对，手或手臂畸形，或者手遮住了脸
- 孩子看起来不像设定的年龄（偏成熟，或比例像成人）
- 张嘴大笑或表情夸张
- 头顶被裁掉，或者不是腰部以上的构图
- 像某个现有 IP 角色，或带有真实品牌、机构标志
- 和对应主题的 prompt/outfitPrompt 明显不符（例如宇航员没有地球舷窗，消防员背后没有消防车）
- 亲子主题人数不对，或者大人和孩子的身高关系不合理

全部通过后，用 sharp 拼一张总览图 `docs/sources/kids-covers/overview.png`（例如每行 7 张，每张下方标 ID），方便甲方一次看完。

## 验收

- `npm test` 全部通过
- `npx tsc --noEmit` 通过
- `npm run build` 通过
- 在交付说明里列出：生成张数、重做过哪些及原因、总览图路径、封面总体积。如果某个主题始终达不到要求，如实写明，不要用不合格的图凑数。
