# PageMosaic

> Visual static-site editor — edit reusable components once, sync across every page, manage multi-language content.

PageMosaic is a lightweight desktop tool for building and maintaining static HTML websites. It gives you a visual workspace where you can manage **reusable components** (navbar, footer, cookie banner, etc.), **multi-language translations**, and **page content** — all in one place, with a live preview.

No framework. No build step. Pure HTML files you own completely.

---

## What PageMosaic can do

### 🧩 Component-based editing
Define reusable blocks (navbar, footer, cookie consent, etc.) as **components**. Edit a component once — PageMosaic rewrites every page that uses it automatically.

Pages reference components with a simple HTML comment:
```html
<!-- @component:navbar -->
<main>…</main>
<!-- @component:footer -->
<!-- @component:cookie-banner -->
```

### 🌍 Multi-language support (i18n)
- Manage translation keys in a spreadsheet-style editor
- Missing translations are highlighted in orange
- At export time, each language gets its own output folder with all strings resolved

### 🎨 Theme editor
- Visual color palette, typography, and border-radius controls
- **Tailwind CDN mode**: theme config injected at runtime — changes are instant with no compilation step
- **Tailwind Local mode**: theme saved to `tailwind.config.js`; auto-compiles `assets/css/tailwind.css` via the Tailwind CLI (Electron only)
- **Custom CSS mode**: Theme Editor disabled; manage your own stylesheets directly

### 📦 Shared data
Menus, social links, language switchers — define them once and reuse them across any component with template loops:
```html
<!-- @each:main-menu -->
<a href="{{item.href}}">{{t:item.i18nKey}}</a>
<!-- @/each -->
```

### 🖼 Live preview
- Desktop / Tablet / Mobile viewport switcher
- Per-language preview
- Instant hot-reload as you type in the code editor

### 📥 Import existing sites
Drop any existing HTML folder into PageMosaic. It auto-detects `<header>`, `<footer>`, and cookie-banner elements and converts them into editable components. No manual setup required.

### 📤 Export
Generates a clean output folder per language under your chosen `releases/` directory. Page metadata (title, description, OG tags, canonical) is injected automatically. Custom `<head>` code (analytics, favicons, hreflang) is appended to every page.

---

## Project structure

```
pagemosaic/
├── builder/            # App source — HTML, CSS, JS (no build step required)
│   ├── index.html
│   ├── css/
│   │   └── builder.css
│   └── js/
│       ├── wb-core.js       # State, Utils, FileHandler
│       ├── wb-project.js    # Project management (CRUD, import, export)
│       ├── wb-ui.js         # Sidebar, tabs, modals
│       ├── wb-editors.js    # Page, Component, SharedData, i18n, Theme editors
│       ├── wb-preview.js    # Live iframe preview & ThemeEngine
│       └── wb-app.js        # Entry point & action handlers
├── electron/           # Electron main process (desktop builds only)
│   ├── main.js         # BrowserWindow + IPC file-system & Tailwind compile handlers
│   └── preload.js      # contextBridge — exposes electronAPI to renderer
├── resources/          # Reusable CSS snippets and script templates
├── .github/
│   └── workflows/
│       └── release.yml # CI/CD — builds installers on every version tag push
├── forge.config.js     # Electron Forge packaging config (Win / macOS / Linux)
├── package.json
├── start.bat           # Quick-start via Python HTTP server (browser mode)
├── LICENSE             # MIT
└── README.md
```

> **Note:** `projects/` and `releases/` are **not** part of the repository.  
> You choose where to store them via the app's Workspace setup at first launch.

---

## Usage — Browser (no install)

```bash
# Clone the repository
git clone https://github.com/yukishama9/pagemosaic.git
cd pagemosaic

# Windows: double-click start.bat, or run:
start.bat

# macOS / Linux:
python3 -m http.server 8765
# then open http://localhost:8765/builder/ in your browser
```

On first launch, click **Set** next to **Projects folder** and **Releases folder** to configure where your work is stored. This is remembered across sessions.

---

## Usage — Desktop App (Electron)

```bash
# Install dependencies
npm install

# Run in development mode (opens DevTools automatically)
npm run dev

# Run without DevTools
npm start
```

---

## Building installers

Requires [Node.js 20+](https://nodejs.org/) and [npm](https://npmjs.com).

```bash
npm install

# Build for the current platform
npm run make

# Build for a specific platform (must run on that OS, or use CI)
npm run make -- --platform=win32    # Windows .exe
npm run make -- --platform=darwin   # macOS .dmg
npm run make -- --platform=linux    # Linux .deb / .rpm / .zip
```

Outputs land in `out/make/`.

---

## CSS modes

PageMosaic supports three CSS modes, configurable per project in **Project Settings**:

| Mode | Description |
|------|-------------|
| **Tailwind CDN** | Tailwind loaded from CDN. Theme config is injected as a `<script>` block at runtime. Zero setup. |
| **Tailwind Local** | Uses a locally compiled `assets/css/tailwind.css`. In Electron mode, saving the Theme Editor auto-runs `npx tailwindcss` to recompile. |
| **Custom CSS** | No Tailwind. Theme Editor is disabled. Manage your own stylesheets directly — any CSS framework or hand-written CSS. |

---

## License

[MIT](LICENSE)