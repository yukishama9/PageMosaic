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

  // ── Process page HTML: inject components, resolve templates ──────────────────
  _processPageHtml(html, filename, lang) {
    let processed = html;

    // Inject component markup in place of <!-- @component:id --> markers
    processed = this._injectComponents(processed, filename, lang);

    // Resolve template tokens
    processed = this._resolveTokens(processed, filename, lang);

    return processed;
  },

  // ── Inject component HTML into page ─────────────────────────────────────────
  // Strategy 1: replace full marker blocks <!-- @component:id -->...<!-- /@component:id -->
  // Strategy 2: replace any remaining bare opening markers <!-- @component:id -->
  // This prevents double-injection when the source HTML already contains filled marker blocks.
  _injectComponents(html, filename, lang) {
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
        const compHtml = this._processComponentHtml(comp.html, lang, filename);
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
      const compHtml = this._processComponentHtml(comp.html, lang, filename);
      return `<!-- @component:${id} -->\n${compHtml}\n<!-- /@component:${id} -->`;
    });

    return result;
  },

  // ── Process a single component's HTML ────────────────────────────────────────
  _processComponentHtml(html, lang, pageName) {
    if (!html) return '';
    let processed = html;

    // Process @each loops
    processed = this._processEachLoops(processed, lang);

    // Resolve tokens
    processed = this._resolveTokens(processed, pageName || '', lang);

    return processed;
  },

  // ── Process @each:id loops ────────────────────────────────────────────────────
  _processEachLoops(html, lang) {
    return html.replace(
      /<!--\s*@each:([\w-]+)\s*-->([\s\S]*?)<!--\s*@\/each\s*-->/g,
      (match, dataId, template) => {
        const data = State.sharedData[dataId];
        if (!data || !data.items) return '';

        return data.items.map(item => {
          let row = template;

          // Replace {{item.field}} tokens
          row = row.replace(/\{\{item\.([\w.]+)\}\}/g, (m, fieldKey) => {
            return Utils.escapeHtml(item[fieldKey] || '');
          });

          // Replace {{t:item.i18nKey}} — look up item's i18n key
          row = row.replace(/\{\{t:item\.([\w.]+)\}\}/g, (m, fieldKey) => {
            const i18nKey = item[fieldKey];
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

  // ── Change preview language ───────────────────────────────────────────────────
  setLanguage(lang) {
    State.previewLanguage = lang;
    if (State.activeView === 'page-editor') this.renderCurrentPage();
    else if (State.activeView === 'component-editor' && State.activeComponent) {
      this.renderComponent(State.activeComponent);
    }
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

        for (const page of pages) {
          tick(`Exporting ${lang}/${page.file}…`);

          // Read source HTML
          const rawHtml = await ProjectManager.readPage(page.file);
          if (!rawHtml) continue;

          // Process: inject components + resolve tokens for this lang
          let exported = Preview._processPageHtml(rawHtml, page.file, lang);

          // Fix asset paths for non-base languages (adjust relative paths up one level)
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

  // ── Fix asset relative paths for language subdirectory pages ─────────────────
  _fixRelativePaths(html) {
    // Prepend ../ to relative src/href paths (not http:// or // or #)
    return html
      .replace(/(src|href)="(?!https?:\/\/|\/\/|#|data:)(.*?)"/g, (match, attr, path) => {
        if (path.startsWith('../') || path.startsWith('/')) return match;
        return `${attr}="../${path}"`;
      })
      .replace(/(url\()(?!['"]?https?:\/\/|['"]?\/\/|['"]?data:)(['"]?)(.*?)(['"]?)(\))/g,
        (match, pre, q1, path, q2, post) => {
          if (path.startsWith('../') || path.startsWith('/')) return match;
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