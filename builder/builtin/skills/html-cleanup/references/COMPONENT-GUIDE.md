# PageMosaic — Component & System Reference Guide

> 参考文件：`templates/component-markers-template.html`

---

## 一、标记语法

```html
<!-- @component:ID -->
  ...组件 HTML 内容（一个或多个元素）...
<!-- /@component:ID -->
```

- 开始标记和结束标记必须**成对出现**
- `ID` 必须与 WebBuilder 中 Component 的 ID **完全一致**（区分大小写）
- 标记之间**不能嵌套**另一个 `@component` 标记

---

## 二、标准组件 ID 及标记位置

| Component ID    | 内容                         | 标记位置               |
|-----------------|------------------------------|------------------------|
| `navbar`        | 顶部导航栏                   | `<body>` 开始后第一个  |
| `footer`        | 页脚                         | `</main>` 之后         |
| `cookie-banner` | Cookie 同意弹窗 + 脚本       | `</footer>` 之后       |

### 正确的页面骨架顺序

```
<body>
  <!-- @component:navbar -->
    <header>...</header>
  <!-- /@component:navbar -->

  <main>
    <!-- 页面独有内容 -->
  </main>

  <!-- @component:footer -->
    <footer>...</footer>
  <!-- /@component:footer -->

  <!-- @component:cookie-banner -->
    <div id="cookie-consent">...</div>
    <script>...</script>
  <!-- /@component:cookie-banner -->
</body>
```

---

## 三、共享数据（Shared Data）

共享数据是**跨组件复用的列表型内容**，在 WebBuilder 中单独管理。

| Shared Data ID | 类型         | 使用位置                     |
|----------------|--------------|------------------------------|
| `main-menu`    | menu         | navbar 菜单 + footer 链接    |
| `social-links` | icon-links   | footer 社交图标区            |
| `languages`    | languages    | navbar 语言切换器            |

### 在组件 HTML 中使用模板语法

```html
<!-- 循环渲染 main-menu 所有菜单项 -->
<!-- @each:main-menu -->
<a href="{{item.href}}">{{t:item.i18nKey}}</a>
<!-- @/each -->

<!-- 循环渲染 social-links 所有社交图标 -->
<!-- @each:social-links -->
<a href="{{item.href}}" title="{{item.label}}" aria-label="{{item.label}}">
  {{item.icon}}
</a>
<!-- @/each -->

<!-- 循环渲染语言切换器 -->
<!-- @each:languages -->
<a href="{{item.pathPrefix}}{{pageName}}" class="lang-btn">{{item.display}}</a>
<!-- @/each -->
```

### 共享数据类型说明

| 类型 | 字段 | 说明 |
|------|------|------|
| `menu` | `label`, `i18nKey`, `href` | 导航菜单项 |
| `icon-links` | `label`, `icon`, `href` | 社交图标链接 |
| `languages` | `code`, `display`, `pathPrefix` | 语言切换器（pathPrefix 由 Export 引擎自动计算） |
| `custom` | 任意字段 | 自定义列表，字段在 Shared Data Editor 中定义 |

---

## 四、模板 Token 完整参考

所有 Token 在 **预览和 Export 时**均会被解析替换。

| Token | 解析结果 | 使用场景 |
|-------|----------|----------|
| `{{t:i18n.key}}` | 当前语言的翻译字符串 | 所有用户可见文字 |
| `{{field:key}}` | 组件/字段编辑器中设置的值 | Logo href/text 等可编辑字段 |
| `{{pageName}}` | 当前页面文件名（如 `about.html`） | 语言切换器链接拼接 |
| `{{lang}}` | 当前语言代码（如 `zh-SC`） | `<html lang="">` 动态设置、条件样式 |
| `{{item.fieldKey}}` | `@each` 循环体内当前项的字段值 | 循环内数据渲染 |
| `{{t:item.i18nKey}}` | 循环项的 i18n key 对应翻译值 | 循环内多语言标签 |

```html
<!-- 所有 Token 综合示例 -->
<html lang="{{lang}}">
  ...
  <!-- @each:main-menu -->
  <a href="{{item.href}}" class="{{pageName}} == index.html ? active : ''">
    {{t:item.i18nKey}}
  </a>
  <!-- @/each -->

  <!-- 组件字段 -->
  <a href="{{field:logo_href}}">
    <img src="{{field:logo_src}}" alt="{{field:logo_alt}}">
  </a>
```

