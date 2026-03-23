---
name: html-localcss
description: 用于将 HTML 项目中依赖 CDN 的 CSS 框架（如 Tailwind CSS）本地化，摆脱联网依赖。自动提取内联配置、编译为本地 CSS 文件、批量替换所有 HTML 的 CDN 引用，并将生成的 CSS 格式化为人类可读的多行格式。适用于静态 HTML 网站的离线发布准备。
---

# HTML Local CSS — CDN 本地化 Skill

## Overview（概述）

本 Skill 将 HTML 项目中通过 CDN 引入的 CSS/JS 框架（主要针对 Tailwind CSS）转换为本地编译的静态文件，使网站完全离线可用。

**处理内容：**
1. **分析** — 扫描 HTML 文件，识别 CDN 引用和内联配置
2. **提取配置** — 从 HTML 的内联 `<script>` 中提取 `tailwind.config`
3. **编译 CSS** — 安装 Tailwind CLI，编译生成`assets/css/tailwind.css`
4. **批量替换** — 移除所有 HTML 文件中的 CDN script，插入本地 CSS `<link>`
5. **格式化** — 将压缩的 CSS 转为可读多行格式（便于 VSCode 阅读）
6. **清理** — 删除临时构建文件

---

## Pre-requisites（前置条件）

- `node`（v14+）和 `npm` 可用于命令行
- 目标目录中至少含有 `.html` 文件
- HTML 文件中包含 Tailwind CDN 引用（`cdn.tailwindcss.com`）或内联 `tailwind.config`

---

## Phase 1：分析项目

**执行动作：**

1. `list_files` 扫描目标目录，列出所有 `.html` 文件
2. 逐一检查每个 HTML 文件，识别以下内容：

   | 检查项 | 示例 |
   |--------|------|
   | Tailwind CDN script | `<script src="https://cdn.tailwindcss.com">` |
   | Tailwind CDN with plugins | `<script src="https://cdn.tailwindcss.com?plugins=forms,typography">` |
   | 内联 tailwind.config | `<script id="tailwind-config">tailwind.config={...}</script>` |

3. 记录：哪些文件有 CDN 引用、是否有自定义 `tailwind.config`（颜色 token、字体、插件等）

**报告格式：**
```
[has-cdn]    index.html: cdn.tailwindcss.com
[has-cdn]    about.html: cdn.tailwindcss.com
[has-config] index.html: 内联 tailwind.config 已找到（包含自定义颜色/字体）
```

---

## Phase 2：提取 Tailwind 配置

**执行动作：**

1. 从任意含 `tailwind.config` 的 HTML 文件中提取内联配置内容
2. 运行脚本 `scripts/extract-tailwind-config.js`（见 scripts/ 目录），将配置写入 `tailwind.config.js`

