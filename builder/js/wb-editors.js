/* ===== wb-editors.js — PageEditor, ComponentEditor, SharedDataEditor, I18nEditor ===== */

// ─── Page Editor ──────────────────────────────────────────────────────────────
const PageEditor = {
  _filename: null,

  async open(filename) {
    State.activePage = filename;
    State.activeComponent = null;
    State.activeSharedData = null;

    const tabId = `page:${filename}`;
    UI.addTab(tabId, filename, 'description', () => this._activate(filename));
    UI.renderPages();
  },

  async _activate(filename) {
    this._filename = filename;
    UI.showView('page-editor');
    document.getElementById('page-editor-filename').textContent = filename;

    const html = await ProjectManager.readPage(filename) || '';

    if (!State.pageCodeMirror) {
      const wrap = document.getElementById('page-codemirror-wrap');
      wrap.innerHTML = '';
      State.pageCodeMirror = CodeMirror(wrap, {
        value: html,
        mode: 'htmlmixed',
        theme: 'dracula',
        lineNumbers: true,
        lineWrapping: false,
        autoCloseTags: true,
        matchBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: {
          'Ctrl-S': () => this.save(),
          'Cmd-S': () => this.save(),
          'Ctrl-F': () => {
            const wrap = document.getElementById('editor-code-panel');
            if (wrap) SearchReplace.toggle(State.pageCodeMirror, wrap);
          },
          'Cmd-F': () => {
            const wrap = document.getElementById('editor-code-panel');
            if (wrap) SearchReplace.toggle(State.pageCodeMirror, wrap);
          },
        },
      });
      State.pageCodeMirror.on('change', Utils.debounce(() => {
        UI.setDirty(`page:${this._filename}`, true);
        Preview.refresh();
      }, 800));
    } else {
      State.pageCodeMirror.setValue(html);
      State.pageCodeMirror.clearHistory();
    }

    UI.setDirty(`page:${filename}`, false);
    this._loadMetaPanel(filename);
    setTimeout(() => State.pageCodeMirror.refresh(), 50);
    Preview.renderCurrentPage();
  },

  async save() {
    if (!this._filename || !State.pageCodeMirror) return;
    const html = State.pageCodeMirror.getValue();
    await ProjectManager.savePage(this._filename, html);
    UI.setDirty(`page:${this._filename}`, false);
    Utils.showToast(`Saved ${this._filename}`, 'info');
    Preview.renderCurrentPage();
  },

  insertComponent() {
    UI.populateInsertComponentPicker();
    UI.openModal('modal-insert-component');
  },

  doInsertComponent(id) {
    if (!State.pageCodeMirror) return;
    const marker = `\n<!-- @component:${id} -->\n`;
    const cursor = State.pageCodeMirror.getCursor();
    State.pageCodeMirror.replaceRange(marker, cursor);
    UI.setDirty(`page:${this._filename}`, true);
  },

  getCurrentHtml() {
    return State.pageCodeMirror ? State.pageCodeMirror.getValue() : null;
  },

  // ── Page Metadata panel ───────────────────────────────────────────────────
  toggleMeta() {
    const fields = document.getElementById('page-meta-fields');
    const chevron = document.getElementById('page-meta-chevron');
    if (!fields) return;
    const isHidden = fields.classList.toggle('hidden');
    if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(90deg)';
  },

  _loadMetaPanel(filename) {
    const page = (State.pages || []).find(p => p.file === filename);
    const meta = page?.meta || {};
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('meta-title', meta.title);
    set('meta-desc', meta.description);
    set('meta-og-title', meta.ogTitle);
    set('meta-og-desc', meta.ogDescription);
    set('meta-og-image', meta.ogImage);
    set('meta-canonical', meta.canonical);
  },

  onMetaChange() {
    if (!this._filename) return;
    const page = (State.pages || []).find(p => p.file === this._filename);
    if (!page) return;
    const get = (id) => document.getElementById(id)?.value.trim() || '';
    page.meta = {
      title:         get('meta-title'),
      description:   get('meta-desc'),
      ogTitle:       get('meta-og-title'),
      ogDescription: get('meta-og-desc'),
      ogImage:       get('meta-og-image'),
      canonical:     get('meta-canonical'),
    };
    // Debounced save to project.json
    clearTimeout(this._metaSaveTimer);
    this._metaSaveTimer = setTimeout(() => ProjectManager.saveProjectMeta(), 1200);
  },

  getCurrentFilename() { return this._filename; },
};

