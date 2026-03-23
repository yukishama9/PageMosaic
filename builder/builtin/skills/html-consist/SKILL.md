---
name: html-consist
description: 用于将分散独立的静态 HTML 模板文件执行全站级的一致性修复与同步。包括导航栏 (Navbar)、页脚 (Footer)、页面自适应宽度与内部边距、以及处理且规范化高重合度的 Cookies 弹窗逻辑（解决首次展示和多页面复用冲突）。
---

# HTML 全局一致性同步与修复工具 (html-consist)

## Overview (概述)
当处理各种从零散设计图转化而来的 HTML 时，各个页面的顶部导航、页脚结构、容器自适应宽度常常会不一致（甚至包含废弃的“幽灵”弹窗残骸）。
本 Skill 提供了一整套“基准参考 + 强力克隆 + 僵尸节点核打击”的方法论，以及一整套可以被复用的脚本工具，专门用来将多个静态模板强制统一。

## Pre-requisites (前置工作与交互确认)

* **执行前，智能体必须主动向用户确认基准文件**：
  > “请告诉我，您希望以哪一个页面（例如 `index.html`）作为版式的唯一基准池？并请告诉我希望赋予其他所有子页面一致的全局宽度（例如 `max-w-7xl mx-auto px-6` ）？”
* **等待用户回应**确认好参照页及容器需求后，才允许开始动刀改写。

## Instructions (工作流指令)

本目录的 `scripts/` 与 `assets/` 提供了一套被实战验证过极其可靠的修复代码，可直接复制或执行这些代码来进行物理层面的同步。

### Step 1: Nuclear Cleanup (多余弹窗与幽灵黑框核清灰)
某些页面上由于重构不当，会残留像黑框大黑块一样的空 `<div class="fixed bottom...">` 废弃代码结构。由于简单的正则匹配无法安全切除带有嵌套 `<div>` 的节点，智能体应：
1. 分析其他页面中存在废弃样式的 DOM 特征（如 `fixed bottom`、`z-100` 或某特定的老内容片段）。
2. 参考使用 `scripts/nuclear_clean.js` 里的算法来基于指针进行**严密的进出栈匹配切除**，它能安全地把那些“老容器外壳”连根拔起且不破坏整体 HTML 结构结构。

### Step 2: Component Synchronization (组件复制同步)
经过核清理后，只剩下干净的页面。此时调用或参考 `scripts/sync_components.js` 逻辑：
1. 提取 “标准基准页面”(例如 index.html) 里的 `<nav>`, `<footer>` 和标准的 `id="cookie-consent"`。
2. 批量将这些绝对权威模块覆盖到其他 HTML 页面上。
3. 通过正则为所有目标内页（例如忽略首页大背图）的 `<main>` 级包裹容器注入用户指定的自适应宽度规则。

### Step 3: Global Cookie Behavior (解决 Cookie 同步与首次加载呈现)
为了彻底解决 “每次点进去新页面弹窗都在” 的问题，我们提供了一个纯享版的现代交互 `localStorage` 联动逻辑库：
1. 将 `assets/cookie-logic.js` 部署进此项目（例如放入项目的 `assets/js/main.js`）。
2. 在所有 HTML 页面引入这段逻辑。它通过控制弹层的 `display: none` 等属性使得弹窗拥有“跨网页消失”的全站级原生体验。

## Advanced Tools (可调用的参考文件)
- `scripts/nuclear_clean.js`：节点彻底斩草除根清理器。
- `scripts/sync_components.js`：跨文件提取、同步注入的逻辑实现。
- `assets/cookie-logic.js`：前端实现第一次出现，同意后长久且顺滑消失的纯原生业务代码。