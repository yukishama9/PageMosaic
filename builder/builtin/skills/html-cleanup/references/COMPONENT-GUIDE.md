# WebBuilder — Component Marker Guide

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

---

## 四、i18n 翻译键引用

所有用户可见文字应使用 i18n 键，而非直接写死文本：

```html
<!-- 引用翻译键 -->
<span>{{t:nav.home}}</span>
<p>{{t:footer.copyright}}</p>
<h3>{{t:cookie.title}}</h3>

<!-- 引用组件字段值（在 WebBuilder 组件编辑器中设置） -->
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