// ─── Component Editor ─────────────────────────────────────────────────────────
// New layout: left info panel (always visible) + right top preview + right bottom code
const ComponentEditor = {
  _id: null,

  async open(id) {
    State.activeComponent = id;
    State.activePage = null;
    State.activeSharedData = null;

    const comp = State.components[id];
    if (!comp) return;

    const label = comp.meta?.label || id;
    const tabId = `comp:${id}`;
    UI.addTab(tabId, label, 'widgets', () => this._activate(id));
    UI.renderComponents();
  },

  async _activate(id) {
    this._id = id;
    const comp = State.components[id];
    if (!comp) return;

    UI.showView('component-editor');
    document.getElementById('comp-editor-name').textContent = comp.meta?.label || id;

    // Usage info in code panel label
    const usages = await ProjectManager.findComponentUsages(id);
    const usedInEl = document.getElementById('comp-used-in');
    if (usedInEl) {
      usedInEl.textContent = usages.length > 0
        ? `Used in: ${usages.join(', ')}`
        : 'Not used in any page yet';
    }

    UI.setDirty(`comp:${id}`, false);

    // Render left info panel
    this._renderInfoPanel();

    // Render code editor in right-bottom
    this._renderCodeEditor(comp);

    // Render preview
    Preview.renderComponent(id);
  },

  // ── Left panel: visual fields + shared data + syntax help ─────────────────
  _renderInfoPanel() {
    const comp = State.components[this._id];
    if (!comp) return;
    const schema = comp.schema || { fields: [], sharedDataRefs: [] };
    const wrap = document.getElementById('comp-editor-content');
    if (!wrap) return;

    let html = '';

    // Description
    if (schema.description) {
      html += `<p style="font-size:11px;color:#555;margin-bottom:16px;line-height:1.6">${Utils.escapeHtml(schema.description)}</p>`;
    }

    // Fields section
    if (schema.fields && schema.fields.length > 0) {
      html += '<div class="vf-section"><div class="vf-section-title">Fields</div>';
      for (const field of schema.fields) {
        html += this._renderField(field, comp);
      }
      html += '</div>';
    }

    // Shared data references
    if (schema.sharedDataRefs && schema.sharedDataRefs.length > 0) {
      html += '<div class="vf-section"><div class="vf-section-title">Shared Data</div>';
      for (const ref of schema.sharedDataRefs) {
        const sd = State.sharedData[ref];
        html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer" onclick="SharedDataEditor.open('${ref}')">
          <span class="material-symbols-outlined" style="font-size:14px;color:#4ade80">hub</span>
          <span style="font-size:12px;color:#aaa;flex:1">${Utils.escapeHtml(sd?.label || ref)}</span>
          <span style="font-size:11px;color:#444">Edit →</span>
        </div>`;
      }
      html += '</div>';
    }

    // Template syntax reference
    html += `<div class="vf-section">
      <div class="vf-section-title">Template Syntax</div>
      <div style="background:#0a0a0e;border:1px solid #1e1e28;border-radius:5px;padding:10px;display:flex;flex-direction:column;gap:5px">
        <p style="font-size:11px;color:#555"><code style="color:#818cf8">{{field:key}}</code> — field value</p>
        <p style="font-size:11px;color:#555"><code style="color:#fbbf24">{{t:i18n.key}}</code> — translated text</p>
        <p style="font-size:11px;color:#555"><code style="color:#4ade80">&lt;!-- @each:data-id --&gt;</code> — loop</p>
        <p style="font-size:11px;color:#555"><code style="color:#4ade80">{{item.fieldKey}}</code> — loop item field</p>
        <p style="font-size:11px;color:#555"><code style="color:#60a5fa">{{pageName}}</code> — current page</p>
      </div>
    </div>`;

    wrap.innerHTML = html;

    // Attach field change listeners (regular fields)
    wrap.querySelectorAll('.vf-input:not(.vf-i18n-input)').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        const field = (comp.schema?.fields || []).find(f => f.key === key);
        if (field) {
          field.value = input.value;
          UI.setDirty(`comp:${this._id}`, true);
          Preview.renderComponent(this._id);
        }
      });
    });

    // Attach i18n-ref field change listeners (base language string editing)
    wrap.querySelectorAll('.vf-i18n-input').forEach(input => {
      input.addEventListener('input', () => {
        const i18nKey = input.dataset.i18nKey;
        const lang = input.dataset.lang;
        if (!i18nKey || !lang) return;
        if (!State.i18nData[lang]) State.i18nData[lang] = {};
        State.i18nData[lang][i18nKey] = input.value;
        UI.setDirty(`comp:${this._id}`, true);
        // Debounced auto-save the i18n file
        clearTimeout(this._i18nSaveTimer);
        this._i18nSaveTimer = setTimeout(() => {
          ProjectManager.saveI18n(lang);
          UI.renderLanguages();
        }, 1500);
        Preview.renderComponent(this._id);
      });
    });
  },

  _renderField(field, comp) {
    if (field.i18n && field.type === 'i18n-ref') {
      const baseLang = State.project?.baseLanguage || 'en';
      const currentVal = State.i18nData[baseLang]?.[field.i18nKey] || field.defaultValue || '';
      return `<div class="vf-field">
        <div class="vf-label">
          <span>${Utils.escapeHtml(field.label)}</span>
          <span class="vf-i18n-badge" onclick="I18nEditor.open('${baseLang}')">🌍 ${Utils.escapeHtml(field.i18nKey)}</span>
        </div>
        <input type="text" class="vf-input vf-i18n-input"
               data-i18n-key="${Utils.escapeHtml(field.i18nKey)}"
               data-lang="${Utils.escapeHtml(baseLang)}"
               value="${Utils.escapeHtml(currentVal)}"
               placeholder="Enter ${Utils.escapeHtml(baseLang)} text…">
      </div>`;
    }

    const val = field.value || '';
    const inputType = field.type === 'url' ? 'url' : 'text';
    return `<div class="vf-field">
      <div class="vf-label">${Utils.escapeHtml(field.label)}</div>
      <input type="${inputType}" class="vf-input" data-key="${Utils.escapeHtml(field.key)}"
             value="${Utils.escapeHtml(val)}"
             placeholder="${field.type === 'url' ? 'https://… or page.html' : 'Value…'}">
    </div>`;
  },

  // ── Right-bottom: CodeMirror code editor ────────────────────────────────────
  _renderCodeEditor(comp) {
    const wrap = document.getElementById('comp-codemirror-wrap');
    if (!wrap) return;

    if (!State.compCodeMirror) {
      State.compCodeMirror = CodeMirror(wrap, {
        value: comp.html || '',
        mode: 'htmlmixed',
        theme: 'dracula',
        lineNumbers: true,
        lineWrapping: false,
        autoCloseTags: true,
        matchBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: {
          'Ctrl-S': () => ComponentEditor.save(),
          'Cmd-S': () => ComponentEditor.save(),
          'Ctrl-F': () => {
            const wrap = document.querySelector('.comp-code-area');
            if (wrap) SearchReplace.toggle(State.compCodeMirror, wrap);
          },
          'Cmd-F': () => {
            const wrap = document.querySelector('.comp-code-area');
            if (wrap) SearchReplace.toggle(State.compCodeMirror, wrap);
          },
        },
      });

      // Code → State + preview (debounced)
      State.compCodeMirror.on('change', Utils.debounce(() => {
        if (!ComponentEditor._id) return;
        const html = State.compCodeMirror.getValue();
        State.components[ComponentEditor._id].html = html;
        UI.setDirty(`comp:${ComponentEditor._id}`, true);
        Preview.renderComponent(ComponentEditor._id);
      }, 500));
    } else {
      State.compCodeMirror.setValue(comp.html || '');
      State.compCodeMirror.clearHistory();
    }

    setTimeout(() => State.compCodeMirror.refresh(), 60);
  },

  async save() {
    if (!this._id) return;
    const comp = State.components[this._id];
    if (!comp) return;

    // Always sync from CodeMirror (source of truth)
    if (State.compCodeMirror) {
      comp.html = State.compCodeMirror.getValue();
    }

    await ProjectManager.saveComponent(this._id);
    UI.setDirty(`comp:${this._id}`, false);
    Utils.showToast(`Saved: ${comp.meta?.label || this._id}`, 'info');
    Preview.renderComponent(this._id);
  },

  getCurrentId() { return this._id; },
};

// ─── Shared Data Editor ───────────────────────────────────────────────────────
const SharedDataEditor = {
  _id: null,

  open(id) {
    State.activeSharedData = id;
    State.activePage = null;
    State.activeComponent = null;

    const sdMeta = State.project?.sharedData?.find(sd => sd.id === id);
    const label = sdMeta?.label || id;
    const tabId = `sd:${id}`;
    UI.addTab(tabId, label, 'hub', () => this._activate(id));
    UI.renderSharedData();
  },

  _activate(id) {
    this._id = id;
    const data = State.sharedData[id];
    if (!data) return;

    UI.showView('shared-data-editor');
    document.getElementById('sd-editor-name').textContent = data.label || id;

    const usages = ProjectManager.findSharedDataUsages(id);
    document.getElementById('sd-used-in').textContent =
      usages.length > 0 ? `Used in: ${usages.join(', ')}` : 'Not used in any component';

    this._renderForm(id, data);
  },

  _renderForm(id, data) {
    const wrap = document.getElementById('sd-editor-content');
    const type = data.type || 'custom';
    let html = '';

    // Header info
    html += `<div class="mb-5 flex items-center gap-3">
      <span class="px-2 py-0.5 bg-green-900/50 border border-green-800/50 rounded text-xs text-green-400">${Utils.escapeHtml(type)}</span>
      <span class="text-xs text-gray-600">${Utils.escapeHtml(data.label || id)}</span>
    </div>`;

    // Items list
    html += `<div class="vf-section">
      <div class="vf-section-title flex items-center justify-between">
        <span>Items ${data.type === 'languages' ? '(Language entries)' : ''}</span>
        <button onclick="SharedDataEditor.addItem()" 
          class="flex items-center gap-1 px-2 py-0.5 bg-green-900/50 hover:bg-green-900 border border-green-800/40 rounded text-xs text-green-400 transition-colors">
          <span class="material-symbols-outlined" style="font-size:12px">add</span>Add Item
        </button>
      </div>
      <div id="sd-items-list" class="space-y-2 mt-2">`;

    const items = data.items || [];
    if (items.length === 0) {
      html += '<p class="text-xs text-gray-600 py-4 text-center">No items yet. Click "Add Item" to start.</p>';
    } else {
      items.forEach((item, idx) => {
        html += this._renderItemRow(id, item, idx, data.fields || [], type);
      });
    }

    html += `</div></div>`;

    // Template reference hint
    html += `<div class="mt-5 bg-[#0d0d11] border border-[#1e1e28] rounded-lg p-4">
      <p class="text-xs text-gray-500 mb-1">Use in component templates:</p>
      <code class="text-xs text-green-400">&lt;!-- @each:${id} --&gt;</code>
      <p class="text-xs text-gray-600 mt-1">Item fields: ${(data.fields || []).map(f => `<code class="text-gray-500">{{item.${f.key}}}</code>`).join(', ')}</p>
    </div>`;

    wrap.innerHTML = html;
  },

  _renderItemRow(sdId, item, idx, fields, type) {
    const isLanguage = type === 'languages';
    const isMenu = type === 'menu';
    const isIcons = type === 'icon-links';

    let inputs = '';
    if (isLanguage) {
      inputs = `
        <input type="text" value="${Utils.escapeHtml(item.code || '')}" placeholder="code (e.g. zh-SC)"
               class="list-item-input" data-field="code" data-idx="${idx}" style="width:80px">
        <input type="text" value="${Utils.escapeHtml(item.display || '')}" placeholder="display (e.g. 简)"
               class="list-item-input" data-field="display" data-idx="${idx}" style="width:60px">
        <input type="text" value="${Utils.escapeHtml(item.pathPrefix || '')}" placeholder="prefix (e.g. zh-SC/)"
               class="list-item-input" data-field="pathPrefix" data-idx="${idx}" style="flex:1">`;
    } else if (isMenu) {
      inputs = `
        <input type="text" value="${Utils.escapeHtml(item.label || '')}" placeholder="Label (e.g. About)"
               class="list-item-input" data-field="label" data-idx="${idx}" style="flex:1">
        <input type="text" value="${Utils.escapeHtml(item.i18nKey || '')}" placeholder="i18n key"
               class="list-item-input" data-field="i18nKey" data-idx="${idx}" style="width:120px">
        <input type="text" value="${Utils.escapeHtml(item.href || '')}" placeholder="href (e.g. about.html)"
               class="list-item-input" data-field="href" data-idx="${idx}" style="flex:1">`;
    } else if (isIcons) {
      inputs = `
        <input type="text" value="${Utils.escapeHtml(item.label || '')}" placeholder="Label"
               class="list-item-input" data-field="label" data-idx="${idx}" style="flex:1">
        <input type="text" value="${Utils.escapeHtml(item.icon || '')}" placeholder="Icon name"
               class="list-item-input" data-field="icon" data-idx="${idx}" style="flex:1">
        <input type="text" value="${Utils.escapeHtml(item.href || '')}" placeholder="URL/href"
               class="list-item-input" data-field="href" data-idx="${idx}" style="flex:1">`;
    } else {
      // Custom fields
      inputs = (fields.length > 0 ? fields : [{ key: 'value', label: 'Value' }]).map(f => `
        <input type="text" value="${Utils.escapeHtml(item[f.key] || '')}" placeholder="${Utils.escapeHtml(f.label)}"
               class="list-item-input" data-field="${f.key}" data-idx="${idx}" style="flex:1">`).join('');
    }

    return `<div class="list-editor-item" data-idx="${idx}">
      <span class="material-symbols-outlined drag-handle" style="font-size:16px">drag_indicator</span>
      <div style="display:flex;gap:6px;flex:1;align-items:center">${inputs}</div>
      <span class="material-symbols-outlined delete-btn" onclick="SharedDataEditor.removeItem(${idx})">delete</span>
    </div>`;
  },

  addItem() {
    if (!this._id) return;
    const data = State.sharedData[this._id];
    if (!data) return;

    if (!data.items) data.items = [];
    const newItem = { id: Utils.generateId() };

    // Pre-fill based on type
    if (data.type === 'menu') {
      newItem.label = 'New Item';
      newItem.i18nKey = 'nav.new_item';
      newItem.href = '#';
    } else if (data.type === 'icon-links') {
      newItem.label = 'Social';
      newItem.icon = 'link';
      newItem.href = '#';
    } else if (data.type === 'languages') {
      newItem.code = '';
      newItem.display = '';
      newItem.pathPrefix = '';
    }

    data.items.push(newItem);
    this._renderForm(this._id, data);
    this._attachInputListeners();
  },

  removeItem(idx) {
    if (!this._id) return;
    const data = State.sharedData[this._id];
    if (!data || !data.items) return;
    data.items.splice(idx, 1);
    this._renderForm(this._id, data);
    this._attachInputListeners();
  },

  _attachInputListeners() {
    const wrap = document.getElementById('sd-editor-content');
    if (!wrap) return;
    wrap.querySelectorAll('.list-item-input').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        const data = State.sharedData[this._id];
        if (data && data.items && data.items[idx] !== undefined) {
          data.items[idx][field] = input.value;
        }
      });
    });
  },

  async save() {
    if (!this._id) return;
    this._attachInputListeners(); // flush any pending
    await ProjectManager.saveSharedData(this._id);
    Utils.showToast(`Saved: ${State.sharedData[this._id]?.label || this._id}`, 'info');

    // Re-render preview if currently viewing a page that uses this component
    if (State.activePage) Preview.renderCurrentPage();
  },
};

// ─── i18n Editor ─────────────────────────────────────────────────────────────
const I18nEditor = {
  _lang: null,
  _filterText: '',
  _filterMissing: false,

  open(lang) {
    State.activeI18nLang = lang;
    const langMeta = State.project?.languages?.find(l => l.code === lang);
    const label = langMeta ? `${lang} — ${langMeta.label || lang}` : lang;
    const tabId = `i18n:${lang}`;
    UI.addTab(tabId, lang, 'translate', () => this._activate(lang));
    UI.renderLanguages();
  },

  _activate(lang) {
    this._lang = lang;
    UI.showView('i18n-editor');

    const langMeta = State.project?.languages?.find(l => l.code === lang);
    document.getElementById('i18n-editor-title').textContent =
      `${lang}${langMeta?.label ? ` — ${langMeta.label}` : ''}`;

    // Sync filter UI state
    const searchEl = document.getElementById('i18n-search');
    if (searchEl) searchEl.value = this._filterText;
    const missingBtn = document.getElementById('i18n-filter-missing');
    if (missingBtn) missingBtn.classList.toggle('active', this._filterMissing);

    this._renderTable();
  },

  _renderTable() {
    const lang = this._lang;
    const baseLang = State.project?.baseLanguage || 'en';
    const isBase = lang === baseLang;
    const data = State.i18nData[lang] || {};
    const baseData = State.i18nData[baseLang] || {};

    // Collect all keys (union of base + current)
    const allKeys = new Set([...Object.keys(baseData), ...Object.keys(data)]);
    let keys = Array.from(allKeys).sort();
    const allMissing = keys.filter(k => !data[k] && !isBase);

    document.getElementById('i18n-missing-count').textContent =
      allMissing.length > 0 ? `${allMissing.length} missing` : '';

    // Apply filters
    const filterText = (this._filterText || '').toLowerCase();
    if (filterText) {
      keys = keys.filter(k => {
        return k.toLowerCase().includes(filterText)
          || (baseData[k] || '').toLowerCase().includes(filterText)
          || (data[k] || '').toLowerCase().includes(filterText);
      });
    }
    if (this._filterMissing && !isBase) {
      keys = keys.filter(k => !data[k]);
    }

    let html = `<table class="i18n-table">
      <thead><tr>
        <th style="width:200px">Key</th>
        ${!isBase ? `<th>${Utils.escapeHtml(baseLang)} (base)</th>` : ''}
        <th>${Utils.escapeHtml(lang)}</th>
        <th style="width:32px"></th>
      </tr></thead>
      <tbody>`;

    for (const key of keys) {
      const baseVal = baseData[key] || '';
      const val = data[key] || '';
      const isMissing = !isBase && !val;
      const keyParts = key.split('.');
      const keyDisplay = keyParts.length > 1
        ? `<span class="key-group">${Utils.escapeHtml(keyParts.slice(0, -1).join('.') + '.')}</span>${Utils.escapeHtml(keyParts[keyParts.length - 1])}`
        : Utils.escapeHtml(key);

      html += `<tr>
        <td class="i18n-row-key">${keyDisplay}</td>
        ${!isBase ? `<td class="i18n-value-cell"><input type="text" value="${Utils.escapeHtml(baseVal)}" readonly
          style="color:#444;background:#050508"></td>` : ''}
        <td class="i18n-value-cell">
          <input type="text" data-key="${Utils.escapeHtml(key)}"
                 value="${Utils.escapeHtml(val)}"
                 placeholder="${isBase ? 'Enter value…' : (baseVal ? Utils.escapeHtml(baseVal) : 'Translation…')}"
                 class="${isMissing ? 'missing' : ''}">
        </td>
        <td class="i18n-row-actions">
          <span class="material-symbols-outlined i18n-delete-btn" onclick="I18nEditor.deleteKey('${Utils.escapeHtml(key)}')">delete</span>
        </td>
      </tr>`;
    }

    const totalKeys = Array.from(allKeys).length;
    if (totalKeys === 0) {
      html += `<tr><td colspan="4" style="padding:24px;text-align:center;color:#444;font-size:12px">
        No translation keys yet. Click "Add Key" to create one.
      </td></tr>`;
    } else if (keys.length === 0) {
      html += `<tr><td colspan="4" style="padding:24px;text-align:center;color:#444;font-size:12px">
        No keys match current filter.
      </td></tr>`;
    }

    html += '</tbody></table>';
    document.getElementById('i18n-editor-content').innerHTML = html;

    // Attach live edit listeners
    document.querySelectorAll('#i18n-editor-content input[data-key]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        if (!State.i18nData[lang]) State.i18nData[lang] = {};
        State.i18nData[lang][key] = input.value;
        input.classList.toggle('missing', !input.value && !isBase);
        this._updateMissingCount();
        UI.renderLanguages(); // refresh progress badges
      });
    });
  },

  _updateMissingCount() {
    const lang = this._lang;
    const baseLang = State.project?.baseLanguage || 'en';
    if (lang === baseLang) return;
    const data = State.i18nData[lang] || {};
    const baseData = State.i18nData[baseLang] || {};
    const missing = Object.keys(baseData).filter(k => !data[k]);
    document.getElementById('i18n-missing-count').textContent =
      missing.length > 0 ? `${missing.length} missing` : '';
  },

  addKey() {
    const lang = this._lang || State.project?.baseLanguage;
    document.getElementById('newkey-key').value = '';
    document.getElementById('newkey-value').value = '';
    document.getElementById('newkey-lang-label').textContent = lang;
    UI.openModal('modal-add-i18n-key');
  },

  confirmAddKey() {
    const key = document.getElementById('newkey-key').value.trim();
    const val = document.getElementById('newkey-value').value.trim();
    const lang = this._lang || State.project?.baseLanguage;

    if (!key) { Utils.showToast('Key cannot be empty.', 'error'); return; }

    if (!State.i18nData[lang]) State.i18nData[lang] = {};
    State.i18nData[lang][key] = val;

    // If this is the base language, add empty entry to all other languages
    if (lang === State.project?.baseLanguage) {
      for (const l of (State.project.languages || [])) {
        if (l.code !== lang && State.i18nData[l.code]) {
          if (State.i18nData[l.code][key] === undefined) {
            State.i18nData[l.code][key] = '';
          }
        }
      }
    }

    UI.closeModal('modal-add-i18n-key');
    this._renderTable();
  },

  deleteKey(key) {
    const lang = this._lang;
    if (!lang || !State.i18nData[lang]) return;
    delete State.i18nData[lang][key];
    this._renderTable();
  },

  // ── Filter helpers ────────────────────────────────────────────────────────────
  setFilter(text) {
    this._filterText = text || '';
    this._renderTable();
  },

  toggleMissingFilter() {
    this._filterMissing = !this._filterMissing;
    const btn = document.getElementById('i18n-filter-missing');
    if (btn) btn.classList.toggle('active', this._filterMissing);
    this._renderTable();
  },

  // ── Export all translations as CSV ────────────────────────────────────────────
  // Columns: key, lang1, lang2, …  (all languages in project)
  exportCsv() {
    const langs = (State.project?.languages || []).map(l => l.code);
    const baseLang = State.project?.baseLanguage || (langs[0] || 'en');

    // Collect union of all keys
    const allKeys = new Set();
    for (const lc of langs) {
      Object.keys(State.i18nData[lc] || {}).forEach(k => allKeys.add(k));
    }
    const keys = Array.from(allKeys).sort();

    // Build CSV: header row + data rows
    const csvEscape = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const header = ['key', ...langs].map(csvEscape).join(',');
    const rows = keys.map(key =>
      [key, ...langs.map(lc => (State.i18nData[lc] || {})[key] || '')].map(csvEscape).join(',')
    );
    const csv = [header, ...rows].join('\r\n');

    // Download
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${State.project?.name || 'project'}-translations.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.showToast('CSV exported.', 'info');
  },

  // ── Import translations from CSV ──────────────────────────────────────────────
  // Accepted formats:
  //   A) Full CSV:  key, lang1, lang2, …  (first row = headers, first col = key)
  //   B) Pair CSV:  key, value            (import into current language)
  importCsvFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.replace(/^\uFEFF/, ''); // strip BOM
      try {
        const result = this._parseCsvImport(text);
        this._applyImport(result);
      } catch (err) {
        Utils.showToast(`CSV import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  _parseCsvImport(text) {
    // Parse CSV respecting quoted fields
    const parseRow = (line) => {
      const fields = [];
      let cur = '', inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') { inQuote = false; }
          else { cur += ch; }
        } else {
          if (ch === '"') { inQuote = true; }
          else if (ch === ',') { fields.push(cur); cur = ''; }
          else { cur += ch; }
        }
      }
      fields.push(cur);
      return fields;
    };

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV has fewer than 2 rows.');

    const headers = parseRow(lines[0]).map(h => h.trim());
    if (headers[0].toLowerCase() !== 'key') throw new Error('First column must be "key".');

    const langCols = headers.slice(1); // column indexes → language codes or just 'value'
    const result = {}; // { langCode: { key: value } }

    const projectLangs = (State.project?.languages || []).map(l => l.code);

    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      const key = (row[0] || '').trim();
      if (!key) continue;
      for (let c = 0; c < langCols.length; c++) {
        const colHeader = langCols[c];
        // If column header matches a project language code, use it; else import into current lang
        const targetLang = projectLangs.includes(colHeader) ? colHeader : this._lang;
        if (!targetLang) continue;
        if (!result[targetLang]) result[targetLang] = {};
        const val = (row[c + 1] || '').trim();
        if (val) result[targetLang][key] = val;
      }
    }
    return result;
  },

  _applyImport(result) {
    let totalUpdated = 0;
    for (const [lc, entries] of Object.entries(result)) {
      if (!State.i18nData[lc]) State.i18nData[lc] = {};
      for (const [key, val] of Object.entries(entries)) {
        State.i18nData[lc][key] = val;
        totalUpdated++;
      }
    }
    this._renderTable();
    UI.renderLanguages();
    Utils.showToast(`Imported ${totalUpdated} translation values.`, 'info');
  },

  // ── Import a single-language JSON file ────────────────────────────────────────
  importJsonFile(file) {
    if (!file || !this._lang) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (typeof json !== 'object' || Array.isArray(json)) throw new Error('Expected a JSON object { key: value }');
        if (!State.i18nData[this._lang]) State.i18nData[this._lang] = {};
        let count = 0;
        for (const [key, val] of Object.entries(json)) {
          if (typeof val === 'string') {
            State.i18nData[this._lang][key] = val;
            count++;
          }
        }
        this._renderTable();
        UI.renderLanguages();
        Utils.showToast(`Imported ${count} keys into ${this._lang}.`, 'info');
      } catch (err) {
        Utils.showToast(`JSON import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  // ── Trigger CSV/JSON import via hidden file input ─────────────────────────────
  triggerImport() {
    const inp = document.getElementById('i18n-import-file');
    if (inp) { inp.value = ''; inp.click(); }
  },

  onImportFileChange(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.json')) {
      this.importJsonFile(file);
    } else {
      this.importCsvFile(file);
    }
  },

  async save() {
    if (!this._lang) return;
    await ProjectManager.saveI18n(this._lang);
    Utils.showToast(`Saved translations: ${this._lang}`, 'info');
    UI.renderLanguages();
    Preview.renderCurrentPage();
  },
};

// ─── Theme Editor ─────────────────────────────────────────────────────────────
const ThemeEditor = {
  _tabId: 'theme-editor',

  open() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    UI.addTab(this._tabId, 'Theme', 'palette', () => this._activate());
  },

  _activate() {
    UI.showView('theme-editor');
    this._renderCssModeNotice();
    this._loadValues();
    this._populatePageSelect();
    this._refreshPreview();
    this._refreshSidebarSwatches();
  },

  // ── CSS mode notice banner ────────────────────────────────────────────────────
  _renderCssModeNotice() {
    const cssMode = State.project?.cssMode || 'tailwind-cdn';
    const noticeEl = document.getElementById('theme-editor-css-notice');
    if (!noticeEl) return;

    const hasElectron = typeof window.electronAPI !== 'undefined';

    const notices = {
      'tailwind-cdn': '',
      'tailwind-local': hasElectron
        ? `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:#0a1a0a;border:1px solid #166534;border-radius:6px;margin-bottom:16px">
          <span class="material-symbols-outlined" style="font-size:16px;color:#4ade80;flex-shrink:0;margin-top:1px">auto_fix_high</span>
          <div>
            <p style="font-size:12px;color:#86efac;font-weight:600;margin:0 0 3px">Local CSS Mode — Auto-compile enabled</p>
            <p style="font-size:11px;color:#166534;line-height:1.5;margin:0">Saving the theme will automatically write <code style="background:#071207;padding:1px 4px;border-radius:3px">tailwind.config.js</code> and recompile <code style="background:#071207;padding:1px 4px;border-radius:3px">assets/css/tailwind.css</code> in your project folder. You'll be asked to confirm the folder on first compile.</p>
          </div>
        </div>`
        : `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:#1a1200;border:1px solid #78350f;border-radius:6px;margin-bottom:16px">
          <span class="material-symbols-outlined" style="font-size:16px;color:#f59e0b;flex-shrink:0;margin-top:1px">warning</span>
          <div>
            <p style="font-size:12px;color:#fbbf24;font-weight:600;margin:0 0 3px">Local CSS Mode</p>
            <p style="font-size:11px;color:#a16207;line-height:1.5;margin:0">Color & font changes update the theme config only. Run <code style="background:#0f0900;padding:1px 4px;border-radius:3px">npx tailwindcss -i input.css -o assets/css/tailwind.css</code> in your project folder to recompile. (Auto-compile requires Electron mode.)</p>
          </div>
        </div>`,
      'custom': `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:#0a0a1a;border:1px solid #2e2e4e;border-radius:6px;margin-bottom:16px">
        <span class="material-symbols-outlined" style="font-size:16px;color:#6366f1;flex-shrink:0;margin-top:1px">info</span>
        <div>
          <p style="font-size:12px;color:#818cf8;font-weight:600;margin:0 0 3px">Custom CSS Mode</p>
          <p style="font-size:11px;color:#4a4a6a;line-height:1.5;margin:0">This project uses custom/pre-built CSS. The Theme Editor does not apply to your stylesheets. Edit your CSS files directly.</p>
        </div>
      </div>`,
    };

    noticeEl.innerHTML = notices[cssMode] || '';

    // Disable interactive controls in 'custom' mode
    const controls = document.getElementById('theme-editor-controls');
    if (controls) {
      controls.style.opacity = cssMode === 'custom' ? '0.35' : '';
      controls.style.pointerEvents = cssMode === 'custom' ? 'none' : '';
    }
  },

  _loadValues() {
    const theme = State.project?.theme || {};
    const colors = theme.colors || {};
    const fonts = theme.fonts || {};
    const radius = theme.radius || 'sharp';

    const colorKeys = ['primary', 'primaryContainer', 'surface', 'onSurface', 'secondary'];
    const defaults = {
      primary: '#e9c176', primaryContainer: '#c5a059',
      surface: '#131313', onSurface: '#e5e2e1', secondary: '#d5c5a7',
    };
    for (const key of colorKeys) {
      const val = colors[key] || defaults[key];
      const picker = document.getElementById(`te-color-${key}`);
      const hex    = document.getElementById(`te-color-${key}-hex`);
      if (picker) picker.value = val;
      if (hex)    hex.value    = val.toUpperCase();
    }

    // Fonts
    const fontDefaults = { headline: 'Newsreader', body: 'Manrope', label: 'Space Grotesk' };
    for (const [role, def] of Object.entries(fontDefaults)) {
      const sel = document.getElementById(`te-font-${role}`);
      if (sel) sel.value = fonts[role] || def;
    }

    // Radius
    document.querySelectorAll('.theme-radius-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.radius === radius);
    });

    this._updateSwatchBar();
  },

  _updateSwatchBar() {
    const colors = this._collectColors();
    const map = {
      'te-swatch-surface':           colors.surface,
      'te-swatch-primary':           colors.primary,
      'te-swatch-primary-container': colors.primaryContainer,
      'te-swatch-secondary':         colors.secondary,
      'te-swatch-on-surface':        colors.onSurface,
    };
    for (const [id, color] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.style.background = color;
    }
  },

  _collectColors() {
    const keys = ['primary', 'primaryContainer', 'surface', 'onSurface', 'secondary'];
    const obj = {};
    for (const k of keys) {
      const picker = document.getElementById(`te-color-${k}`);
      obj[k] = picker?.value || '#888888';
    }
    return obj;
  },

  _collectFonts() {
    return {
      headline: document.getElementById('te-font-headline')?.value || 'Newsreader',
      body:     document.getElementById('te-font-body')?.value     || 'Manrope',
      label:    document.getElementById('te-font-label')?.value    || 'Space Grotesk',
    };
  },

  _collectRadius() {
    const active = document.querySelector('.theme-radius-btn.active');
    return active?.dataset.radius || 'sharp';
  },

  onColorChange() {
    // Sync hex inputs from color pickers
    const keys = ['primary', 'primaryContainer', 'surface', 'onSurface', 'secondary'];
    for (const k of keys) {
      const picker = document.getElementById(`te-color-${k}`);
      const hex    = document.getElementById(`te-color-${k}-hex`);
      if (picker && hex && document.activeElement !== hex) {
        hex.value = picker.value.toUpperCase();
      }
    }
    this._updateSwatchBar();
    this._refreshPreview();
  },

  onHexInput(key) {
    const hex    = document.getElementById(`te-color-${key}-hex`);
    const picker = document.getElementById(`te-color-${key}`);
    if (!hex || !picker) return;
    const val = hex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      picker.value = val;
      this._updateSwatchBar();
      this._refreshPreview();
    }
  },

  onRadiusSelect(radius) {
    document.querySelectorAll('.theme-radius-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.radius === radius);
    });
    this._refreshPreview();
  },

  _populatePageSelect() {
    const sel = document.getElementById('te-preview-page-select');
    if (!sel) return;
    sel.innerHTML = '';
    for (const p of (State.pages || [])) {
      const opt = document.createElement('option');
      opt.value = p.file;
      opt.textContent = p.file;
      sel.appendChild(opt);
    }
    // Default to index.html
    const idx = Array.from(sel.options).findIndex(o => o.value === 'index.html');
    if (idx >= 0) sel.selectedIndex = idx;
  },

  onPreviewPageChange(filename) {
    this._refreshPreview(filename);
  },

  _refreshPreview(filename) {
    const sel = document.getElementById('te-preview-page-select');
    const file = filename || sel?.value || (State.pages?.[0]?.file);
    if (!file) return;

    const colors  = this._collectColors();
    const fonts   = this._collectFonts();
    const radius  = this._collectRadius();

    // Build a temporary theme object and inject into preview
    const tempTheme = { colors, fonts, radius };
    Preview.renderPageWithTheme('theme-preview-iframe', file, tempTheme);
  },

  async save() {
    if (!State.project) return;
    const colors = this._collectColors();
    const fonts  = this._collectFonts();
    const radius = this._collectRadius();

    State.project.theme = { colors, fonts, radius };
    await ProjectManager.saveProjectMeta();

    this._refreshSidebarSwatches();

    const cssMode = State.project.cssMode || 'tailwind-cdn';
    if (cssMode === 'tailwind-local') {
      // Auto-compile if in Electron; otherwise just show save confirmation
      await this._compileLocalTailwind();
    } else {
      Utils.showToast('Theme saved.', 'info');
    }
  },

  // ── Auto-compile Tailwind CSS (tailwind-local mode, Electron only) ───────────
  async _compileLocalTailwind() {
    if (typeof window.electronAPI === 'undefined') {
      Utils.showToast('Theme saved. Run Tailwind CLI manually to recompile CSS.', 'info');
      return;
    }

    // Get or prompt for the project's filesystem path
    if (!State.projectFsPath) {
      Utils.showToast('Select your project folder to enable auto-compile…', 'info');
      const picked = await window.electronAPI.openDirectory({
        title: 'Select project folder (where tailwind.config.js lives)',
      });
      if (!picked) {
        Utils.showToast('Theme saved. Compilation cancelled — folder not selected.', 'warn');
        return;
      }
      State.projectFsPath = picked;
    }

    const configScript = ThemeEngine.generateConfigScript(State.project?.theme);
    if (!configScript) {
      Utils.showToast('Could not generate Tailwind config.', 'error');
      return;
    }

    Utils.showToast('Compiling Tailwind CSS…', 'info');

    const result = await window.electronAPI.compileTailwind(State.projectFsPath, configScript);

    if (result.success) {
      Utils.showToast('✓ Theme saved & Tailwind CSS recompiled.', 'info');
      // Refresh preview to pick up the new compiled CSS
      if (State.activeView === 'page-editor') Preview.renderCurrentPage();
      else if (State.activeView === 'theme-editor') this._refreshPreview();
    } else {
      Utils.showToast(`Theme saved, but compile failed: ${result.error || result.stderr || 'unknown error'}`, 'error', 6000);
      console.error('[Tailwind compile]', result);
    }
  },

  _refreshSidebarSwatches() {
    const theme = State.project?.theme;
    const swatchWrap = document.getElementById('theme-sidebar-swatches');
    const summaryEl  = document.getElementById('theme-sidebar-summary');
    if (!swatchWrap) return;

    if (!theme) {
      swatchWrap.innerHTML = '<span style="font-size:10px;color:#444;padding:4px 0">No theme set</span>';
      if (summaryEl) summaryEl.textContent = '';
      return;
    }

    const colorOrder = ['surface', 'primary', 'primaryContainer', 'secondary', 'onSurface'];
    swatchWrap.innerHTML = colorOrder.map(k => {
      const c = theme.colors?.[k] || '#333';
      return `<div class="theme-sidebar-swatch" title="${k}" style="background:${c}" onclick="ThemeEditor.open()"></div>`;
    }).join('');

    if (summaryEl) {
      const headline = theme.fonts?.headline || '—';
      const body     = theme.fonts?.body     || '—';
      const radius   = theme.radius          || '—';
      summaryEl.textContent = `${headline} / ${body} · ${radius}`;
    }
  },

  // ── Import Design System ─────────────────────────────────────────────────────
  // Stored pending parsed JSON from AI response
  _pendingDesignJson: null,

  openImportDesign() {
    // Reset modal state
    this._pendingDesignJson = null;
    const ta = document.getElementById('import-design-textarea');
    if (ta) ta.value = '';
    const fn = document.getElementById('import-design-filename');
    if (fn) fn.textContent = '';
    const status = document.getElementById('import-design-status');
    if (status) { status.style.display = 'none'; status.innerHTML = ''; }
    const preview = document.getElementById('import-design-preview');
    if (preview) preview.style.display = 'none';
    const btnParse = document.getElementById('btn-import-design-parse');
    if (btnParse) btnParse.style.display = '';
    const btnApply = document.getElementById('btn-import-design-apply');
    if (btnApply) btnApply.style.display = 'none';
    UI.openModal('modal-import-design');
  },

  _importDesignPickFile() {
    document.getElementById('import-design-file-input')?.click();
  },

  _importDesignOnFileChange(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const ta = document.getElementById('import-design-textarea');
      if (ta) ta.value = e.target.result || '';
      const fn = document.getElementById('import-design-filename');
      if (fn) fn.textContent = file.name;
    };
    reader.readAsText(file);
  },

  async _importDesignParse() {
    const ta = document.getElementById('import-design-textarea');
    const doc = ta?.value?.trim();
    if (!doc) {
      Utils.showToast('Please paste or load a Design System document first.', 'warn');
      return;
    }

    // Check AI availability
    if (!AiProvider || !AiProvider.config?.apiKey) {
      Utils.showToast('Please configure your AI API key in AI Settings first.', 'error');
      return;
    }

    // Find the design-import skill prompt
    const skillData = (window.__BUILTIN_DATA__?.skills || []).find(s => s.id === 'design-import');
    if (!skillData) {
      Utils.showToast('design-import skill not found.', 'error');
      return;
    }

    const statusEl = document.getElementById('import-design-status');
    const previewEl = document.getElementById('import-design-preview');
    const btnParse = document.getElementById('btn-import-design-parse');
    const btnApply = document.getElementById('btn-import-design-apply');

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#a78bfa;font-size:11px">⟳ Sending to AI… this may take a few seconds.</span>';
    }
    if (btnParse) btnParse.disabled = true;

    try {
      const messages = [
        { role: 'system', content: skillData.prompt },
        { role: 'user',   content: `Here is the Design System document to parse:\n\n${doc}` },
      ];

      // Use chatWithMode streaming, collect full text
      const raw = await new Promise((resolve, reject) => {
        let fullText = '';
        AiProvider.chatWithMode('act', messages, {
          onToken: (t) => { fullText += t; },
          onDone:  () => resolve(fullText),
          onError: (e) => reject(new Error(e)),
        });
      });
      const json = this._extractDesignJson(raw);

      if (!json) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#f97316;font-size:11px">⚠ Could not extract valid JSON from the AI response. Try again or check the document format.</span>';
        if (btnParse) btnParse.disabled = false;
        return;
      }

      this._pendingDesignJson = json;
      this._showDesignPreview(json);

      if (statusEl) {
        statusEl.innerHTML = `<span style="color:#4ade80;font-size:11px">✓ Parsed: <strong style="color:#ccc">${json.design_system_name || 'Design System'}</strong>${json.notes ? ` — ${json.notes}` : ''}</span>`;
      }
      if (previewEl) previewEl.style.display = 'block';
      if (btnParse) { btnParse.disabled = false; btnParse.style.display = 'none'; }
      if (btnApply) btnApply.style.display = '';

    } catch (err) {
      console.error('[ImportDesign] AI error:', err);
      if (statusEl) statusEl.innerHTML = `<span style="color:#f97316;font-size:11px">⚠ AI error: ${err.message || err}</span>`;
      if (btnParse) btnParse.disabled = false;
    }
  },

  _extractDesignJson(text) {
    // Find the first ```json ... ``` block
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    try {
      const obj = JSON.parse(candidate.trim());
      // Validate required fields
      if (obj && obj.colors && obj.fonts && obj.radius) return obj;
    } catch { /* fall through */ }
    // Try to find bare JSON object in the text
    const bare = text.match(/\{[\s\S]*"colors"[\s\S]*"fonts"[\s\S]*"radius"[\s\S]*\}/);
    if (bare) {
      try { return JSON.parse(bare[0]); } catch { /* ignore */ }
    }
    return null;
  },

  /**
   * Public entry point: apply a parsed design JSON directly (called from AI Chat).
   */
  applyDesignJson(json) {
    if (!json || !json.colors || !json.fonts || !json.radius) return false;
    this._pendingDesignJson = json;
    this._applyPendingToControls();
    return true;
  },

  _importDesignApply() {
    if (!this._pendingDesignJson) return;
    this._applyPendingToControls();
    UI.closeModal('modal-import-design');
    Utils.showToast('Design tokens applied — review and click Save Theme to persist.', 'info', 4000);
  },

  _applyPendingToControls() {
    const json = this._pendingDesignJson;
    if (!json) return;

    // Apply colors
    const colorMap = {
      primary:          'primary',
      primaryContainer: 'primaryContainer',
      surface:          'surface',
      onSurface:        'onSurface',
      secondary:        'secondary',
    };
    Object.entries(colorMap).forEach(([key, id]) => {
      const val = json.colors?.[key];
      if (!val) return;
      const picker = document.getElementById(`te-color-${id}`);
      const hex    = document.getElementById(`te-color-${id}-hex`);
      if (picker) picker.value = val;
      if (hex)    hex.value   = val;
    });

    // Apply fonts (best-effort select matching)
    const fontMap = { headline: 'headline', body: 'body', label: 'label' };
    Object.entries(fontMap).forEach(([key, id]) => {
      const fontName = json.fonts?.[key];
      if (!fontName) return;
      const sel = document.getElementById(`te-font-${id}`);
      if (!sel) return;
      // Try exact match first, then case-insensitive
      const opts = Array.from(sel.options);
      const exact = opts.find(o => o.value === fontName);
      const icase = opts.find(o => o.value.toLowerCase() === fontName.toLowerCase());
      if (exact || icase) {
        sel.value = (exact || icase).value;
      }
      // If no match, add a temporary option so the value is visible
      else {
        const opt = document.createElement('option');
        opt.value = fontName;
        opt.textContent = fontName + ' (custom)';
        sel.appendChild(opt);
        sel.value = fontName;
      }
    });

    // Apply radius
    if (json.radius) this.onRadiusSelect(json.radius);

    // Trigger live preview update
    this.onColorChange();
  },

  _showDesignPreview(json) {
    const swatchWrap = document.getElementById('import-design-preview-swatches');
    const fontsWrap  = document.getElementById('import-design-preview-fonts');
    if (swatchWrap && json.colors) {
      const order = ['surface', 'primary', 'primaryContainer', 'secondary', 'onSurface'];
      swatchWrap.innerHTML = order.map(k => {
        const c = json.colors[k] || '#333';
        const label = k.replace(/([A-Z])/g, ' $1');
        return `<div title="${label}: ${c}" style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:28px;height:28px;border-radius:4px;background:${c};border:1px solid rgba(255,255,255,.1)"></div>
          <span style="font-size:9px;color:#555;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c}</span>
        </div>`;
      }).join('');
    }
    if (fontsWrap && json.fonts) {
      fontsWrap.innerHTML = [
        `Headline: <strong style="color:#ccc">${json.fonts.headline || '–'}</strong>`,
        `Body: <strong style="color:#ccc">${json.fonts.body || '–'}</strong>`,
        `Label: <strong style="color:#ccc">${json.fonts.label || '–'}</strong>`,
        `Shape: <strong style="color:#ccc">${json.radius || '–'}</strong>`,
      ].join(' &nbsp;·&nbsp; ');
    }
  },
};

// ─── Search / Replace Panel ───────────────────────────────────────────────────
// A persistent, custom search-replace bar that floats over the active CodeMirror
// editor. Supports: Ctrl+F to open, Enter/Shift+Enter to navigate, highlight all
// matches, replace-one, replace-all. Panel stays open until the user closes it.
const SearchReplace = {
  _cm: null,          // current CodeMirror instance
  _container: null,   // DOM container the panel is appended to
  _panel: null,       // panel DOM element (or null when closed)
  _marks: [],         // all match TextMarker objects
  _currentIdx: -1,    // index of currently highlighted match
  _matches: [],       // [{from, to}] positions of all matches

  // ── Open (or focus) the panel attached to a given CodeMirror + DOM container ──
  open(cm, container) {
    this._cm = cm;
    this._container = container;

    // Make sure container is relatively positioned (CSS already sets this, but guard)
    const pos = window.getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    if (this._panel) {
      // Already open — just re-focus and re-run on the new cm
      this._panel.querySelector('.cm-search-input').select();
      this._runSearch();
      return;
    }

    // Build the panel HTML
    const el = document.createElement('div');
    el.className = 'cm-search-panel';
    el.innerHTML = `
      <div class="cm-search-row">
        <div class="cm-search-btns">
          <button class="cm-sr-btn cm-sr-btn--icon" id="srp-prev" title="Previous (Shift+Enter)">
            <span class="material-symbols-outlined">expand_less</span>
          </button>
          <button class="cm-sr-btn cm-sr-btn--icon" id="srp-next" title="Next (Enter)">
            <span class="material-symbols-outlined">expand_more</span>
          </button>
          <button class="cm-sr-btn cm-sr-btn--close cm-sr-btn--icon" id="srp-close" title="Close (Esc)">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="cm-search-input-wrap">
          <input class="cm-search-input" id="srp-find" placeholder="Find…" spellcheck="false" autocomplete="off">
          <span class="cm-search-count" id="srp-count"></span>
        </div>
      </div>
      <div class="cm-search-row">
        <div class="cm-search-btns">
          <button class="cm-sr-btn cm-sr-btn--primary" id="srp-replace-one" title="Replace">Replace</button>
          <button class="cm-sr-btn cm-sr-btn--primary" id="srp-replace-all" title="Replace All">All</button>
        </div>
        <div class="cm-search-input-wrap">
          <input class="cm-search-input" id="srp-replace" placeholder="Replace with…" spellcheck="false" autocomplete="off">
        </div>
      </div>`;

    container.appendChild(el);
    this._panel = el;

    const findInput    = el.querySelector('#srp-find');
    const replaceInput = el.querySelector('#srp-replace');

    // Restore last search term
    if (this._lastQuery) findInput.value = this._lastQuery;

    // ── Event listeners ────────────────────────────────────────
    findInput.addEventListener('input', () => {
      this._lastQuery = findInput.value;
      this._runSearch(true);
    });

    findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this._navigate(-1); else this._navigate(1);
      }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });

    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });

    el.querySelector('#srp-prev').addEventListener('click', () => this._navigate(-1));
    el.querySelector('#srp-next').addEventListener('click', () => this._navigate(1));
    el.querySelector('#srp-close').addEventListener('click', () => this.close());
    el.querySelector('#srp-replace-one').addEventListener('click', () => this._replaceOne());
    el.querySelector('#srp-replace-all').addEventListener('click', () => this._replaceAll());

    // Close on Esc from editor
    cm.addKeyMap({ 'Escape': () => { if (this._panel) this.close(); } });

    findInput.focus();
    findInput.select();
    this._runSearch(true);
  },

  close() {
    this._clearMarks();
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    if (this._cm) {
      this._cm.focus();
    }
    this._matches = [];
    this._currentIdx = -1;
  },

  // ── Core search logic ───────────────────────────────────────
  _runSearch(resetIdx = false) {
    this._clearMarks();
    this._matches = [];
    this._currentIdx = -1;

    const query = (this._panel?.querySelector('#srp-find')?.value) || '';
    const countEl = this._panel?.querySelector('#srp-count');

    if (!query || !this._cm) {
      if (countEl) { countEl.textContent = ''; countEl.className = 'cm-search-count'; }
      return;
    }

    const cm = this._cm;
    const doc = cm.getDoc();
    const content = cm.getValue();

    // Case-insensitive search using SearchCursor (CM5 API)
    try {
      const cursor = cm.getSearchCursor(query, CodeMirror.Pos(0, 0), { caseFold: true });
      while (cursor.findNext()) {
        this._matches.push({ from: cursor.from(), to: cursor.to() });
      }
    } catch (e) {
      // If query is invalid regex or throws, just try literal string
      const lower = content.toLowerCase();
      const qLower = query.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(qLower, idx)) !== -1) {
        const from = doc.posFromIndex(idx);
        const to   = doc.posFromIndex(idx + query.length);
        this._matches.push({ from, to });
        idx += query.length;
      }
    }

    // Mark all matches with "all" class
    for (const m of this._matches) {
      const mark = cm.markText(m.from, m.to, { className: 'cm-search-match-all' });
      this._marks.push({ mark, type: 'all' });
    }

    const total = this._matches.length;

    if (total === 0) {
      if (countEl) { countEl.textContent = 'no matches'; countEl.className = 'cm-search-count no-matches'; }
      return;
    }

    // Navigate to nearest match from cursor
    if (resetIdx) {
      const cursorPos = cm.getCursor();
      let nearest = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < this._matches.length; i++) {
        const dist = Math.abs(this._matches[i].from.line - cursorPos.line);
        if (dist < nearestDist) { nearestDist = dist; nearest = i; }
      }
      this._currentIdx = nearest;
    } else {
      this._currentIdx = Math.max(0, Math.min(this._currentIdx, total - 1));
    }

    this._highlightCurrent(countEl, total);
  },

  _navigate(dir) {
    if (this._matches.length === 0) { this._runSearch(false); return; }
    this._currentIdx = (this._currentIdx + dir + this._matches.length) % this._matches.length;
    const countEl = this._panel?.querySelector('#srp-count');
    this._highlightCurrent(countEl, this._matches.length);
  },

  _highlightCurrent(countEl, total) {
    if (this._currentIdx < 0 || this._currentIdx >= this._matches.length) return;

    // Remove old "current" marks
    this._marks = this._marks.filter(m => {
      if (m.type === 'current') { m.mark.clear(); return false; }
      return true;
    });

    const m = this._matches[this._currentIdx];
    const mark = this._cm.markText(m.from, m.to, { className: 'cm-search-match-current' });
    this._marks.push({ mark, type: 'current' });

    // Scroll into view
    this._cm.scrollIntoView({ from: m.from, to: m.to }, 80);

    if (countEl) {
      countEl.textContent = `${this._currentIdx + 1}/${total}`;
      countEl.className = 'cm-search-count has-matches';
    }
  },

  _clearMarks() {
    for (const m of this._marks) m.mark.clear();
    this._marks = [];
  },

  // ── Replace operations ──────────────────────────────────────
  _replaceOne() {
    if (this._matches.length === 0 || this._currentIdx < 0) return;
    const replaceVal = this._panel?.querySelector('#srp-replace')?.value || '';
    const m = this._matches[this._currentIdx];
    this._cm.replaceRange(replaceVal, m.from, m.to);
    // Re-search and stay at same index
    this._runSearch(false);
  },

  _replaceAll() {
    if (this._matches.length === 0) return;
    const replaceVal = this._panel?.querySelector('#srp-replace')?.value || '';
    const cm = this._cm;
    // Replace from last to first to keep positions valid
    const sorted = [...this._matches].reverse();
    cm.operation(() => {
      for (const m of sorted) {
        cm.replaceRange(replaceVal, m.from, m.to);
      }
    });
    const count = sorted.length;
    this._runSearch(true);
    Utils.showToast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}.`, 'info');
  },

  // ── Toggle: if panel is open for given cm, close; else open ──
  toggle(cm, container) {
    if (this._panel && this._cm === cm) {
      this.close();
    } else {
      if (this._panel) this.close(); // close the old one first
      this.open(cm, container);
    }
  },

  _lastQuery: '',
};

