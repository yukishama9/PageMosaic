---
name: html-cleanup
description: 用于将设计好的html模板的内部链接进行遍历清理，并为静态网站项目创建合适的标准文件结构。用户在此Skill请求中需提供目标网站的性质或需求（如企业官网、知识库、个人展示等）以便做出结构规划。
---

# WebBuilder HTML 清理与规范化 Skill (html-cleanup)

## Overview（概述）

本 Skill 处理从第三方工具（Figma 转 HTML、Webflow 导出、网页构建器、购买的 HTML 模板等）获得的原始 HTML 模板，执行以下工作：

1. **文件结构整理** — 规范 `assets/` 目录布局
2. **内部链接修复** — 修复 `href="#"` 死链，建立页面间跳转
3. **冗余代码清理** — 删除构建工具残留代码
4. **`<head>` 规范化与 Metadata 标注** — 清理冗余 head 标签，标注 WebBuilder Metadata 管理区域 ← 本次新增
5. **WebBuilder 组件标记注入** — 核心标记，使页面可被 WebBuilder 识别
6. **SVG / 无障碍规范化** — social icons 合规化
7. **骨架验证与报告** — 确认可直接导入 WebBuilder

> 参考规范文件位于本 Skill 文件夹：
> - `templates/component-markers-template.html` — 标准页面模板
> - `references/COMPONENT-GUIDE.md` — 详细标记规范

---

## Pre-requisites（前置条件）

- 工作目录中应至少包含 `.html` 文件
- 用户提示词中需说明站点用途（如"企业官网"、"产品展示页"、"作品集"）
- 如果用户指定了目标文件夹路径，在该目录下操作；否则在当前工作目录操作

---

## Phase 1：项目分析与文件结构整理

**执行动作：**

1. 用 `list_files` (recursive) 扫描所有文件，识别：
   - 所有 `.html` 页面
   - CSS / JS / 图片 / 字体文件的当前位置
   - 是否已有 `assets/` 目录结构

2. 根据站点用途推断页面用途，建立映射表：

   | 文件名（含常见变体）| 推断用途 | 标准链接目标 |
   |---|---|---|
   | `index.html`, `home.html` | 首页 | `index.html` |
   | `about.html`, `about-us.html` | 关于页 | `about.html` |
   | `services.html`, `service.html` | 服务页 | `services.html` |
   | `contact.html`, `contact-us.html` | 联系页 | `contact.html` |
   | `privacy.html`, `privacy-policy.html` | 隐私政策 | `privacy.html` |
   | `blog.html`, `news.html` | 博客/新闻 | `blog.html` |

3. 创建规范目录（如不存在）：
   ```
   assets/
     css/        ← 所有 .css 文件
     js/         ← 所有 .js 文件（页面专属脚本）
     images/     ← 所有图片
     fonts/      ← 字体文件（如有）
   ```

4. 将散落的静态资源移动到对应目录，同步更新 HTML 中的引用路径。

---

## Phase 2：内部链接修复

**执行动作：**

1. 扫描所有 HTML，提取所有 `<a href="...">` 链接
2. 识别以下需要修复的情况：
   - `href="#"` — 占位死链
   - `href=""` — 空链接
   - `href="javascript:void(0)"` — JS 占位链接
   - 指向不存在文件的链接
3. 根据 Phase 1 建立的页面映射表，将链接文本（如 "Home"、"About"、"Contact"）匹配到正确的文件名
4. 语言切换链接：如有多语言版本子文件夹（`zh-SC/`、`en/` 等），建立正确的跨语言跳转路径

**修复报告格式：**
```
[link-fix] index.html: "About" href="#" → "about.html"
[link-fix] index.html: "Contact" href="#" → "contact.html"
[skip]     index.html: "Twitter" href="https://twitter.com/..." → 外部链接，保留
```

---

## Phase 3：冗余代码清理

**执行动作：**

清理以下类型的冗余内容（清理前逐一确认，不盲目删除）：

- Webflow / Framer / Figma 导出的追踪脚本（含 `webflow.com`、`framer.com` 域名的 `<script src>`）
- 空的 `<div>` / `<span>` 包装层（无 class、无 id、无内容）
- 重复的 `<meta>` 标签
- 构建工具注释（如 `<!-- This site was created in Webflow. -->`）
- 未使用的内联 `style=""` 属性（宽度/高度写死的情况，询问用户是否清理）

**⚠️ 不清理：**
- 有实际作用的 `<script>` 内联脚本
- Cookie banner 的 JS 代码
- 合法的 CDN 引用

---

## Phase 4：`<head>` 规范化与 Metadata 标注 ⭐

对每个 HTML 文件的 `<head>` 区域执行以下清理和标注工作。

### 4.1 清理构建工具残留

移除以下 head 内容：