**手动提取方法（备用）：**
在目标目录创建 `tailwind.config.js`，内容格式：
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.html"],
  theme: {
    extend: {
      // 从 HTML 内联配置中复制 theme.extend 内容
    },
  },
  plugins: [],
}
```

> 如果 HTML 中没有自定义 tailwind.config，使用最简默认配置即可。

---

## Phase 3：安装 Tailwind CLI 并编译

**执行动作：**

1. 在 **项目根目录（webbuilder/）** 安装 `tailwindcss@3`（避免中文路径问题）：
   ```bash
   npm install -D tailwindcss@3
   ```

2. 在目标 HTML 目录创建 `input.css`：
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

3. 确保 `assets/css/` 目录存在；如不存在，创建它。

4. 使用 **PowerShell + node CLI** 方式编译（规避 Windows 中文路径问题）：

   ```powershell
   powershell -Command "& {
     Set-Location 'c:\path\to\webbuilder';
     node node_modules\tailwindcss\lib\cli.js
       -i projects\<project-name>\input.css
       -o projects\<project-name>\assets\css\tailwind.css
       --config projects\<project-name>\tailwind.config.js
       --content 'projects/<project-name>/**/*.html'
       --minify
   }"
   ```

   > ⚠️ **重要**：在 Windows 含中文字符的路径下，直接调用 `npx tailwindcss` 或 `.cmd` 文件会报文件未找到错误。
   > 正确做法：从**不含中文的父目录**安装 `node_modules`，然后通过 `node node_modules/tailwindcss/lib/cli.js` 调用。

5. 编译成功后确认 `assets/css/tailwind.css` 文件存在且体积 > 1 KB。

---

## Phase 4：批量替换 CDN 引用

**执行动作：**

将 `scripts/fix-cdn.js` 复制到目标 HTML 目录，然后运行：

```bash
node path/to/project/fix-cdn.js
```

脚本将对每个 HTML 文件执行：
- 移除 `<script src="https://cdn.tailwindcss.com...">` 标签
- 移除 `<script id="tailwind-config">...</script>` 内联配置块
- 在 `</head>` 前插入 `<link rel="stylesheet" href="assets/css/tailwind.css">`（如尚未存在）

**验证：**
```
UPDATED: index.html     → CDN=false, config=false, link=true
UPDATED: about.html     → CDN=false, config=false, link=true
```

---

## Phase 5：格式化 CSS

**执行动作：**

编译生成的 `tailwind.css` 默认为压缩的单行格式，不便于阅读。运行 `scripts/prettify-css.js` 将其格式化：

将 `scripts/prettify-css.js` 复制到目标 HTML 目录，然后运行：

```bash
node path/to/project/prettify-css.js
```

格式化后每条规则独立成行，属性缩进，便于在 VSCode 中阅读和搜索。

> 注意：格式化只影响可读性，不影响浏览器解析，文件体积略有增大（约 +10-15%）。

---

## Phase 6：清理临时文件

**执行动作：**

删除以下临时文件（不删除 `tailwind.config.js`，保留供日后重新编译使用）：

```
项目目录/input.css          ← 删除
项目目录/fix-cdn.js         ← 删除（脚本已用完）
项目目录/prettify-css.js    ← 删除（脚本已用完）
webbuilder根目录/node_modules/ ← 可选删除（体积较大）
webbuilder根目录/package.json  ← 可选删除
webbuilder根目录/package-lock.json ← 可选删除
```

> 如果需要将来重新编译（添加了新 Tailwind class），保留 `node_modules`、`package.json` 和 `input.css`。

---

## Phase 7：验证与报告

**执行验证脚本（inline Node.js）：**

```bash
node -e "
const fs=require('fs'),path=require('path');
const dir='<target-dir>';
const files=['index.html','about.html']; // 替换为实际文件列表
files.forEach(f => {
  const c=fs.readFileSync(path.join(dir,f),'utf8');
  console.log(f+': CDN='+c.includes('cdn.tailwindcss.com')+
    ' config='+c.includes('tailwind-config')+
    ' link='+c.includes('assets/css/tailwind.css'));
});
"
```

**期望结果：**
```
index.html: CDN=false config=false link=true ✅
about.html: CDN=false config=false link=true ✅
```

**use `attempt_completion` 汇总报告包含：**
1. 处理的 HTML 文件列表及验证结果
2. 编译的 `tailwind.css` 大小（KB）
3. 格式化后的行数
4. 保留的文件（`tailwind.config.js`）用于将来重新编译的命令提示

---

## 将来重新编译 Tailwind CSS

当项目 HTML 中新增了 Tailwind utility class，需要重新编译：

```powershell
# 在 webbuilder 根目录执行
powershell -Command "& {
  Set-Location '<webbuilder根目录>';
  node node_modules\tailwindcss\lib\cli.js
    -i projects\<project>\input.css
    -o projects\<project>\assets\css\tailwind.css
    --config projects\<project>\tailwind.config.js
    --content 'projects/<project>/**/*.html'
    --minify
}"
# 然后重新运行 prettify-css.js 格式化
```

---

## Execution Steps for the Agent（执行顺序）

1. `list_files` 获取目标目录所有 `.html` 文件
2. `read_file` 检查是否有 CDN 引用和内联 `tailwind.config`
3. 运行 `extract-tailwind-config.js` 生成 `tailwind.config.js`
4. 创建 `input.css`，安装 tailwindcss（在根目录）
5. PowerShell 编译命令生成 `assets/css/tailwind.css`
6. 复制并运行 `fix-cdn.js` 批量替换 CDN 引用
7. 复制并运行 `prettify-css.js` 格式化 CSS
8. 清理临时文件
9. 验证结果，`attempt_completion` 报告

> **⚠️ Windows 中文路径注意事项（重要）**
> - 直接在含中文路径的目录运行 `npx` 或 `.cmd` 脚本会失败（系统找不到指定路径）
> - 解决方案：始终在 **不含中文字符的目录** 安装 `node_modules`，通过 `node <path>/cli.js` 调用
> - 推荐在 `webbuilder/` 根目录（无中文）安装依赖，用绝对路径引用 CLI