/* ===== wb-core.js — State, Utils, FileHandler ===== */

// ─── Global State ─────────────────────────────────────────────────────────────
const State = {
  // Workspace handles (persisted in IndexedDB)
  workspaceProjectsHandle: null,  // FileSystemDirectoryHandle for projects/
  workspaceReleasesHandle: null,  // FileSystemDirectoryHandle for releases/

  // File System handles
  projectHandle: null,       // FileSystemDirectoryHandle for current project
  projectFsPath: null,       // Absolute filesystem path (Electron only) — used for Tailwind auto-compile

  // Loaded project data
  project: null,             // project.json content
  pages: [],                 // [{ file, title }]
  components: {},            // { id: { html, schema } }
  sharedData: {},            // { id: { ...json } }
  i18nData: {},              // { lang: { key: value } }

  // UI state
  activeView: 'welcome',     // 'welcome' | 'page-editor' | 'component-editor' | 'shared-data-editor' | 'i18n-editor'
  activePage: null,
  activeComponent: null,
  activeSharedData: null,
  activeI18nLang: null,
  openTabs: [],              // [{ id, title, type, data }]
  activeTabId: null,

  // Editor instances
  pageCodeMirror: null,
  compCodeMirror: null,
  compEditorMode: 'visual',  // 'visual' | 'code'

  // Preview
  previewDevice: 'desktop',
  previewLanguage: null,

  // i18n base-language snapshot for real-time preview overlay
  // Set when a project is loaded; each key maps to the text originally in the HTML.
  // Used by _applyI18nOverlay() to detect user edits to base language strings.
  _i18nOriginalSnapshot: {},

  // Dirty tracking
  dirtyFlags: {},            // { 'page:index.html': true }
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const Utils = {
  debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  slugify(str) {
    return str
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  formatDate(d) {
    return new Date(d || Date.now()).toISOString();
  },

  // Show toast notification
  showToast(message, type = 'info', duration = 2800) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast toast-${type} show`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove('show');
    }, duration);
  },

  // Deep clone a plain object
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Get filename without extension
  basename(path) {
    const name = path.split('/').pop();
    return name.replace(/\.[^.]+$/, '');
  },

  // Ensure a string is a valid HTML filename
  sanitizeFilename(name) {
    return name
      .replace(/[^a-zA-Z0-9_\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  },

  // Get page name from filename (index.html → index)
  pageName(file) {
    return file.replace(/\.html$/, '');
  },
};

// ─── FileHandler — File System Access API wrapper ─────────────────────────────
const FileHandler = {

  // Open a directory picker and return the handle
  async pickDirectory(id, startIn) {
    try {
      const opts = {};
      if (startIn) opts.startIn = startIn;
      if (id) opts.id = id;
      const handle = await window.showDirectoryPicker(opts);
      return handle;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
  },

  // Get or create a sub-directory
  async getDir(parentHandle, name, create = false) {
    return await parentHandle.getDirectoryHandle(name, { create });
  },

  // Read a text file from a directory handle
  async readFile(dirHandle, filename) {
    try {
      const fh = await dirHandle.getFileHandle(filename);
      const f = await fh.getFile();
      return await f.text();
    } catch {
      return null;
    }
  },

  // Write a text file to a directory handle
  async writeFile(dirHandle, filename, content) {
    const fh = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  },

  // List entries in a directory (returns { name, kind } for each)
  async listEntries(dirHandle) {
    const entries = [];
    for await (const [name, handle] of dirHandle.entries()) {
      entries.push({ name, kind: handle.kind, handle });
    }
    return entries;
  },

  // Check if a file exists
  async fileExists(dirHandle, filename) {
    try {
      await dirHandle.getFileHandle(filename);
      return true;
    } catch {
      return false;
    }
  },

  // Check if directory exists
  async dirExists(dirHandle, name) {
    try {
      await dirHandle.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  },

  // Read JSON file (returns parsed object or null)
  async readJSON(dirHandle, filename) {
    const text = await this.readFile(dirHandle, filename);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },

  // Write JSON file (pretty-printed)
  async writeJSON(dirHandle, filename, data) {
    await this.writeFile(dirHandle, filename, JSON.stringify(data, null, 2));
  },

  // Write a binary file (ArrayBuffer) to a directory handle
  async writeBinary(dirHandle, filename, arrayBuffer) {
    const fh = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();
  },

  // Delete a file
  async deleteFile(dirHandle, filename) {
    try {
      await dirHandle.removeEntry(filename);
      return true;
    } catch {
      return false;
    }
  },

  // Copy all files from one directory to another (non-recursive)
  async copyDir(srcHandle, destHandle) {
    const entries = await this.listEntries(srcHandle);
    for (const entry of entries) {
      if (entry.kind === 'file') {
        const f = await entry.handle.getFile();
        const text = await f.text();
        await this.writeFile(destHandle, entry.name, text);
      }
    }
  },

  // Request permission for a stored handle.
  // silent=true: only query (no dialog) — safe to call without user gesture.
  // silent=false (default): query first, then prompt if not yet granted.
  async verifyPermission(handle, readWrite = true, silent = false) {
    const opts = readWrite ? { mode: 'readwrite' } : { mode: 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (silent) return false; // no user gesture available — skip requestPermission
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  },

  // Persist a directory handle to IndexedDB
  async persistHandle(key, handle) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('webbuilder-handles', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  },

  // Restore a persisted handle from IndexedDB
  async restoreHandle(key) {
    return new Promise((resolve) => {
      const req = indexedDB.open('webbuilder-handles', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('handles', 'readonly');
        const getReq = tx.objectStore('handles').get(key);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  },
};

// ─── Component Templates ──────────────────────────────────────────────────────
const ComponentTemplates = {
  navbar: {
    html: `<nav class="navbar-component">
  <a class="nav-logo" href="{{field:logo_href}}">{{field:logo_text}}</a>
  <div class="nav-links">
    <!-- @each:main-menu -->
    <a href="{{item.href}}" class="nav-link">{{t:item.i18nKey}}</a>
    <!-- @/each -->
  </div>
  <div class="nav-lang">
    <!-- @each:languages -->
    <a href="{{item.pathPrefix}}{{pageName}}">{{item.display}}</a>
    <!-- @/each -->
  </div>
  <a class="nav-cta" href="{{field:cta_href}}">{{t:nav.cta}}</a>
</nav>`,
    schema: {
      label: 'Navigation Bar',
      description: 'Fixed top navigation bar with logo, menu, language switcher and CTA.',
      selector: 'header, nav, [class*="navbar"], [class*="nav-bar"], [class*="header"], [id*="navbar"], [id*="header"]',
      fields: [
        { key: 'logo_text', label: 'Logo Text', type: 'text', i18n: false, value: 'SITE NAME' },
        { key: 'logo_href', label: 'Logo Link', type: 'url', i18n: false, value: 'index.html' },
        { key: 'cta_href', label: 'CTA Button Link', type: 'url', i18n: false, value: 'contact.html' },
        { key: 'nav.cta', label: 'CTA Button Text', type: 'i18n-ref', i18n: true, i18nKey: 'nav.cta', defaultValue: 'Contact' },
      ],
      sharedDataRefs: ['main-menu', 'languages'],
    },
  },

  footer: {
    html: `<footer class="footer-component">
  <div class="footer-logo">{{field:logo_text}}</div>
  <nav class="footer-links">
    <!-- @each:main-menu -->
    <a href="{{item.href}}">{{t:item.i18nKey}}</a>
    <!-- @/each -->
  </nav>
  <div class="footer-social">
    <!-- @each:social-links -->
    <a href="{{item.href}}" class="social-icon" title="{{item.label}}">{{item.icon}}</a>
    <!-- @/each -->
  </div>
  <p class="footer-copy">{{t:footer.copyright}}</p>
</footer>`,
    schema: {
      label: 'Footer',
      description: 'Site footer with logo, links, social icons, and copyright.',
      selector: 'footer, [class*="footer"], [id*="footer"]',
      fields: [
        { key: 'logo_text', label: 'Footer Logo Text', type: 'text', i18n: false, value: 'SITE NAME' },
        { key: 'footer.copyright', label: 'Copyright Text', type: 'i18n-ref', i18n: true, i18nKey: 'footer.copyright', defaultValue: '© 2025 Company Name. All rights reserved.' },
      ],
      sharedDataRefs: ['main-menu', 'social-links'],
    },
  },

  'cookie-banner': {
    html: `<div class="cookie-banner" id="cookie-consent">
  <div class="cookie-content">
    <h3 class="cookie-title">{{t:cookie.title}}</h3>
    <p class="cookie-desc">{{t:cookie.desc}}</p>
    <div class="cookie-actions">
      <button class="btn-decline" id="decline-cookies">{{t:cookie.decline}}</button>
      <button class="btn-accept" id="accept-cookies">{{t:cookie.accept}}</button>
    </div>
  </div>
</div>
<script>
(function() {
  var c = document.getElementById('cookie-consent');
  if (!c) return;
  if (localStorage.getItem('cookies-accepted')) { c.style.display = 'none'; return; }
  document.getElementById('accept-cookies').onclick = function() {
    localStorage.setItem('cookies-accepted', '1');
    c.style.display = 'none';
  };
  document.getElementById('decline-cookies').onclick = function() {
    c.style.display = 'none';
  };
})();
<\/script>`,
    schema: {
      label: 'Cookie Banner',
      description: 'GDPR cookie consent banner.',
      selector: '[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], [class*="gdpr"], [id*="gdpr"]',
      fields: [
        { key: 'cookie.title', label: 'Banner Title', type: 'i18n-ref', i18n: true, i18nKey: 'cookie.title', defaultValue: 'Cookie Notice' },
        { key: 'cookie.desc', label: 'Banner Description', type: 'i18n-ref', i18n: true, i18nKey: 'cookie.desc', defaultValue: 'We use cookies to improve your experience.' },
        { key: 'cookie.accept', label: 'Accept Button', type: 'i18n-ref', i18n: true, i18nKey: 'cookie.accept', defaultValue: 'Accept' },
        { key: 'cookie.decline', label: 'Decline Button', type: 'i18n-ref', i18n: true, i18nKey: 'cookie.decline', defaultValue: 'Decline' },
      ],
      sharedDataRefs: [],
    },
  },
};

// ─── Shared Data Templates ────────────────────────────────────────────────────
const SharedDataTemplates = {
  menu: {
    id: '',
    label: '',
    type: 'menu',
    fields: [
      { key: 'label', label: 'Label', type: 'text', i18n: true, i18nKeyPrefix: '' },
      { key: 'href', label: 'URL', type: 'url', i18n: false },
    ],
    items: [],
  },
  'icon-links': {
    id: '',
    label: '',
    type: 'icon-links',
    fields: [
      { key: 'label', label: 'Label', type: 'text', i18n: false },
      { key: 'icon', label: 'Icon (Material Symbol name or SVG)', type: 'text', i18n: false },
      { key: 'href', label: 'URL', type: 'url', i18n: false },
    ],
    items: [],
  },
  languages: {
    id: 'languages',
    label: 'Language Switcher',
    type: 'languages',
    fields: [
      { key: 'code', label: 'Language Code', type: 'text', i18n: false },
      { key: 'display', label: 'Display Name', type: 'text', i18n: false },
      { key: 'pathPrefix', label: 'Path Prefix', type: 'text', i18n: false },
    ],
    items: [],
  },
  custom: {
    id: '',
    label: '',
    type: 'custom',
    fields: [],
    items: [],
  },
};

// ─── TextScanner — extract visible text strings from components & page metadata ─
const TextScanner = {
  // Tags whose text content we want to extract
  TEXT_TAGS: new Set(['h1','h2','h3','h4','h5','h6','p','a','button','span','li','th','td','label','figcaption','blockquote','dt','dd','caption','legend','summary']),
  // Attributes to scan
  ATTR_TARGETS: ['alt', 'title', 'placeholder', 'aria-label'],
  // Tags to skip entirely (including their subtree)
  SKIP_TAGS: new Set(['script','style','template','pre','code','noscript','svg','math','head']),

  /**
   * Scan all components, page body content and page metadata.
   * Returns: [{ key, text, source, type, attr, category }]
   *   key      – suggested i18n key
   *   text     – extracted string
   *   source   – component id or page filename
   *   type     – 'text' | 'attr' | 'meta'
   *   attr     – attribute name if type==='attr'|'meta', null otherwise
   *   category – 'global' (components) | 'page' (page body) | 'meta' (metadata)
   */
  async scan() {
    const results = [];
    const seenText = new Set(); // lowercase dedup

    // 1. Components (HTML is in memory) → category: 'global'
    for (const [compId, comp] of Object.entries(State.components || {})) {
      if (!comp.html) continue;
      const entries = this._scanHtml(comp.html, `comp.${compId}`, seenText, 'global');
      results.push(...entries);
    }

    // 2. Page body content (read from disk) → category: 'page'
    for (const page of (State.pages || [])) {
      if (!State.projectHandle) continue;
      const basename = Utils.pageName(page.file);
      const html = await ProjectManager.readPage(page.file);
      if (!html) continue;

      // Strip @component blocks to avoid duplicating component text
      const stripped = html.replace(/<!--\s*@component:[^>]+-->([\s\S]*?)<!--\s*\/@component:[^>]+-->/g, '');

      // Parse body only
      const parser = new DOMParser();
      const doc = parser.parseFromString(stripped, 'text/html');
      const bodyEl = doc.body;
      if (!bodyEl) continue;

      const entries = this._scanHtml(bodyEl.innerHTML, `page.${basename}`, seenText, 'page');
      results.push(...entries);
    }

    // 3. Page metadata (title, description) from project.json → category: 'meta'
    for (const page of (State.pages || [])) {
      const basename = Utils.pageName(page.file);
      const meta = page.meta || {};
      for (const field of ['title', 'description', 'ogTitle', 'ogDescription']) {
        const text = (meta[field] || '').trim();
        if (!text || text.includes('{{') || seenText.has(text.toLowerCase())) continue;
        seenText.add(text.toLowerCase());
        results.push({
          key: `meta.${basename}.${this._camel2snake(field)}`,
          text,
          source: page.file,
          type: 'meta',
          attr: field,
          category: 'meta',
        });
      }
    }

    return results;
  },

  /** Scan an HTML string within a given scope prefix */
  _scanHtml(html, scope, seenText, category = 'global') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const results = [];
    const tagCounts = {};

    const walk = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (this.SKIP_TAGS.has(tag)) return;

      // Scan text-bearing attributes
      for (const attr of this.ATTR_TARGETS) {
        const val = node.getAttribute(attr);
        if (!val || val.includes('{{')) continue;
        const text = val.trim();
        if (text.length < 2 || seenText.has(text.toLowerCase())) continue;
        seenText.add(text.toLowerCase());
        const slot = `${tag}_${attr}`;
        tagCounts[slot] = (tagCounts[slot] || 0) + 1;
        results.push({ key: `${scope}.${slot}_${tagCounts[slot]}`, text, source: scope, type: 'attr', attr, category });
      }

      // Scan direct text content for target tags
      if (this.TEXT_TAGS.has(tag)) {
        const directText = this._directText(node);
        if (directText && directText.length >= 2 && !directText.includes('{{')) {
          const norm = directText.toLowerCase();
          if (!seenText.has(norm)) {
            seenText.add(norm);
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            results.push({ key: `${scope}.${tag}_${tagCounts[tag]}`, text: directText, source: scope, type: 'text', attr: null, category });
          }
        }
      }

      for (const child of node.childNodes) walk(child);
    };

    walk(doc.body || doc.documentElement);
    return results;
  },

  /** Concatenate only direct (non-element) text nodes */
  _directText(el) {
    let t = '';
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) t += n.textContent;
    }
    return t.replace(/\s+/g, ' ').trim();
  },

  /** camelCase → snake_case helper for meta field names */
  _camel2snake(s) {
    return s.replace(/([A-Z])/g, m => '_' + m.toLowerCase());
  },
};

// ─── Page Templates ───────────────────────────────────────────────────────────
const PageTemplates = {
  blank: (title, lang) => `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>

  <main>
    <h1>${title}</h1>
    <p>Page content goes here.</p>
  </main>

</body>
</html>`,

  'with-components': (title, lang) => `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{t:page.title}} | {{field:site_name}}</title>
</head>
<body>

<!-- @component:navbar -->

<main>
  <h1>{{t:page.heading}}</h1>
  <p>{{t:page.intro}}</p>
</main>

<!-- @component:footer -->
<!-- @component:cookie-banner -->

</body>
</html>`,
};