---
layout: post
title: "PageMosaic v0.2.0 — Built-in AI Assistant"
date: 2026-03-23
categories: [news, release]
excerpt: "v0.2.0 ships a fully integrated AI chat panel with streaming responses, Plan/Act modes, and a Skill & Agent system — all without leaving the editor."
---

PageMosaic v0.2.0 is out. The headline feature: a **built-in AI assistant** that lives inside the editor and writes code directly into your pages.

## What's new

The AI panel opens as a floating overlay — press **Ctrl+Shift+A** or click the AI button in the toolbar. Your code editor and live preview stay fully visible while you chat.

### Plan mode and Act mode

Two modes control what happens when the AI responds:

- **Plan mode** — the AI explains its approach step-by-step before writing a single line of code. Use it for complex changes where you want to review the plan first.
- **Act mode** — the AI outputs complete HTML and applies it directly to the active page or component the moment the stream finishes. One message, done.

You can switch between them mid-conversation. The typical workflow: plan first, then flip to Act to implement.

### Context-aware by default

When a page or component is open, the AI already has its full HTML as context. Slash commands let you inject more:

- `/page` — include the full active page
- `/comp` — include the full active component
- `/i18n` — include the current language's translation keys

### Skill & Agent system 🔌

Skills give the AI task-specific instructions without you having to repeat them every time. The built-in **HTML Cleanup** skill enforces PageMosaic's component marker format. Drop a `SKILL.md` or `.skill.json` into your AI Library folder to add your own.

Agents let you switch the AI's persona — a **Web Developer** agent focuses on clean semantic HTML; a **Copywriter** agent focuses on persuasive copy. Both are included out of the box.

## Get v0.2.0

- 📥 **[Download the installer](https://github.com/yukishama9/PageMosaic/releases)** — Windows, macOS, Linux
- 📖 **[Read the AI tutorial](/PageMosaic/tutorial/#ai-assistant)** — setup and usage walkthrough
- ⭐ **[Star on GitHub](https://github.com/yukishama9/PageMosaic)** — helps more people find the project