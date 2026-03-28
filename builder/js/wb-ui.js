/* ===== wb-ui.js — UI Rendering, Sidebar, Tabs, Modals ===== */

const UI = {

  // ── Initialize UI ────────────────────────────────────────────────────────────
  init() {
    this._sectionStates = { pages: true, components: true, 'shared-data': true, languages: true, theme: true, headcode: true };
  },

  // ── Show a view ──────────────────────────────────────────────────────────────
  showView(name) {
    const views = ['welcome', 'page-editor', 'component-editor', 'shared-data-editor', 'i18n-editor', 'theme-editor', 'headcode-editor'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== name);
    });
    State.activeView = name;
  },

  // ── Load project into sidebar ────────────────────────────────────────────────
  loadSidebar() {
    document.getElementById('sidebar-empty').classList.add('hidden');
    document.getElementById('sidebar-project').classList.remove('hidden');
    document.getElementById('project-name-display').textContent = State.project?.title || State.project?.name || '';
    document.getElementById('btn-export').disabled = false;
    const reimportBtn = document.getElementById('btn-reimport');
    if (reimportBtn) reimportBtn.disabled = false;
    const rebuildBtn = document.getElementById('btn-rebuild');
    if (rebuildBtn) rebuildBtn.disabled = false;

    this.renderPages();
    this.renderComponents();
    this.renderSharedData();
    this.renderLanguages();
    this.updatePreviewLangSelect();

    // Refresh Theme + HeadCode sidebar sections
    if (typeof ThemeEditor !== 'undefined') ThemeEditor._refreshSidebarSwatches();
    if (typeof HeadCodeEditor !== 'undefined') HeadCodeEditor._refreshSidebarStatus();
  },

  // ── Render sidebar sections ──────────────────────────────────────────────────
  renderPages() {
    const el = document.getElementById('section-pages');
    el.innerHTML = (State.pages || []).map(page => `
      <div class="sidebar-item ${State.activePage === page.file ? 'active' : ''}"
           onclick="PageEditor.open('${page.file}')" title="${page.file}">
        <span class="material-symbols-outlined text-gray-600" style="font-size:13px;flex-shrink:0">description</span>
        <span class="item-label">${Utils.escapeHtml(page.file)}</span>
        <span class="item-actions">
          <span class="material-symbols-outlined item-action-btn" style="font-size:14px"
                onclick="event.stopPropagation();App.deletePage('${page.file}')" title="Delete">delete</span>
        </span>
      </div>`).join('');
  },

  renderComponents() {
    const el = document.getElementById('section-components');
    el.innerHTML = Object.entries(State.components).map(([id, comp]) => `
      <div class="sidebar-item ${State.activeComponent === id ? 'active' : ''}"
           onclick="ComponentEditor.open('${id}')" title="${comp.meta?.label || id}">
        <span class="material-symbols-outlined text-purple-800" style="font-size:13px;flex-shrink:0">widgets</span>
        <span class="item-label">${Utils.escapeHtml(comp.meta?.label || id)}</span>
        <span class="item-actions">
          <span class="material-symbols-outlined item-action-btn" style="font-size:14px"
                onclick="event.stopPropagation();App.deleteComponent('${id}')" title="Delete">delete</span>
        </span>
      </div>`).join('');
  },

  renderSharedData() {
    const el = document.getElementById('section-shared-data');
    const items = State.project?.sharedData || [];
    el.innerHTML = items.map(sd => `
      <div class="sidebar-item ${State.activeSharedData === sd.id ? 'active' : ''}"
           onclick="SharedDataEditor.open('${sd.id}')" title="${sd.label || sd.id}">
        <span class="material-symbols-outlined text-green-800" style="font-size:13px;flex-shrink:0">hub</span>
        <span class="item-label">${Utils.escapeHtml(sd.label || sd.id)}</span>
      </div>`).join('');
  },

  renderLanguages() {
    const el = document.getElementById('section-languages');
    const langs = State.project?.languages || [];
    const baseLang = State.project?.baseLanguage;
    // Compute total keys from base language
    const baseKeys = baseLang ? Object.keys(State.i18nData[baseLang] || {}) : [];
    const totalKeys = baseKeys.length;

    el.innerHTML = langs.map(lang => {
      // Compute translation completion for non-base languages
      let progressHtml = '';
      if (!lang.isBase && totalKeys > 0) {
        const langData = State.i18nData[lang.code] || {};
        const filled = baseKeys.filter(k => langData[k] && langData[k].trim() !== '').length;
        const pct = Math.round((filled / totalKeys) * 100);
        const color = pct === 100 ? '#22c55e' : pct >= 50 ? '#f97316' : '#ef4444';
        progressHtml = `<span style="font-size:9px;color:${color};margin-left:auto;flex-shrink:0">${filled}/${totalKeys}</span>`;
      } else if (lang.isBase) {
        progressHtml = `<span style="font-size:9px;color:#555;margin-left:auto;flex-shrink:0">${totalKeys} keys</span>`;
      }

      return `
      <div class="sidebar-item ${State.activeI18nLang === lang.code ? 'active' : ''}"
           onclick="I18nEditor.open('${lang.code}')" title="${lang.label || lang.code}">
        <span class="material-symbols-outlined text-yellow-800" style="font-size:13px;flex-shrink:0">translate</span>
        <span class="item-label">${Utils.escapeHtml(lang.code)}${lang.isBase ? ' <span style="color:#555;font-size:10px">(base)</span>' : ''}</span>
        ${progressHtml}
      </div>`;
    }).join('');
  },

  updatePreviewLangSelect() {
    const sel = document.getElementById('preview-lang-select');
    const langs = State.project?.languages || [];
    sel.innerHTML = langs.map(l =>
      `<option value="${l.code}" ${l.code === State.previewLanguage ? 'selected' : ''}>${l.display || l.code}</option>`
    ).join('');
  },

  // ── Tab management ───────────────────────────────────────────────────────────
  addTab(id, title, icon, viewFn) {
    // If already open, just activate
    const existing = State.openTabs.find(t => t.id === id);
    if (existing) { this.activateTab(id); return; }

    State.openTabs.push({ id, title, icon, viewFn });
    this.renderTabs();
    this.activateTab(id);
  },

  activateTab(id) {
    State.activeTabId = id;
    this.renderTabs();
    const tab = State.openTabs.find(t => t.id === id);
    if (tab && tab.viewFn) tab.viewFn();
  },

  closeTab(id) {
    const idx = State.openTabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    State.openTabs.splice(idx, 1);

    if (State.activeTabId === id) {
      const next = State.openTabs[Math.min(idx, State.openTabs.length - 1)];
      if (next) { this.activateTab(next.id); }
      else { State.activeTabId = null; this.showView('welcome'); }
    }
    this.renderTabs();
  },

  renderTabs() {
    const bar = document.getElementById('tab-bar');
    bar.innerHTML = State.openTabs.map(tab => {
      const icon = tab.icon || 'tab';
      const isActive = tab.id === State.activeTabId;
      const dirty = State.dirtyFlags[tab.id] ? '●' : '';
      return `<div class="editor-tab ${isActive ? 'active' : ''}" onclick="UI.activateTab('${tab.id}')">
        <span class="material-symbols-outlined" style="font-size:13px">${icon}</span>
        <span>${Utils.escapeHtml(tab.title)}</span>
        ${dirty ? `<span style="color:#f97316;font-size:10px;margin-left:2px">${dirty}</span>` : ''}
        <span class="tab-close material-symbols-outlined" style="font-size:14px"
              onclick="event.stopPropagation();UI.closeTab('${tab.id}')">close</span>
      </div>`;
    }).join('');
  },

  // ── Section collapse/expand ──────────────────────────────────────────────────
  toggleSection(name) {
    this._sectionStates[name] = !this._sectionStates[name];
    const section = document.getElementById(`section-${name}`);
    const icon = document.getElementById(`si-${name}`);
    if (this._sectionStates[name]) {
      section.style.display = '';
      if (icon) icon.textContent = 'expand_more';
    } else {
      section.style.display = 'none';
      if (icon) icon.textContent = 'chevron_right';
    }
  },

  // ── Modals ───────────────────────────────────────────────────────────────────
  openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      // Focus first input
      setTimeout(() => {
        const inp = el.querySelector('input, select, textarea');
        if (inp) inp.focus();
      }, 50);
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  },

  // ── Language modal helper ────────────────────────────────────────────────────
  onAddLangChange() {
    const val = document.getElementById('addlang-code').value;
    const wrap = document.getElementById('addlang-custom-wrap');
    wrap.classList.toggle('hidden', val !== 'custom');

    // Auto-fill display name
    const displayMap = {
      'zh-SC': '简', 'zh-TC': '繁', 'ja': '日', 'ko': '한',
      'fr': 'FR', 'de': 'DE', 'es': 'ES',
    };
    const display = document.getElementById('addlang-display');
    if (displayMap[val]) display.value = displayMap[val];
  },

  // ── Export modal ─────────────────────────────────────────────────────────────
  populateExportModal() {
    const langs = State.project?.languages || [];
    const el = document.getElementById('export-lang-list');
    el.innerHTML = langs.map(lang => `
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" value="${lang.code}" ${lang.isBase ? 'checked data-base="true"' : 'checked'}
               class="rounded border-gray-600 bg-gray-800 text-blue-500">
        <span class="text-sm text-gray-300">${lang.display || lang.code}</span>
        <span class="text-xs text-gray-600">${lang.label || ''} ${lang.isBase ? '<span class="text-blue-600">(base)</span>' : ''}</span>
      </label>`).join('');

    const projectName = State.project?.name || 'project';
    document.getElementById('export-output-path').textContent = `releases/${projectName}/`;
    document.getElementById('export-progress-wrap').classList.add('hidden');
    document.getElementById('export-result').classList.add('hidden');
    document.getElementById('btn-run-export').disabled = false;
  },

  getExportLanguages() {
    const boxes = document.querySelectorAll('#export-lang-list input[type=checkbox]:checked');
    return Array.from(boxes).map(b => b.value);
  },

  setExportProgress(pct, text) {
    document.getElementById('export-progress-wrap').classList.remove('hidden');
    document.getElementById('export-progress-bar').style.width = pct + '%';
    document.getElementById('export-progress-text').textContent = text;
  },

  showExportResult(text, success = true) {
    const el = document.getElementById('export-result');
    el.classList.remove('hidden');
    el.className = `rounded-lg p-3 ${success ? 'bg-[#0d1f0d] border border-green-800' : 'bg-[#1f0d0d] border border-red-800'}`;
    document.getElementById('export-result-text').textContent = text;
    document.getElementById('export-result-text').className = `text-xs ${success ? 'text-green-400' : 'text-red-400'}`;
    document.getElementById('btn-run-export').disabled = true;
  },

  // ── App Settings modal (global workspace paths) ───────────────────────────────
  populateAppSettings() {
    const ph = State.workspaceProjectsHandle;
    const rh = State.workspaceReleasesHandle;

    const pEl  = document.getElementById('appsettings-projects-path');
    const rEl  = document.getElementById('appsettings-releases-path');
    const prEl = document.getElementById('appsettings-projects-reauth');
    const rrEl = document.getElementById('appsettings-releases-reauth');

    if (pEl) {
      const hasP = !!(ph?.name);
      pEl.textContent = hasP ? ph.name : 'Not configured';
      pEl.classList.toggle('appsettings-path-ok', hasP);
    }
    if (rEl) {
      const hasR = !!(rh?.name);
      rEl.textContent = hasR ? rh.name : 'Not configured';
      rEl.classList.toggle('appsettings-path-ok', hasR);
    }

    // Check permission state for reauth banners
    this._checkHandlePermission(ph).then(state => {
      if (prEl) prEl.classList.toggle('hidden', state !== 'prompt');
    });
    this._checkHandlePermission(rh).then(state => {
      if (rrEl) rrEl.classList.toggle('hidden', state !== 'prompt');
    });
  },

  // Returns 'granted'|'prompt'|'none' for a FileSystemHandle (async)
  async _checkHandlePermission(handle) {
    if (!handle) return 'none';
    try {
      const state = await handle.queryPermission({ mode: 'readwrite' });
      return state; // 'granted' | 'prompt' | 'denied'
    } catch { return 'none'; }
  },

  // ── Settings modal ───────────────────────────────────────────────────────────
  populateSettings() {
    if (!State.project) return;

    document.getElementById('settings-title').value = State.project.title || '';
    document.getElementById('settings-base-lang').value = State.project.baseLanguage || '';
    const langs = (State.project.languages || []).map(l => `${l.code} (${l.label || l.code})`).join(', ');
    const info = document.querySelector('#settings-lang-info p');
    if (info) info.textContent = `Languages: ${langs}`;

    // CSS Mode
    const cssModeEl = document.getElementById('settings-css-mode');
    const cssHintEl = document.getElementById('settings-css-mode-hint');
    if (cssModeEl) {
      cssModeEl.value = State.project.cssMode || 'tailwind-cdn';
      this._updateCssModeHint(cssModeEl.value, cssHintEl);
      cssModeEl.onchange = () => this._updateCssModeHint(cssModeEl.value, cssHintEl);
    }

    // Canonical Base URL
    const canonicalBaseEl = document.getElementById('settings-canonical-base');
    if (canonicalBaseEl) {
      canonicalBaseEl.value = State.project.canonicalBase || '';
    }

    // Folder paths
    const projectsPath = document.getElementById('settings-projects-path');
    const releasesPath = document.getElementById('settings-releases-path');
    if (projectsPath) {
      projectsPath.textContent = State.workspaceProjectsHandle?.name
        ? `…/${State.workspaceProjectsHandle.name}`
        : 'Not configured';
    }
    if (releasesPath) {
      releasesPath.textContent = State.workspaceReleasesHandle?.name
        ? `…/${State.workspaceReleasesHandle.name}`
        : 'Not configured';
    }
  },

  // ── CSS Mode hint text ────────────────────────────────────────────────────────
  _updateCssModeHint(mode, hintEl) {
    if (!hintEl) return;
    const hints = {
      'tailwind-cdn': 'Tailwind CSS is loaded from CDN. Theme colors & fonts are injected automatically at runtime and on export.',
      'tailwind-local': 'Uses a locally compiled tailwind.css. Theme config is saved but you must recompile CSS manually with the Tailwind CLI after changes.',
      'custom': 'No Tailwind. Theme Editor is disabled. Manage your own CSS files directly in the project folder.',
    };
    hintEl.textContent = hints[mode] || '';
  },

  // ── Insert component picker ──────────────────────────────────────────────────
  populateInsertComponentPicker() {
    const el = document.getElementById('insert-comp-list');
    const comps = Object.entries(State.components);
    if (comps.length === 0) {
      el.innerHTML = '<p class="text-xs text-gray-600 text-center py-4">No components defined yet.</p>';
      return;
    }
    el.innerHTML = comps.map(([id, comp]) => `
      <button onclick="PageEditor.doInsertComponent('${id}'); UI.closeModal('modal-insert-component')"
        class="w-full flex items-center gap-3 px-4 py-2.5 bg-[#161620] hover:bg-[#1e1e2e] border border-[#222228] rounded-lg transition-colors text-left">
        <span class="material-symbols-outlined text-purple-600" style="font-size:18px">widgets</span>
        <div>
          <div class="text-sm text-gray-200">${Utils.escapeHtml(comp.meta?.label || id)}</div>
          <div class="text-xs text-gray-600 font-mono">&lt;!-- @component:${id} --&gt;</div>
        </div>
      </button>`).join('');
  },

  // ── Dirty indicator ──────────────────────────────────────────────────────────
  setDirty(key, dirty) {
    State.dirtyFlags[key] = dirty;
    this.renderTabs();
    // Show/hide dot in toolbars
    if (key.startsWith('page:')) {
      const dot = document.getElementById('page-dirty-dot');
      if (dot) dot.classList.toggle('hidden', !dirty);
    } else if (key.startsWith('comp:')) {
      const dot = document.getElementById('comp-dirty-dot');
      if (dot) dot.classList.toggle('hidden', !dirty);
    }
  },

  clearSidebar() {
    document.getElementById('sidebar-empty').classList.remove('hidden');
    document.getElementById('sidebar-project').classList.add('hidden');
    document.getElementById('project-name-display').textContent = 'No project open';
    document.getElementById('btn-export').disabled = true;
    const reimportBtn2 = document.getElementById('btn-reimport');
    if (reimportBtn2) reimportBtn2.disabled = true;
    const rebuildBtn2 = document.getElementById('btn-rebuild');
    if (rebuildBtn2) rebuildBtn2.disabled = true;
    document.getElementById('tab-bar').innerHTML = '';
    this.showView('welcome');
    State.openTabs = [];
    State.activeTabId = null;
    State.activePage = null;
    State.activeComponent = null;
  },

  // ── Code panel collapse/expand ────────────────────────────────────────────────
  toggleCodePanel() {
    const panel = document.getElementById('editor-code-panel');
    const previewPanel = document.getElementById('editor-preview-panel');
    const btn = document.getElementById('btn-toggle-code');
    const isCollapsed = panel.classList.toggle('collapsed');

    if (isCollapsed) {
      panel.style.display = 'none';
      previewPanel.style.flex = '1';
      if (btn) { btn.title = 'Show Code'; btn.querySelector('.material-symbols-outlined').textContent = 'code'; }
    } else {
      panel.style.display = '';
      previewPanel.style.flex = '';
      if (btn) { btn.title = 'Hide Code'; btn.querySelector('.material-symbols-outlined').textContent = 'code_off'; }
      // Refresh CodeMirror after display restore
      setTimeout(() => {
        if (State.pageCodeMirror) State.pageCodeMirror.refresh();
        if (State.compCodeMirror) State.compCodeMirror.refresh();
      }, 50);
    }
  },

  // ── Project picker modal ──────────────────────────────────────────────────────
  showProjectPicker(projects, callback) {
    this._projectPickerCallback = callback;
    // Store the full project list (with handles) so _onPickProject can look up by index
    this._projectPickerList = projects;

    const list = document.getElementById('project-picker-list');
    if (!list) {
      callback(null);
      return;
    }

    list.innerHTML = projects.map((p, idx) => `
      <div class="project-picker-item" onclick="UI._onPickProject(${idx})">
        <span class="material-symbols-outlined" style="font-size:18px;color:#6366f1;flex-shrink:0">folder_open</span>
        <div style="flex:1;min-width:0">
          <div class="item-label" style="font-size:13px;color:#e0e0e0">${Utils.escapeHtml(p.title)}</div>
          <div style="font-size:11px;color:#555">${Utils.escapeHtml(p.name)}</div>
        </div>
        <span style="font-size:10px;color:#444">${p.meta?.lastModified ? new Date(p.meta.lastModified).toLocaleDateString() : ''}</span>
      </div>`).join('') +
      `<div class="project-picker-item" onclick="UI._onPickProject('__pick__')" style="border-top:1px solid #1a1a24;margin-top:4px;padding-top:8px">
        <span class="material-symbols-outlined" style="font-size:18px;color:#555;flex-shrink:0">folder</span>
        <div style="flex:1"><div class="item-label" style="font-size:13px;color:#777">Browse for folder…</div></div>
      </div>`;

    this.openModal('modal-project-picker');
  },

  _onPickProject(idxOrCommand) {
    this.closeModal('modal-project-picker');
    if (!this._projectPickerCallback) return;
    const cb = this._projectPickerCallback;
    this._projectPickerCallback = null;

    if (idxOrCommand === '__pick__') {
      cb('__pick__');
    } else {
      // Return the full project object including the handle
      const project = (this._projectPickerList || [])[idxOrCommand];
      cb(project || null);
    }
    this._projectPickerList = null;
  },

  cancelProjectPicker() {
    this.closeModal('modal-project-picker');
    if (this._projectPickerCallback) {
      this._projectPickerCallback(null);
      this._projectPickerCallback = null;
    }
  },

  // ── Import Confirm modal ──────────────────────────────────────────────────────
  // components: [{ id, label }]
  // callback: stored for App.confirmImportComponents to call
  showImportConfirmModal(components, callback) {
    this._importConfirmCallback = callback;

    const iconMap = {
      navbar: 'tab',
      footer: 'bottom_app_bar',
      'cookie-banner': 'privacy_tip',
    };

    const list = document.getElementById('import-confirm-list');
    if (!list) { callback(false); return; }

    list.innerHTML = components.map(c => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d0d18;border:1px solid #1a1a2e;border-radius:6px">
        <span class="material-symbols-outlined" style="font-size:16px;color:#6366f1;flex-shrink:0">${iconMap[c.id] || 'widgets'}</span>
        <div style="flex:1">
          <div style="font-size:13px;color:#e0e0e0">${Utils.escapeHtml(c.label)}</div>
          <div style="font-size:11px;color:#555;font-family:monospace">&lt;!-- @component:${Utils.escapeHtml(c.id)} --&gt; &nbsp;·&nbsp; 从 index.html 提取</div>
        </div>
        <span class="material-symbols-outlined" style="font-size:14px;color:#22c55e">check_circle</span>
      </div>`).join('');

    this.openModal('modal-import-confirm');
  },

  resolveImportConfirm(doSync) {
    const cb = this._importConfirmCallback;
    this._importConfirmCallback = null;
    if (cb) cb(doSync);
  },

  // ── Show "Restore last project" prompt on welcome screen ─────────────────────
  showRestorePrompt() {
    const el = document.getElementById('welcome-restore-prompt');
    if (el) el.classList.remove('hidden');
  },
};