// ─── Head Code Editor ─────────────────────────────────────────────────────────
const HeadCodeEditor = {
  _tabId: 'headcode-editor',
  _cm: null,

  open() {
    if (!State.project) { Utils.showToast('Open a project first.', 'error'); return; }
    UI.addTab(this._tabId, 'Head Code', 'code', () => this._activate());
  },

  _activate() {
    UI.showView('headcode-editor');
    const code = State.project?.headInject || '';

    const wrap = document.getElementById('headcode-codemirror-wrap');
    if (!wrap) return;

    if (!this._cm) {
      wrap.innerHTML = '';
      this._cm = CodeMirror(wrap, {
        value: code,
        mode: 'htmlmixed',
        theme: 'dracula',
        lineNumbers: true,
        lineWrapping: true,
        autoCloseTags: true,
        matchBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        extraKeys: {
          'Ctrl-S': () => HeadCodeEditor.save(),
          'Cmd-S': () => HeadCodeEditor.save(),
        },
      });
    } else {
      this._cm.setValue(code);
      this._cm.clearHistory();
    }

    setTimeout(() => this._cm?.refresh(), 50);
    this._refreshSidebarStatus();
  },

  async save() {
    if (!State.project) return;
    const code = this._cm ? this._cm.getValue() : '';
    State.project.headInject = code;
    await ProjectManager.saveProjectMeta();
    this._refreshSidebarStatus();
    Utils.showToast('Head code saved.', 'info');
  },

  _refreshSidebarStatus() {
    const el = document.getElementById('headcode-sidebar-status');
    if (!el) return;
    const code = (State.project?.headInject || '').trim();
    if (code) {
      el.textContent = '✓ Has custom code';
      el.className = 'headcode-sidebar-status has-code';
    } else {
      el.textContent = 'Empty';
      el.className = 'headcode-sidebar-status';
    }
  },
};
