# PageMosaic

![PageMosaic](https://raw.githubusercontent.com/yukishama9/PageMosaic/main/builder/img/banner.svg)

> Visual static-site editor — edit reusable components once, sync across every page, manage multi-language content.

PageMosaic is a lightweight desktop tool for building and maintaining static HTML websites. No framework. No build step. Pure HTML files you own completely.

🌐 **Project homepage:** https://yukishama9.github.io/PageMosaic/
🌐 **Demo Multi-Language Site:** https://heliopolis-cc.com/

---

🧩 **Component-based editing** — Edit a component once, every page updates automatically.  
🌍 **Multi-language (i18n)** — Spreadsheet-style translation editor with missing-key highlighting.  
🎨 **Theme editor** — Visual color, font, and shape controls with Tailwind CDN / Local / Custom CSS modes.  
🖼 **Live preview** — Desktop / Tablet / Mobile switcher with per-language, instant hot-reload preview.  
📥 **Import existing sites** — Auto-detects headers, footers, and cookie banners from any HTML folder.  
📤 **Export** — Clean per-language output with metadata, OG tags, and custom head code injected automatically.  
🤖 **Built-in AI assistant** — Streaming chat panel with Plan/Act modes; AI-generated code applies directly to the active editor.  
🔌 **Skill & Agent system** — Extend the AI with reusable skills (e.g. HTML Cleanup) and custom agent personas.  
🪟 **Split view** — Toggle between Code, Preview, or side-by-side Split layout with a draggable resizer.  
🔍 **Search & Replace** — Persistent Ctrl+F panel with real-time match highlighting, single and bulk replace.  
💾 **Session persistence** — Desktop app remembers your last workspace paths across restarts.

![PageMosaic UI](https://raw.githubusercontent.com/yukishama9/PageMosaic/main/docs/assets/img/screenshot-01.png)

---

### ☕ Support this project
[![Support my work](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-orange?style=for-the-badge)](https://yukishama9.github.io/Helios-Blog/)

---

## Quick Start

### 📦 Download (Recommended)

Download the latest installer from [GitHub Releases](https://github.com/yukishama9/PageMosaic/releases):

| Platform | File |
|----------|------|
| Windows  | `.exe` installer |
| macOS    | `.dmg` |
| Linux    | `.deb` / `.rpm` / `.zip` |

### 🌐 Browser Mode (No installation)

```bash
git clone https://github.com/yukishama9/PageMosaic.git
cd PageMosaic

# Windows — double-click start.bat, or:
start.bat

# macOS / Linux:
python3 -m http.server 8765
# Open http://localhost:8765/builder/
```

### 🖥 Electron Dev Mode

```bash
npm install
npm start          # run normally
npm run dev        # run with DevTools
```

📖 **[Full Getting Started Guide](https://yukishama9.github.io/PageMosaic/tutorial/)** — step-by-step walkthrough with screenshots

---

## License

[MIT](LICENSE)