| 清理项 | 示例 | 处理方式 |
|--------|------|---------|
| `generator` meta | `<meta name="generator" content="Webflow">` | 删除 |
| 指向开发域名的 OG 标签 | `<meta property="og:url" content="https://xxx.webflow.io/...">` | 删除 |
| 指向开发域名的 canonical | `<link rel="canonical" href="https://xxx.webflow.io/...">` | 删除 |
| 指向开发域名的 OG image | `<meta property="og:image" content="https://xxx.webflow.io/...">` | 删除 |
| 构建工具私有 meta | Webflow `wf-*`、Framer 内部 meta 等 | 删除 |

**⚠️ 不删除：**
- 有效的 `<meta name="description">` 内容（保留，记录到报告）
- 有效的 OG 标签（`og:title`、`og:description` 等有实际内容的）
- Favicon `<link rel="icon">` 或 `<link rel="apple-touch-icon">`
- 字体 CDN 引用（Google Fonts 等）

### 4.2 确保最小必需 head 元素

检查并补充以下元素（缺失才添加）：

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>（见 4.3）</title>
```

### 4.3 `<title>` 规范化

- 如果 `<title>` 为空或仅含构建工具占位值（如 `Untitled`、`Home - Webflow`）：
  - 根据文件名推断合理标题（如 `about.html` → `About — Site Name`）
  - 写入推断后的标题，并在报告中注明"建议在 WebBuilder 中通过 Page Metadata 面板修改"
- 如果 `<title>` 已有有意义的内容：保留原值不修改

### 4.4 Metadata 管理标注（WebBuilder 对接）

在 `<head>` 内、CSS 引用之前，插入以下标注注释：

```html
<!-- @meta:managed
     以下 SEO metadata 由 WebBuilder Page Metadata 面板管理，导出时自动注入：
     - <title>
     - <meta name="description">
     - <meta property="og:title">
     - <meta property="og:description">
     - <meta property="og:image">
     - <link rel="canonical">
     在 WebBuilder 中打开此页面，展开 "Page Metadata" 面板填写上述字段。
-->
```

此标注不影响页面渲染，仅作为编辑提示。WebBuilder 导出时会在该区域注入对应标签；若字段为空则不注入，原 HTML 内容不受影响。

### 4.4 `<html lang>` 检查

- 检查 `<html lang="...">` 是否存在
- 如缺失，根据项目语言（用户指定或推断）补充
- 如页面位于语言子目录（如 `zh-SC/index.html`），相应修改 `lang="zh-Hans"`

**Phase 4 报告格式：**
```
[head-clean]  index.html: 删除 generator meta (Webflow)
[head-clean]  index.html: 删除 og:url 指向开发域名
[head-keep]   index.html: 保留现有 <meta name="description"> 内容
[head-add]    about.html: 补充缺失的 <meta charset="UTF-8">
[head-title]  about.html: title 规范化 "About Us - Webflow" → "About — Site Name"
[meta-marked] index.html: @meta:managed 标注已注入
[lang-fix]    index.html: 补充缺失的 <html lang="en">
```

---

## Phase 5：WebBuilder 组件标记注入 ⭐

这是本 Skill 的核心步骤，目标是让所有 HTML 文件能正确被 WebBuilder 识别和导入。

### 5.1 识别组件区块

读取每个 HTML 文件，用以下选择器策略识别三类核心组件：

**navbar（顶部导航）**
优先级匹配（从高到低）：
1. 已有 `<!-- @component:navbar -->` 标记 → 跳过
2. `<header>` 元素（包含 `<nav>` 子元素的）
3. `<nav>` 元素（位于 `<body>` 顶部，在 `<main>` 之前）
4. `[class*="navbar"]`、`[class*="nav-bar"]`、`[class*="header"]`
5. `[id*="navbar"]`、`[id*="header"]`、`[id*="nav"]`

**footer（页脚）**
优先级匹配：
1. 已有 `<!-- @component:footer -->` 标记 → 跳过
2. `<footer>` 元素
3. `[class*="footer"]`、`[id*="footer"]`

**cookie-banner（Cookie 弹窗）**
优先级匹配：
1. 已有 `<!-- @component:cookie-banner -->` 标记 → 跳过
2. `[id*="cookie"]`、`[class*="cookie"]`
3. `[class*="consent"]`、`[id*="consent"]`
4. `[class*="gdpr"]`、`[id*="gdpr"]`
5. 包含 `localStorage.setItem` 且紧邻弹窗 `<div>` 的 `<script>` 块

### 5.2 注入标记

在识别的元素前后注入标记，遵循以下骨架顺序：

```html
<body>

<!-- @component:navbar -->
<header class="...">
  ...
</header>
<!-- /@component:navbar -->

<main>
  ...页面独有内容...
</main>

<!-- @component:footer -->
<footer class="...">
  ...
</footer>
<!-- /@component:footer -->

<!-- @component:cookie-banner -->
<div id="cookie-consent" class="...">
  ...
</div>
<script>/* cookie script */</script>
<!-- /@component:cookie-banner -->

