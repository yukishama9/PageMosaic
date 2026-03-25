/* ===== wb-project.js — Project Management ===== */

// ── Electron native filesystem proxy ─────────────────────────────────────────
// When running inside Electron, we use the native electronAPI instead of the
// browser FileSystem Access API. This gives us real filesystem paths that can
// be persisted across sessions via Electron's config store.
//
// ElectronDirHandle mimics the minimal FileSystemDirectoryHandle interface used
// by FileHandler so the rest of the codebase works without changes.
class ElectronDirHandle {
  constructor(dirPath) {
    this._path = dirPath;
    this.name = dirPath.split(/[\\/]/).filter(Boolean).pop() || dirPath;
    this.kind = 'directory';
  }
  // Internal helpers used by FileHandler-compatible shims
  get fullPath() { return this._path; }
}

// Override key FileHandler methods to work with ElectronDirHandle
// (called once at startup when Electron is detected)
function patchFileHandlerForElectron() {
  if (!window.electronAPI || FileHandler._electronPatched) return;
  FileHandler._electronPatched = true;

  const api = window.electronAPI;
  const nodePath = { join: (...p) => p.join('/').replace(/\/+/g, '/') };

  // Helper: resolve a handle (may be ElectronDirHandle or native FSHandle) to a path
  const resolvePath = (handle) => handle instanceof ElectronDirHandle ? handle._path : null;

  // Wrap the original methods — fall through to original if handle is not Electron
  const origListEntries = FileHandler.listEntries.bind(FileHandler);
  FileHandler.listEntries = async function(handle) {
    const p = resolvePath(handle);
    if (!p) return origListEntries(handle);
    const entries = await api.listDir(p);
    return entries.map(e => ({
      name: e.name,
      kind: e.kind,
      fullPath: e.fullPath,
      handle: e.kind === 'directory' ? new ElectronDirHandle(e.fullPath) : { name: e.name, _path: e.fullPath, kind: 'file', getFile: async () => ({ text: async () => api.readFile(e.fullPath) || '', arrayBuffer: async () => { const t = await api.readFile(e.fullPath); return new TextEncoder().encode(t || '').buffer; } }) },
    }));
  };

  const origGetDir = FileHandler.getDir.bind(FileHandler);
  FileHandler.getDir = async function(handle, name, create = false) {
    const p = resolvePath(handle);
    if (!p) return origGetDir(handle, name, create);
    const fullPath = p.replace(/\\/g, '/') + '/' + name;
    if (create) await api.mkdir(fullPath);
    return new ElectronDirHandle(fullPath);
  };

  const origDirExists = FileHandler.dirExists.bind(FileHandler);
  FileHandler.dirExists = async function(handle, name) {
    const p = resolvePath(handle);
    if (!p) return origDirExists(handle, name);
    const fullPath = p.replace(/\\/g, '/') + '/' + name;
    return api.exists(fullPath);
  };

  const origReadFile = FileHandler.readFile.bind(FileHandler);
  FileHandler.readFile = async function(handle, filename) {
    const p = resolvePath(handle);
    if (!p) return origReadFile(handle, filename);
    return api.readFile(p.replace(/\\/g, '/') + '/' + filename);
  };

  const origWriteFile = FileHandler.writeFile.bind(FileHandler);
  FileHandler.writeFile = async function(handle, filename, content) {
    const p = resolvePath(handle);
    if (!p) return origWriteFile(handle, filename, content);
    return api.writeFile(p.replace(/\\/g, '/') + '/' + filename, content);
  };

  const origWriteJSON = FileHandler.writeJSON.bind(FileHandler);
  FileHandler.writeJSON = async function(handle, filename, obj) {
    const p = resolvePath(handle);
    if (!p) return origWriteJSON(handle, filename, obj);
    return api.writeFile(p.replace(/\\/g, '/') + '/' + filename, JSON.stringify(obj, null, 2));
  };

  const origReadJSON = FileHandler.readJSON.bind(FileHandler);
  FileHandler.readJSON = async function(handle, filename) {
    const p = resolvePath(handle);
    if (!p) return origReadJSON(handle, filename);
    const raw = await api.readFile(p.replace(/\\/g, '/') + '/' + filename);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const origFileExists = FileHandler.fileExists.bind(FileHandler);
  FileHandler.fileExists = async function(handle, filename) {
    const p = resolvePath(handle);
    if (!p) return origFileExists(handle, filename);
    return api.exists(p.replace(/\\/g, '/') + '/' + filename);
  };

  const origDeleteFile = FileHandler.deleteFile.bind(FileHandler);
  FileHandler.deleteFile = async function(handle, filename) {
    const p = resolvePath(handle);
    if (!p) return origDeleteFile(handle, filename);
    return api.deleteFile(p.replace(/\\/g, '/') + '/' + filename);
  };

  // verifyPermission is a no-op for Electron handles (native FS is always accessible)
  const origVerifyPermission = FileHandler.verifyPermission.bind(FileHandler);
  FileHandler.verifyPermission = async function(handle, readWrite, silent) {
    if (handle instanceof ElectronDirHandle) return true;
    return origVerifyPermission(handle, readWrite, silent);
  };

  // persistHandle / restoreHandle are no-ops for Electron (we use config:save instead)
  const origPersistHandle = FileHandler.persistHandle.bind(FileHandler);
  FileHandler.persistHandle = async function(key, handle) {
    if (handle instanceof ElectronDirHandle) return; // no-op; path already saved in config
    return origPersistHandle(key, handle);
  };

  const origRestoreHandle = FileHandler.restoreHandle.bind(FileHandler);
  FileHandler.restoreHandle = async function(key) {
    const result = await origRestoreHandle(key);
    // If nothing in IndexedDB, still return null — Electron paths come from config
    return result;
  };
}

const ProjectManager = {

  // ── Setup: get or init the projects/ and releases/ workspace handles ─────────
  async setupWorkspace() {
    // In Electron, patch FileHandler to use native FS and load saved paths from config
    if (window.electronAPI) {
      patchFileHandlerForElectron();
      const cfg = await window.electronAPI.loadConfig().catch(() => ({}));
      if (cfg.projectsPath && !State.workspaceProjectsHandle) {
        const exists = await window.electronAPI.exists(cfg.projectsPath);
        if (exists) State.workspaceProjectsHandle = new ElectronDirHandle(cfg.projectsPath);
      }
      if (cfg.releasesPath && !State.workspaceReleasesHandle) {
        const exists = await window.electronAPI.exists(cfg.releasesPath);
        if (exists) State.workspaceReleasesHandle = new ElectronDirHandle(cfg.releasesPath);
      }
      return !!(State.workspaceProjectsHandle && State.workspaceReleasesHandle);
    }

    // Browser (web) mode: use FileSystem Access API with IndexedDB handle persistence
    // Use silent=true — called on page load without a user gesture, so we must
    // only query permission (not prompt). If not already granted, the handle is
    // cleared and the user will be asked to re-select on next interaction.
    State.workspaceProjectsHandle = await FileHandler.restoreHandle('wb-projects-dir');
    State.workspaceReleasesHandle = await FileHandler.restoreHandle('wb-releases-dir');

    if (State.workspaceProjectsHandle) {
      const ok = await FileHandler.verifyPermission(State.workspaceProjectsHandle, true, true);
      if (!ok) State.workspaceProjectsHandle = null;
    }
    if (State.workspaceReleasesHandle) {
      const ok = await FileHandler.verifyPermission(State.workspaceReleasesHandle, true, true);
      if (!ok) State.workspaceReleasesHandle = null;
    }

    return !!(State.workspaceProjectsHandle && State.workspaceReleasesHandle);
  },

  async pickProjectsFolder() {
    Utils.showToast('Select your "projects" folder…', 'info');

    if (window.electronAPI) {
      const dirPath = await window.electronAPI.openDirectory({ title: 'Select your "projects" folder' });
      if (!dirPath) return false;
      State.workspaceProjectsHandle = new ElectronDirHandle(dirPath);
      await this._saveElectronConfig();
      return true;
    }

    const handle = await FileHandler.pickDirectory('wb-projects', 'documents');
    if (!handle) return false;
    const ok = await FileHandler.verifyPermission(handle);
    if (!ok) return false;
    State.workspaceProjectsHandle = handle;
    await FileHandler.persistHandle('wb-projects-dir', handle);
    return true;
  },

  async pickReleasesFolder() {
    Utils.showToast('Select your "releases" folder…', 'info');

    if (window.electronAPI) {
      const dirPath = await window.electronAPI.openDirectory({ title: 'Select your "releases" folder' });
      if (!dirPath) return false;
      State.workspaceReleasesHandle = new ElectronDirHandle(dirPath);
      await this._saveElectronConfig();
      return true;
    }

    const handle = await FileHandler.pickDirectory('wb-releases', 'documents');
    if (!handle) return false;
    const ok = await FileHandler.verifyPermission(handle);
    if (!ok) return false;
    State.workspaceReleasesHandle = handle;
    await FileHandler.persistHandle('wb-releases-dir', handle);
    return true;
  },

  // Save Electron workspace paths (and any other config keys) to the native config file
  async _saveElectronConfig(extra = {}) {
    if (!window.electronAPI) return;
    const existing = await window.electronAPI.loadConfig().catch(() => ({}));
    const cfg = Object.assign({}, existing, {
      projectsPath: State.workspaceProjectsHandle instanceof ElectronDirHandle
        ? State.workspaceProjectsHandle._path : (existing.projectsPath || null),
      releasesPath: State.workspaceReleasesHandle instanceof ElectronDirHandle
        ? State.workspaceReleasesHandle._path : (existing.releasesPath || null),
      ...extra,
    });
    await window.electronAPI.saveConfig(cfg);
  },

  // Ensure workspace is set up, prompting user if needed
  async ensureWorkspace() {
    if (State.workspaceProjectsHandle && State.workspaceReleasesHandle) return true;
    const ok = await this.setupWorkspace();
    if (!ok) {
      // Guide user through selecting folders
      if (!State.workspaceProjectsHandle) {
        Utils.showToast('First, select your "projects" storage folder.', 'info');
        const r = await this.pickProjectsFolder();
        if (!r) return false;
      }
      if (!State.workspaceReleasesHandle) {
        Utils.showToast('Now select your "releases" output folder.', 'info');
        const r = await this.pickReleasesFolder();
        if (!r) return false;
      }
    }
    return true;
  },

  // ── List all projects in projects/ folder ─────────────────────────────────────
  async listProjects() {
    if (!State.workspaceProjectsHandle) return [];
    const entries = await FileHandler.listEntries(State.workspaceProjectsHandle);
    const projects = [];
    for (const entry of entries) {
      if (entry.kind !== 'directory') continue;
      const projectJson = await FileHandler.readJSON(entry.handle, 'project.json');
      if (projectJson) {
        projects.push({ name: entry.name, title: projectJson.title || entry.name, handle: entry.handle, meta: projectJson });
      }
    }
    return projects;
  },

  // ── Open existing project from projects/ ─────────────────────────────────────
  async openProject() {
    const ready = await this.ensureWorkspace();
    if (!ready) return false;

    // List available projects
    const projects = await this.listProjects();

    if (projects.length === 0) {
      Utils.showToast('No projects found. Create a new one or import an existing site.', 'info');
      // Fall back to manual folder picker
      return this._openProjectFromPicker();
    }

    // Show project picker modal
    return new Promise(resolve => {
      UI.showProjectPicker(projects, async (chosen) => {
        if (!chosen) { resolve(false); return; }
        let handle;
        if (chosen === '__pick__') {
          handle = await FileHandler.pickDirectory('project-open', 'documents');
          if (!handle) { resolve(false); return; }
          await FileHandler.verifyPermission(handle);
        } else if (chosen.handle) {
          // Full handle returned from UI picker — verify permission
          handle = chosen.handle;
          const ok = await FileHandler.verifyPermission(handle);
          if (!ok) { Utils.showToast('Permission denied for project folder.', 'error'); resolve(false); return; }
        } else if (chosen.name && State.workspaceProjectsHandle) {
          // Fallback: look up by name inside workspaceProjectsHandle
          try {
            handle = await FileHandler.getDir(State.workspaceProjectsHandle, chosen.name, false);
            const ok = await FileHandler.verifyPermission(handle);
            if (!ok) { Utils.showToast('Permission denied for project folder.', 'error'); resolve(false); return; }
          } catch (e) {
            Utils.showToast(`Could not open project "${chosen.name}": ${e.message}`, 'error');
            resolve(false); return;
          }
        } else {
          Utils.showToast('Unable to open selected project.', 'error');
          resolve(false); return;
        }
        const project = await FileHandler.readJSON(handle, 'project.json');
        if (!project) { Utils.showToast('Invalid project folder — no project.json found.', 'error'); resolve(false); return; }
        await this._loadProject(handle, project);
        await FileHandler.persistHandle('last-project', handle);
        resolve(true);
      });
    });
  },

  async _openProjectFromPicker() {
    const handle = await FileHandler.pickDirectory('project-open', 'documents');
    if (!handle) return false;
    await FileHandler.verifyPermission(handle);
    const project = await FileHandler.readJSON(handle, 'project.json');
    if (!project) { Utils.showToast('No project.json found.', 'error'); return false; }
    await this._loadProject(handle, project);
    await FileHandler.persistHandle('last-project', handle);
    return true;
  },

  // ── Create new project in projects/ ──────────────────────────────────────────
  async createProject(name, title, baseLang) {
    const ready = await this.ensureWorkspace();
    if (!ready) return false;

    if (!name) { Utils.showToast('Project name is required.', 'error'); return false; }

    // Create project subdirectory inside projects/
    let projectHandle;
    try {
      projectHandle = await FileHandler.getDir(State.workspaceProjectsHandle, name, true);
    } catch (e) {
      Utils.showToast(`Could not create folder "${name}": ${e.message}`, 'error');
      return false;
    }

    await this._scaffoldProject(projectHandle, name, title, baseLang);
    const project = await FileHandler.readJSON(projectHandle, 'project.json');
    await this._loadProject(projectHandle, project);
    await FileHandler.persistHandle('last-project', projectHandle);
    return true;
  },

  // ── Import existing HTML site → copy to projects/ ────────────────────────────
  async importProject() {
    const ready = await this.ensureWorkspace();
    if (!ready) return false;

    Utils.showToast('Select the folder containing your existing HTML site…', 'info');
    const srcHandle = await FileHandler.pickDirectory('import-source', 'documents');
    if (!srcHandle) return false;

    const srcOk = await FileHandler.verifyPermission(srcHandle);
    if (!srcOk) return false;

    // Scan for HTML files in source
    const srcEntries = await FileHandler.listEntries(srcHandle);
    const htmlFiles = srcEntries.filter(e => e.kind === 'file' && e.name.endsWith('.html'));

    if (htmlFiles.length === 0) {
      Utils.showToast('No HTML files found in the selected folder.', 'error');
      return false;
    }

    const projectName = Utils.sanitizeFilename(srcHandle.name) || 'imported-site';

    // Create destination folder in projects/
    let destHandle;
    try {
      destHandle = await FileHandler.getDir(State.workspaceProjectsHandle, projectName, true);
    } catch (e) {
      Utils.showToast(`Cannot create projects/${projectName}: ${e.message}`, 'error');
      return false;
    }

    Utils.showToast(`Copying files to projects/${projectName}…`, 'info');

    // Copy all files from source to destination (recursively)
    await this._copyDirRecursive(srcHandle, destHandle, srcEntries);

    Utils.showToast('Extracting components from index.html…', 'info');

    // ── Phase 1: Extract components from index.html only ──────────────────────
    const extracted = await this._extractFromIndex(destHandle, htmlFiles);
    const detectedLangs = await this._detectLanguages(srcHandle, srcEntries);

    // Create project structure directories
    const compDir = await FileHandler.getDir(destHandle, 'components', true);
    const sdDir = await FileHandler.getDir(destHandle, 'shared-data', true);
    const i18nDir = await FileHandler.getDir(destHandle, 'i18n', true);

    // Write extracted components
    const componentMetas = [];
    for (const comp of extracted.components) {
      await FileHandler.writeFile(compDir, `${comp.id}.html`, comp.html);
      await FileHandler.writeJSON(compDir, `${comp.id}.schema.json`, comp.schema);
      componentMetas.push({ id: comp.id, label: comp.label, htmlFile: `${comp.id}.html`, schemaFile: `${comp.id}.schema.json` });
    }

    // Write shared data (menus, social links)
    const sharedDataMetas = [];
    for (const sd of extracted.sharedData) {
      await FileHandler.writeJSON(sdDir, `${sd.id}.json`, sd);
      sharedDataMetas.push({ id: sd.id, label: sd.label, file: `${sd.id}.json` });
    }

    // Build i18n files
    const baseLang = detectedLangs.baseLang;
    const baseI18n = {};
    await FileHandler.writeJSON(i18nDir, `${baseLang}.json`, baseI18n);

    const langEntries = [{ code: baseLang, display: baseLang.toUpperCase(), label: baseLang, isBase: true }];
    for (const lang of detectedLangs.others) {
      await FileHandler.writeJSON(i18nDir, `${lang.code}.json`, lang.i18nData || {});
      langEntries.push({ code: lang.code, display: lang.display || lang.code.toUpperCase(), label: lang.code, isBase: false });
    }

    // Detect CSS mode and theme tokens from index.html (or first HTML file)
    const primaryHtmlFile = htmlFiles.find(f => f.name === 'index.html') || htmlFiles[0];
    const primaryHtmlContent = await FileHandler.readFile(destHandle, primaryHtmlFile.name) || '';
    const detectedCssMode = this._detectCssMode(primaryHtmlContent);
    const detectedTheme = this._extractThemeFromHtml(primaryHtmlContent);

    // Build and write project.json (initial — before sync)
    const project = {
      name: projectName,
      title: srcHandle.name,
      baseLanguage: baseLang,
      languages: langEntries,
      pages: htmlFiles.map(f => ({ file: f.name, title: Utils.basename(f.name) })),
      components: componentMetas,
      sharedData: sharedDataMetas,
      cssMode: detectedCssMode,
      ...(detectedTheme ? { theme: detectedTheme } : {}),
      importedFrom: srcHandle.name,
      created: Utils.formatDate(),
      lastModified: Utils.formatDate(),
    };
    await FileHandler.writeJSON(destHandle, 'project.json', project);

    // ── Phase 2: Ask user whether to sync components to other pages ───────────
    if (extracted.components.length > 0) {
      // Store pending sync info for use in confirmImportComponents
      this._pendingImportSync = {
        destHandle,
        project,
        components: extracted.components,
        htmlFiles,
      };

      // Show confirmation modal — execution continues in confirmImportComponents()
      UI.showImportConfirmModal(
        extracted.components.map(c => ({ id: c.id, label: c.label })),
        async (doSync) => {
          await this._finishImport(doSync);
        }
      );
    } else {
      // No components found — finish directly
      await this._finishImport(false);
    }

    return true;
  },

  // ── Finish import after user confirms (or declines) sync ──────────────────────
  async _finishImport(doSync) {
    UI.closeModal('modal-import-confirm');
    const pending = this._pendingImportSync;
    this._pendingImportSync = null;
    if (!pending) return;

    const { destHandle, project, components, htmlFiles } = pending;

    if (doSync && htmlFiles.length > 1) {
      Utils.showToast('Rebuilding all pages from index.html template…', 'info');
      const indexHtml = await FileHandler.readFile(destHandle, 'index.html') || '';
      const report = await this._syncFromIndexTemplate(destHandle, indexHtml, htmlFiles);
      const synced = report.filter(r => r.status === 'synced').length;
      const failed = report.filter(r => r.status === 'failed').length;
      Utils.showToast(
        `Synced ${synced} page(s) from index.html template${failed > 0 ? ` (${failed} failed)` : ''}.`,
        'info', 4000
      );
    }

    await this._loadProject(destHandle, project);
    await FileHandler.persistHandle('last-project', destHandle);

    Utils.showToast(
      `Imported "${project.title}" → projects/${project.name}. ${project.components.length} component(s) extracted.`,
      'info', 5000
    );
  },

  // ── Extract components exclusively from index.html ────────────────────────────
  // Returns { components: [...], sharedData: [...] }
  // Same detection logic as _autoDetectComponents but reads only index.html.
  // Respects existing @component markers (extracts content between them).
  async _extractFromIndex(dirHandle, htmlFileEntries) {
    const components = [];
    const sharedData = [];

    // Always use index.html as source; fall back to first HTML file
    const primaryFile = htmlFileEntries.find(f => f.name === 'index.html') || htmlFileEntries[0];
    const primaryHtml = await FileHandler.readFile(dirHandle, primaryFile.name) || '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(primaryHtml, 'text/html');

    // Helper: extract content between @component markers from raw HTML string
    const extractMarkerContent = (html, id) => {
      const start = `<!-- @component:${id} -->`;
      const end = `<!-- /@component:${id} -->`;
      const si = html.indexOf(start);
      const ei = html.indexOf(end);
      if (si !== -1 && ei !== -1 && ei > si) {
        return html.slice(si + start.length, ei).trim();
      }
      return null;
    };

    // ── navbar ────────────────────────────────────────────────────────────────
    let navbarHtml = extractMarkerContent(primaryHtml, 'navbar')
                  || extractMarkerContent(primaryHtml, 'header');
    if (!navbarHtml) {
      const el = this._findElement(doc, [
        'header', '[class*="header"]', '[id*="header"]',
        '[class*="navbar"]', '[id*="navbar"]', '[class*="nav-bar"]',
        '[class*="top-bar"]', '[id*="top-bar"]', 'nav',
      ]);
      if (el) navbarHtml = el.outerHTML;
    }
    if (navbarHtml) {
      const navEl = parser.parseFromString(navbarHtml, 'text/html').body.firstElementChild
                 || parser.parseFromString(navbarHtml, 'text/html').body;
      const navLinks = this._extractNavLinks(navEl || doc.body, 'main-menu');
      if (navLinks.items.length > 0) sharedData.push(navLinks);

      components.push({
        id: 'navbar',
        label: 'Navigation Bar',
        html: navbarHtml,
        schema: {
          id: 'navbar',
          label: 'Navigation Bar',
          description: 'Site header with navigation. Extracted from index.html.',
          selector: 'header, nav, [class*="navbar"], [class*="nav-bar"], [class*="header"], [id*="navbar"], [id*="header"]',
          fields: [
            { key: 'logo_text', label: 'Logo Text', type: 'text', i18n: false, value: this._extractLogoText(navEl || doc.body) },
            { key: 'logo_href', label: 'Logo Link', type: 'url', i18n: false, value: 'index.html' },
            { key: 'cta_href', label: 'CTA Link', type: 'url', i18n: false, value: 'contact.html' },
          ],
          sharedDataRefs: navLinks.items.length > 0 ? ['main-menu', 'languages'] : [],
        },
      });
    }

    // ── footer ────────────────────────────────────────────────────────────────
    let footerHtml = extractMarkerContent(primaryHtml, 'footer');
    if (!footerHtml) {
      const el = this._findElement(doc, [
        'footer', '[class*="footer"]', '[id*="footer"]', '[class*="site-footer"]',
      ]);
      if (el) footerHtml = el.outerHTML;
    }
    if (footerHtml) {
      const footEl = parser.parseFromString(footerHtml, 'text/html').body.firstElementChild
                  || parser.parseFromString(footerHtml, 'text/html').body;
      const socialLinks = this._extractSocialLinks(footEl || doc.body);
      if (socialLinks.items.length > 0) sharedData.push(socialLinks);

      components.push({
        id: 'footer',
        label: 'Footer',
        html: footerHtml,
        schema: {
          id: 'footer',
          label: 'Footer',
          description: 'Site footer. Extracted from index.html.',
          selector: 'footer, [class*="footer"], [id*="footer"]',
          fields: [
            { key: 'logo_text', label: 'Footer Logo', type: 'text', i18n: false, value: this._extractLogoText(footEl || doc.body) },
            { key: 'footer.copyright', label: 'Copyright', type: 'i18n-ref', i18n: true, i18nKey: 'footer.copyright', defaultValue: '' },
          ],
          sharedDataRefs: socialLinks.items.length > 0 ? ['main-menu', 'social-links'] : ['main-menu'],
        },
      });
    }

    // ── cookie-banner ─────────────────────────────────────────────────────────
    let cookieHtml = extractMarkerContent(primaryHtml, 'cookie-banner');
    if (!cookieHtml) {
      const el = this._findElement(doc, [
        '[id*="cookie"]', '[class*="cookie"]',
        '[class*="consent"]', '[id*="consent"]',
        '[class*="gdpr"]', '[id*="gdpr"]',
      ]);
      if (el && !el.closest('header') && !el.closest('footer')) {
        // Include any immediately following <script> block (cookie logic)
        let raw = el.outerHTML;
        const nextSib = el.nextElementSibling;
        if (nextSib && nextSib.tagName === 'SCRIPT') raw += '\n' + nextSib.outerHTML;
        cookieHtml = raw;
      }
    }
    if (cookieHtml) {
      components.push({
        id: 'cookie-banner',
        label: 'Cookie Banner',
        html: cookieHtml,
        schema: {
          id: 'cookie-banner',
          label: 'Cookie Banner',
          description: 'GDPR cookie consent banner. Extracted from index.html.',
          selector: '[class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"]',
          fields: [],
          sharedDataRefs: [],
        },
      });
    }

    return { components, sharedData };
  },

  // ── Sync all pages from index.html template ────────────────────────────────────
  // Rebuilds every non-index page by:
  //   1. Preserving the page's own <main>...</main> content and <title>
  //   2. Using index.html as the full structural template
  //   3. Injecting @component markers around known components
  //
  // Returns an array of { file, status, note }
  async _syncFromIndexTemplate(dirHandle, indexHtml, htmlFileEntries) {
    const report = [];
    const otherPages = htmlFileEntries.filter(f => f.name !== 'index.html');

    // Component definitions used to inject markers
    const componentDefs = [
      { id: 'navbar',        selectors: ['header', 'nav', '[class*="navbar"]', '[class*="nav-bar"]', '[class*="header"]', '[id*="navbar"]', '[id*="header"]'] },
      { id: 'footer',        selectors: ['footer', '[class*="footer"]', '[id*="footer"]'] },
      { id: 'cookie-banner', selectors: ['[id*="cookie"]', '[class*="cookie"]', '[class*="consent"]', '[id*="consent"]', '[class*="gdpr"]', '[id*="gdpr"]'] },
    ];

    // Build the "stamped" index template with @component markers
    const stampedIndex = this._injectComponentMarkers(indexHtml, componentDefs);

    // Update index.html with markers if needed
    if (stampedIndex !== indexHtml) {
      await FileHandler.writeFile(dirHandle, 'index.html', stampedIndex);
    }

    // Pre-extract all <style> blocks from the index template (for deduplication)
    const indexStyleContents = new Set(
      [...stampedIndex.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1].trim())
    );

    for (const pageEntry of otherPages) {
      try {
        const pageHtml = await FileHandler.readFile(dirHandle, pageEntry.name) || '';

        // Preserve this page's <main>...</main>
        const mainContent = this._extractMainContent(pageHtml);

        // Preserve this page's <title>
        const titleMatch = pageHtml.match(/<title[^>]*>[\s\S]*?<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[0] : null;

        // Collect page-specific <style> blocks (those NOT already present in index template)
        const pageStyleBlocks = [];
        for (const m of pageHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
          const content = m[1].trim();
          if (content && !indexStyleContents.has(content)) {
            pageStyleBlocks.push(`<style>\n${content}\n</style>`);
          }
        }

        // Start with the stamped index as template
        let result = stampedIndex;

        // Replace <main> with this page's own content
        if (mainContent !== null) {
          const mainRange = this._findTagRangeInRawHtml(result, 'main', null, null);
          if (mainRange) {
            result = result.slice(0, mainRange.start) + mainContent + result.slice(mainRange.end);
          } else {
            // index.html has no <main> — inject before </body>
            result = result.replace(/<\/body>/i, `${mainContent}\n</body>`);
          }
        }

        // Restore this page's <title>
        if (pageTitle) {
          result = result.replace(/<title[^>]*>[\s\S]*?<\/title>/i, pageTitle);
        }

        // Inject page-specific <style> blocks before </head>
        if (pageStyleBlocks.length > 0) {
          const injection = pageStyleBlocks.join('\n');
          if (/<\/head>/i.test(result)) {
            result = result.replace(/<\/head>/i, `${injection}\n</head>`);
          } else {
            result = injection + '\n' + result;
          }
        }

        await FileHandler.writeFile(dirHandle, pageEntry.name, result);
        report.push({ file: pageEntry.name, status: 'synced', note: 'rebuilt from index template' });
      } catch (e) {
        console.warn(`_syncFromIndexTemplate: failed on ${pageEntry.name}:`, e);
        report.push({ file: pageEntry.name, status: 'failed', note: e.message });
      }
    }

    return report;
  },

  // ── Inject @component markers into an HTML string ─────────────────────────────
  // Wraps detected component blocks with <!-- @component:id --> markers.
  // Uses DOMParser for element detection + _findTagRangeInRawHtml for accurate placement.
  // Already-marked components are skipped.
  _injectComponentMarkers(html, componentDefs) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const found = [];

    for (const def of componentDefs) {
      const markerStart = `<!-- @component:${def.id} -->`;
      if (html.includes(markerStart)) continue; // already marked

      const el = this._findElement(doc, def.selectors);
      if (!el) continue;

      // Skip elements nested inside other known components (e.g. nav inside header)
      const parentDef = componentDefs.find(d => d.id !== def.id && el.closest && (() => {
        try { return el.closest(d.selectors.join(',')); } catch { return false; }
      })());
      if (parentDef) continue;

      const tagName = el.tagName.toLowerCase();
      const idHint = el.id || null;
      const classHint = el.classList.length > 0 ? el.classList[0] : null;

      const range = this._findTagRangeInRawHtml(html, tagName, idHint, classHint);
      if (!range) continue;

      found.push({ id: def.id, range });
    }

    // Sort by position descending (insert from back to front to keep indices valid)
    found.sort((a, b) => b.range.start - a.range.start);

    let result = html;
    for (const { id, range } of found) {
      const block = result.slice(range.start, range.end);
      const marked = `<!-- @component:${id} -->\n${block}\n<!-- /@component:${id} -->`;
      result = result.slice(0, range.start) + marked + result.slice(range.end);
    }

    return result;
  },

  // ── Extract <main>...</main> from raw HTML ─────────────────────────────────────
  _extractMainContent(html) {
    const range = this._findTagRangeInRawHtml(html, 'main', null, null);
    if (!range) return null;
    return html.slice(range.start, range.end);
  },

  // ── Find a tag's character range in raw HTML ──────────────────────────────────
  // Locates the first occurrence of <tagName ...>...</tagName> in rawHtml where
  // the opening tag optionally matches idHint (id="...") or classHint (within class="...").
  // Returns { start, end } (character indices) or null if not found.
  // Handles simple nesting (e.g. <nav><nav>inner</nav></nav>).
  _findTagRangeInRawHtml(rawHtml, tagName, idHint, classHint) {
    const openRe = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
    const closeTag = `</${tagName}>`;
    const closeLower = closeTag.toLowerCase();

    let match;
    while ((match = openRe.exec(rawHtml)) !== null) {
      const attrs = (match[1] || '').toLowerCase();

      // If we have hints, verify this is the right element
      if (idHint && !attrs.includes(`id="${idHint.toLowerCase()}"`)) continue;
      if (!idHint && classHint) {
        // classHint must appear inside a class="..." attribute value
        if (!attrs.includes(classHint.toLowerCase())) continue;
      }

      const start = match.index;
      // Walk forward counting nesting to find the matching close tag
      let depth = 1;
      let pos = match.index + match[0].length;
      const lower = rawHtml.toLowerCase();

      // Void elements have no close tag — bail
      if (/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName)) {
        return { start, end: match.index + match[0].length };
      }

      while (depth > 0 && pos < lower.length) {
        const nextOpen = lower.indexOf(`<${tagName}`, pos);
        const nextClose = lower.indexOf(closeLower, pos);

        if (nextClose === -1) break; // malformed HTML

        if (nextOpen !== -1 && nextOpen < nextClose) {
          // Make sure it's really a tag open (not e.g. a class name in text)
          const charAfter = lower[nextOpen + 1 + tagName.length];
          if (charAfter === '>' || charAfter === ' ' || charAfter === '\t' || charAfter === '\n' || charAfter === '/') {
            depth++;
            pos = nextOpen + 1;
          } else {
            pos = nextOpen + 1;
          }
        } else {
          depth--;
          if (depth === 0) {
            return { start, end: nextClose + closeTag.length };
          }
          pos = nextClose + closeTag.length;
        }
      }
    }
    return null;
  },

  // ── Auto-detect reusable components from HTML files ───────────────────────────
  async _autoDetectComponents(dirHandle, htmlFileEntries) {
    const components = [];
    const sharedData = [];

    // Read first page to analyze (use index.html if present, else first HTML)
    const primaryFile = htmlFileEntries.find(f => f.name === 'index.html') || htmlFileEntries[0];
    const primaryHtml = await FileHandler.readFile(dirHandle, primaryFile.name) || '';

    // Read all pages html for cross-page comparison
    const allPageHtmls = [];
    for (const f of htmlFileEntries) {
      const html = await FileHandler.readFile(dirHandle, f.name) || '';
      allPageHtmls.push({ file: f.name, html });
    }

    // Use DOMParser to analyze
    const parser = new DOMParser();
    const doc = parser.parseFromString(primaryHtml, 'text/html');

    // ── Detect Header / Navbar ────────────────────────────────────────────────
    const headerEl = this._findElement(doc, [
      'header',
      '[class*="header"]', '[id*="header"]',
      '[class*="navbar"]', '[id*="navbar"]',
      '[class*="nav-bar"]', '[id*="nav-bar"]',
      '[class*="top-bar"]', '[id*="top-bar"]',
      'nav',   // plain <nav> element (most common pattern, checked last as broadest)
    ]);
    if (headerEl) {
      // Extract nav links for menu shared data
      const navLinks = this._extractNavLinks(headerEl, 'main-menu');
      if (navLinks.items.length > 0) {
        sharedData.push(navLinks);
      }

      const headerHtml = this._cleanComponentHtml(headerEl.outerHTML, navLinks);
      components.push({
        id: 'header',
        label: 'Header / Navbar',
        html: headerHtml,
        schema: {
          id: 'header',
          label: 'Header / Navbar',
          description: 'Site header with navigation. Imported from existing HTML.',
          fields: [
            { key: 'logo_text', label: 'Logo Text', type: 'text', i18n: false, value: this._extractLogoText(headerEl) },
            { key: 'logo_href', label: 'Logo Link', type: 'url', i18n: false, value: 'index.html' },
          ],
          sharedDataRefs: navLinks.items.length > 0 ? ['main-menu'] : [],
        },
      });

      // Replace in all pages
      await this._replaceInAllPages(dirHandle, allPageHtmls, headerEl.outerHTML, '<!-- @component:header -->');
    }

    // ── Detect Footer ──────────────────────────────────────────────────────────
    const footerEl = this._findElement(doc, [
      'footer',
      '[class*="footer"]', '[id*="footer"]',
      '[class*="site-footer"]', '[id*="site-footer"]',
    ]);
    if (footerEl) {
      // Extract social links from footer
      const socialLinks = this._extractSocialLinks(footerEl);
      if (socialLinks.items.length > 0) {
        sharedData.push(socialLinks);
      }

      // Extract footer nav links
      const footerNav = this._extractNavLinks(footerEl, 'footer-menu');
      if (footerNav.items.length > 0) {
        sharedData.push(footerNav);
      }

      const footerHtml = this._cleanComponentHtml(footerEl.outerHTML, footerNav, socialLinks);
      components.push({
        id: 'footer',
        label: 'Footer',
        html: footerHtml,
        schema: {
          id: 'footer',
          label: 'Footer',
          description: 'Site footer. Imported from existing HTML.',
          fields: [
            { key: 'logo_text', label: 'Footer Logo', type: 'text', i18n: false, value: this._extractLogoText(footerEl) },
            { key: 'footer.copyright', label: 'Copyright', type: 'i18n-ref', i18n: true, i18nKey: 'footer.copyright', defaultValue: '' },
          ],
          sharedDataRefs: [
            ...(footerNav.items.length > 0 ? ['footer-menu'] : []),
            ...(socialLinks.items.length > 0 ? ['social-links'] : []),
          ],
        },
      });

      await this._replaceInAllPages(dirHandle, allPageHtmls, footerEl.outerHTML, '<!-- @component:footer -->');
    }

    // ── Detect Cookie Banner ──────────────────────────────────────────────────
    const cookieEl = this._findElement(doc, [
      '[class*="cookie"]', '[id*="cookie"]',
      '[class*="consent"]', '[id*="consent"]',
      '[class*="gdpr"]', '[id*="gdpr"]',
    ]);
    if (cookieEl && !cookieEl.closest('header') && !cookieEl.closest('footer')) {
      components.push({
        id: 'cookie-banner',
        label: 'Cookie Banner',
        html: cookieEl.outerHTML,
        schema: {
          id: 'cookie-banner',
          label: 'Cookie Banner',
          description: 'GDPR cookie consent banner. Imported from existing HTML.',
          fields: [],
          sharedDataRefs: [],
        },
      });
      await this._replaceInAllPages(dirHandle, allPageHtmls, cookieEl.outerHTML, '<!-- @component:cookie-banner -->');
    }

    return { components, sharedData };
  },

  // ── HTML DOM helpers ──────────────────────────────────────────────────────────
  _findElement(doc, selectors) {
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        if (el) return el;
      } catch { /* invalid selector, skip */ }
    }
    return null;
  },

  _extractNavLinks(containerEl, id) {
    const links = [];
    const addedHrefs = new Set();

    // Find nav elements within container
    const navEls = containerEl.querySelectorAll('nav, [class*="nav-list"], [class*="menu-list"], ul li > a, nav a');
    const anchors = navEls.length > 0
      ? Array.from(containerEl.querySelectorAll('nav a, [class*="menu"] a, [class*="nav"] a'))
      : Array.from(containerEl.querySelectorAll('a'));

    for (const a of anchors) {
      const href = a.getAttribute('href') || '#';
      const text = (a.textContent || '').trim();
      if (!text || addedHrefs.has(href)) continue;
      if (href.startsWith('http') || href.startsWith('//')) continue; // skip external
      if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      if (text.length > 40) continue; // skip long text (probably not menu items)

      addedHrefs.add(href);
      const itemId = Utils.slugify(text) || Utils.generateId();
      links.push({
        id: itemId,
        label: text,
        i18nKey: `nav.${itemId}`,
        href,
      });

      if (links.length >= 12) break; // reasonable max
    }

    return {
      id,
      label: id === 'main-menu' ? 'Main Menu' : 'Footer Menu',
      type: 'menu',
      fields: [
        { key: 'label', label: 'Label', type: 'text', i18n: true },
        { key: 'href', label: 'URL', type: 'url', i18n: false },
      ],
      items: links,
    };
  },

  _extractSocialLinks(containerEl) {
    const socialDomains = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'github.com', 'tiktok.com', 'pinterest.com', 'weibo.com', 'wechat.com'];
    // Material Icons / SVG content patterns that indicate social/contact links
    const socialIconKeywords = ['share', 'alternate_email', 'post_add', 'rss_feed', 'chat', 'forum'];
    const items = [];
    const seenIds = new Set();

    const anchors = Array.from(containerEl.querySelectorAll('a'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const ariaLabel = (a.getAttribute('aria-label') || '').toLowerCase();
      const title = (a.getAttribute('title') || '').toLowerCase();
      const textContent = (a.textContent || '').trim();

      const svg = a.querySelector('svg');
      const iconEl = a.querySelector('.material-symbols-outlined, [class*="icon"], i');
      const iconText = (iconEl?.textContent || '').trim();

      // Detect as social if: known domain, aria/title label hints, SVG-only link, or known social icon name
      const hasDomain = socialDomains.some(d => href.includes(d));
      const hasIconOnly = (svg || iconEl) && textContent.length < 25;
      const hasIconKeyword = socialIconKeywords.includes(iconText)
        || socialDomains.some(d => ariaLabel.includes(d.replace('.com','')) || title.includes(d.replace('.com','')));

      const isSocial = hasDomain || hasIconOnly || hasIconKeyword;
      if (!isSocial) continue;

      // Skip pure nav links that happen to have an icon
      if (!svg && !iconEl && textContent.length > 5) continue;

      // Derive label from aria-label, title, SVG content hint, or icon name
      let label = (a.getAttribute('aria-label') || a.getAttribute('title') || '').trim();
      if (!label && hasDomain) {
        label = socialDomains.find(d => href.includes(d))?.replace('.com', '') || '';
      }
      if (!label && iconText) label = iconText;
      if (!label) label = 'Link';

      // Derive icon representation
      let icon = '';
      if (svg) {
        icon = svg.outerHTML;
      } else if (iconEl) {
        icon = iconText || 'link';
      }

      // Generate stable ID
      const platform = hasDomain
        ? (socialDomains.find(d => href.includes(d))?.replace('.com', '') || Utils.slugify(label))
        : Utils.slugify(label) || Utils.generateId();

      // Avoid exact duplicates by label+href
      const dedupeKey = `${platform}:${href}`;
      if (seenIds.has(dedupeKey)) continue;
      seenIds.add(dedupeKey);

      items.push({
        id: platform,
        label,
        icon,
        href,
      });
    }

    return {
      id: 'social-links',
      label: 'Social Links',
      type: 'icon-links',
      fields: [
        { key: 'label', label: 'Label', type: 'text', i18n: false },
        { key: 'icon', label: 'Icon (SVG or name)', type: 'text', i18n: false },
        { key: 'href', label: 'URL', type: 'url', i18n: false },
      ],
      items,
    };
  },

  _extractLogoText(containerEl) {
    const logo = containerEl.querySelector(
      '[class*="logo"], [id*="logo"], .brand, .navbar-brand, h1 a, h2 a'
    );
    return (logo?.textContent || '').trim().slice(0, 60) || 'Site Name';
  },

  _cleanComponentHtml(html, ...sharedDataInfos) {
    // Just return the raw HTML; template markers can be added manually by user
    return html;
  },

  // ── Replace component HTML in all pages with @component marker ───────────────
  async _replaceInAllPages(dirHandle, allPageHtmls, originalHtml, marker) {
    const normalizedOrig = originalHtml.replace(/\s+/g, ' ').trim();
    for (const page of allPageHtmls) {
      if (!page.html.includes(originalHtml.slice(0, 100))) continue;
      const updated = page.html.replace(originalHtml, marker);
      if (updated !== page.html) {
        await FileHandler.writeFile(dirHandle, page.file, updated);
        page.html = updated;
      }
    }
  },

  // ── Detect existing language versions ────────────────────────────────────────
  async _detectLanguages(srcHandle, srcEntries) {
    const knownLangCodes = ['zh-SC', 'zh-TC', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ar', 'ru', 'it', 'nl'];
    const others = [];
    let baseLang = 'en';

    // Check for lang subdirectories
    const dirs = srcEntries.filter(e => e.kind === 'directory');
    for (const dir of dirs) {
      const code = dir.name.toLowerCase();
      const isLang = knownLangCodes.includes(dir.name) ||
        /^[a-z]{2}(-[a-zA-Z]{2,4})?$/.test(dir.name);
      if (!isLang) continue;

      // Try to read i18n JSON from the lang subfolder
      let i18nData = {};
      const i18nJson = await FileHandler.readJSON(dir.handle, 'i18n.json');
      if (i18nJson) i18nData = i18nJson;

      const displayMap = {
        'zh-SC': '简', 'zh-tc': '繁', 'zh': '中', 'ja': '日', 'ko': '한',
        'fr': 'FR', 'de': 'DE', 'es': 'ES', 'pt': 'PT', 'ar': 'AR', 'ru': 'RU',
      };

      others.push({
        code: dir.name,
        display: displayMap[code] || dir.name.toUpperCase(),
        i18nData,
      });
    }

    return { baseLang, others };
  },

  // ── Recursively copy a directory ──────────────────────────────────────────────
  async _copyDirRecursive(srcDir, destDir, entries) {
    const entriesToCopy = entries || await FileHandler.listEntries(srcDir);
    for (const entry of entriesToCopy) {
      if (entry.kind === 'file') {
        // Skip hidden files and webbuilder internal files
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'project.json') continue; // will create fresh
        const file = await entry.handle.getFile();
        // Handle binary vs text files
        const isBinary = /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|pdf|mp4|mp3|webm)$/i.test(entry.name);
        if (isBinary) {
          const buf = await file.arrayBuffer();
          const fh = await destDir.getFileHandle(entry.name, { create: true });
          const writable = await fh.createWritable();
          await writable.write(buf);
          await writable.close();
        } else {
          const text = await file.text();
          await FileHandler.writeFile(destDir, entry.name, text);
        }
      } else if (entry.kind === 'directory') {
        // Skip already-created webbuilder dirs
        if (['components', 'shared-data', 'i18n'].includes(entry.name)) continue;
        const subDest = await FileHandler.getDir(destDir, entry.name, true);
        const subEntries = await FileHandler.listEntries(entry.handle);
        await this._copyDirRecursive(entry.handle, subDest, subEntries);
      }
    }
  },

  // ── Try to restore last opened project ──────────────────────────────────────
  // Called automatically on page load (allowPrompt=false) or by user gesture.
  // Returns { restored: bool, needsGesture: bool }
  async tryRestoreLastProject(allowPrompt = false) {
    await this.setupWorkspace();
    const handle = await FileHandler.restoreHandle('last-project');
    if (!handle) return { restored: false, needsGesture: false };
    try {
      // Try silently first (no permission dialog)
      const silentOk = await FileHandler.verifyPermission(handle, true, true);
      if (silentOk) {
        const project = await FileHandler.readJSON(handle, 'project.json');
        if (!project) return { restored: false, needsGesture: false };
        await this._loadProject(handle, project);
        return { restored: true, needsGesture: false };
      }
      // Silent failed — permission expired
      if (!allowPrompt) {
        // Store handle so UI can trigger re-auth later with a user gesture
        this._pendingRestoreHandle = handle;
        return { restored: false, needsGesture: true };
      }
      // User-gesture path: prompt for permission
      const ok = await FileHandler.verifyPermission(handle, true, false);
      if (!ok) return { restored: false, needsGesture: false };
      const project = await FileHandler.readJSON(handle, 'project.json');
      if (!project) return { restored: false, needsGesture: false };
      await this._loadProject(handle, project);
      this._pendingRestoreHandle = null;
      return { restored: true, needsGesture: false };
    } catch {
      return { restored: false, needsGesture: false };
    }
  },

  // ── Detect CSS mode from HTML content ────────────────────────────────────────
  // Returns: 'tailwind-cdn' | 'tailwind-local' | 'custom'
  _detectCssMode(htmlContent) {
    if (!htmlContent) return 'custom';
    if (htmlContent.includes('cdn.tailwindcss.com')) return 'tailwind-cdn';
    if (/assets\/css\/tailwind\.css/.test(htmlContent) ||
        /tailwind-config/.test(htmlContent)) return 'tailwind-local';
    return 'custom';
  },

  // ── Extract theme tokens from HTML (Tailwind CDN config + Google Fonts) ───────
  // Returns: { colors: {}, fonts: { headline, body, label }, cssMode }
  // Tries to parse inline Tailwind config or CSS variables.
  _extractThemeFromHtml(htmlContent) {
    if (!htmlContent) return null;

    const theme = { colors: {}, fonts: {}, cssMode: this._detectCssMode(htmlContent) };

    // ── Colors: try to read tailwind.config ──────────────────────────────────
    // Pattern: tailwind.config = { theme: { extend: { colors: { ... } } } }
    // or:      tailwind.config = { theme: { colors: { ... } } }
    const twConfigMatch = htmlContent.match(/tailwind\.config\s*=\s*(\{[\s\S]*?\})\s*(?:<\/script>|;?\s*\n)/);
    if (twConfigMatch) {
      try {
        // Safely evaluate the object literal by wrapping in a function scope
        // eslint-disable-next-line no-new-func
        const cfg = Function('"use strict"; return (' + twConfigMatch[1] + ')')();
        const colorMap = cfg?.theme?.extend?.colors || cfg?.theme?.colors || {};
        for (const [key, val] of Object.entries(colorMap)) {
          if (typeof val === 'string') theme.colors[key] = val;
          else if (typeof val === 'object') {
            // Use DEFAULT or '500' as representative value
            theme.colors[key] = val['DEFAULT'] || val['500'] || Object.values(val)[0] || '';
          }
        }
      } catch { /* invalid JS — skip */ }
    }

    // ── Colors: CSS variables fallback (--color-primary: #xxx or --tw-color-*) ─
    if (Object.keys(theme.colors).length === 0) {
      const cssVarRe = /--(?:color-|tw-color-)?([a-zA-Z][a-zA-Z0-9-]*):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
      let m;
      while ((m = cssVarRe.exec(htmlContent)) !== null) {
        const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // kebab→camel
        theme.colors[name] = m[2];
      }
    }

    // ── Fonts: Google Fonts <link> ────────────────────────────────────────────
    const gfRe = /fonts\.googleapis\.com\/css[^"']*family=([^"'&]+)/g;
    const fontFamilies = [];
    let fm;
    while ((fm = gfRe.exec(htmlContent)) !== null) {
      const families = decodeURIComponent(fm[1]).split('|');
      for (const f of families) {
        const name = f.split(':')[0].replace(/\+/g, ' ').trim();
        if (name && !fontFamilies.includes(name)) fontFamilies.push(name);
      }
    }
    if (fontFamilies.length > 0) {
      // Heuristic: first CJK/serif font → headline, last sans → body, middle → label
      const serifKeywords = ['Garamond','Playfair','Newsreader','Cormorant','Lora','Merriweather','Noto Serif','EB Garamond','DM Serif'];
      const monoKeywords = ['Mono','Code','JetBrains','Fira','Space Mono','IBM Plex Mono'];
      const serifFonts = fontFamilies.filter(f => serifKeywords.some(k => f.includes(k)));
      const monoFonts = fontFamilies.filter(f => monoKeywords.some(k => f.includes(k)));
      const sansFonts = fontFamilies.filter(f => !serifKeywords.some(k => f.includes(k)) && !monoKeywords.some(k => f.includes(k)));

      theme.fonts.headline = serifFonts[0] || sansFonts[0] || fontFamilies[0];
      theme.fonts.body = sansFonts[0] || fontFamilies[0];
      theme.fonts.label = monoFonts[0] || sansFonts[1] || sansFonts[0] || fontFamilies[0];
    }

    // Only return if we found something useful
    const hasColors = Object.keys(theme.colors).length > 0;
    const hasFonts = Object.keys(theme.fonts).length > 0;
    return (hasColors || hasFonts) ? theme : null;
  },

  // ── Update cssMode in project.json and State ──────────────────────────────────
  async saveCssMode(mode) {
    if (!State.project) return;
    State.project.cssMode = mode;
    await this.saveProjectMeta();
  },

  // ── Internal: scaffold a brand new project ───────────────────────────────────
  async _scaffoldProject(handle, name, title, baseLang) {
    const compDir = await FileHandler.getDir(handle, 'components', true);
    const sdDir = await FileHandler.getDir(handle, 'shared-data', true);
    const i18nDir = await FileHandler.getDir(handle, 'i18n', true);
    const assetsDir = await FileHandler.getDir(handle, 'assets', true);
    await FileHandler.getDir(assetsDir, 'css', true);
    await FileHandler.getDir(assetsDir, 'js', true);
    await FileHandler.getDir(assetsDir, 'images', true);

    const mainMenuData = {
      id: 'main-menu', label: 'Main Menu', type: 'menu',
      fields: [
        { key: 'label', label: 'Label', type: 'text', i18n: true },
        { key: 'href', label: 'URL', type: 'url', i18n: false },
      ],
      items: [
        { id: 'home', label: 'Home', i18nKey: 'nav.home', href: 'index.html' },
        { id: 'about', label: 'About', i18nKey: 'nav.about', href: 'about.html' },
        { id: 'contact', label: 'Contact', i18nKey: 'nav.contact', href: 'contact.html' },
      ],
    };
    const socialData = {
      id: 'social-links', label: 'Social Links', type: 'icon-links',
      fields: [
        { key: 'label', label: 'Label', type: 'text', i18n: false },
        { key: 'icon', label: 'Icon', type: 'text', i18n: false },
        { key: 'href', label: 'URL', type: 'url', i18n: false },
      ],
      items: [],
    };
    const langData = {
      id: 'languages', label: 'Language Switcher', type: 'languages',
      fields: [
        { key: 'code', label: 'Code', type: 'text', i18n: false },
        { key: 'display', label: 'Display', type: 'text', i18n: false },
        { key: 'pathPrefix', label: 'Path Prefix', type: 'text', i18n: false },
      ],
      items: [{ id: baseLang, code: baseLang, display: baseLang.toUpperCase(), pathPrefix: '' }],
    };

    await FileHandler.writeJSON(sdDir, 'main-menu.json', mainMenuData);
    await FileHandler.writeJSON(sdDir, 'social-links.json', socialData);
    await FileHandler.writeJSON(sdDir, 'languages.json', langData);

    const baseI18n = {
      'nav.home': 'Home', 'nav.about': 'About', 'nav.contact': 'Contact',
      'nav.cta': 'Contact Us',
      'footer.copyright': `© ${new Date().getFullYear()} ${title}. All rights reserved.`,
      'cookie.title': 'Cookie Notice',
      'cookie.desc': 'We use cookies to enhance your experience on our website.',
      'cookie.accept': 'Accept', 'cookie.decline': 'Decline',
    };
    await FileHandler.writeJSON(i18nDir, `${baseLang}.json`, baseI18n);

    const tplNavbar = ComponentTemplates.navbar;
    const tplFooter = ComponentTemplates.footer;
    const tplCookie = ComponentTemplates['cookie-banner'];
    await FileHandler.writeFile(compDir, 'navbar.html', tplNavbar.html);
    await FileHandler.writeJSON(compDir, 'navbar.schema.json', { ...Utils.clone(tplNavbar.schema), id: 'navbar' });
    await FileHandler.writeFile(compDir, 'footer.html', tplFooter.html);
    await FileHandler.writeJSON(compDir, 'footer.schema.json', { ...Utils.clone(tplFooter.schema), id: 'footer' });
    await FileHandler.writeFile(compDir, 'cookie-banner.html', tplCookie.html);
    await FileHandler.writeJSON(compDir, 'cookie-banner.schema.json', { ...Utils.clone(tplCookie.schema), id: 'cookie-banner' });

    const pageHtml = PageTemplates['with-components'](title, baseLang);
    await FileHandler.writeFile(handle, 'index.html', pageHtml);

    const project = {
      name, title,
      baseLanguage: baseLang,
      languages: [{ code: baseLang, display: baseLang.toUpperCase(), label: 'English', isBase: true }],
      pages: [{ file: 'index.html', title: 'Home' }],
      components: [
        { id: 'navbar', label: 'Navigation Bar', htmlFile: 'navbar.html', schemaFile: 'navbar.schema.json' },
        { id: 'footer', label: 'Footer', htmlFile: 'footer.html', schemaFile: 'footer.schema.json' },
        { id: 'cookie-banner', label: 'Cookie Banner', htmlFile: 'cookie-banner.html', schemaFile: 'cookie-banner.schema.json' },
      ],
      sharedData: [
        { id: 'main-menu', label: 'Main Menu', file: 'main-menu.json' },
        { id: 'social-links', label: 'Social Links', file: 'social-links.json' },
        { id: 'languages', label: 'Language Switcher', file: 'languages.json' },
      ],
      cssMode: 'tailwind-cdn',
      created: Utils.formatDate(),
      lastModified: Utils.formatDate(),
    };
    await FileHandler.writeJSON(handle, 'project.json', project);
  },

  // ── Internal: load project data into State ───────────────────────────────────
  async _loadProject(handle, project) {
    State.projectHandle = handle;
    State.project = project;
    State.pages = project.pages || [];
    State.components = {};
    State.sharedData = {};
    State.i18nData = {};
    State.previewLanguage = project.baseLanguage;

    let compDir = null;
    if (await FileHandler.dirExists(handle, 'components')) {
      compDir = await FileHandler.getDir(handle, 'components');
    }
    for (const comp of (project.components || [])) {
      const html = compDir ? (await FileHandler.readFile(compDir, comp.htmlFile) || '') : '';
      const schema = compDir ? (await FileHandler.readJSON(compDir, comp.schemaFile) || { fields: [], sharedDataRefs: [] }) : { fields: [], sharedDataRefs: [] };
      State.components[comp.id] = { html, schema, meta: comp };
    }

    let sdDir = null;
    if (await FileHandler.dirExists(handle, 'shared-data')) {
      sdDir = await FileHandler.getDir(handle, 'shared-data');
    }
    for (const sd of (project.sharedData || [])) {
      const data = sdDir ? (await FileHandler.readJSON(sdDir, sd.file) || {}) : {};
      State.sharedData[sd.id] = data;
    }

    let i18nDir = null;
    if (await FileHandler.dirExists(handle, 'i18n')) {
      i18nDir = await FileHandler.getDir(handle, 'i18n');
    }
    for (const lang of (project.languages || [])) {
      const data = i18nDir ? (await FileHandler.readJSON(i18nDir, `${lang.code}.json`) || {}) : {};
      State.i18nData[lang.code] = data;
    }
  },

  // ── Save project.json ─────────────────────────────────────────────────────────
  async saveProjectMeta() {
    if (!State.projectHandle || !State.project) return;
    State.project.lastModified = Utils.formatDate();
    await FileHandler.writeJSON(State.projectHandle, 'project.json', State.project);
  },

  // ── Page CRUD ─────────────────────────────────────────────────────────────────
  async addPage(filename, title, template) {
    if (!State.projectHandle) return false;
    const file = filename.endsWith('.html') ? filename : filename + '.html';
    const exists = await FileHandler.fileExists(State.projectHandle, file);
    if (exists) { Utils.showToast(`Page "${file}" already exists.`, 'error'); return false; }
    const html = PageTemplates[template]
      ? PageTemplates[template](title || Utils.basename(file), State.project.baseLanguage)
      : PageTemplates.blank(title || Utils.basename(file), State.project.baseLanguage);
    await FileHandler.writeFile(State.projectHandle, file, html);
    const pageEntry = { file, title: title || Utils.basename(file) };
    State.pages.push(pageEntry);
    State.project.pages = State.pages;
    await this.saveProjectMeta();
    return pageEntry;
  },

  async deletePage(filename) {
    if (!State.projectHandle) return;
    await FileHandler.deleteFile(State.projectHandle, filename);
    State.pages = State.pages.filter(p => p.file !== filename);
    State.project.pages = State.pages;
    await this.saveProjectMeta();
  },

  async readPage(filename) {
    return await FileHandler.readFile(State.projectHandle, filename);
  },

  async savePage(filename, html) {
    await FileHandler.writeFile(State.projectHandle, filename, html);
  },

  // ── Component CRUD ────────────────────────────────────────────────────────────
  async addComponent(id, label, templateKey) {
    if (!State.projectHandle) return false;
    const compDir = await FileHandler.getDir(State.projectHandle, 'components', true);
    const htmlFile = `${id}.html`;
    const schemaFile = `${id}.schema.json`;
    const tpl = ComponentTemplates[templateKey] || {
      html: `<!-- ${label} component -->\n<div class="${id}-component">\n  <!-- Add your HTML here -->\n</div>`,
      schema: { label, description: '', fields: [], sharedDataRefs: [] },
    };
    await FileHandler.writeFile(compDir, htmlFile, tpl.html);
    const schema = { ...Utils.clone(tpl.schema), id, label };
    await FileHandler.writeJSON(compDir, schemaFile, schema);
    const meta = { id, label, htmlFile, schemaFile };
    State.components[id] = { html: tpl.html, schema, meta };
    if (!State.project.components) State.project.components = [];
    State.project.components.push(meta);
    await this.saveProjectMeta();
    return meta;
  },

  async deleteComponent(id) {
    const compDir = await FileHandler.getDir(State.projectHandle, 'components');
    const meta = State.components[id]?.meta;
    if (meta) {
      await FileHandler.deleteFile(compDir, meta.htmlFile);
      await FileHandler.deleteFile(compDir, meta.schemaFile);
    }
    delete State.components[id];
    State.project.components = State.project.components.filter(c => c.id !== id);
    await this.saveProjectMeta();
  },

  async saveComponent(id) {
    const comp = State.components[id];
    if (!comp || !State.projectHandle) return;
    const compDir = await FileHandler.getDir(State.projectHandle, 'components', true);
    await FileHandler.writeFile(compDir, comp.meta.htmlFile, comp.html);
    await FileHandler.writeJSON(compDir, comp.meta.schemaFile, comp.schema);
  },

  // ── Shared Data CRUD ──────────────────────────────────────────────────────────
  async addSharedData(id, label, type) {
    if (!State.projectHandle) return false;
    const sdDir = await FileHandler.getDir(State.projectHandle, 'shared-data', true);
    const tpl = Utils.clone(SharedDataTemplates[type] || SharedDataTemplates.custom);
    tpl.id = id; tpl.label = label; tpl.type = type;
    await FileHandler.writeJSON(sdDir, `${id}.json`, tpl);
    State.sharedData[id] = tpl;
    if (!State.project.sharedData) State.project.sharedData = [];
    State.project.sharedData.push({ id, label, file: `${id}.json` });
    await this.saveProjectMeta();
    return tpl;
  },

  async saveSharedData(id) {
    const sdDir = await FileHandler.getDir(State.projectHandle, 'shared-data', true);
    const meta = State.project.sharedData.find(sd => sd.id === id);
    if (meta) await FileHandler.writeJSON(sdDir, meta.file, State.sharedData[id]);
  },

  // ── Language management ───────────────────────────────────────────────────────
  async addLanguage(code, display) {
    if (!State.projectHandle) return false;
    if (State.project.languages.find(l => l.code === code)) {
      Utils.showToast(`Language "${code}" already exists.`, 'error'); return false;
    }
    const i18nDir = await FileHandler.getDir(State.projectHandle, 'i18n', true);
    const baseLang = State.project.baseLanguage;
    const baseData = State.i18nData[baseLang] || {};
    const newData = {};
    for (const key of Object.keys(baseData)) newData[key] = '';
    await FileHandler.writeJSON(i18nDir, `${code}.json`, newData);
    State.i18nData[code] = newData;
    State.project.languages.push({ code, display: display || code.toUpperCase(), label: code, isBase: false });

    // Update languages shared data
    if (State.sharedData['languages']) {
      if (!State.sharedData['languages'].items) State.sharedData['languages'].items = [];
      State.sharedData['languages'].items.push({ id: code, code, display: display || code.toUpperCase(), pathPrefix: `${code}/` });
      await this.saveSharedData('languages');
    }
    await this.saveProjectMeta();
    return true;
  },

  async saveI18n(lang) {
    const i18nDir = await FileHandler.getDir(State.projectHandle, 'i18n', true);
    await FileHandler.writeJSON(i18nDir, `${lang}.json`, State.i18nData[lang] || {});
  },

  // ── Utilities ─────────────────────────────────────────────────────────────────
  async findComponentUsages(componentId) {
    const comp = State.components[componentId];
    const selector = comp?.schema?.selector || null;
    const parser = new DOMParser();
    const pages = [];

    for (const page of State.pages) {
      const html = await this.readPage(page.file) || '';

      // Primary: look for @component marker (any form)
      if (html.includes(`@component:${componentId}`)) {
        pages.push(page.file);
        continue;
      }

      // Fallback: use CSS selector to check if a matching element exists in the page
      if (selector) {
        try {
          const doc = parser.parseFromString(html, 'text/html');
          const el = doc.querySelector(selector);
          if (el) pages.push(page.file);
        } catch { /* bad selector — skip */ }
      }
    }
    return pages;
  },

  findSharedDataUsages(dataId) {
    const usages = [];
    for (const [id, comp] of Object.entries(State.components)) {
      if ((comp.schema?.sharedDataRefs || []).includes(dataId) || comp.html.includes(`@each:${dataId}`)) {
        usages.push(comp.meta?.label || id);
      }
    }
    return usages;
  },

  updatePageTitle(file, title) {
    const page = State.pages.find(p => p.file === file);
    if (page) page.title = title;
    if (State.project) State.project.pages = State.pages;
  },

  async getReleasesHandle() {
    if (State.workspaceReleasesHandle) return State.workspaceReleasesHandle;
    return null;
  },

  // Alias used by Exporter — picks folder if not yet configured
  async getOrPickReleasesHandle() {
    if (State.workspaceReleasesHandle) return State.workspaceReleasesHandle;
    const ok = await this.pickReleasesFolder();
    if (!ok) return null;
    return State.workspaceReleasesHandle;
  },

  // ── Import HTML pages into an existing open project ───────────────────────────
  // Copies HTML files (and assets/) from a selected source folder into the current
  // project directory and registers them as pages in project.json.
  async importPagesToProject() {
    if (!State.projectHandle || !State.project) {
      Utils.showToast('Open or create a project first.', 'error');
      return false;
    }

    Utils.showToast('Select the folder containing your HTML files…', 'info');
    const srcHandle = await FileHandler.pickDirectory('import-pages', 'documents');
    if (!srcHandle) return false;

    const srcOk = await FileHandler.verifyPermission(srcHandle);
    if (!srcOk) return false;

    const srcEntries = await FileHandler.listEntries(srcHandle);
    const htmlFiles = srcEntries.filter(e => e.kind === 'file' && e.name.endsWith('.html'));

    if (htmlFiles.length === 0) {
      Utils.showToast('No HTML files found in the selected folder.', 'error');
      return false;
    }

    let addedPages = 0;
    let updatedPages = 0;

    // Copy root-level HTML files
    for (const entry of htmlFiles) {
      const file = await entry.handle.getFile();
      const text = await file.text();
      await FileHandler.writeFile(State.projectHandle, entry.name, text);

      if (!State.pages.find(p => p.file === entry.name)) {
        State.pages.push({ file: entry.name, title: Utils.basename(entry.name) });
        addedPages++;
      } else {
        updatedPages++;
      }
    }

    // Copy assets directory if present
    for (const entry of srcEntries) {
      if (entry.kind !== 'directory') continue;

      const knownLangCodes = ['zh-SC', 'zh-TC', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ar', 'ru', 'it', 'nl'];
      const isLang = knownLangCodes.includes(entry.name) || /^[a-z]{2}(-[a-zA-Z]{2,4})?$/i.test(entry.name);
      const isAssets = entry.name === 'assets' || entry.name === 'images' || entry.name === 'css' || entry.name === 'js' || entry.name === 'fonts';

      if (isAssets) {
        // Copy asset folder
        const destDir = await FileHandler.getDir(State.projectHandle, entry.name, true);
        const subEntries = await FileHandler.listEntries(entry.handle);
        await this._copyDirRecursive(entry.handle, destDir, subEntries);
      } else if (isLang) {
        // Copy language subfolder's HTML pages
        const langEntries = await FileHandler.listEntries(entry.handle);
        const langHtml = langEntries.filter(e => e.kind === 'file' && e.name.endsWith('.html'));
        if (langHtml.length > 0) {
          const destLangDir = await FileHandler.getDir(State.projectHandle, entry.name, true);
          for (const lf of langHtml) {
            const file = await lf.handle.getFile();
            const text = await file.text();
            await FileHandler.writeFile(destLangDir, lf.name, text);
          }
          // Register language if not already tracked
          if (!State.project.languages.find(l => l.code === entry.name)) {
            const displayMap = { 'zh-SC': '简', 'zh-TC': '繁', 'zh': '中', 'ja': '日', 'ko': '한', 'fr': 'FR', 'de': 'DE', 'es': 'ES' };
            State.project.languages.push({
              code: entry.name,
              display: displayMap[entry.name] || entry.name.toUpperCase(),
              label: entry.name,
              isBase: false,
            });
            // Create empty i18n file for this lang if needed
            const i18nDir = await FileHandler.getDir(State.projectHandle, 'i18n', true);
            const existing = await FileHandler.readJSON(i18nDir, `${entry.name}.json`);
            if (!existing) await FileHandler.writeJSON(i18nDir, `${entry.name}.json`, {});
            State.i18nData[entry.name] = {};
          }
        }
      }
    }

    State.project.pages = State.pages;
    await this.saveProjectMeta();

    const msg = addedPages > 0
      ? `Imported ${addedPages} new page(s)${updatedPages > 0 ? `, updated ${updatedPages}` : ''} from "${srcHandle.name}".`
      : `Updated ${updatedPages} page(s) from "${srcHandle.name}".`;
    Utils.showToast(msg, 'info', 4000);
    return { addedPages, updatedPages };
  },

  // ── Re-import components & shared data from index.html (on existing project) ──
  // Overwrites existing component HTML + schema files and shared data JSON files
  // with fresh data extracted from the current index.html.
  // Then prompts the user to optionally sync to all other pages.
  async reimportFromIndex() {
    if (!State.projectHandle || !State.project) {
      Utils.showToast('Open a project first.', 'error');
      return false;
    }

    // Check index.html exists
    const indexExists = await FileHandler.fileExists(State.projectHandle, 'index.html');
    if (!indexExists) {
      Utils.showToast('No index.html found in the project root.', 'error');
      return false;
    }

    Utils.showToast('Re-extracting components from index.html…', 'info');

    // List HTML files in project root (for sync later)
    const entries = await FileHandler.listEntries(State.projectHandle);
    const htmlFiles = entries.filter(e => e.kind === 'file' && e.name.endsWith('.html'));

    // Extract theme + CSS mode from index.html
    const indexHtmlContent = await FileHandler.readFile(State.projectHandle, 'index.html') || '';
    const reimportedCssMode = this._detectCssMode(indexHtmlContent);
    const reimportedTheme = this._extractThemeFromHtml(indexHtmlContent);
    if (reimportedCssMode) State.project.cssMode = reimportedCssMode;
    if (reimportedTheme) State.project.theme = reimportedTheme;

    // Extract from index.html
    const extracted = await this._extractFromIndex(State.projectHandle, htmlFiles);

    if (extracted.components.length === 0) {
      Utils.showToast('No components found in index.html.', 'error');
      return false;
    }

    const compDir = await FileHandler.getDir(State.projectHandle, 'components', true);
    const sdDir = await FileHandler.getDir(State.projectHandle, 'shared-data', true);

    // Overwrite component files
    for (const comp of extracted.components) {
      await FileHandler.writeFile(compDir, `${comp.id}.html`, comp.html);
      await FileHandler.writeJSON(compDir, `${comp.id}.schema.json`, comp.schema);

      // Update State in-memory
      if (State.components[comp.id]) {
        State.components[comp.id].html = comp.html;
        State.components[comp.id].schema = comp.schema;
      } else {
        // Component didn't exist yet — register it
        const meta = { id: comp.id, label: comp.label, htmlFile: `${comp.id}.html`, schemaFile: `${comp.id}.schema.json` };
        State.components[comp.id] = { html: comp.html, schema: comp.schema, meta };
        if (!State.project.components) State.project.components = [];
        State.project.components.push(meta);
      }
    }

    // Overwrite shared data files (only those re-extracted: main-menu, social-links)
    for (const sd of extracted.sharedData) {
      await FileHandler.writeJSON(sdDir, `${sd.id}.json`, sd);
      State.sharedData[sd.id] = sd;

      // Register in project.json if new
      if (!State.project.sharedData) State.project.sharedData = [];
      if (!State.project.sharedData.find(s => s.id === sd.id)) {
        State.project.sharedData.push({ id: sd.id, label: sd.label, file: `${sd.id}.json` });
      }
    }

    await this.saveProjectMeta();

    // Store pending sync info (reuse same flow as importProject)
    this._pendingImportSync = {
      destHandle: State.projectHandle,
      project: State.project,
      components: extracted.components,
      htmlFiles,
    };

    // Show confirmation modal
    UI.showImportConfirmModal(
      extracted.components.map(c => ({ id: c.id, label: c.label })),
      async (doSync) => {
        await this._finishImport(doSync);
      }
    );

    return true;
  },

  // ── Re-run component auto-detection on current project ────────────────────────
  // Can be triggered at any time on a project that already has pages loaded.
  // Does NOT overwrite existing components — only adds newly detected ones.
  async runAutoDetect() {
    if (!State.projectHandle || !State.project) {
      Utils.showToast('Open a project first.', 'error');
      return false;
    }

    const entries = await FileHandler.listEntries(State.projectHandle);
    const htmlFiles = entries.filter(e => e.kind === 'file' && e.name.endsWith('.html'));

    if (htmlFiles.length === 0) {
      Utils.showToast('No HTML pages found in project root to analyze.', 'error');
      return false;
    }

    Utils.showToast('Analyzing pages for reusable components…', 'info');

    const detected = await this._autoDetectComponents(State.projectHandle, htmlFiles);

    const compDir = await FileHandler.getDir(State.projectHandle, 'components', true);
    const sdDir = await FileHandler.getDir(State.projectHandle, 'shared-data', true);

    let addedComps = 0;
    let addedSd = 0;

    // Add detected shared data first (so component schemas can reference them)
    for (const sd of detected.sharedData) {
      if (State.sharedData[sd.id]) continue; // don't overwrite
      await FileHandler.writeJSON(sdDir, `${sd.id}.json`, sd);
      State.sharedData[sd.id] = sd;
      if (!State.project.sharedData) State.project.sharedData = [];
      State.project.sharedData.push({ id: sd.id, label: sd.label, file: `${sd.id}.json` });
      addedSd++;
    }

    // Add detected components
    for (const comp of detected.components) {
      if (State.components[comp.id]) continue; // don't overwrite
      await FileHandler.writeFile(compDir, `${comp.id}.html`, comp.html);
      await FileHandler.writeJSON(compDir, `${comp.id}.schema.json`, comp.schema);
      const meta = { id: comp.id, label: comp.label, htmlFile: `${comp.id}.html`, schemaFile: `${comp.id}.schema.json` };
      State.components[comp.id] = { html: comp.html, schema: comp.schema, meta };
      if (!State.project.components) State.project.components = [];
      State.project.components.push(meta);
      addedComps++;
    }

    await this.saveProjectMeta();

    const summary = [];
    if (addedComps > 0) summary.push(`${addedComps} component(s)`);
    if (addedSd > 0) summary.push(`${addedSd} shared data`);
    Utils.showToast(
      summary.length > 0
        ? `Auto-detected: ${summary.join(', ')}.`
        : 'No new components detected (existing ones preserved).',
      'info', 4000
    );
    return { addedComps, addedSd };
  },
};
