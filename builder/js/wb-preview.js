/* ===== wb-preview.js — Preview Engine & Export ===== */

// ── Built-in structure-visualizer CSS for component/data previews ─────────────
// Renders HTML structure as a readable wireframe without relying on user CSS.
const STRUCTURE_PREVIEW_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px; line-height: 1.5; background: #0f0f14; color: #ccc;
  }
  /* ── Block semantic elements ── */
  header, nav, footer, section, article, aside, main, div, form, ul, ol {
    position: relative;
    border: 1px dashed #2a2a36;
    border-radius: 3px;
    padding: 6px 8px;
    margin: 4px 0;
  }
  header  { border-color: #3d2a6a; background: #0d0b16; }
  nav     { border-color: #1e3a5f; background: #090c13; }
  footer  { border-color: #1a3a2a; background: #090e0c; }
  section { border-color: #2a3a1e; background: #0a0d09; }
  form    { border-color: #3a2a1e; background: #0d0a09; }

  /* ── Tag labels (::before pseudo) ── */
  header::before, nav::before, footer::before, section::before,
  article::before, aside::before, main::before {
    content: attr(class);
    font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em;
    padding: 1px 5px; border-radius: 2px; margin-bottom: 4px;
    display: inline-block;
  }
  header::before  { content: 'header'; background:#2a1654; color:#a78bfa; }
  nav::before     { content: 'nav';    background:#0d2240; color:#60a5fa; }
  footer::before  { content: 'footer'; background:#0a2018; color:#4ade80; }
  section::before { content: 'section'; background:#141d0a; color:#86efac; }
  article::before { content: 'article'; background:#1a1a0e; color:#fde047; }

  /* ── Text elements ── */
  h1, h2, h3, h4, h5, h6 {
    color: #e0e0e0; margin: 4px 0;
    padding: 3px 0; border-bottom: 1px solid #1e1e28; font-weight: 600;
  }
  h1 { font-size: 18px; } h2 { font-size: 15px; } h3 { font-size: 13px; }
  p  { color: #888; margin: 4px 0; font-size: 12px; }
  small, span { color: #666; font-size: 11px; }

  /* ── Links ── */
  a {
    display: inline-block;
    color: #818cf8; text-decoration: none;
    border: 1px solid #2e2e4e; border-radius: 3px;
    padding: 1px 6px; margin: 2px; font-size: 11px;
    background: #0d0d1e;
    transition: background .12s;
  }
  a:hover { background: #1a1a30; }

  /* ── Buttons ── */
  button, [role="button"], .btn, [class*="btn-"], [class*="button"] {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 4px;
    background: #1e1b4b; border: 1px solid #3730a3;
    color: #a5b4fc; font-size: 11px; cursor: pointer; margin: 2px;
  }

  /* ── Images ── */
  img {
    display: block; max-width: 100%;
    border: 1px dashed #333; border-radius: 3px;
    background: repeating-linear-gradient(45deg,#111,#111 5px,#141420 5px,#141420 10px);
    min-height: 32px; color: #555; font-size: 10px;
  }

  /* ── Lists ── */
  ul, ol { padding-left: 16px; }
  li { color: #aaa; font-size: 12px; padding: 2px 0; }

  /* ── Inputs / Form controls ── */
  input, textarea, select {
    padding: 4px 8px; background: #0d0d18;
    border: 1px solid #2e2e3e; border-radius: 4px;
    color: #ccc; font-size: 11px; width: auto; max-width: 100%;
  }

  /* ── Dividers ── */
  hr { border: none; border-top: 1px solid #1e1e28; margin: 6px 0; }

  /* ── SVG / Icons ── */
  svg { width: 20px; height: 20px; fill: #666; vertical-align: middle; }
  .material-symbols-outlined, [class*="icon"], i[class*="fa"] {
    display: inline-block; width: 18px; height: 18px;
    background: #1e1e28; border-radius: 3px;
    text-align: center; line-height: 18px; font-size: 12px; color: #666;
    vertical-align: middle;
  }

  /* ── Cookie / overlay banners ── */
  [class*="cookie"], [class*="consent"], [class*="banner"] {
    border: 1px solid #3a2a0e; background: #0d0a06; padding: 10px;
  }

  /* ── Util ── */
  .hidden, [style*="display:none"] { display: block !important; border: 1px dashed #555; opacity: .4; }
  template-placeholder {
    display: block; padding: 2px 6px; border-radius: 3px;
    background: #0a0a1a; border: 1px dashed #333;
    color: #555; font-size: 10px; font-family: monospace; margin: 1px 0;
  }
`;

const Preview = {
  _lastPageHtml: '',
  _deviceMode: 'desktop',

  // ── Render the current page into the iframe ──────────────────────────────────
  async renderCurrentPage() {
    if (State.activeView !== 'page-editor') return;
    const filename = PageEditor.getCurrentFilename();
    if (!filename) return;

    const rawHtml = PageEditor.getCurrentHtml();
    if (rawHtml === null) return;

    const rendered = this._processPageHtml(rawHtml, filename, State.previewLanguage);
    await this._writeIframe('preview-iframe', rendered);
  },

  // ── Render a component into the component preview (with structure CSS) ────────
  async renderComponent(id) {
    const comp = State.components[id];
    if (!comp) return;

    const rendered = this._processComponentHtml(comp.html, State.previewLanguage);
    const wrapper = `<!DOCTYPE html>
<html lang="${State.previewLanguage || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${STRUCTURE_PREVIEW_CSS}</style>
</head>
<body>${rendered}</body>
</html>`;
    await this._writeIframe('comp-preview-iframe', wrapper);
  },

  // ── Refresh page preview (debounced from code changes) ───────────────────────
  refresh: Utils.debounce(function () {
    Preview.renderCurrentPage();
  }, 500),

  // ── Process page HTML: inject components, resolve templates, apply theme ──────
  // exportCtx (optional): { exportLang, baseLang } — set only during Exporter.run()
  _processPageHtml(html, filename, lang, exportCtx) {
    let processed = html;

    // Inject component markup in place of <!-- @component:id --> markers
    processed = this._injectComponents(processed, filename, lang, exportCtx);

    // Resolve template tokens
    processed = this._resolveTokens(processed, filename, lang);

    // Apply i18n overlay: for imported HTML that has no {{t:...}} tokens,
    // perform DOM-level text replacement using the i18n database.
    // Runs in both preview and export mode — Exporter also needs translated text
    // for non-base languages, for which no pre-translated source files exist.
    processed = this._applyI18nOverlay(processed, lang);

    // Apply project theme based on cssMode
    const cssMode = State.project?.cssMode || 'tailwind-cdn';
    const theme = State.project?.theme;
    if (!exportCtx) {
      // ── Preview mode: always use CDN so theme edits work in real-time ──────
      // For 'tailwind-local' projects, swap the pre-compiled CSS link for the
      // Tailwind CDN script so the injected config is processed by the runtime.
      if (theme && cssMode === 'tailwind-local') {
        processed = ThemeEngine.swapLocalCssForCdn(processed);
        processed = ThemeEngine.injectConfig(processed, theme);
        processed = ThemeEngine.injectFontsLink(processed, theme);
      } else if (theme && cssMode === 'tailwind-cdn') {
        processed = ThemeEngine.injectConfig(processed, theme);
        processed = ThemeEngine.injectFontsLink(processed, theme);
      }
      // cssMode === 'custom': no ThemeEngine injection
    } else {
      // ── Export mode: respect the project's cssMode ────────────────────────
      if (theme && cssMode === 'tailwind-cdn') {
        processed = ThemeEngine.injectConfig(processed, theme);
        processed = ThemeEngine.injectFontsLink(processed, theme);
      } else if (theme && cssMode === 'tailwind-local') {
        // Keep the pre-compiled CSS; only update the Google Fonts link
        processed = ThemeEngine.injectFontsLink(processed, theme);
      }
      // cssMode === 'custom': no ThemeEngine injection
    }

    return processed;
  },

  // ── Inject component HTML into page ─────────────────────────────────────────
  // Strategy 1: replace full marker blocks <!-- @component:id -->...<!-- /@component:id -->
  // Strategy 2: replace any remaining bare opening markers <!-- @component:id -->
  // This prevents double-injection when the source HTML already contains filled marker blocks.
  _injectComponents(html, filename, lang, exportCtx) {
    // Track which IDs were already handled in Step 1 (full block replacement).
    // Step 2 must skip these to avoid re-matching the markers we just wrote.
    const processedIds = new Set();

    // Step 1: replace complete blocks <!-- @component:id -->...<!-- /@component:id -->
    let result = html.replace(
      /<!--\s*@component:([\w-]+)\s*-->([\s\S]*?)<!--\s*\/@component:\1\s*-->/g,
      (match, id) => {
        processedIds.add(id);
        const comp = State.components[id];
        if (!comp) return `<!-- component "${id}" not found -->`;
        const compHtml = this._processComponentHtml(comp.html, lang, filename, exportCtx);
        return `<!-- @component:${id} -->\n${compHtml}\n<!-- /@component:${id} -->`;
      }
    );

    // Step 2: replace bare opening markers only for IDs NOT already processed above.
    // (If we didn't guard here, Step 2 would re-match the markers inserted by Step 1
    //  and produce a second copy of the component HTML.)
    result = result.replace(/<!--\s*@component:([\w-]+)\s*-->/g, (match, id) => {
      if (processedIds.has(id)) return match; // already replaced — leave the marker as-is
      const comp = State.components[id];
      if (!comp) return `<!-- component "${id}" not found -->`;
      const compHtml = this._processComponentHtml(comp.html, lang, filename, exportCtx);
      return `<!-- @component:${id} -->\n${compHtml}\n<!-- /@component:${id} -->`;
    });

    return result;
  },

  // ── Process a single component's HTML ────────────────────────────────────────
  // exportCtx (optional): { exportLang, baseLang } — set only during Exporter.run()
  _processComponentHtml(html, lang, pageName, exportCtx) {
    if (!html) return '';
    let processed = html;

    // Process @each loops
    processed = this._processEachLoops(processed, lang, pageName, exportCtx);

    // Resolve tokens
    processed = this._resolveTokens(processed, pageName || '', lang);

    return processed;
  },

  // ── Process @each:id loops ────────────────────────────────────────────────────
  // exportCtx (optional): { exportLang, baseLang } — enables dynamic lang-switcher path calc
  _processEachLoops(html, lang, pageName, exportCtx) {
    return html.replace(
      /<!--\s*@each:([\w-]+)\s*-->([\s\S]*?)<!--\s*@\/each\s*-->/g,
      (match, dataId, template) => {
        const data = State.sharedData[dataId];
        if (!data || !data.items) return '';

        return data.items.map(item => {
          let row = template;

          // For 'languages' shared data during export: compute correct relative path prefix
          // so the language switcher always links to the correct language version of the
          // current page, regardless of which language subdirectory we are exporting to.
          let resolvedItem = item;
          if (dataId === 'languages' && exportCtx && pageName) {
            resolvedItem = Object.assign({}, item, {
              pathPrefix: this._computeLangSwitcherPrefix(
                item.code, exportCtx.exportLang, exportCtx.baseLang
              ),
            });
          }

          // Replace {{item.field}} tokens
          row = row.replace(/\{\{item\.([\w.]+)\}\}/g, (m, fieldKey) => {
            return Utils.escapeHtml(resolvedItem[fieldKey] || '');
          });

          // Replace {{t:item.i18nKey}} — look up item's i18n key
          row = row.replace(/\{\{t:item\.([\w.]+)\}\}/g, (m, fieldKey) => {
            const i18nKey = resolvedItem[fieldKey];
            if (!i18nKey) return '';
            return this._resolveI18n(i18nKey, lang);
          });

          return row;
        }).join('\n');
      }
    );
  },

  // ── Resolve template tokens in HTML ──────────────────────────────────────────
  _resolveTokens(html, filename, lang) {
    if (!html) return '';

    // {{t:key}} — i18n translation
    let result = html.replace(/\{\{t:([\w.]+)\}\}/g, (match, key) => {
      return this._resolveI18n(key, lang);
    });

    // {{field:key}} — component/page field values
    result = result.replace(/\{\{field:([\w_]+)\}\}/g, (match, key) => {
      // Check in site-info
      const siteInfo = State.sharedData['site-info'];
      if (siteInfo?.data?.[key]) return Utils.escapeHtml(siteInfo.data[key]);
      return match; // leave as-is if not found
    });

    // {{pageName}} — current page filename
    result = result.replace(/\{\{pageName\}\}/g, filename || '');

    // {{lang}} — current language
    result = result.replace(/\{\{lang\}\}/g, lang || '');

    return result;
  },

  // ── Compute relative path prefix for the language switcher ───────────────────
  // Returns the prefix that, when prepended to a page filename, gives the correct
  // relative link from a page in `currentLang` to the same page in `targetLang`.
  //
  // Examples (baseLang = 'en'):
  //   currentLang='en',    targetLang='zh-SC' → 'zh-SC/'
  //   currentLang='zh-SC', targetLang='en'    → '../'
  //   currentLang='zh-SC', targetLang='zh-SC' → ''
  //   currentLang='zh-SC', targetLang='zh-TC' → '../zh-TC/'
  _computeLangSwitcherPrefix(targetLang, currentLang, baseLang) {
    const targetIsBase = targetLang === baseLang;
    const currentIsBase = currentLang === baseLang;
    if (currentIsBase) {
      if (targetIsBase) return ''; // same lang, at root
      return `${targetLang}/`; // at root → into lang subdir
    } else {
      // current page is in a lang subdirectory
      if (targetIsBase) return '../'; // go up to root (base lang)
      if (targetLang === currentLang) return ''; // same subdir
      return `../${targetLang}/`; // up to root then into sibling lang dir
    }
  },

  // ── Set <html lang="…"> attribute ────────────────────────────────────────────
  // Replaces or inserts the lang attribute on the <html> opening tag.
  _injectLangAttribute(html, lang) {
    return html.replace(/<html([^>]*?)>/i, (match, attrs) => {
      const cleanAttrs = attrs
        .replace(/\s+lang="[^"]*"/gi, '')
        .replace(/\s+lang='[^']*'/gi, '');
      return `<html lang="${Utils.escapeHtml(lang)}"${cleanAttrs}>`;
    });
  },

  // ── Inject hreflang <link> tags for all language versions ────────────────────
  // Inserts <link rel="alternate" hreflang="xx" href="…"> for every language,
  // plus an x-default pointing to the base language.
  // Uses relative paths when canonicalBase is not provided.
  // Only injects when there are 2 or more languages (hreflang is pointless with one).
  _injectHreflang(html, pageName, currentLang, allLangs, baseLang, canonicalBase) {
    if (!allLangs || allLangs.length < 2) return html;

    const lines = allLangs.map(lang => {
      let href;
      if (canonicalBase) {
        const cleanBase = canonicalBase.replace(/\/$/, '');
        href = lang.code === baseLang
          ? `${cleanBase}/${pageName}`
          : `${cleanBase}/${lang.code}/${pageName}`;
      } else {
        const prefix = this._computeLangSwitcherPrefix(lang.code, currentLang, baseLang);
        href = `${prefix}${pageName}`;
      }
      return `  <link rel="alternate" hreflang="${Utils.escapeHtml(lang.code)}" href="${href}">`;
    });

    // x-default → base language version
    const xDefaultPrefix = canonicalBase
      ? (canonicalBase.replace(/\/$/, '') + '/')
      : this._computeLangSwitcherPrefix(baseLang, currentLang, baseLang);
    const xDefaultHref = canonicalBase
      ? `${canonicalBase.replace(/\/$/, '')}/${pageName}`
      : `${xDefaultPrefix}${pageName}`;
    lines.unshift(`  <link rel="alternate" hreflang="x-default" href="${xDefaultHref}">`);

    // Remove any pre-existing hreflang tags to avoid duplicates
    let result = html.replace(/<link\s[^>]*hreflang[^>]*>/gi, '').replace(/[ \t]*\n(?=\s*\n)/g, '\n');

    const injection = lines.join('\n') + '\n';
    if (/<\/head>/i.test(result)) {
      return result.replace(/<\/head>/i, `${injection}</head>`);
    }
    return result;
  },

  // ── Apply i18n overlay: DOM-level text replacement for hardcoded HTML ─────────
  // For imported HTML sites that don't use {{t:...}} template tokens, this method
  // walks the rendered HTML (as a DOM) and replaces all text nodes + key attributes
  // that match the base-language strings with their target-language translations.
  //
  // Rules:
  //   • Only runs when target lang ≠ base lang
  //   • Only replaces entries where targetData[key] is non-empty
  //   • Replacements are sorted longest-first to avoid partial-match corruption
  //   • Only touches: text nodes, alt, title, placeholder, aria-label attributes
  //   • Skips script/style/pre/code element subtrees
  _applyI18nOverlay(html, lang) {
    if (!State.project || !lang) return html;
    const baseLang = State.project.baseLanguage;
    if (!baseLang || lang === baseLang) return html; // nothing to do for base lang

    const baseData = State.i18nData[baseLang] || {};
    const targetData = State.i18nData[lang] || {};

    // Build replacement list: [{ from, to }], skipping empty translations
    const replacements = [];
    for (const [key, baseText] of Object.entries(baseData)) {
      const t = targetData[key];
      if (!baseText || typeof baseText !== 'string') continue;
      if (!t || typeof t !== 'string' || !t.trim()) continue;
      if (baseText === t) continue; // same text — skip
      replacements.push({ from: baseText, to: t });
    }

    if (replacements.length === 0) return html;

    // Sort longest first to avoid shorter strings corrupting longer ones
    replacements.sort((a, b) => b.from.length - a.from.length);

    // Parse the HTML and do DOM-level replacement
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const SKIP_TAGS = new Set(['script', 'style', 'pre', 'code', 'noscript', 'template', 'svg', 'math']);
    const ATTR_TARGETS = ['alt', 'title', 'placeholder', 'aria-label'];

    // Build a fast lookup map: from → to (normalised whitespace)
    const lookupMap = new Map();
    for (const { from, to } of replacements) {
      // Store both exact and single-space-normalised variants
      lookupMap.set(from, to);
      const norm = from.replace(/\s+/g, ' ').trim();
      if (norm !== from) lookupMap.set(norm, to);
    }

    const walk = (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (SKIP_TAGS.has(tag)) return;

        // Replace matching attribute values
        for (const attr of ATTR_TARGETS) {
          const val = node.getAttribute(attr);
          if (!val) continue;
          const norm = val.replace(/\s+/g, ' ').trim();
          if (lookupMap.has(val))        node.setAttribute(attr, lookupMap.get(val));
          else if (lookupMap.has(norm))  node.setAttribute(attr, lookupMap.get(norm));
        }

        for (const child of node.childNodes) walk(child);
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const norm = text.replace(/\s+/g, ' ').trim();
        if (!norm) return;

        let replacement = null;
        if (lookupMap.has(text)) {
          replacement = lookupMap.get(text);
        } else if (lookupMap.has(norm)) {
          // Preserve surrounding whitespace
          const leading  = text.match(/^\s*/)[0];
          const trailing = text.match(/\s*$/)[0];
          replacement = leading + lookupMap.get(norm) + trailing;
        }

        if (replacement !== null) {
          node.textContent = replacement;
        }
      }
    };

    walk(doc.documentElement);

    // Serialise back to HTML string
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  },

  // ── Resolve an i18n key ───────────────────────────────────────────────────────
  _resolveI18n(key, lang) {
    const langData = State.i18nData[lang] || {};
    if (langData[key] !== undefined) return Utils.escapeHtml(langData[key]);

    // Fall back to base language
    const baseLang = State.project?.baseLanguage;
    if (baseLang && baseLang !== lang) {
      const baseData = State.i18nData[baseLang] || {};
      if (baseData[key] !== undefined) return Utils.escapeHtml(baseData[key]);
    }

    // Return key as placeholder
    return `[${key}]`;
  },

  // ── Resolve local asset paths → Blob URLs ────────────────────────────────────
  // When using srcdoc, the iframe base is about:srcdoc so relative paths break.
  // This reads local project files via FSA and replaces paths with blob: URLs.
  async _resolveLocalAssets(html) {
    if (!State.projectHandle) return html;

    // Match src="..." and href="..." for local files (not external / data: / #)
    const attrPattern = /\b(src|href)="((?!https?:\/\/|\/\/|data:|#|mailto:|tel:)[^"]+)"/gi;
    // Match CSS url(...) patterns
    const cssPattern = /url\(['"]?((?!https?:\/\/|\/\/|data:|#)[^'")]+)['"]?\)/gi;

    const pathsToResolve = new Set();

    let m;
    while ((m = attrPattern.exec(html)) !== null) pathsToResolve.add(m[2]);
    while ((m = cssPattern.exec(html)) !== null) pathsToResolve.add(m[1]);

    if (pathsToResolve.size === 0) return html;

    const resolved = new Map();

    for (const rawPath of pathsToResolve) {
      // Skip paths that look like template tokens or anchors
      if (rawPath.startsWith('{{') || rawPath.startsWith('@')) continue;
      // Strip leading ./
      const path = rawPath.replace(/^\.\//, '');
      if (!path || resolved.has(path)) continue;

      try {
        const parts = path.split('/').filter(Boolean);
        let dirHandle = State.projectHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          dirHandle = await dirHandle.getDirectoryHandle(parts[i]);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        const file = await fileHandle.getFile();
        const blobUrl = URL.createObjectURL(file);
        resolved.set(rawPath, blobUrl);
        if (path !== rawPath) resolved.set(path, blobUrl);
      } catch {
        // File not found or permission denied — leave original path
      }
    }

    if (resolved.size === 0) return html;

    let result = html;
    for (const [originalPath, blobUrl] of resolved) {
      // Replace in src="..." href="..."
      result = result.split(`"${originalPath}"`).join(`"${blobUrl}"`);
      result = result.split(`'${originalPath}'`).join(`'${blobUrl}'`);
      // Replace in url(...)
      result = result.split(`url(${originalPath})`).join(`url(${blobUrl})`);
      result = result.split(`url('${originalPath}')`).join(`url('${blobUrl}')`);
      result = result.split(`url("${originalPath}")`).join(`url("${blobUrl}")`);
    }
    return result;
  },

  // ── Write HTML into an iframe ─────────────────────────────────────────────────
  // Uses srcdoc to avoid file:// cross-origin restrictions in Edge/Chrome.
  // Resolves local asset paths to Blob URLs so images/CSS/JS load correctly.
  async _writeIframe(iframeId, html) {
    const iframe = document.getElementById(iframeId);
    if (!iframe) return;
    const resolvedHtml = await this._resolveLocalAssets(html);
    iframe.srcdoc = resolvedHtml;
  },

  // ── Set preview device ────────────────────────────────────────────────────────
  setDevice(mode) {
    this._deviceMode = mode;
    State.previewDevice = mode;

    // The outer wrapper that holds the iframe (may be in page-editor or comp-editor)
    const wrap = document.getElementById('preview-outer') || document.getElementById('preview-iframe-wrap');
    const iframe = document.getElementById('preview-iframe');
    if (!wrap || !iframe) return;

    if (mode === 'desktop') {
      wrap.style.overflow = 'auto';
      wrap.style.background = '#1a1a2a';
      wrap.style.padding = '';
      wrap.style.alignItems = '';
      wrap.style.justifyContent = 'stretch';
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    } else if (mode === 'tablet') {
      wrap.style.overflow = 'auto';
      wrap.style.background = '#111118';
      wrap.style.padding = '24px';
      wrap.style.alignItems = 'flex-start';
      wrap.style.justifyContent = 'center';
      iframe.style.cssText = 'width:768px;min-height:1024px;height:auto;border:none;border-radius:8px;box-shadow:0 4px 32px #0008;flex-shrink:0;display:block;';
    } else {
      // mobile
      wrap.style.overflow = 'auto';
      wrap.style.background = '#111118';
      wrap.style.padding = '24px';
      wrap.style.alignItems = 'flex-start';
      wrap.style.justifyContent = 'center';
      iframe.style.cssText = 'width:390px;min-height:844px;height:auto;border:none;border-radius:16px;box-shadow:0 8px 40px #0009;flex-shrink:0;display:block;';
    }

    // Update toolbar button states
    ['mobile', 'tablet', 'desktop'].forEach(m => {
      const btn = document.getElementById(`device-${m}`);
      if (btn) btn.classList.toggle('active', m === mode);
    });
  },

  // ── Render a page with a temporary/unsaved theme (for Theme Editor preview) ──
  async renderPageWithTheme(iframeId, filename, tempTheme) {
    const rawHtml = await ProjectManager.readPage(filename);
    if (!rawHtml) return;

    let processed = rawHtml;

    // inject components + resolve tokens (use current preview lang)
    processed = this._injectComponents(processed, filename, State.previewLanguage);
    processed = this._resolveTokens(processed, filename, State.previewLanguage);

    // Apply temp theme — always use CDN in preview so color edits work in real-time
    const cssMode = State.project?.cssMode || 'tailwind-cdn';
    if (tempTheme) {
      if (cssMode === 'tailwind-local') {
        // Swap pre-compiled CSS for CDN so the injected config is processed
        processed = ThemeEngine.swapLocalCssForCdn(processed);
      }
      if (cssMode !== 'custom') {
        processed = ThemeEngine.injectConfig(processed, tempTheme);
        processed = ThemeEngine.injectFontsLink(processed, tempTheme);
      }
    }

    await this._writeIframe(iframeId, processed);
  },

  // ── Change preview language ───────────────────────────────────────────────────
  setLanguage(lang) {
    State.previewLanguage = lang;
    if (State.activeView === 'page-editor') this.renderCurrentPage();
    else if (State.activeView === 'component-editor' && State.activeComponent) {
      this.renderComponent(State.activeComponent);
    }
  },
};

// ─── Theme Engine ─────────────────────────────────────────────────────────────
// Generates a full Tailwind config from 5 seed colors + font + radius settings.
// Uses lightweight HSL arithmetic to derive the complete M3-style token palette.
const ThemeEngine = {

  // ── HSL utilities ────────────────────────────────────────────────────────────
  _hexToHsl(hex) {
    let r = parseInt(hex.slice(1,3),16)/255;
    let g = parseInt(hex.slice(3,5),16)/255;
    let b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      switch (max) {
        case r: h = ((g-b)/d + (g<b?6:0))/6; break;
        case g: h = ((b-r)/d + 2)/6; break;
        default: h = ((r-g)/d + 4)/6;
      }
    }
    return [h*360, s*100, l*100];
  },

  _hslToHex(h, s, l) {
    h = ((h%360)+360)%360; s = Math.max(0,Math.min(100,s))/100; l = Math.max(0,Math.min(100,l))/100;
    const c = (1-Math.abs(2*l-1))*s;
    const x = c*(1-Math.abs((h/60)%2-1));
    const m = l - c/2;
    let r=0,g=0,b=0;
    if      (h<60)  { r=c; g=x; b=0; }
    else if (h<120) { r=x; g=c; b=0; }
    else if (h<180) { r=0; g=c; b=x; }
    else if (h<240) { r=0; g=x; b=c; }
    else if (h<300) { r=x; g=0; b=c; }
    else            { r=c; g=0; b=x; }
    const toHex = n => Math.round((n+m)*255).toString(16).padStart(2,'0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },

  // Adjust lightness by `delta` percentage points
  _adjL(hex, delta) {
    const [h,s,l] = this._hexToHsl(hex);
    return this._hslToHex(h, s, l + delta);
  },
  // Adjust saturation by `delta` percentage points
  _adjS(hex, delta) {
    const [h,s,l] = this._hexToHsl(hex);
    return this._hslToHex(h, s + delta, l);
  },
  // Mix two hex colors at ratio t (0=a, 1=b)
  _mix(a, b, t) {
    const ra=parseInt(a.slice(1,3),16), ga=parseInt(a.slice(3,5),16), ba=parseInt(a.slice(5,7),16);
    const rb=parseInt(b.slice(1,3),16), gb=parseInt(b.slice(3,5),16), bb=parseInt(b.slice(5,7),16);
    const r=Math.round(ra+(rb-ra)*t), g=Math.round(ga+(gb-ga)*t), bv=Math.round(ba+(bb-ba)*t);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bv.toString(16).padStart(2,'0')}`;
  },

  // ── Derive full M3-style color token set from 5 seed colors ─────────────────
  // Seeds: primary, primaryContainer, surface, onSurface, secondary
  deriveM3Colors(seeds) {
    const p   = seeds.primary          || '#e9c176';
    const pc  = seeds.primaryContainer || this._adjL(p, -15);
    const s   = seeds.surface          || '#131313';
    const os  = seeds.onSurface        || '#e5e2e1';
    const sec = seeds.secondary        || this._adjS(this._adjL(p, -5), -25);

    // Determine if surface is dark or light
    const [,,sL] = this._hexToHsl(s);
    const isDark = sL < 50;

    // On-primary: should be readable on primary background
    const [,,pL] = this._hexToHsl(p);
    const onP = pL > 55 ? this._adjL(s, isDark ? 5 : -5) : this._adjL(os, 0);

    // Secondary-derived
    const secContainer  = this._adjL(sec, isDark ? -20 : 20);
    const onSec         = pL > 55 ? this._adjL(s, isDark ? 3 : -3) : os;
    const onSecContainer= this._adjL(isDark ? s : os, isDark ? 15 : -15);

    // Tertiary: hue-shifted version of primary
    const [pH,,] = this._hexToHsl(p);
    const tert          = this._hslToHex(pH + 30, 40, pL);
    const tertContainer = this._adjL(tert, isDark ? -18 : 18);
    const onTert        = pL > 55 ? this._adjL(s, isDark ? 5 : -5) : os;
    const onTertContainer = this._adjL(isDark ? s : os, isDark ? 18 : -18);

    // Surface tonal scale
    const sStep = isDark ? 3 : -3;
    const surfaceVariant = this._adjL(s, sStep * 5);

    return {
      // ── Primary ──────────────────────────────────────────────────────────────
      "primary":                    p,
      "primary-fixed":              this._adjL(p,  isDark ? 18 : -18),
      "primary-fixed-dim":          p,
      "on-primary":                 onP,
      "primary-container":          pc,
      "on-primary-container":       this._adjL(isDark ? s : os, isDark ? 10 : -10),
      "on-primary-fixed":           this._adjL(isDark ? s : os, isDark ? 5 : -5),
      "on-primary-fixed-variant":   this._adjL(isDark ? s : os, isDark ? 15 : -15),
      "surface-tint":               p,
      "inverse-primary":            this._adjL(pc, isDark ? 20 : -20),
      // ── Secondary ────────────────────────────────────────────────────────────
      "secondary":                  sec,
      "secondary-fixed":            this._adjL(sec, isDark ? 20 : -20),
      "secondary-fixed-dim":        sec,
      "on-secondary":               onSec,
      "secondary-container":        secContainer,
      "on-secondary-container":     onSecContainer,
      "on-secondary-fixed":         this._adjL(isDark ? s : os, isDark ? 5 : -5),
      "on-secondary-fixed-variant": this._adjL(isDark ? s : os, isDark ? 20 : -20),
      // ── Tertiary ─────────────────────────────────────────────────────────────
      "tertiary":                   tert,
      "tertiary-fixed":             this._adjL(tert, isDark ? 20 : -20),
      "tertiary-fixed-dim":         tert,
      "on-tertiary":                onTert,
      "tertiary-container":         tertContainer,
      "on-tertiary-container":      onTertContainer,
      "on-tertiary-fixed":          this._adjL(isDark ? s : os, isDark ? 5 : -5),
      "on-tertiary-fixed-variant":  this._adjL(isDark ? s : os, isDark ? 22 : -22),
      // ── Surface scale ─────────────────────────────────────────────────────────
      "surface":                    s,
      "surface-dim":                s,
      "surface-bright":             this._adjL(s, sStep * 6),
      "surface-variant":            surfaceVariant,
      "surface-container-lowest":   this._adjL(s, sStep * 1),
      "surface-container-low":      this._adjL(s, sStep * 2),
      "surface-container":          this._adjL(s, sStep * 3),
      "surface-container-high":     this._adjL(s, sStep * 4),
      "surface-container-highest":  this._adjL(s, sStep * 5),
      "background":                 s,
      // ── On-surface ───────────────────────────────────────────────────────────
      "on-surface":                 os,
      "on-background":              os,
      "on-surface-variant":         this._mix(os, s, 0.35),
      "inverse-surface":            os,
      "inverse-on-surface":         this._adjL(s, sStep * 5),
      "outline":                    this._mix(os, s, 0.6),
      "outline-variant":            this._mix(os, s, 0.8),
      // ── Error (fixed M3 defaults) ─────────────────────────────────────────────
      "error":                      "#ffb4ab",
      "on-error":                   "#690005",
      "error-container":            "#93000a",
      "on-error-container":         "#ffdad6",
    };
  },

  // ── Build the Google Fonts URL for the 3 selected fonts ─────────────────────
  buildGoogleFontsUrl(fonts) {
    const headline = fonts.headline || 'Newsreader';
    const body     = fonts.body     || 'Manrope';
    const label    = fonts.label    || 'Space Grotesk';

    // Font → Google Fonts query mapping
    const fontMap = {
      'Newsreader':         'Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800',
      'Playfair Display':   'Playfair+Display:ital,wght@0,400..900;1,400..900',
      'Cormorant Garamond': 'Cormorant+Garamond:ital,wght@0,300..700;1,300..700',
      'EB Garamond':        'EB+Garamond:ital,wght@0,400..800;1,400..800',
      'DM Serif Display':   'DM+Serif+Display:ital@0;1',
      'Lora':               'Lora:ital,wght@0,400..700;1,400..700',
      'Merriweather':       'Merriweather:ital,wght@0,300..900;1,300..900',
      'Inter':              'Inter:wght@300..700',
      'Outfit':             'Outfit:wght@300..700',
      'Raleway':            'Raleway:ital,wght@0,300..800;1,300..800',
      'Bebas Neue':         'Bebas+Neue',
      'Noto Serif SC':      'Noto+Serif+SC:wght@300..900',
      'Noto Sans SC':       'Noto+Sans+SC:wght@300..700',
      'LXGW WenKai':        'LXGW+WenKai',
      'Manrope':            'Manrope:wght@200..800',
      'Plus Jakarta Sans':  'Plus+Jakarta+Sans:wght@300..700',
      'DM Sans':            'DM+Sans:wght@300..700',
      'Nunito':             'Nunito:wght@300..800',
      'Poppins':            'Poppins:wght@300..700',
      'Source Sans 3':      'Source+Sans+3:wght@300..700',
      'IBM Plex Sans':      'IBM+Plex+Sans:wght@300..700',
      'Rubik':              'Rubik:wght@300..700',
      'Space Grotesk':      'Space+Grotesk:wght@300..700',
      'Barlow':             'Barlow:wght@300..700',
      'Work Sans':          'Work+Sans:wght@300..700',
      'Space Mono':         'Space+Mono:ital,wght@0,400;0,700;1,400;1,700',
      'IBM Plex Mono':      'IBM+Plex+Mono:wght@300..600',
      'JetBrains Mono':     'JetBrains+Mono:wght@300..700',
      'Fira Code':          'Fira+Code:wght@300..700',
    };

    const families = [...new Set([headline, body, label])]
      .map(f => fontMap[f] || encodeURIComponent(f))
      .map(f => `family=${f}`)
      .join('&');

    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  },

  // ── Radius presets ───────────────────────────────────────────────────────────
  _radiusPresets: {
    sharp:   { DEFAULT: '0.125rem', lg: '0.25rem',  xl: '0.5rem',  full: '0.75rem' },
    rounded: { DEFAULT: '0.375rem', lg: '0.5rem',   xl: '0.75rem', full: '1.5rem'  },
    pill:    { DEFAULT: '0.75rem',  lg: '1rem',     xl: '1.5rem',  full: '9999px'  },
  },

  // ── Generate full tailwind.config JS string ──────────────────────────────────
  generateConfigScript(theme) {
    if (!theme) return null;
    const colors   = this.deriveM3Colors(theme.colors || {});
    const fonts    = theme.fonts  || {};
    const radius   = this._radiusPresets[theme.radius || 'sharp'];
    const headline = fonts.headline || 'Newsreader';
    const body     = fonts.body     || 'Manrope';
    const label    = fonts.label    || 'Space Grotesk';

    const cfg = {
      darkMode: 'class',
      theme: {
        extend: {
          colors,
          fontFamily: {
            headline: [headline],
            body:     [body],
            label:    [label],
          },
          borderRadius: radius,
        },
      },
    };

    return `tailwind.config = ${JSON.stringify(cfg, null, 2)}`;
  },

  // ── Swap local Tailwind CSS link for CDN script (preview-only) ───────────────
  // Removes any <link> tag referencing a local tailwind.css file and injects the
  // Tailwind CDN <script> tag so that injectConfig() can take effect in preview.
  // Only used in preview mode — export mode keeps the local CSS as-is.
  swapLocalCssForCdn(html) {
    // Remove local tailwind CSS links (e.g. assets/css/tailwind.css)
    let result = html.replace(
      /<link[^>]*href=["'][^"']*tailwind[^"']*\.css["'][^>]*>/gi, ''
    );

    // If CDN script is already present, nothing more to do
    if (/cdn\.tailwindcss\.com/i.test(result)) return result;

    // Inject CDN script before </head>
    const cdnTag = '<script src="https://cdn.tailwindcss.com"></script>';
    if (/<\/head>/i.test(result)) {
      return result.replace(/<\/head>/i, `${cdnTag}\n</head>`);
    }
    // Fallback: inject at start
    return cdnTag + '\n' + result;
  },

  // ── Inject / replace tailwind.config into an HTML string ─────────────────────
  // Replaces <script id="tailwind-config">…</script> if present.
  // If not present but <script src="…tailwindcss…"> exists, injects after it.
  // Does nothing if Tailwind CDN is not in the page at all.
  injectConfig(html, theme) {
    if (!theme) return html;
    const script = this.generateConfigScript(theme);
    if (!script) return html;

    const tag = `<script id="tailwind-config">\n${script}\n</script>`;

    // Replace existing <script id="tailwind-config">…</script>
    const existing = /<script[^>]*\bid="tailwind-config"[^>]*>[\s\S]*?<\/script>/i;
    if (existing.test(html)) {
      return html.replace(existing, tag);
    }

    // No existing block — inject after the Tailwind CDN <script> tag
    const cdnScript = /(<script[^>]*cdn\.tailwindcss\.com[^>]*>[\s\S]*?<\/script>)/i;
    if (cdnScript.test(html)) {
      return html.replace(cdnScript, `$1\n${tag}`);
    }

    // Inject before </head> as last resort
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${tag}\n</head>`);
    }

    return html;
  },

  // ── Replace Google Fonts <link> in HTML to match selected fonts ──────────────
  // Replaces the first googleapis.com/css2 <link> (not Material Symbols) or
  // injects a new one before </head> if none found.
  injectFontsLink(html, theme) {
    if (!theme?.fonts) return html;
    const url  = this.buildGoogleFontsUrl(theme.fonts);
    const tag  = `<link href="${url}" rel="stylesheet"/>`;

    // Match a Google Fonts link that isn't the Material Symbols one
    const existing = /<link[^>]*fonts\.googleapis\.com\/css2\?(?!family=Material)[^>]*>/i;
    if (existing.test(html)) {
      return html.replace(existing, tag);
    }

    // Inject before </head>
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${tag}\n</head>`);
    }
    return html;
  },
};

// ─── Exporter ─────────────────────────────────────────────────────────────────
const Exporter = {

  async run(selectedLangs) {
    if (!State.project || !State.projectHandle) {
      Utils.showToast('No project loaded.', 'error'); return;
    }

    const releasesHandle = await ProjectManager.getOrPickReleasesHandle();
    if (!releasesHandle) return;

    const projectName = State.project.name || 'project';
    let destHandle;
    try {
      destHandle = await FileHandler.getDir(releasesHandle, projectName, true);
    } catch (e) {
      Utils.showToast(`Cannot create releases/${projectName}: ${e.message}`, 'error'); return;
    }

    document.getElementById('btn-run-export').disabled = true;
    const langs = selectedLangs || State.project.languages.map(l => l.code);
    const baseLang = State.project.baseLanguage;
    const pages = State.pages;
    const total = langs.length * pages.length + 1;
    let done = 0;

    const tick = (msg) => {
      done++;
      UI.setExportProgress(Math.round((done / total) * 100), msg);
    };

    try {
      for (const lang of langs) {
        const isBase = lang === baseLang;

        // For base language: write to root. For others: write to lang/ subfolder
        let langDir;
        if (isBase) {
          langDir = destHandle;
        } else {
          langDir = await FileHandler.getDir(destHandle, lang, true);
        }

        // Build export context: used by template engine to compute correct
        // lang-switcher links relative to the current export language.
        const exportCtx = { exportLang: lang, baseLang };

        for (const page of pages) {
          tick(`Exporting ${lang}/${page.file}…`);

          // Read source HTML
          const rawHtml = await ProjectManager.readPage(page.file);
          if (!rawHtml) continue;

          // Process: inject components + resolve tokens for this lang.
          // Pass exportCtx so the language switcher links are computed correctly.
          let exported = Preview._processPageHtml(rawHtml, page.file, lang, exportCtx);

          // Update <html lang="…"> to match the export language
          exported = Preview._injectLangAttribute(exported, lang);

          // Inject hreflang <link> tags for all language versions (SEO)
          const allLangs = State.project.languages || [];
          const canonicalBase = State.project?.canonicalBase || null;
          exported = Preview._injectHreflang(exported, page.file, lang, allLangs, baseLang, canonicalBase);

          // Inject page metadata (title, description, OG tags, canonical)
          exported = this._injectPageMetadata(exported, page, lang);

          // Inject theme based on cssMode — export mode
          const cssMode = State.project?.cssMode || 'tailwind-cdn';
          const theme = State.project?.theme;
          if (theme && cssMode === 'tailwind-cdn') {
            exported = ThemeEngine.injectConfig(exported, theme);
            exported = ThemeEngine.injectFontsLink(exported, theme);
          } else if (theme && cssMode === 'tailwind-local') {
            exported = ThemeEngine.injectFontsLink(exported, theme);
          }
          // cssMode === 'custom': no ThemeEngine injection

          // Inject custom head code (from Project Settings, all pages, export only)
          exported = this._injectHeadCode(exported);

          // Fix asset paths for non-base languages (prepend ../ to non-HTML assets)
          if (!isBase) {
            exported = this._fixRelativePaths(exported);
          }

          await FileHandler.writeFile(langDir, page.file, exported);
        }
      }

      // Copy assets folder if it exists
      tick('Copying assets…');
      if (await FileHandler.dirExists(State.projectHandle, 'assets')) {
        const srcAssets = await FileHandler.getDir(State.projectHandle, 'assets');
        await this._copyDirRecursive(srcAssets, await FileHandler.getDir(destHandle, 'assets', true));
      }

      UI.showExportResult(
        `✓ Exported ${pages.length} pages × ${langs.length} languages to releases/${projectName}/`,
        true
      );
      Utils.showToast('Export complete!', 'info');
    } catch (e) {
      UI.showExportResult(`Export failed: ${e.message}`, false);
      Utils.showToast('Export failed.', 'error');
      console.error('Export error:', e);
    }
  },

  // ── Inject page metadata into <head> ─────────────────────────────────────────
  // Inserts/replaces <title>, <meta name="description">, OG tags, and canonical
  // based on the page.meta object stored in project.json.
  // Only injects fields that have a non-empty value.
  _injectPageMetadata(html, page, lang) {
    const meta = page?.meta;
    if (!meta) return html;

    const title       = meta.title       || '';
    const desc        = meta.description  || '';
    const ogTitle     = meta.ogTitle      || title;
    const ogDesc      = meta.ogDescription || desc;
    const ogImage     = meta.ogImage      || '';
    const canonical   = meta.canonical    || '';

    // Build the tags to inject
    let tags = '';

    if (title) {
      // Replace existing <title> or inject new one
      if (/<title[\s>]/i.test(html)) {
        html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
      } else {
        tags += `  <title>${title}</title>\n`;
      }
    }

    if (desc) {
      // Remove existing description meta if present
      html = html.replace(/<meta\s[^>]*name=["']description["'][^>]*>/gi, '');
      tags += `  <meta name="description" content="${desc.replace(/"/g, '&quot;')}">\n`;
    }
    if (ogTitle) {
      html = html.replace(/<meta\s[^>]*property=["']og:title["'][^>]*>/gi, '');
      tags += `  <meta property="og:title" content="${ogTitle.replace(/"/g, '&quot;')}">\n`;
    }
    if (ogDesc) {
      html = html.replace(/<meta\s[^>]*property=["']og:description["'][^>]*>/gi, '');
      tags += `  <meta property="og:description" content="${ogDesc.replace(/"/g, '&quot;')}">\n`;
    }
    if (ogImage) {
      html = html.replace(/<meta\s[^>]*property=["']og:image["'][^>]*>/gi, '');
      tags += `  <meta property="og:image" content="${ogImage.replace(/"/g, '&quot;')}">\n`;
    }
    if (canonical) {
      html = html.replace(/<link\s[^>]*rel=["']canonical["'][^>]*>/gi, '');
      tags += `  <link rel="canonical" href="${canonical.replace(/"/g, '&quot;')}">\n`;
    }

    // Inject remaining tags before </head>
    if (tags) {
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${tags}</head>`);
      } else {
        html = tags + html;
      }
    }

    return html;
  },

  // ── Inject custom head code (Project Settings → Custom Head Code) ────────────
  // Appends user-defined code immediately before </head> on every exported page.
  // This is intentionally NOT applied during preview — scripts like GA would fire
  // in the editor and are irrelevant / potentially disruptive during development.
  _injectHeadCode(html) {
    const code = State.project?.headInject;
    if (!code || !code.trim()) return html;
    const snippet = '\n' + code.trim() + '\n';
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${snippet}</head>`);
    }
    // No </head> found — append to start as a fallback
    return snippet + html;
  },

  // ── Fix asset relative paths for language subdirectory pages ─────────────────
  // Prepends ../ to asset paths (CSS, JS, images, fonts) but intentionally
  // leaves .html page-to-page links intact — they are already correct relative
  // to the language subdir because all pages share the same filename structure.
  _fixRelativePaths(html) {
    return html
      .replace(/(src|href)="(?!https?:\/\/|\/\/|#|data:|mailto:|tel:)(.*?)"/g, (match, attr, path) => {
        if (!path) return match;
        if (path.startsWith('../') || path.startsWith('/')) return match;
        // Keep .html inter-page links as-is — they resolve correctly within same lang dir
        if (/\.html(\?|#|$)/.test(path)) return match;
        return `${attr}="../${path}"`;
      })
      .replace(/(url\()(?!['"]?https?:\/\/|['"]?\/\/|['"]?data:)(['"]?)(.*?)(['"]?)(\))/g,
        (match, pre, q1, path, q2, post) => {
          if (!path || path.startsWith('../') || path.startsWith('/')) return match;
          return `${pre}${q1}../${path}${q2}${post}`;
        });
  },

  // ── Recursively copy a directory ──────────────────────────────────────────────
  async _copyDirRecursive(srcDir, destDir) {
    const entries = await FileHandler.listEntries(srcDir);
    for (const entry of entries) {
      if (entry.kind === 'file') {
        const file = await entry.handle.getFile();
        const buf = await file.arrayBuffer();
        const fh = await destDir.getFileHandle(entry.name, { create: true });
        const writable = await fh.createWritable();
        await writable.write(buf);
        await writable.close();
      } else if (entry.kind === 'directory') {
        const subDest = await FileHandler.getDir(destDir, entry.name, true);
        await this._copyDirRecursive(entry.handle, subDest);
      }
    }
  },
};