</body>
```

### 5.3 `<main>` 标签检查

如果页面主内容没有被 `<main>` 包裹：
- 识别 navbar 和 footer 之间的内容区域
- 自动用 `<main>` 包裹（不改变内部内容）
- 若无法确定边界，向用户报告，建议手动包裹

### 5.4 标记注入报告

```
[marker-injected] index.html: navbar → <header class="site-header">
[marker-injected] index.html: footer → <footer class="footer">
[marker-injected] index.html: cookie-banner → <div id="cookie-consent">
[marker-skipped]  about.html: navbar — 已有 @component 标记，跳过
[marker-warning]  contact.html: 未找到 cookie-banner，请手动添加
```

---

## Phase 6：SVG / 无障碍规范化

检查所有 footer 中的社交图标链接（`<a>` 元素，`href` 含 social/twitter/instagram 等域名关键词）：

**检查项目：**

| 检查项 | 问题 | 修复动作 |
|--------|------|---------|
| `<a>` 无 `title` | 无障碍缺失 | 从 href 域名推断平台名，添加 `title="Twitter"` |
| `<a>` 无 `aria-label` | 无障碍缺失 | 添加 `aria-label="Twitter"` |
| `<svg>` 无 `fill="currentColor"` | 颜色无法用 CSS 控制 | 将 `fill="#ffffff"` 等固定颜色替换为 `fill="currentColor"` |
| `<svg>` 无 `width`/`height` | 尺寸不明确 | 添加 `width="20" height="20"` |
| `<img>` 图标（非 SVG）| 无法 CSS 控制颜色 | 报告建议用户替换为内联 SVG，提供 simpleicons.org 链接 |

**平台域名识别表：**

| 域名关键词 | 平台名 |
|-----------|--------|
| `twitter.com`, `x.com` | Twitter |
| `instagram.com` | Instagram |
| `linkedin.com` | LinkedIn |
| `facebook.com` | Facebook |
| `youtube.com` | YouTube |
| `github.com` | GitHub |
| `weibo.com` | 微博 (Weibo) |
| `wechat.com`, `weixin.qq.com` | WeChat |
| `tiktok.com` | TikTok |
| `pinterest.com` | Pinterest |

---

## Phase 7：验证与最终报告

### 7.1 WebBuilder 兼容性清单验证

对每个处理完的 HTML 文件执行以下检查，输出结果：

```
✅ index.html
   ✅ <html lang> 存在且正确
   ✅ <meta charset> 和 <meta viewport> 存在
   ✅ <title> 有意义的内容
   ✅ @meta:managed 标注已注入
   ✅ @component:navbar 标记已注入
   ✅ @component:footer 标记已注入
   ✅ @component:cookie-banner 标记已注入
   ✅ 内容区域被 <main> 包裹
   ✅ 所有社交图标有 title + aria-label
   ✅ 所有社交 SVG 使用 fill="currentColor"

⚠️ about.html
   ✅ <html lang> 存在且正确
   ✅ <meta charset> 和 <meta viewport> 存在
   ✅ <title> 有意义的内容
   ✅ @meta:managed 标注已注入
   ✅ @component:navbar 标记已注入
   ✅ @component:footer 标记已注入
   ❌ 未找到 cookie-banner（该页无弹窗，可忽略或手动添加）
   ✅ 内容区域被 <main> 包裹
```

### 7.2 汇总报告

输出 `attempt_completion` 时包含：

1. **文件结构** — 创建/移动了哪些文件/目录
2. **链接修复** — 修复了多少个死链，哪些文件
3. **`<head>` 规范化** — 清理了哪些冗余标签，补充了哪些必要元素，哪些页面注入了 `@meta:managed`
4. **组件标记** — 每个文件注入了哪些标记，哪些跳过，哪些需手动处理
5. **SVG 规范化** — 修复了哪些图标属性
6. **下一步操作提示**：
   > 文件已准备好，可以打开 WebBuilder，点击 **Import Site** 选择此文件夹。
   > WebBuilder 将自动识别 `@component` 标记，无需运行 Auto-detect。
   > 导入后，在每个页面的编辑器中展开 **Page Metadata** 面板，填写 Title / Description / OG 等字段；导出时将自动注入到 `<head>`。

---

## Execution Steps for the Agent（执行顺序）

1. **读取规范**：先读取本 Skill 文件夹中的参考文件：
   - `references/COMPONENT-GUIDE.md` — 了解标记规范
   - `templates/component-markers-template.html` — 了解标准骨架

2. **分析项目**：`list_files` 获取目标目录所有文件

3. **逐页读取**：`read_file` 读取每个 `.html` 文件内容

4. **对每个文件依次执行** Phase 1–6 的修改，使用 `write_to_file` 或 `replace_in_file` 保存

5. **汇总并用 `attempt_completion` 报告结果**

> **重要**：每次修改文件前，先在内部确认：
> - `<head>` 中是否已有 `@meta:managed` 标注（避免重复注入）
> - 是否已有该组件标记（避免重复注入）
> - 识别到的元素是否确实是目标组件（避免误标记页面内容区块）
> - 如有多个候选元素，选择文档中位置最靠近 `<body>` 开头（navbar）或 `</body>` 末尾（footer）的元素