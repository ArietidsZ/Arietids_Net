# arietids.net 个人主页

钟智博（Arietids）的个人主页，Astro 静态站点，中文在 `/`，英文在 `/en/`。

主页展示已批准的个人资料与作品；技术、学习、研究博客共用一套写作与发布流程。博客框架不附带示例文章，正文由本人后续补充。

## 运行

需要 Node 22.23.4 或更高版本。

```bash
npm ci                 # 按 package-lock.json 安装依赖
npm run dev:public     # 本地查看，只显示已公开内容（http://localhost:4321）
npm run dev            # 预览模式，待确认内容以虚线框标出
npm run check          # 类型检查与内容 lint
npm test               # 单元测试（公开范围检查、排版规则）
npm run build          # 生产构建到 dist/，运行公开范围检查与中文字体覆盖检查
npm run preview:public # 本地预览 dist/
npm run fonts          # 重新生成中文显示字体子集（新增汉字后运行，见下文）
```

端到端测试使用 Playwright，分两套：

```bash
npx playwright install chromium   # 首次运行；已有 Chromium 时可改用下一行的变量
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e     # 预览版（含待确认内容）
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:public  # 实际部署的 dist/
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:blog:flow # 临时副本验证草稿、文章渲染和发布链路
```

`tests/public.spec.ts` 从 sitemap 遍历公开路由，检查报错、HTTP/网络失败和待确认标记；核验中文字体、首屏及两面头像的字节预算、暂停动效。另有博客无脚本导航、RSS、窄屏论文图、翻转打印和主题/动效状态回归。`.github/workflows/ci.yml` 在推送与 PR 时运行类型检查、单元测试、独立博客发布链路与两套端到端测试；不自动部署。

`tests/smoke.spec.ts` 覆盖首页各区块、主题切换、星图筛选、头像翻转、语言切换、移动端菜单和 axe 检查；`tests/visual.spec.ts` 覆盖 320/390 宽度下各路由的横向溢出、标语原文、分组筛选、详情页星图与引用、详情页和 404 在日夜两种主题下的 axe 检查。

## 内容与公开范围

- 个人资料写在 `src/content/*.yaml`，每条带 `visibility`（public / pending / private）。文章使用下文的 Markdown/MDX 写作流程。生产构建只包含已公开且到发布日期的内容。
- `npm run review` 列出待确认项，`npm run visibility -- public work:auralis facts:identity.name` 修改状态（`private`、`pending` 同理）。
- `scripts/check-public.mjs` 在构建后检查产物，阻止未批准内容、路由、头像和主题标签进入 `dist/`。比对前会去掉标签、零宽断行并统一横线，所以排版组件拆开的文字也能查出；含汉字的条目从 4 个字起即参与比对。
- 没有公开作品的研究主题不会以标签形式出现。星图上对应的恒星只显示天文名称（如 γ Ari）。

## 博客写作

技术、学习、研究三个分区共用一个 Markdown/MDX 文章集合。分类分别是 `tech`、`study`、`research`；中文入口为 `/blog/`，英文入口为 `/en/blog/`。文章采用 `/blog/<slug>/`，分类采用 `/blog/category/<category>/`。相同 slug 的 `.zh.md` 与 `.en.md` 是互相对应的两种语言；没有译文时不生成虚假的另一语言文章。

Vercel 将旧 `/notes/` 路径及英文对应路径以 HTTP 301 转到博客；本地静态预览保留 HTML 跳转回退。

```bash
npm run post -- new my-first-post --category tech --lang zh
```

新文件位于 `.drafts/my-first-post.zh.md`，默认 `pending`。填写 `title`、`description` 与正文后用 `npm run dev` 本地预览。日期使用 `YYYY-MM-DD`，`updated` 不能早于 `date`，标签写在 `tags` 数组。文件名使用小写英文字母、数字和单个连字符；`category`、`index`、`rss` 是保留名。文章文件保持平铺，不按分类建立文件夹。

