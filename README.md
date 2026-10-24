# arietids.net 个人主页

钟智博（Arietids）的个人主页，Astro 静态站点，中文在 `/`，英文在 `/en/`。

本版是以线上版本（来源 commit 183618d）为基准做的一轮视觉重做。个人事实与公开范围未改：`src/content/` 仍是 28 项已批准内容，首屏表述与内容取舍保持原样。生产部署与域名不在本轮范围内。

## 运行

需要 Node 22.22 或更高版本。

```bash
npm ci                 # 按 package-lock.json 安装依赖
npm run dev:public     # 本地查看，只显示已公开内容（http://localhost:4321）
npm run dev            # 预览模式，待确认内容以虚线框标出
npm run check          # 类型检查与内容 lint
npm run build          # 生产构建到 dist/，并运行公开范围检查
npm run preview:public # 本地预览 dist/
```

端到端测试使用 Playwright，会先构建预览版再启动本地服务：

```bash
npx playwright install chromium   # 首次运行；已有 Chromium 时可改用下一行的变量
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e
```

`tests/smoke.spec.ts` 覆盖首页各区块、主题切换、星图筛选、头像翻转、语言切换、移动端菜单和 axe 检查；`tests/visual.spec.ts` 覆盖 320/390 宽度下各路由的横向溢出、标语原文、分组筛选、详情页星图与引用、详情页和 404 在日夜两种主题下的 axe 检查。

## 内容与公开范围

- 内容只写在 `src/content/*.yaml`，每条带 `visibility`（public / pending / private）。生产构建只包含 public。
- `npm run review` 列出待确认项，`npm run visibility -- set <id> public` 修改状态。
- `scripts/check-public.mjs` 在构建后检查产物，阻止未批准内容、路由、头像和主题标签进入 `dist/`。
- 没有公开作品的研究主题不会以标签形式出现。星图上对应的恒星只显示天文名称（如 γ Ari）。

## 视觉系统

整站是同一片天空：首屏的星盘就是流星雨的辐射点，向下经过关于、论文、星图，最后在联系区落到地平线。

| 位置 | 文件 | 说明 |
| --- | --- | --- |
| 设计变量 | `src/styles/tokens.css` | 日夜两套色板、金色填充、"仪器面板"与卡片两级表面、星尘与经纬网颜色。新主题只需新增一组变量。 |
| 全站底层 | `src/components/Cosmos.astro` | 构建时生成的星尘与经纬网，随滚动缓慢漂移（CSS scroll-driven，无脚本）。 |
| 首屏天空 | `src/scripts/sky.ts` | 夜间：星云带、流星（渐细拖尾、余迹、火流星）。日间：以星盘为中心的雷达扫描与回波。`anchor` 指定辐射点元素，`shield` 指定需要保持可读的文字区域。详情页和 404 复用同一脚本。 |
| 星盘头像 | `src/components/Portrait.astro` | 指针倾斜、边缘高光、翻面时可见金边、翻面后刻度环转动一格。 |
| 星图 | `src/lib/aries.ts`、`src/components/Atlas.astro` | 白羊座真实星表与等距圆锥投影；主题按 `themes.yaml` 的 `star` 字段对应到恒星；作品自动排在主题星的轨道上，避开其他恒星和标签。右侧主题列表即筛选器。 |
| 详情页星图 | `src/components/StarPlate.astro` | 从同一张星图裁出的局部，点亮当前作品。 |
| 排版 | `src/lib/typeset.ts`、`src/components/ui/Typeset.astro` | 标题按文字系统（汉字/拉丁）设置字重和字距；连字符复合词不断行；`——`、`: ` 后的副标题降为第二行；汉字标题在"的/及/与"等处给出断行点；日期范围显示为短横线。只影响显示，不改文字。 |
| 页面切换 | `src/scripts/transitions.ts`、`src/layouts/Base.astro` | 跨页 View Transitions：卡片标题过渡为详情页大标题，返回时还原。 |

新增内容不需要手工坐标：作品写进 `work.yaml` 后会自动出现在卡片网格、星图轨道和详情页。新增主题时在 `themes.yaml` 里用 `star` 指明对应恒星（例如 `Botein · δ Ari`），并在 `content.config.ts` 的 `themeId` 中登记。

## 交给 Codex 的事项

性能、可靠性、后端与部署由 Codex 接手。本轮没有改动部署配置、域名或 OG 流程（`npm run og` 仍需本人批准后生成）。需要关注的点：

1. Canvas 动画：首页首屏、每个详情页头部和 404 各有一个。离屏、标签页隐藏时暂停；减少动态效果时只画一帧。在无头 Chromium（软件渲染）中空闲测量，首页夜间与线上版本相当，日间约高 25%（雷达扫描每帧多一次遮罩），需要在真机上复测，再决定是否按设备降低流星频率或星数。
2. 固定层：`Cosmos` 为全屏固定 SVG，加上 `body::before` 噪点层与若干 `backdrop-filter`（页眉、卡片、面板）。滚动性能在低端安卓上值得实测。
3. 字体：新增 Fraunces 斜体（真实斜体，用于拉丁名和期刊名），可考虑子集化。
4. 浏览器支持：`text-autospace`、scroll-driven 动画、跨文档 View Transitions、Popover 均为渐进增强，不支持时退化为普通排版或无动画。
5. 页眉毛玻璃只写了无前缀的 `backdrop-filter`（旧版写法被压缩器合并掉了），Safari 18 以前没有模糊，只有半透明底色。
