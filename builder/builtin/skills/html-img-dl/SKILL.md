---
name: html-img-dl
description: 用于将 HTML 文件中挂载的外部网络图片自动批量下载至本地文件夹，并同步更新 HTML 代码里的图片链接为本地的相对路径，实现资源纯本地化。执行前会主动提示用户确认网络代理环境。此技能内附置了使用 Python 引擎支持代理环境的下载执行脚本方案。
---

# HTML 外部图片批量本地化工具 (html-img-dl)

## Overview (概述)
本 Skill 帮助开发者应对大量外部第三方图床静态链接（如 Googleusercontent、AWS 等）受网络环境（如 GFW）影响无法访问，或者项目需要闭环交付的场景。它可以遍历寻找网络 `<img>` 标签，把图片完整地下载下来放入指定的本地 `assets` 目录内，然后全自动地重写所有 HTML 文件里的对应图片路径为该本地路径。

## How to use (详细规则与执行流程)

### 1. 强制代理与网络环境提醒 (Critical Step)
*   **在执行任何图片下载和文件修改操作** **前**，智能体 **必须** 直接询问或通过 `ask_followup_question` 向用户确认：“**请确认您是否已经开启了 VPN 代理？如果不开启，连接某些国外图床或生成平台（如 Google Cloud）的网络图片资源可能会因为超时（ETIMEDOUT / exit code 28）而下载失败。若您已准备就绪，请回复 OK。**”

### 2. 信息抓取与正则映射
*   扫描整个前端项目（一般为 `.html` 文件），找到 `<img src="http...">` 中的所有绝对路径网址。
*   依据逻辑设定建立映射组方案，如：`image-1.jpg`, `image-2.jpg` ... 映射回外网链接。

### 3. 创建本地资产目录与源文件替换
*   创建 `assets/images/`（或用户要求的其他资产目录）。
*   利用代码将 HTML 的 `src` 实时替换修正为如 `assets/images/image-1.jpg`。

### 4. 执行复用脚本下载静态资源
由于 Node.js 原生的 `https.get` 或命令行工具（如 `curl`，除非手动指定环境变量）在 Windows 下有时无法正常顺延全局梯子（VPN）代理设置，**推荐复用 Python 原生的网络库** 进行下载。Python 的 `urllib` 可以更智能地捕获 Windows 的 Internet Options 全局代理方案：
*   **智能体必须** 在用户本地写入一个 python 取图脚本（可参考该附带脚本逻辑）。
*   运行脚本完成真实下载。
*   （可选）运行完成后销毁该临时 `.py` 脚本，保持项目清爽。

## Dependencies / Scripts
*   依赖于用户的 Windows 机器中安装有效的 Python 3（或 Node 配合 HTTP_PROXY 环境变量设定）。

附: 可高度复用的 Python 下载脚本模板示例供 Agent 参考生成：
```python
import urllib.request
import os
import sys

# 结构参考: [("https://example.com/a.jpg", "image-1.jpg"), ...]
images = [
    # 填入由 Agent 提取出的 URLs 映射对
]

images_dir = os.path.join(".", "assets", "images")
os.makedirs(images_dir, exist_ok=True)

success_count = 0
for url, filename in images:
    filepath = os.path.join(images_dir, filename)
    print(f"Downloading {filename}...")
    try:
        urllib.request.urlretrieve(url, filepath)
        print(f"Success: {filename}")
        success_count += 1
    except Exception as e:
        print(f"Failed to download {filename}: {e}")

print(f"All downloads finished! {success_count}/{len(images)} downloaded.")