/* ===== wb-app.js — Application Entry Point & Action Handlers ===== */

const App = {

  // ── Startup ──────────────────────────────────────────────────────────────────
  async init() {
    UI.init();

    // Keyboard shortcut: Escape closes modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => {
          m.classList.add('hidden');
        });
      }
    });

    // Initialize split resizer drag behaviour
    this._initSplitResizer();

    // Restore persisted workspace handles from IndexedDB, then refresh UI
    await ProjectManager.setupWorkspace();
    await this._updateWorkspaceStatus();

    // Try to restore last project (silently, no prompt)
    try {
      const { restored, needsGesture } = await ProjectManager.tryRestoreLastProject();
      if (restored) {
        UI.loadSidebar();
        Utils.showToast('Project restored.', 'info');
      } else if (needsGesture) {
        // Permission expired — show a restore button on the welcome screen
        UI.showRestorePrompt();
      }
    } catch (e) {
      console.warn('Could not restore last project:', e);
    }

    // Populate recent projects list on welcome screen
    await this._renderWelcomeProjects();

    // Show CTA popup on first launch and every 30 days
    this._checkCtaPopup();
  },

  // Refresh all workspace-status UI elements (welcome page + sidebar)
  async _updateWorkspaceStatus() {
    const projectsHandle  = State.workspaceProjectsHandle;
    const releasesHandle  = State.workspaceReleasesHandle;

    const projectsName = projectsHandle ? projectsHandle.name : null;
    const releasesName = releasesHandle ? releasesHandle.name : null;

    // Welcome page: projects row
    const wpPath   = document.getElementById('ws-projects-path');
    const wpStatus = document.getElementById('ws-projects-status');
    if (wpPath) {
      wpPath.textContent = projectsName || 'Not configured';
      wpPath.classList.toggle('configured', !!projectsName);
    }
    if (wpStatus) {
      wpStatus.textContent = projectsName ? '✓' : '⚠';
      wpStatus.className   = projectsName ? 'ws-dot ws-dot-ok' : 'ws-dot ws-dot-warn';
    }

    // Welcome page: releases row
    const wrPath   = document.getElementById('ws-releases-path');
    const wrStatus = document.getElementById('ws-releases-status');
    if (wrPath) {
      wrPath.textContent = releasesName || 'Not configured';
      wrPath.classList.toggle('configured', !!releasesName);
    }
    if (wrStatus) {
      wrStatus.textContent = releasesName ? '✓' : '⚠';
      wrStatus.className   = releasesName ? 'ws-dot ws-dot-ok' : 'ws-dot ws-dot-warn';
    }

    // Sidebar mini rows
    const spLabel = document.getElementById('sidebar-projects-status');
    if (spLabel) spLabel.textContent = projectsName ? `Projects: ${projectsName}` : 'Projects: not set';

    const srLabel = document.getElementById('sidebar-releases-status');
    if (srLabel) srLabel.textContent = releasesName ? `Releases: ${releasesName}` : 'Releases: not set';

    // App Settings modal (live-update if open)
    if (typeof UI !== 'undefined') UI.populateAppSettings();
  },

  // ── CTA popup: first launch + monthly ─────────────────────────────────────────
  _checkCtaPopup() {
    const key = 'pm-cta-last-shown';
    const last = parseInt(localStorage.getItem(key) || '0', 10);
    const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    if (!last || Date.now() - last > MONTH_MS) {
      localStorage.setItem(key, String(Date.now()));
      setTimeout(() => UI.openModal('modal-welcome-cta'), 900);
    }
  },

  // ── Open external URL (works in both browser and Electron) ────────────────────
  _openExternal(url) {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },

  // ── Welcome screen: render recent projects list ────────────────────────────────
  async _renderWelcomeProjects() {
    const el = document.getElementById('welcome-recent-projects');
    if (!el) return;

    if (!State.workspaceProjectsHandle) {
      el.innerHTML = '<p style="font-size:12px;color:#444;text-align:center;padding:12px 0">Set your Projects folder to see recent projects.</p>';
      return;
    }

    try {
      const projects = await ProjectManager.listProjects();
      if (projects.length === 0) {
        el.innerHTML = '<p style="font-size:12px;color:#444;text-align:center;padding:12px 0">No projects yet. Create or import one.</p>';
        return;
      }
      // Sort by lastModified desc
      projects.sort((a, b) => {
        const da = a.meta?.lastModified || '';
        const db = b.meta?.lastModified || '';
        return da < db ? 1 : -1;
      });
      el.innerHTML = projects.map((p, idx) => `
        <div class="welcome-project-item" onclick="App._openProjectByIndex(${idx})">
          <span class="material-symbols-outlined" style="font-size:16px;color:#6366f1;flex-shrink:0">folder_open</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(p.title)}</div>
            <div style="font-size:11px;color:#555">${Utils.escapeHtml(p.name)}</div>
          </div>
          <span style="font-size:10px;color:#444;flex-shrink:0">${p.meta?.lastModified ? new Date(p.meta.lastModified).toLocaleDateString() : ''}</span>
        </div>`).join('');
      // Store list for index lookup
      this._welcomeProjectsList = projects;
    } catch (e) {
      el.innerHTML = '<p style="font-size:12px;color:#444;text-align:center;padding:12px 0">Could not read projects folder.</p>';
    }
  },

  async _openProjectByIndex(idx) {
    const projects = this._welcomeProjectsList;
    if (!projects || !projects[idx]) { this.openProject(); return; }
    const p = projects[idx];
    try {
      const handle = p.handle;
      const ok = await FileHandler.verifyPermission(handle);
      if (!ok) { Utils.showToast('Permission denied for project folder.', 'error'); return; }
      const project = await FileHandler.readJSON(handle, 'project.json');
      if (!project) { Utils.showToast('Invalid project folder.', 'error'); return; }
      await ProjectManager._loadProject(handle, project);
      await FileHandler.persistHandle('last-project', handle);
      UI.loadSidebar();
      Utils.showToast(`Opened: ${project.title || project.name}`, 'info');
    } catch (e) {
      Utils.showToast(`Could not open project: ${e.message}`, 'error');
    }
  },

  // ── Re-auth and restore last project (triggered by user gesture) ───────────────
  async restoreLastProject() {
    try {
      const { restored } = await ProjectManager.tryRestoreLastProject(false); // allow prompt
      if (restored) {
        UI.loadSidebar();
        // Hide restore prompt
        const el = document.getElementById('welcome-restore-prompt');
        if (el) el.classList.add('hidden');
        Utils.showToast('Project restored.', 'info');
      } else {
        Utils.showToast('Could not restore project — please Open Project manually.', 'error');
      }
    } catch (e) {
      console.warn('restoreLastProject failed:', e);
      Utils.showToast('Could not restore project.', 'error');
    }
  },

  // ── Save All open editors ──────────────────────────────────────────────────────
  async saveAll() {
    if (!State.project) { Utils.showToast('No project open.', 'error'); return; }
    let saved = 0;

    if (State.activePage && State.pageCodeMirror) {
      await PageEditor.save();
      saved++;
    }
    if (State.activeComponent && State.compCodeMirror) {
      await ComponentEditor.save();
      saved++;
    }
    if (State.activeSharedData) {
      await SharedDataEditor.save();
      saved++;
    }
    if (State.activeI18nLang) {
      await I18nEditor.save();
      saved++;
    }
    await ProjectManager.saveProjectMeta();
    Utils.showToast(saved > 0 ? `Saved ${saved} editor(s).` : 'Project metadata saved.', 'info');
  },

  // ── Workspace: pick projects folder independently ─────────────────────────────
  async pickProjectsFolder() {
    const ok = await ProjectManager.pickProjectsFolder();
    if (ok) {
      await this._updateWorkspaceStatus();
      Utils.showToast('Projects folder configured.', 'info');
    }
  },

  // ── Workspace: pick releases folder independently ─────────────────────────────
  async pickReleasesFolder() {
    const ok = await ProjectManager.pickReleasesFolder();
    if (ok) {
      await this._updateWorkspaceStatus();
      Utils.showToast('Releases folder configured.', 'info');
    }
  },

  // ── Project: Open ─────────────────────────────────────────────────────────────
  async openProject() {
    try {
      const ok = await ProjectManager.openProject();
      if (ok) {
        UI.loadSidebar();
        await this._renderWelcomeProjects();
        Utils.showToast(`Opened: ${State.project?.title || State.project?.name}`, 'info');
      }
    } catch (e) {
      console.error('openProject error:', e);
      Utils.showToast(`Could not open project: ${e.message || 'Unknown error'}`, 'error', 4000);
    }
  },

  // ── Project: New ─────────────────────────────────────────────────────────────
  showNewProject() {
    document.getElementById('np-name').value = '';
    document.getElementById('np-title').value = '';
    document.getElementById('np-lang').value = 'en';
    UI.openModal('modal-new-project');
  },

  async confirmNewProject() {
    const name = Utils.sanitizeFilename(document.getElementById('np-name').value.trim());
    const title = document.getElementById('np-title').value.trim() || name;
    const lang = document.getElementById('np-lang').value.trim() || 'en';

    if (!name) { Utils.showToast('Project name is required.', 'error'); return; }
    UI.closeModal('modal-new-project');

    try {
      const ok = await ProjectManager.createProject(name, title, lang);
      if (ok) {
        UI.loadSidebar();
        await this._renderWelcomeProjects();
        Utils.showToast(`Created project: ${title}`, 'info');
      }
    } catch (e) {
      console.error('confirmNewProject error:', e);
      Utils.showToast(`Could not create project: ${e.message || 'Unknown error'}`, 'error', 4000);
    }
  },

  // ── Project: Import (new project from existing HTML site) ─────────────────────
  async importProject() {
    try {
      // Ensure workspace folders are configured first, with clear user guidance
      if (!State.workspaceProjectsHandle || !State.workspaceReleasesHandle) {
        Utils.showToast('First, configure your Projects and Releases folders in the sidebar.', 'warn', 4000);
        // Still attempt — ensureWorkspace will guide the user through folder selection
        const ready = await ProjectManager.ensureWorkspace();
        if (!ready) {
          Utils.showToast('Workspace folders are required before importing. Use the "Set" buttons in the sidebar.', 'error', 4000);
          return;
        }
        await this._updateWorkspaceStatus();
      }
      const ok = await ProjectManager.importProject();
      if (ok) {
        UI.loadSidebar();
        await this._renderWelcomeProjects();
      }
    } catch (e) {
      console.error('importProject error:', e);
      Utils.showToast(`Import failed: ${e.message || 'Unknown error'}`, 'error', 4000);
    }
  },

  // ── Rebuild All Pages ──────────────────────────────────────────────────────────
  // Re-injects the latest component HTML + resolves template tokens in every page.
  // Only writes pages whose content actually changed (skips unchanged files).
  // Also refreshes the CodeMirror editor if a rebuilt page is currently open.
  async rebuildAllPages() {
    if (!State.project || !State.projectHandle) {
      Utils.showToast('Open a project first.', 'error');
      return;
    }

    const baseLang = State.project.baseLanguage;
    const pages = State.pages;

    if (!pages || pages.length === 0) {
      Utils.showToast('No pages in project.', 'error');
      return;
    }

    if (!confirm(
      `Rebuild all ${pages.length} page(s) from source?\n\n` +
      `This will re-inject the latest component HTML into every page file ` +
      `in the project folder, overwriting the source HTML.\n\n` +
      `Tip: Save any open editors before proceeding.`
    )) return;

    Utils.showToast('Rebuilding pages…', 'info', 2000);
    const currentPageFile = PageEditor.getCurrentFilename();
    let rebuilt = 0;
    let unchanged = 0;
    let failed = 0;

    for (const page of pages) {
      try {
        const rawHtml = await ProjectManager.readPage(page.file);
        if (!rawHtml) continue;

        // Re-inject latest component markup and resolve template tokens,
        // then apply the base-language i18n overlay so any strings edited
        // in the Language Editor are written back into the source HTML.
        let processed = Preview._injectComponents(rawHtml, page.file, baseLang);
        processed = Preview._resolveTokens(processed, page.file, baseLang);
        processed = Preview._applyI18nOverlay(processed, page.file, baseLang);

        if (processed === rawHtml) {
          unchanged++;
          continue; // skip write — no actual change
        }

        await ProjectManager.savePage(page.file, processed);
        rebuilt++;

        // If this page is currently open in CodeMirror, refresh editor
        if (page.file === currentPageFile && State.pageCodeMirror) {
          const scrollInfo = State.pageCodeMirror.getScrollInfo();
          State.pageCodeMirror.setValue(processed);
          State.pageCodeMirror.clearHistory();
          State.pageCodeMirror.scrollTo(scrollInfo.left, scrollInfo.top);
          UI.setDirty(`page:${currentPageFile}`, false);
          Preview.renderCurrentPage();
        }
      } catch (e) {
        console.warn(`[Rebuild] Failed on ${page.file}:`, e);
        failed++;
      }
    }

    // Rebuild i18n snapshot from newly written HTML so the next rebuild/export
    // correctly detects changes relative to what is now on disk.
    if (rebuilt > 0) {
      try { await ProjectManager._buildI18nSnapshot(State.project); } catch (_) {}
    }

    const parts = [];
    if (rebuilt > 0) parts.push(`${rebuilt} page(s) updated`);
    if (unchanged > 0) parts.push(`${unchanged} unchanged`);
    if (failed > 0) parts.push(`${failed} failed`);
    const msg = parts.length > 0
      ? parts.join(', ') + '.'
      : 'No pages processed.';
    Utils.showToast(msg, rebuilt > 0 ? 'info' : 'warn', 4000);
  },

  // ── Re-import components & shared data from index.html (existing project) ──────
  async reimportFromIndex() {
    if (!State.project) {
      Utils.showToast('Open a project first.', 'error'); return;
    }
    try {
      const ok = await ProjectManager.reimportFromIndex();
      if (ok) {
        UI.renderComponents();
        UI.renderSharedData();
      }
    } catch (e) {
      console.error('reimportFromIndex error:', e);
      Utils.showToast(`Re-import failed: ${e.message || 'Unknown error'}`, 'error', 4000);
    }
  },

  // ── Confirm import: called from modal buttons ──────────────────────────────────
  // doSync=true  → sync components to all other pages after extracting
  // doSync=false → just extract components, don't modify other pages
  async confirmImportComponents(doSync) {
    UI.resolveImportConfirm(doSync);
  },

  // ── Refresh page list by scanning project folder on disk ─────────────────────
  async refreshPagesList() {
    if (!State.project) {
      Utils.showToast('Open or create a project first.', 'error'); return;
    }
    const result = await ProjectManager.refreshPagesList();
    if (result) {
      UI.renderPages();
      const added = result.added;
      Utils.showToast(
        added > 0
          ? `Refreshed: found ${added} new page(s). Total: ${result.total}.`
          : `Page list up to date. ${result.total} page(s) found.`,
        'info'
      );
    }
  },

  // ── Import HTML pages into the currently open project ─────────────────────────
  async importPagesToProject() {
    if (!State.project) {
      Utils.showToast('Open or create a project first.', 'error'); return;
    }
    const result = await ProjectManager.importPagesToProject();
    if (result) {
      UI.renderPages();
      UI.renderLanguages();
      UI.updatePreviewLangSelect();
    }
  },

  // ── Auto-detect components in the current project pages ───────────────────────
  async runAutoDetect() {
    if (!State.project) {
      Utils.showToast('Open a project first.', 'error'); return;
    }
    const result = await ProjectManager.runAutoDetect();
    if (result) {
      UI.renderComponents();
      UI.renderSharedData();
    }
  },

  // ── Update topbar button enabled/disabled states ───────────────────────────────
  _updateTopbarButtons() {
    const isOpen = !!State.project;
    const ids = ['btn-save-all', 'btn-reimport', 'btn-rebuild', 'btn-export'];
    for (const id of ids) {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !isOpen;
    }
  },

  // ── Project: Close ────────────────────────────────────────────────────────────
  closeProject() {
    if (State.project && Object.values(State.dirtyFlags).some(Boolean)) {
      if (!confirm('You have unsaved changes. Close anyway?')) return;
    }
    UI.clearSidebar();
    State.project = null;
    State.projectHandle = null;
    State.projectFsPath = null;   // Clear cached filesystem path (used by Tailwind auto-compile)
    State.pages = [];
    State.components = {};
    State.sharedData = {};
    State.i18nData = {};
    State.dirtyFlags = {};
    Utils.showToast('Project closed.', 'info');
  },

  // ── Page management ────────────────────────────────────────────────────────────
  showNewPage() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    document.getElementById('newpage-name').value = '';
    document.getElementById('newpage-title').value = '';
    document.getElementById('newpage-tpl').value = 'blank';
    UI.openModal('modal-new-page');
  },

  async confirmNewPage() {
    const rawName = document.getElementById('newpage-name').value.trim();
    const title = document.getElementById('newpage-title').value.trim();
    const tpl = document.getElementById('newpage-tpl').value;

    if (!rawName) { Utils.showToast('Page filename is required.', 'error'); return; }
    UI.closeModal('modal-new-page');

    const page = await ProjectManager.addPage(rawName, title, tpl);
    if (page) {
      UI.renderPages();
      Utils.showToast(`Created page: ${page.file}`, 'info');
      PageEditor.open(page.file);
    }
  },

  async deletePage(filename) {
    if (!confirm(`Delete page "${filename}"? This cannot be undone.`)) return;
    if (State.activePage === filename) {
      UI.closeTab(`page:${filename}`);
    }
    await ProjectManager.deletePage(filename);
    UI.renderPages();
    Utils.showToast(`Deleted: ${filename}`, 'info');
  },

  // ── Component management ───────────────────────────────────────────────────────
  showNewComponent() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    document.getElementById('newcomp-id').value = '';
    document.getElementById('newcomp-label').value = '';
    document.getElementById('newcomp-tpl').value = 'blank';
    UI.openModal('modal-new-component');
  },

  async confirmNewComponent() {
    const id = Utils.sanitizeFilename(document.getElementById('newcomp-id').value.trim());
    const label = document.getElementById('newcomp-label').value.trim() || id;
    const tpl = document.getElementById('newcomp-tpl').value;

    if (!id) { Utils.showToast('Component ID is required.', 'error'); return; }
    if (State.components[id]) { Utils.showToast(`Component "${id}" already exists.`, 'error'); return; }
    UI.closeModal('modal-new-component');

    const meta = await ProjectManager.addComponent(id, label, tpl);
    if (meta) {
      UI.renderComponents();
      Utils.showToast(`Created component: ${label}`, 'info');
      ComponentEditor.open(id);
    }
  },

  async deleteComponent(id) {
    const label = State.components[id]?.meta?.label || id;
    if (!confirm(`Delete component "${label}"? This cannot be undone.`)) return;
    UI.closeTab(`comp:${id}`);
    await ProjectManager.deleteComponent(id);
    UI.renderComponents();
    Utils.showToast(`Deleted: ${label}`, 'info');
  },

  // ── Shared Data management ─────────────────────────────────────────────────────
  showNewSharedData() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    document.getElementById('newsd-id').value = '';
    document.getElementById('newsd-label').value = '';
    document.getElementById('newsd-type').value = 'menu';
    UI.openModal('modal-new-shared-data');
  },

  async confirmNewSharedData() {
    const id = Utils.sanitizeFilename(document.getElementById('newsd-id').value.trim());
    const label = document.getElementById('newsd-label').value.trim() || id;
    const type = document.getElementById('newsd-type').value;

    if (!id) { Utils.showToast('ID is required.', 'error'); return; }
    UI.closeModal('modal-new-shared-data');

    const sd = await ProjectManager.addSharedData(id, label, type);
    if (sd) {
      UI.renderSharedData();
      Utils.showToast(`Created data: ${label}`, 'info');
      SharedDataEditor.open(id);
    }
  },

  // ── Language management ────────────────────────────────────────────────────────
  showAddLanguage() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    const sel = document.getElementById('addlang-code');
    if (sel) sel.value = 'zh-SC';
    const disp = document.getElementById('addlang-display');
    if (disp) disp.value = '简';
    const wrap = document.getElementById('addlang-custom-wrap');
    if (wrap) wrap.classList.add('hidden');
    UI.openModal('modal-add-language');
  },

  async confirmAddLanguage() {
    let code = document.getElementById('addlang-code').value;
    if (code === 'custom') {
      code = document.getElementById('addlang-custom-code').value.trim();
    }
    const display = document.getElementById('addlang-display').value.trim() || code.toUpperCase();

    if (!code) { Utils.showToast('Language code is required.', 'error'); return; }
    UI.closeModal('modal-add-language');

    const ok = await ProjectManager.addLanguage(code, display);
    if (ok) {
      UI.renderLanguages();
      UI.updatePreviewLangSelect();
      Utils.showToast(`Added language: ${code}`, 'info');
      I18nEditor.open(code);
    }
  },

  // ── Export ─────────────────────────────────────────────────────────────────────
  showExport() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    UI.populateExportModal();
    UI.openModal('modal-export');
  },

  async runExport() {
    const langs = UI.getExportLanguages();
    if (langs.length === 0) { Utils.showToast('Select at least one language.', 'error'); return; }

    // Ensure releases handle
    if (!State.workspaceReleasesHandle) {
      Utils.showToast('Select your releases folder first…', 'info');
      const ok = await ProjectManager.pickReleasesFolder();
      if (!ok) return;
    }

    await Exporter.run(langs);
  },

  // ── App Settings (global — workspace paths) ────────────────────────────────────
  showAppSettings() {
    UI.populateAppSettings();
    UI.openModal('modal-app-settings');
  },

  async reauthorizeProjectsFolder() {
    const h = State.workspaceProjectsHandle;
    if (!h) { Utils.showToast('No projects folder configured.', 'error'); return; }
    try {
      const perm = await h.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        await this._updateWorkspaceStatus();
        Utils.showToast('Projects folder re-authorized.', 'info');
      } else {
        Utils.showToast('Permission denied.', 'error');
      }
    } catch (e) {
      Utils.showToast('Re-authorization failed: ' + (e.message || e), 'error');
    }
  },

  async reauthorizeReleasesFolder() {
    const h = State.workspaceReleasesHandle;
    if (!h) { Utils.showToast('No releases folder configured.', 'error'); return; }
    try {
      const perm = await h.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        await this._updateWorkspaceStatus();
        Utils.showToast('Releases folder re-authorized.', 'info');
      } else {
        Utils.showToast('Permission denied.', 'error');
      }
    } catch (e) {
      Utils.showToast('Re-authorization failed: ' + (e.message || e), 'error');
    }
  },

  // ── Settings ───────────────────────────────────────────────────────────────────
  showSettings() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    UI.populateSettings();
    UI.openModal('modal-settings');
  },

  // ── Auto-detect CSS mode from index.html and update the Settings dropdown ─────
  async detectCssMode() {
    if (!State.projectHandle) { Utils.showToast('Open a project first.', 'error'); return; }
    const indexContent = await ProjectManager.readPage('index.html');
    if (!indexContent) { Utils.showToast('No index.html found in project.', 'error'); return; }
    const detected = ProjectManager._detectCssMode(indexContent);
    const sel = document.getElementById('settings-css-mode');
    if (sel) sel.value = detected;
    const labels = { 'tailwind-cdn': 'Tailwind CDN', 'tailwind-local': 'Tailwind Local', 'custom': 'Custom CSS' };
    Utils.showToast(`Detected: ${labels[detected] || detected}`, 'info');
  },

  async saveSettings() {
    if (!State.project) return;

    // General only — Theme and Head Code now have their own editors
    State.project.title = document.getElementById('settings-title').value.trim() || State.project.title;
    document.getElementById('project-name-display').textContent = State.project.title;

    // Canonical Base URL
    const canonicalBaseEl = document.getElementById('settings-canonical-base');
    if (canonicalBaseEl) {
      State.project.canonicalBase = canonicalBaseEl.value.trim().replace(/\/$/, '') || '';
    }

    const cssModeEl = document.getElementById('settings-css-mode');
    if (cssModeEl) {
      State.project.cssMode = cssModeEl.value || 'tailwind-cdn';
    }

    UI.closeModal('modal-settings');
    await ProjectManager.saveProjectMeta();

    // Refresh ThemeEditor notice if it's currently open
    if (State.activeView === 'theme-editor' && typeof ThemeEditor !== 'undefined') {
      ThemeEditor._renderCssModeNotice();
    }

    Utils.showToast('Settings saved.', 'info');
  },

  // ── Sync component to all pages (template-based) ──────────────────────────────
  // 1. Saves the current component HTML
  // 2. Updates index.html with the new component content (via marker or raw-tag)
  // 3. Rebuilds ALL other pages from updated index.html template (preserving each <main> + <title>)
  async syncComponentToPages() {
    const id = ComponentEditor.getCurrentId();
    if (!id) { Utils.showToast('No component open.', 'error'); return; }

    const comp = State.components[id];
    if (!comp) return;

    // Ensure latest HTML from CodeMirror is in State
    if (State.compCodeMirror) {
      comp.html = State.compCodeMirror.getValue();
    }

    // Save component file
    await ProjectManager.saveComponent(id);

    if (!State.projectHandle) { Utils.showToast('No project open.', 'error'); return; }

    // ── Step 1: Update index.html with this component's latest HTML ──────────
    let indexHtml = await ProjectManager.readPage('index.html') || '';
    const markerStart = `<!-- @component:${id} -->`;
    const markerEnd = `<!-- /@component:${id} -->`;
    const wrappedBlock = `${markerStart}\n${comp.html}\n${markerEnd}`;

    const si = indexHtml.indexOf(markerStart);
    const ei = indexHtml.indexOf(markerEnd);
    if (si !== -1 && ei !== -1 && ei > si) {
      // Marker already present — replace between markers
      indexHtml = indexHtml.slice(0, si) + wrappedBlock + indexHtml.slice(ei + markerEnd.length);
    } else {
      // No marker — locate element in raw HTML and replace
      const parser = new DOMParser();
      const doc = parser.parseFromString(indexHtml, 'text/html');
      const selectors = comp.schema?.selector ? comp.schema.selector.split(',').map(s => s.trim()) : [];
      const targetEl = selectors.length > 0 ? ProjectManager._findElement(doc, selectors) : null;
      if (targetEl) {
        const tagName = targetEl.tagName.toLowerCase();
        const idHint = targetEl.id || null;
        const classHint = targetEl.classList.length > 0 ? targetEl.classList[0] : null;
        const range = ProjectManager._findTagRangeInRawHtml(indexHtml, tagName, idHint, classHint);
        if (range) {
          indexHtml = indexHtml.slice(0, range.start) + wrappedBlock + indexHtml.slice(range.end);
        }
      }
    }
    await ProjectManager.savePage('index.html', indexHtml);

    // ── Step 2: Rebuild all other pages from updated index.html template ─────
    const entries = await FileHandler.listEntries(State.projectHandle);
    const htmlFiles = entries.filter(e => e.kind === 'file' && e.name.endsWith('.html'));

    if (htmlFiles.length <= 1) {
      // Only index.html — nothing else to sync
      UI.setDirty(`comp:${id}`, false);
      Utils.showToast(`"${comp.meta?.label || id}" saved to index.html.`, 'info');
      return;
    }

    Utils.showToast('Rebuilding all pages from index.html template…', 'info');
    const report = await ProjectManager._syncFromIndexTemplate(State.projectHandle, indexHtml, htmlFiles);

    const synced = report.filter(r => r.status === 'synced').length;
    const failed = report.filter(r => r.status === 'failed').length;

    UI.setDirty(`comp:${id}`, false);

    // Refresh page editor if a page is currently open
    if (State.activePage && State.activePage !== 'index.html' && State.pageCodeMirror) {
      const refreshed = await ProjectManager.readPage(State.activePage);
      if (refreshed) {
        State.pageCodeMirror.setValue(refreshed);
        State.pageCodeMirror.clearHistory();
        Preview.renderCurrentPage();
      }
    }

    const label = comp.meta?.label || id;
    Utils.showToast(
      `"${label}" synced — ${synced} page(s) rebuilt from index.html${failed > 0 ? `, ${failed} failed` : ''}.`,
      'info', 4000
    );
  },

  // ── Text Scan ──────────────────────────────────────────────────────────────────
  async runTextScan() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    Utils.showToast('Scanning text…', 'info', 1500);
    this._scanResults = await TextScanner.scan();
    if (this._scanResults.length === 0) {
      Utils.showToast('No text found to extract.', 'info');
      return;
    }
    // Reset filter UI
    const filterEl = document.getElementById('scan-filter');
    if (filterEl) filterEl.value = '';
    const skipEl = document.getElementById('scan-skip-existing');
    if (skipEl) skipEl.checked = true;

    this.filterScanResults();
    UI.openModal('modal-text-scan');
  },

  filterScanResults(text) {
    const results = this._scanResults || [];
    const baseLang = State.project?.baseLanguage || 'en';
    const baseData = State.i18nData[baseLang] || {};

    const filterText = (text || document.getElementById('scan-filter')?.value || '').toLowerCase();
    const skipExisting = document.getElementById('scan-skip-existing')?.checked !== false;

    const filtered = results.filter(r => {
      if (skipExisting && baseData[r.key] !== undefined) return false;
      if (filterText && !r.key.toLowerCase().includes(filterText) && !r.text.toLowerCase().includes(filterText)) return false;
      return true;
    });

    const body = document.getElementById('scan-results-body');
    const summary = document.getElementById('scan-summary');
    if (!body) return;

    const totalNew = results.filter(r => baseData[r.key] === undefined).length;
    if (summary) {
      summary.textContent = `Found ${results.length} strings — ${totalNew} new (not in base lang "${baseLang}"). Showing ${filtered.length}.`;
    }

    if (filtered.length === 0) {
      body.innerHTML = `<tr><td colspan="4" style="padding:20px;text-align:center;color:#444">No results match current filter.</td></tr>`;
      this._scanFiltered = [];
      return;
    }

    // Group by category
    const groups = { global: [], page: [], meta: [] };
    filtered.forEach((r, idx) => groups[r.category]?.push({ r, idx }));

    const groupMeta = {
      global: { label: '🌐 Global — Components (shared across all pages)', color: '#4f46e5' },
      page:   { label: '📄 Page Content (unique per page)', color: '#0891b2' },
      meta:   { label: '📋 Page Metadata (title, description, OG)', color: '#7c3aed' },
    };

    let html = '';
    for (const [cat, items] of Object.entries(groups)) {
      if (items.length === 0) continue;
      const gm = groupMeta[cat];
      // Group header row with select-all for this group
      html += `<tr>
        <td colspan="4" style="padding:6px 8px;background:#0a0a14;border-top:1px solid #1a1a2e">
          <span style="font-size:10px;font-weight:600;color:${gm.color}">${gm.label}</span>
          <span style="float:right;font-size:10px;color:#444">
            <a href="#" onclick="App._scanGroupSelect('${cat}',true);return false" style="color:#4f46e5;text-decoration:none">all</a> /
            <a href="#" onclick="App._scanGroupSelect('${cat}',false);return false" style="color:#444;text-decoration:none">none</a>
          </span>
        </td>
      </tr>`;
      for (const { r, idx } of items) {
        const keyId = `scan-key-${idx}`;
        const existing = baseData[r.key];
        const rowStyle = existing ? 'opacity:0.4' : '';
        const typeBadge = r.type === 'attr' ? '🏷' : '📝';
        html += `<tr style="border-top:1px solid #0d0d18;${rowStyle}" data-cat="${cat}">
          <td style="padding:4px 8px">
            <input type="checkbox" class="scan-cb" data-idx="${idx}" data-cat="${cat}" ${existing ? '' : 'checked'}>
          </td>
          <td style="padding:4px 8px">
            <input type="text" id="${keyId}" value="${Utils.escapeHtml(r.key)}"
                   style="width:100%;background:#080810;border:1px solid #1e1e2a;border-radius:3px;color:#818cf8;font-family:monospace;font-size:10px;padding:2px 5px;outline:none">
          </td>
          <td style="padding:4px 8px;color:#bbb;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escapeHtml(r.text)}">
            ${typeBadge} ${Utils.escapeHtml(r.text.substring(0, 55))}${r.text.length > 55 ? '…' : ''}
          </td>
          <td style="padding:4px 8px;color:#444;font-size:10px">${Utils.escapeHtml(r.source.replace(/^(comp\.|page\.)/, ''))}</td>
        </tr>`;
      }
    }

    body.innerHTML = html;
    this._scanFiltered = filtered;
  },

  _scanGroupSelect(cat, checked) {
    document.querySelectorAll(`#scan-results-body .scan-cb[data-cat="${cat}"]`).forEach(cb => cb.checked = checked);
  },

  scanSelectAll(checked) {
    document.querySelectorAll('#scan-results-body .scan-cb').forEach(cb => cb.checked = checked);
  },

  confirmTextScan() {
    const baseLang = State.project?.baseLanguage || 'en';
    if (!State.i18nData[baseLang]) State.i18nData[baseLang] = {};

    const filtered = this._scanFiltered || [];
    const tbody = document.getElementById('scan-results-body');
    const checkboxes = tbody ? tbody.querySelectorAll('.scan-cb') : [];

    let added = 0;
    checkboxes.forEach((cb, idx) => {
      if (!cb.checked) return;
      const item = filtered[idx];
      if (!item) return;
      // Read (possibly user-edited) key from input
      const keyInput = document.getElementById(`scan-key-${idx}`);
      const key = (keyInput ? keyInput.value.trim() : item.key);
      if (!key) return;
      State.i18nData[baseLang][key] = item.text;
      // Add placeholder for other languages
      for (const l of (State.project.languages || [])) {
        if (l.code !== baseLang) {
          if (!State.i18nData[l.code]) State.i18nData[l.code] = {};
          if (State.i18nData[l.code][key] === undefined) {
            State.i18nData[l.code][key] = '';
          }
        }
      }
      added++;
    });

    UI.closeModal('modal-text-scan');
    if (added > 0) {
      UI.renderLanguages();
      if (State.activeI18nLang) I18nEditor._renderTable();
      Utils.showToast(`Added ${added} key(s) to base language (${baseLang}).`, 'info');
    } else {
      Utils.showToast('No keys selected.', 'info');
    }
  },

  // ── View mode: split / code / preview ─────────────────────────────────────────
  _viewMode: 'split',

  setViewMode(mode) {
    this._viewMode = mode;
    const codePanel    = document.getElementById('editor-code-panel');
    const previewPanel = document.getElementById('editor-preview-panel');
    const resizer      = document.getElementById('editor-split-resizer');

    // Update button states
    ['split','code','preview'].forEach(m => {
      const btn = document.getElementById(`vmode-${m}`);
      if (btn) btn.classList.toggle('active', m === mode);
    });

    if (mode === 'code') {
      if (codePanel)    { codePanel.style.width = '100%'; codePanel.style.display = ''; }
      if (previewPanel) previewPanel.style.display = 'none';
      if (resizer)      resizer.style.display = 'none';
    } else if (mode === 'preview') {
      if (codePanel)    codePanel.style.display = 'none';
      if (previewPanel) { previewPanel.style.display = ''; previewPanel.style.flex = '1'; }
      if (resizer)      resizer.style.display = 'none';
    } else {
      // split
      if (codePanel)    { codePanel.style.display = ''; codePanel.style.width = this._splitWidth || '42%'; }
      if (previewPanel) { previewPanel.style.display = ''; previewPanel.style.flex = '1'; }
      if (resizer)      resizer.style.display = '';
    }

    // Refresh CodeMirror after layout change
    setTimeout(() => {
      State.pageCodeMirror?.refresh();
      State.compCodeMirror?.refresh();
    }, 60);

    Preview.renderCurrentPage();
  },

  _splitWidth: '42%',

  _initSplitResizer() {
    const resizer  = document.getElementById('editor-split-resizer');
    if (!resizer) return;
    let dragging = false;
    let startX   = 0;
    let startW   = 0;

    resizer.addEventListener('mousedown', (e) => {
      const codePanel = document.getElementById('editor-code-panel');
      if (!codePanel) return;
      dragging = true;
      startX   = e.clientX;
      startW   = codePanel.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const codePanel   = document.getElementById('editor-code-panel');
      const splitEl     = codePanel?.parentElement;
      if (!codePanel || !splitEl) return;
      const delta       = e.clientX - startX;
      const totalW      = splitEl.getBoundingClientRect().width;
      const newW        = Math.max(200, Math.min(startW + delta, totalW - 200));
      const pct         = (newW / totalW * 100).toFixed(2) + '%';
      codePanel.style.width = pct;
      this._splitWidth = pct;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor  = '';
      document.body.style.userSelect = '';
      // Refresh editor after resize
      setTimeout(() => State.pageCodeMirror?.refresh(), 60);
    });
  },

  // ── Preview device ─────────────────────────────────────────────────────────────
  setDevice(mode) {
    Preview.setDevice(mode);
  },

  // ── Preview language ───────────────────────────────────────────────────────────
  setPreviewLang(lang) {
    State.previewLanguage = lang;
    Preview.setLanguage(lang);
  },
};

// Boot the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());