# PageMosaic

> Visual static-site editor — edit reusable components once, sync across every page, manage multi-language content.

PageMosaic is a lightweight desktop tool for building and maintaining static HTML websites. No framework. No build step. Pure HTML files you own completely.

🌐 **Project homepage:** https://yukishama9.github.io/PageMosaic/

---

🧩 **Component-based editing** — Edit a component once, every page updates automatically.  
🌍 **Multi-language (i18n)** — Spreadsheet-style translation editor with missing-key highlighting.  
🎨 **Theme editor** — Visual color, font, and shape controls with Tailwind CDN / Local / Custom CSS modes.  
🖼 **Live preview** — Desktop / Tablet / Mobile switcher with per-language, instant hot-reload preview.  
📥 **Import existing sites** — Auto-detects headers, footers, and cookie banners from any HTML folder.  
📤 **Export** — Clean per-language output with metadata, OG tags, and custom head code injected automatically.

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

---

## License

[MIT](LICENSE)