### i18n 翻译键引用

所有用户可见文字应使用 i18n 键，而非直接写死文本：

```html
<!-- 引用翻译键 -->
<span>{{t:nav.home}}</span>
<p>{{t:footer.copyright}}</p>
<h3>{{t:cookie.title}}</h3>

<!-- 引用组件字段值（在 PageMosaic 组件编辑器中设置） -->
<a href="{{field:logo_href}}">{{field:logo_text}}</a>
```

### 常用 i18n 键参考

| i18n Key             | 默认英文值                           |
|----------------------|--------------------------------------|
| `nav.home`           | Home                                 |
| `nav.about`          | About                                |
| `nav.services`       | Services                             |
| `nav.contact`        | Contact                              |
| `nav.cta`            | Contact Us                           |
| `footer.copyright`   | © 2025 Company. All rights reserved. |
| `cookie.title`       | Cookie Notice                        |
| `cookie.desc`        | We use cookies to enhance...         |
| `cookie.accept`      | Accept                               |
| `cookie.decline`     | Decline                              |
| `cookie.privacyLink` | Privacy Policy                       |

---

## 五、Social Links SVG 规范

### 规则

1. `fill="currentColor"` — 必须，使颜色由 CSS `color` 属性控制
2. 明确的 `width` / `height` — 建议 `20` 或 `24`（单位 px）
3. `<a>` 标签必须有 `title` 和 `aria-label` — 无障碍 + WebBuilder 自动识别依赖此属性
4. `href` 写完整 URL（包含 `https://`）
5. 不用的平台注释掉，不要删除（方便以后启用）

### 最小标准模板（单个图标）

```html
<a href="https://platform.com/yourhandle" title="Platform" aria-label="Platform">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
       viewBox="0 0 24 24" fill="currentColor">
    <path d="...SVG path data..."/>
  </svg>
</a>
```

### 支持的平台 SVG path（已内置于模板文件）