正文可使用 Markdown、MDX、代码块、脚注及 `$...$` / `$$...$$` 数学公式。草稿素材可以存放在 `.drafts/assets/`；仅把确认可公开的媒体复制到 `public/blog-media/<slug>/`，正文使用 `/blog-media/<slug>/文件名`。该目录内全部文件都视为同一篇文章的公开素材；不要把内部研究图片或尚未公开的另一语言素材放进去。

确认整篇文章和关联媒体都可公开后执行：

```bash
npm run post -- publish my-first-post --lang zh
npm run check
npm run build
```

发布命令会将草稿移至 `src/content/notes/`、改为 `public`，并去掉本地审阅字段；不会替你提交 Git 或部署。检查差异后再提交源码、部署网站。若新增了显示字体中的汉字，运行 `npm run fonts` 后重新构建。新建空模板、缺少正文、日期无效或目标文件已存在时会拒绝发布。

`.drafts/` 被 Git 与 Vercel 上传忽略，Astro 只在本地预览时加载草稿；生产检查会比对本地草稿以防内容误入产物。**`visibility` 只控制网站显示，不会隐藏公开 GitHub 仓库中的源码。** 因此 `src/content/notes/` 只允许完整、已确认公开的文章，内部研究与未发表文章留在 `.drafts/` 或仓库之外。删除网页也不会抹除已经公开的 Git 历史。

公开文章的 `date` 晚于上海当天时，不生成网页和订阅条目；日期到达后仍需重新构建并部署。将未来日期的文章放进公开源码意味着源码已公开，它不是保密的定时发布功能。

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

新增内容不需要手工坐标：作品写进 `work.yaml` 后会自动出现在卡片网格、星图轨道和详情页。新增主题只需在 `themes.yaml` 里用 `star` 指明对应恒星（例如 `Botein · δ Ari`）；作品的 `themes` 和经历的 `work` 只能引用已存在的 id，写错会在构建时报错。

### 中文显示字体

标题用的 Noto Serif SC 不再整套加载，而是只保留站点实际用到的字（约 500 字，单个文件约 150 KB，中文页预加载）。`npm run build` 会检查构建产物里的汉字是否都在子集内；不在时给出提示，这些字会先用系统宋体显示。新增或修改中文内容后运行 `npm run fonts`（首次会下载 25 MB 原字体到 `node_modules/.cache`），提交生成的 `src/assets/fonts/noto-serif-sc.subset.woff2` 和 `src/styles/noto-serif-sc.css`。

检查会读取 WOFF2 的实际字符映射，损坏字体或不实 CSS 覆盖声明会阻止构建。生成时只采集公开页面，草稿字形不会进入公开字体；本地草稿缺少的标题字使用系统字体。字体许可随网站发布于 `/fonts/OFL.txt`。

## 性能说明

测量方法与数据见 `CHANGES.md`。要点：

1. 首屏天空分层绘制（`src/scripts/sky.ts`）：静态的星云、星尘和雷达刻度只在尺寸或主题变化时画一次；辐射点光晕和日间雷达扫描交给合成线程；每帧只重画星星、流星和回波。页眉下方的淡出由遮罩完成。离屏、后台标签页、暂停动效时全部停止。
2. 所有无限循环动画都用 transform/opacity 实现，可以在合成线程运行，所在区块离开视口时自动暂停（`[data-loops]`，见 `src/scripts/offscreen.ts`）。入场动画只向后填充（`backwards`）：结束后仍然生效的滤镜动画会把子元素的合成动画拖回主线程。
3. 卡片、按钮、标签和面板不再使用 `backdrop-filter`（背后的天空一直在动，模糊需要每帧重算），改用预先合成的半透明底色；只有页眉保留毛玻璃。
4. "暂停动效"统一由 `src/scripts/motion.ts` 判断，也覆盖主题切换的揭示动画和页面/筛选过渡。

仍待处理：
- 部署：`vercel.json` 设置了旧博客路径跳转、`/_astro/` 长期缓存和几项安全响应头。CSP 需要先为内联脚本生成 hash，并处理大量内联 `style` 属性，尚未启用。
- 内容：论文的英文摘要目前只有 "A survey paper."，会出现在 ScholarlyArticle 结构化数据里，建议本人补充。
