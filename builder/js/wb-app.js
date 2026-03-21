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

  // ── Project: Close ────────────────────────────────────────────────────────────
  closeProject() {
    if (State.project && Object.values(State.dirtyFlags).some(Boolean)) {
      if (!confirm('You have unsaved changes. Close anyway?')) return;
    }
    UI.clearSidebar();
    State.project = null;
    State.projectHandle = null;
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

  // ── Settings ───────────────────────────────────────────────────────────────────
  showSettings() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    UI.populateSettings();
    UI.openModal('modal-settings');
  },

  async saveSettings() {
    if (!State.project) return;
    State.project.title = document.getElementById('settings-title').value.trim() || State.project.title;
    document.getElementById('project-name-display').textContent = State.project.title;
    UI.closeModal('modal-settings');
    await ProjectManager.saveProjectMeta();
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

  // ── Code panel toggle ──────────────────────────────────────────────────────────
  toggleCodePanel() {
    UI.toggleCodePanel();
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