| 平台      | 来源                                              |
|-----------|--------------------------------------------------|
| X/Twitter | [simpleicons.org](https://simpleicons.org)       |
| Instagram | simpleicons.org                                  |
| LinkedIn  | simpleicons.org                                  |
| Facebook  | simpleicons.org                                  |
| YouTube   | simpleicons.org                                  |
| GitHub    | simpleicons.org（模板中已注释，解注释即可使用）  |
| WeChat    | 需手动从 simpleicons.org 获取                    |
| 微博      | 需手动从 simpleicons.org 获取                    |

> **推荐来源**：https://simpleicons.org

### CSS 配套建议

```css
.footer-social {
  display: flex;
  gap: 12px;
  align-items: center;
}
.footer-social a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #888;
  transition: color 0.2s ease;
}
.footer-social a:hover { color: #fff; }
```

---

## 六、工作流程建议

### 新项目（从头开始）

1. 复制 `templates/component-markers-template.html` 作为每个页面的起点
2. 替换占位内容（Logo、菜单项、社交链接 href）
3. 在 WebBuilder 中新建项目，点击 **Import HTML** 导入页面
4. WebBuilder 会自动识别 `@component` 标记，无需 Auto-detect

### 已有项目（导入现有网站）

1. 运行 `html-cleanup` Skill，自动注入 `@component` 标记
2. 在 WebBuilder 中点击 **Import Site** 导入文件夹
3. 标记已存在 → 直接进入编辑

### 最终导出

```
releases/
  project-name/
    index.html          ← 基础语言（en）
    about.html
    assets/
    zh-SC/
      index.html        ← 简体中文版本
      about.html
```

---

## 七、快速检查清单

导入前确认每个 HTML 页面：

- [ ] `<html lang="...">` 存在且语言代码正确
- [ ] `<meta charset="UTF-8">` 和 `<meta name="viewport">` 存在
- [ ] `<title>` 有有意义的内容
- [ ] `<!-- @meta:managed -->` 注释标注已插入（在 CSS `<link>` 之前）
- [ ] `<!-- @component:navbar -->` 在 `<body>` 后第一个位置
- [ ] `<!-- /@component:navbar -->` 在 `</header>` 后
- [ ] `<!-- @component:footer -->` 在 `</main>` 后
- [ ] `<!-- /@component:footer -->` 在 `</footer>` 后
- [ ] `<!-- @component:cookie-banner -->` 在 `</footer>` 后、`</body>` 前
- [ ] 所有社交图标 `<a>` 有 `title` 和 `aria-label`
- [ ] 所有社交图标 SVG 使用 `fill="currentColor"`

---

## 八、`<head>` 规范与 Metadata 管理

### `@meta:managed` 标注

在每个页面的 `<head>` 内、CSS `<link>` 之前插入以下注释：

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
     ⚠️ 请勿在此区域手动添加上述标签，它们会在 Export 时自动注入。
-->
```

**作用：**
- 纯注释，不影响页面渲染
- 作为 WebBuilder 编辑提示，提醒协作者不要手动编辑该区域
- WebBuilder Export 时会将 `page.meta` 中填写的字段注入到 `</head>` 之前
- 若字段为空则不注入，对原始 HTML 无副作用

### 标准 `<head>` 骨架（cleanup 完成后）

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title — Site Name</title>

  <!-- @meta:managed
       以下 SEO metadata 由 WebBuilder Page Metadata 面板管理，导出时自动注入：
       - <title>  - <meta name="description">  - OG tags  - canonical
       在 WebBuilder 中打开此页面，展开 "Page Metadata" 面板填写上述字段。
  -->

  <!-- 字体 CDN（如有） -->
  <link rel="preconnect" href="https://fonts.googleapis.com">

  <!-- Favicon -->
  <link rel="icon" href="assets/images/favicon.ico">

  <!-- 样式表 -->
  <link rel="stylesheet" href="assets/css/style.css">
</head>
```

### `<head>` 清理规则速查

| 元素 | 来源 | 处理 |
|------|------|------|
| `<meta name="generator">` | Webflow / Framer | **删除** |
| `og:url` 指向 `.webflow.io` | Webflow | **删除** |
| `og:image` 指向构建工具域名 | Webflow / Framer | **删除** |
| `<link rel="canonical">` 指向构建工具域名 | Webflow | **删除** |
| 构建工具私有 `wf-*` meta | Webflow | **删除** |
| `<meta name="description">` 有实际内容 | 来源不限 | **保留** |
| `og:title` / `og:description` 有实际内容 | 来源不限 | **保留** |
| `<link rel="icon">` | 来源不限 | **保留** |
| Google Fonts / CDN `<link>` | 来源不限 | **保留** |

### Metadata 在 WebBuilder 中的工作流

```
导入后操作：
  1. 打开 WebBuilder，导入已 cleanup 的项目文件夹
  2. 点击侧栏中的页面，进入 Page Editor
  3. 点击编辑器工具栏下方的 "Page Metadata" 标题行，展开面板
  4. 填写以下字段（每个页面分别填写）：
     - Title             → 浏览器标签 + 搜索结果标题
     - Description       → 搜索结果摘要
     - OG Title          → 社交分享标题（留空则使用 Title）
     - OG Description    → 社交分享描述（留空则使用 Description）
     - OG Image          → 社交分享封面图路径或 URL
     - Canonical URL     → 规范 URL（多语言版本时尤为重要）
  5. 字段数据保存在 project.json（不修改 HTML 源文件）
  6. Export 时自动注入到每个页面 </head> 之前
```

---

## 九、CSS 模式与 Theme Engine

PageMosaic 支持三种 CSS 模式，在新建项目时选择，影响 Theme Editor 的行为和导出输出。

### CSS 模式对比

| 模式 | `<head>` 中的样式 | Theme Editor | 说明 |
|------|-------------------|--------------|------|
| `tailwind-cdn` | `<script src="https://cdn.tailwindcss.com">` | ✅ 完整支持 | 默认模式，无需本地构建 |
| `tailwind-local` | `<link href="assets/css/tailwind.css">` | ✅ 支持（需重编译） | 适合生产部署，零 CDN 依赖 |
| `custom` | 自定义 `<link rel="stylesheet">` | ❌ 不适用 | 使用自有 CSS，Theme Editor 不生效 |

### tailwind-cdn 模式下的 `<head>` 标准写法

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- @meta:managed -->

  <!-- Tailwind CDN — PageMosaic 会在此后自动注入 tailwind.config -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Google Fonts — PageMosaic 会根据 Theme 设置自动替换此链接 -->
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Manrope:wght@200..800&family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet">
  <!-- Material Symbols（导航图标等） -->
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">

  <title>Page Title</title>
</head>
```

### Theme Engine 颜色系统

主题由 5 个种子色生成完整的 M3 风格色盘（40+ 色阶）：

| 种子色 | 说明 | Tailwind 类名示例 |
|--------|------|-------------------|
| `primary` | 主品牌色 | `text-primary` `bg-primary` |
| `primaryContainer` | 主色容器背景 | `bg-primary-container` |
| `surface` | 页面背景色 | `bg-surface` |
| `onSurface` | 正文文字色 | `text-on-surface` |
| `secondary` | 次要强调色 | `text-secondary` |

**常用衍生色阶：**

```html
<!-- 背景层次 -->
<div class="bg-surface">           <!-- 基础背景 -->
<div class="bg-surface-container"> <!-- 卡片/面板背景 -->
<div class="bg-surface-container-high"> <!-- 悬浮元素 -->

<!-- 文字层次 -->
<p class="text-on-surface">       <!-- 主要文字 -->
<p class="text-on-surface-variant"> <!-- 次要文字 -->

<!-- 分割线 -->
<hr class="border-outline-variant">

<!-- 主色按钮 -->
<button class="bg-primary text-on-primary rounded px-4 py-2">
```

### 字体角色

| 角色 | Tailwind 类 | 用途 |
|------|-------------|------|
| 标题字体 | `font-headline` | 大标题、展示文字 |
| 正文字体 | `font-body` | 段落、正文内容 |
| 标签字体 | `font-label` | 按钮、导航、UI 标签 |

### 圆角预设

| 预设 | `rounded` | `rounded-lg` | `rounded-full` |
|------|-----------|--------------|----------------|
| `sharp` | 2px | 4px | 12px |
| `rounded` | 6px | 8px | 24px |
| `pill` | 12px | 16px | 9999px |

---

## 十、Custom Head Code（自定义 `<head>` 代码）

**位置：** 侧栏 → Project Settings → Head Code

用于插入 Google Analytics、Facebook Pixel、Hotjar 等第三方脚本。

**重要规则：**
- Head Code **仅在 Export 时写入**，预览中不执行（避免统计数据污染）
- 代码插入位置：所有页面 `</head>` 之前
- 不要在页面 HTML 中直接添加分析脚本，统一通过 Head Code 管理

```html
<!-- Head Code 示例：Google Analytics GA4 -->
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

---

## 十一、Export 多语言结构与 hreflang

### 导出目录结构

```
releases/
  project-name/
    index.html          ← 基础语言（如 en）页面，置于根目录
    about.html
    services.html
    assets/             ← 共享资源（CSS、JS、图片）
      css/
      images/
    zh-SC/              ← 简体中文，置于语言子目录
      index.html
      about.html
      services.html
    ja/                 ← 日语
      index.html
      ...
```

**规则：**
- 基础语言（`baseLanguage`）页面输出到根目录
- 其他语言输出到 `/{lang-code}/` 子目录
- 资源文件（`assets/`）仅复制一份到根目录；语言子目录页面的资产路径自动添加 `../` 前缀
- `.html` 页面间链接**不修改**——所有语言使用相同文件名，与同级页面相互链接即可

### hreflang 自动注入

Export 时，PageMosaic 自动为每个页面的每个语言版本注入 `<link rel="alternate" hreflang>` 标签：

```html
<!-- 以 about.html 为例，项目有 en / zh-SC / ja 三种语言 -->
<link rel="alternate" hreflang="x-default" href="https://example.com/about.html">
<link rel="alternate" hreflang="en"    href="https://example.com/about.html">
<link rel="alternate" hreflang="zh-SC" href="https://example.com/zh-SC/about.html">
<link rel="alternate" hreflang="ja"    href="https://example.com/ja/about.html">
```

**前提条件：** 在 Project Settings 中填写 `Canonical Base URL`（如 `https://example.com`），否则使用相对路径。

### 语言切换器路径说明

`languages` 共享数据中的 `pathPrefix` 字段**由 Export 引擎自动计算**，无需手动填写：

| 当前语言 | 目标语言 | 自动计算的 pathPrefix |
|---------|---------|----------------------|
| `en`（根） | `zh-SC` | `zh-SC/` |
| `zh-SC`（子目录） | `en` | `../` |
| `zh-SC`（子目录） | `ja` | `../ja/` |
| `zh-SC` | `zh-SC`（自身） | `''`（空） |

预览模式下 `pathPrefix` 使用 Shared Data Editor 中填写的值（或空值）；正式路径仅在 Export 时生成。
