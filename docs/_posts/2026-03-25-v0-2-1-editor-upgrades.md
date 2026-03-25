---
layout: post
title: "v0.2.1 — Split View, Search & Replace, Session Persistence"
date: 2026-03-25
categories: [news, release]
excerpt: "v0.2.1 brings a split code/preview layout with a draggable resizer, a persistent Ctrl+F search-and-replace panel, and session persistence so the desktop app remembers your workspace paths."
---

v0.2.1 is a focused quality-of-life release. Three things that were small but constant annoyances are now fixed.

## 🪟 Split View

The editor toolbar now has three layout buttons: **Code**, **Split**, and **Preview**.

- **Code** — full-width CodeMirror editor.
- **Preview** — full-width live preview iframe.
- **Split** — both panels side by side, separated by a draggable resizer. Drag it left or right to give whichever side more room.

The preview panel scales the page content responsively so it always renders correctly regardless of the panel width.

## 🔍 Search & Replace

Press `Ctrl+F` (or `Cmd+F` on Mac) inside any code editor — the Page editor or the Component code panel — to open a persistent search panel anchored to the top-right of the editor.

- Real-time match highlighting as you type. All matches are highlighted; the current one is highlighted in orange.
- Match counter shows `current / total`.
- `Enter` → next match, `Shift+Enter` → previous match.
- **Replace** replaces the current match and jumps to the next.
- **All** replaces every match in one operation and shows a toast with the count.
- The panel stays open until you press `Esc` or click ✕. It remembers the last search term.

## 💾 Session Persistence

The Electron desktop app now saves your configured **Projects folder** and **Releases folder** paths to a local config file (`config.json` in the app's user-data directory).

On next launch, the paths are restored automatically. No more re-configuring paths every time you open PageMosaic.

---

**Download:** [GitHub Releases](https://github.com/yukishama9/PageMosaic/releases/tag/v0.2.1)  
**Full changelog:** [v0.2.0...v0.2.1](https://github.com/yukishama9/PageMosaic/compare/v0.2.0...v0.2.1)