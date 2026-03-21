# WebBuilder

> Visual HTML site editor with reusable component sync and multi-language support.

WebBuilder is a lightweight desktop tool for managing static HTML websites. It lets you edit reusable components (navbar, footer, cookie banner, etc.) once and sync changes across every page — with built-in multi-language (i18n) support and a live preview.

---

## Features

- **Component sync** — edit a navbar or footer once; all pages update automatically
- **Multi-language** — manage translations per page with the built-in i18n editor
- **Live preview** — desktop / tablet / mobile viewport switching
- **Import existing sites** — drop in any HTML folder; components are auto-detected
- **Export** — generates one output folder per language in your chosen releases directory
- **Works in-browser or as a desktop app** — run directly from `builder/index.html` in any modern browser, or install the Electron desktop build

---

## Project Structure

```
webbuilder/
├── builder/            # App source — HTML, CSS, JS (no build step required)
│   ├── index.html
│   ├── css/
│   │   └── builder.css
│   └── js/
│       ├── wb-core.js       # State, Utils, FileHandler
│       ├── wb-project.js    # Project management (CRUD, import, export)
│       ├── wb-ui.js         # Sidebar, tabs, modals
│       ├── wb-editors.js    # Page, Component, SharedData, i18n editors
│       ├── wb-preview.js    # Live iframe preview
│       └── wb-app.js        # Entry point & action handlers
├── electron/           # Electron main process (desktop builds only)
│   ├── main.js         # BrowserWindow + IPC file-system handlers
│   └── preload.js      # contextBridge — exposes electronAPI to renderer
├── resources/          # Reusable CSS snippets and script templates
├── .github/
│   └── workflows/
│       └── release.yml # CI/CD — builds installers on every version tag push
├── forge.config.js     # Electron Forge packaging config (Win / macOS / Linux)
├── package.json
├── LICENSE             # MIT
└── README.md
```

> **Note:** `projects/` and `releases/` are **not** part of the repository.  
> You choose where to store them via the app's Workspace setup at first launch.

---

## Usage — Browser (no install)

```bash
# Clone the repository
git clone https://github.com/your-username/webbuilder.git
cd webbuilder

# Open directly in your browser
open builder/index.html       # macOS
start builder/index.html      # Windows
xdg-open builder/index.html   # Linux
```

On first launch, click **Select…** next to **Projects folder** and **Releases folder** to configure where your work is stored. This is remembered across sessions.

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

## Building Installers

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

## Automated Releases via GitHub Actions

Push a version tag to trigger a full three-platform build and create a GitHub Release automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow (`.github/workflows/release.yml`) builds on `windows-latest`, `macos-latest`, and `ubuntu-latest`, then attaches all installers to the release.

---

## How Components Work

Pages reference components with a comment marker:

```html
<!-- @component:navbar -->
<main>…</main>
<!-- @component:footer -->
```

When you edit the `navbar` component and save, WebBuilder rewrites every page that uses it. Components can reference **shared data** (menus, social links) and **i18n keys** for multilingual content.

---

## Multi-language Support

Each language gets its own `i18n/{code}.json` translation file. The i18n editor shows all keys in a table with one column per language, highlighting missing translations in orange.

At export time, WebBuilder generates one subfolder per language with all i18n keys resolved.

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss major changes.

---

## License

[MIT](LICENSE)