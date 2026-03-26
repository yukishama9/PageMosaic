---
layout: post
title: "v0.2.5 — Import Design System (Google Stitch & Figma Token Support)"
date: 2026-03-26
categories: [news, release]
excerpt: "v0.2.5 introduces Import Design System — paste a Google Stitch Design file, Figma token export, or any brand guide document, and the AI instantly converts it into PageMosaic theme colors, fonts, and shapes."
---

v0.2.5 delivers a single focused feature: **Import Design System**. If your team works with Google Stitch Design files, Figma design tokens, or any structured brand guide, you can now bring that design language into PageMosaic in seconds — without manually re-entering color values.

## 🎨 Import Design System

Design systems describe your brand's visual language: primary colors, surface colors, typography scale, and shape style. PageMosaic's Theme Editor already controls all of those. Now it can read them directly from any design document you provide.

### How it works

1. Open the **Theme Editor** from the sidebar.
2. Click the new **Import Design System** button (upload icon above the color pickers).
3. In the modal, paste your design system document — or load it from a file.
4. Click **Parse with AI** — PageMosaic sends the document to your configured AI provider and extracts a structured JSON with `colors`, `fonts`, and `radius`.
5. A preview strip shows the detected swatches and font names before you commit.
6. Click **Apply to Theme** → all controls are populated instantly.
7. Review and click **Save Theme** to persist.

### What formats work?

The AI parser is intentionally format-agnostic. It works with:

- **Google Stitch Design** exports (JSON or copied text)
- **Figma design token** JSON files (W3C Design Tokens format)
- **Plain-text brand guides** — e.g. "Primary color: #4F46E5, headline font: Inter"
- Any structured description of colors, fonts, and shape styles

### AI Chat integration

If you prefer to work from the AI chat panel:

1. Select the **Design Import** skill from the Skill selector in the toolbar.
2. Paste your design document directly in the chat.
3. The AI parses it and the extracted tokens are automatically applied to the Theme Editor controls.
4. A toast notification confirms the result and reminds you to save.

### Technical notes

- The parser looks for a ````json` code block in the AI response containing `colors`, `fonts`, and `radius` keys.
- If no fenced block is found, it falls back to extracting a bare JSON object from the response text.
- Font names that don't match the built-in Google Fonts list are added as temporary custom options so you don't lose the value.
- The modal itself requires no AI call to open — the Parse step only runs when you click the button.

---

**Download:** [GitHub Releases](https://github.com/yukishama9/PageMosaic/releases/tag/v0.2.5)  
**Full changelog:** [v0.2.4...v0.2.5](https://github.com/yukishama9/PageMosaic/compare/v0.2.4...v0.2.5)