---
name: html-copyright
description: 用于将静态 HTML 页面底部（Footer）固定的版权年份信息智能化，不仅批量完成格式替换，更引入本地系统时间校验机制以实现在未来的年份自然过渡。自动处理诸如“单独显示今年”或“保留起始年份范围”等业务逻辑。
---

# 网页版权自动化与格式化技能 (html-copyright)

## Overview (概述)
当维护老旧或刚设计的网站模板时，Footer 内的版权年份往往写死为某一年（例如：© 2023 Company...）。
当时间流逝，手动修改大量 HTML 文件的年份非常繁杂。本 Skill 意在以优雅的结构（注入 `<span class="copyright-year">`），配合小型的 Vanilla JavaScript 前端探测逻辑，让年份能够基于客户端浏览器永远动态维护。

## Pre-requisites (前置问询 - 强制项)

执行此技能的物理操作之前，**智能体必须主动向用户确认以下设置**：
> "为了部署自动化版权组件，请告诉我：
> 1. 您希望展示的最终格式是【**纯动态当前年份**（例：© 2026）】，还是【**起始年-动态当前年份**（例：© 2022-2026）】？（如果需要起始年，请告诉我具体的起始年数字）
> 2. 目前您源文件（旧模板）中写死的旧年份大概是哪一年？（用于帮助我精准匹配，例：2024）"

等待用户给出明确选择后，再继续执行。

## Instructions (工作流指令)

在此技能目录下，自带了可以帮助你安全落地的模板文件：

### Step 1: 扫描并改造 HTML (Batch Replacement)
* 在理解了用户的格式意图和旧年份参数后，请结合或直接调用 `scripts/batch_replace_copyright.js` 遍历目标 HTML 项目文件。
* **工作核心**：
  * 定位形如 `© 2024` 或 `Copyright 2024` 的文本。
  * 将数字部分替换为骨架：`<span class="copyright-year">2026</span>`（以当下的实际自然年为填充掩码，如 2026）。
  * 若用户要求**具有起始年份范围**（例如 2022 起），则替换格式应拼接为：`2022-<span class="copyright-year">2026</span>`。

### Step 2: 前端永动引擎挂载 (Inject Logic)
* 请参考本技能中的前端 JS 模板：`assets/copyright-auto.js`。
* 根据项目架构，选择这两种方式之一应用至所有的 HTML：
  - 将这段逻辑追加到项目现有的主干 JS 中（如 `assets/js/main.js`）。
  - 或者让这段原生 `DOMContentLoaded` 代码置入包含 `<script>` 的公共底部组件中。

---

## 附属工具模块说明

* **`scripts/batch_replace_copyright.js`**：可以在 Node.js 环境下跨文件夹搜寻并做精准字串注入的模板逻辑，适合一键完成几十个文件的修改。
* **`assets/copyright-auto.js`**：精简提纯的最短年份更新逻辑，直接用类名 `.copyright-year` 对标，极度低耗能在客户端生效。