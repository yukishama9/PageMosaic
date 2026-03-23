/* ===== wb-ai-chat.js — AI Panel UI & Chat Logic (P2) ===== */

// ─── Conversation History Manager ────────────────────────────────────────────
const AiHistory = {
  // Save a complete conversation to IDB
  async save(conv) {
    await AiDB.set('conversations', conv.id, conv);
    // Update metadata index (for listing)
    const meta = {
      id: conv.id,
      title: conv.title,
      provider: conv.provider,
      model: conv.model,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messages.length,
    };
    await AiDB.set('conv-meta', conv.id, meta);
  },

  async load(id) {
    return AiDB.get('conversations', id);
  },

  async listMeta() {
    const metas = await AiDB.getAll('conv-meta');
    return metas.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  async delete(id) {
    await AiDB.del('conversations', id);
    await AiDB.del('conv-meta', id);
  },

  // Derive a short title from first user message
  deriveTitle(messages) {
    const first = messages.find(m => m.role === 'user');
    if (!first) return 'New Conversation';
    const text = first.content.slice(0, 60).replace(/\n/g, ' ').trim();
    return text.length < first.content.length ? text + '…' : text;
  },
};

// ─── Markdown-ish renderer (minimal, no dependencies) ─────────────────────────
// Renders: code blocks, inline code, bold, italic, headers, lists, paragraphs.
const AiMarkdown = {
  render(text) {
    if (!text) return '';
    let html = Utils.escapeHtml(text);

    // Code blocks ```lang\n...\n```
    html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const l = (lang || '').trim();
      return `<div class="ai-code-block">`
        + `<div class="ai-code-lang">${Utils.escapeHtml(l) || 'code'}</div>`
        + `<pre><code>${code}</code></pre>`
        + `<div class="ai-code-actions">`
        +   `<button class="ai-code-copy" onclick="AiChat._copyCode(this)" title="Copy">copy</button>`
        +   `<button class="ai-code-act-btn" onclick="AiChat._applyCodeFromBlock(this,'page')" title="Replace current page HTML">&rarr;&thinsp;page</button>`
        +   `<button class="ai-code-act-btn" onclick="AiChat._applyCodeFromBlock(this,'component')" title="Replace current component HTML">&rarr;&thinsp;comp</button>`
        +   `<button class="ai-code-act-btn ai-code-act-insert" onclick="AiChat._applyCodeFromBlock(this,'insert')" title="Insert at cursor">insert</button>`
        + `</div>`
        + `</div>`;
    });

    // Inline code `...`
    html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

    // Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers ### ## #
    html = html.replace(/^### (.+)$/gm, '<h5 class="ai-h5">$1</h5>');
    html = html.replace(/^## (.+)$/gm, '<h4 class="ai-h4">$1</h4>');
    html = html.replace(/^# (.+)$/gm, '<h3 class="ai-h3">$1</h3>');

    // Unordered list items - item
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="ai-list">$1</ul>');
    // merge consecutive <ul> blocks
    html = html.replace(/<\/ul>\s*<ul class="ai-list">/g, '');

    // Numbered list 1. item
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Horizontal rule ---
    html = html.replace(/^---+\s*$/gm, '<hr class="ai-hr">');

    // Paragraphs: blank line separates paragraphs
    html = html
      .split(/\n{2,}/)
      .map(para => {
        para = para.trim();
        if (!para) return '';
        // Don't wrap block-level elements in <p>
        if (/^<(div|h[1-6]|ul|ol|li|hr|pre|blockquote)/.test(para)) return para;
        return `<p class="ai-p">${para.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');

    return html;
  },
};

// ─── AI Chat Panel ────────────────────────────────────────────────────────────
const AiChat = {
  _open: false,
  _activeTab: 'chat',    // 'chat' | 'settings' | 'history'
  _conv: null,           // current conversation object
  _streaming: false,
  _abortCtrl: null,
  _streamingMsgEl: null,
  _streamingText: '',
  _autoScroll: true,
  _pendingImages: [],    // P5 — images staged for next send
  _mode: 'act',          // P7 — 'plan' | 'act'
  _activeSkill: '',      // P7.1 — active skill id
  _activeAgent: '',      // P7.1 — active agent id
  _skills: [],           // loaded from IDB
  _agents: [],           // loaded from IDB

  // ── Initialize ────────────────────────────────────────────────────────────────
  async init() {
    await AiProvider.loadConfig();
    // Restore last conversation or start fresh
    const lastId = await AiDB.get('config', 'last-conv-id');
    if (lastId) {
      const conv = await AiHistory.load(lastId);
      if (conv) { this._conv = conv; }
    }
    if (!this._conv) this._newConvObj();

    // Keyboard shortcut: Ctrl+Shift+A to toggle
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        this.toggle();
      }
    });

    // P4 — panel resize + textarea auto-grow
    this._initResize();
    this._initAutoGrow();
    // P5 — vision: drag/drop + paste
    this._initVision();
    // P7 — restore persisted mode
    this._initMode();
    // P7.1 — load skills/agents + render model select
    this._initSkillsAgents();
    this._renderModelSelect();
  },

  // ── Panel open/close/toggle ───────────────────────────────────────────────────
  toggle() { this._open ? this.close() : this.open(); },

  open() {
    this._open = true;
    document.getElementById('ai-panel').classList.remove('ai-panel--closed');
    document.getElementById('btn-ai-toggle').classList.add('active');
    this._renderMessages();
    setTimeout(() => this._scrollToBottom(), 50);
  },

  close() {
    this._open = false;
    document.getElementById('ai-panel').classList.add('ai-panel--closed');
    document.getElementById('btn-ai-toggle').classList.remove('active');
  },

  // ── Tab switching ─────────────────────────────────────────────────────────────
  switchTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('.ai-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.ai-tab-pane').forEach(pane => {
      pane.classList.toggle('hidden', pane.dataset.pane !== tab);
    });
    if (tab === 'settings') this._renderSettings();
    if (tab === 'history') this._renderHistory();
    if (tab === 'chat') this._renderMessages();
  },

  // ── New conversation ──────────────────────────────────────────────────────────
  _newConvObj() {
    this._conv = {
      id: Utils.generateId(),
      title: 'New Conversation',
      provider: AiProvider.config.provider,
      model: AiProvider.config.model,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },

  async newConversation() {
    if (this._conv?.messages?.length > 0) {
      // Persist current before starting new
      await this._saveCurrentConv();
    }
    this._newConvObj();
    this._renderMessages();
    this._focusInput();
  },

  // ── Send message ──────────────────────────────────────────────────────────────
  async send(text) {
    const input = document.getElementById('ai-input');
    const rawMsg = (text || (input ? input.value : '')).trim();
    if (!rawMsg || this._streaming) return;
    if (input) { input.value = ''; input.style.height = ''; }

    // P5 — capture & clear pending images
    const attachedImages = this._pendingImages.splice(0);
    this._renderImagePreviews();

    // Warn if vision not supported but images attached
    if (attachedImages.length > 0 && !AiProvider.supportsVision()) {
      Utils.showToast('当前模型不支持图片，图片将被忽略', 'warn');
      attachedImages.length = 0;
    }

    // Preprocess slash commands — may augment the LLM message with injected context
    const slash = this._preprocessSlashCmd(rawMsg);
    const displayMsg = slash ? slash.display : rawMsg;
    const llmMsg    = slash ? slash.llm    : rawMsg;

    // Add user message (display version saved to history; _imgCount for badge)
    const userMsgObj = { role: 'user', content: displayMsg };
    if (attachedImages.length) userMsgObj._imgCount = attachedImages.length;
    this._conv.messages.push(userMsgObj);
    this._conv.updatedAt = Date.now();
    if (this._conv.messages.length === 1) {
      this._conv.title = AiHistory.deriveTitle(this._conv.messages);
    }
    this._renderMessages();
    this._scrollToBottom();

    // Start streaming assistant response
    this._streaming = true;
    this._streamingText = '';
    this._updateSendBtn(true);

    // Add streaming placeholder
    this._appendStreamingBubble();

    // Build message array for API — last user msg uses llmMsg + attached images
    const systemPrompt = this._buildSystemPrompt();
    const history = this._conv.messages.slice(0, -1);
    const lastUserMsg = { role: 'user', content: llmMsg };
    if (attachedImages.length) lastUserMsg.images = attachedImages;
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      lastUserMsg,
    ];

    this._abortCtrl = AiProvider.chat(apiMessages, {
      onToken: (token) => {
        this._streamingText += token;
        this._updateStreamingBubble(this._streamingText);
        if (this._autoScroll) this._scrollToBottom();
      },
      onDone: () => {
        this._finalizeStreamingBubble();
        this._streaming = false;
        this._abortCtrl = null;
        this._updateSendBtn(false);
      },
      onError: (err) => {
        this._finalizeStreamingBubbleError(err);
        this._streaming = false;
        this._abortCtrl = null;
        this._updateSendBtn(false);
      },
    });
  },

  cancelStream() {
    if (this._abortCtrl) {
      this._abortCtrl.abort();
      this._abortCtrl = null;
    }
    if (this._streaming) {
      this._finalizeStreamingBubble();
      this._streaming = false;
      this._updateSendBtn(false);
    }
  },

  // ── System prompt ─────────────────────────────────────────────────────────────
  _buildSystemPrompt() {
    const parts = [
      'You are an AI assistant integrated into PageMosaic, a visual static-site editor.',
      'You help users with HTML editing, CSS styling, component design, i18n translations, and web development tasks.',
    ];

    if (State.project) {
      parts.push(`\n## Current Project`);
      parts.push(`Name: "${State.project.title || State.project.name}"`);
      parts.push(`CSS mode: ${State.project.cssMode || 'tailwind-cdn'}`);

      // Pages & components summary
      const pages = State.pages || [];
      if (pages.length) parts.push(`Pages: ${pages.map(p => p.file).join(', ')}`);
      const compIds = Object.keys(State.components || {});
      if (compIds.length) parts.push(`Components: ${compIds.join(', ')}`);

      // Languages
      const langs = (State.project.languages || []).map(l => l.code);
      if (langs.length) parts.push(`Languages: ${langs.join(', ')}, base: ${State.project.baseLanguage || 'en'}`);

      // Theme summary
      const theme = State.project.theme;
      if (theme) {
        const cp = [];
        if (theme.primaryColor) cp.push(`primary=${theme.primaryColor}`);
        if (theme.accentColor)  cp.push(`accent=${theme.accentColor}`);
        if (theme.bgColor)      cp.push(`bg=${theme.bgColor}`);
        if (cp.length) parts.push(`Theme colors: ${cp.join(', ')}`);
        if (theme.fontBody) parts.push(`Body font: ${theme.fontBody}`);
      }
    }

    // Active editor context — inject current HTML (truncated)
    if (State.activePage) {
      parts.push(`\n## Active Page: ${State.activePage}`);
      const html = State.pageCodeMirror?.getValue() || '';
      if (html) {
        const snippet = html.length > 3000 ? html.slice(0, 3000) + '\n<!-- [truncated] -->' : html;
        parts.push('```html\n' + snippet + '\n```');
      }
    }

    if (State.activeComponent) {
      const comp = State.components?.[State.activeComponent];
      parts.push(`\n## Active Component: ${comp?.meta?.label || State.activeComponent}`);
      const html = State.compCodeMirror?.getValue() || comp?.html || '';
      if (html) {
        const snippet = html.length > 2000 ? html.slice(0, 2000) + '\n<!-- [truncated] -->' : html;
        parts.push('```html\n' + snippet + '\n```');
      }
    }

    if (State.activeI18nLang) {
      const baseLang = State.project?.baseLanguage || 'en';
      const baseKeys = Object.keys(State.i18nData?.[baseLang] || {});
      const langData = State.i18nData?.[State.activeI18nLang] || {};
      const missing = baseKeys.filter(k => !langData[k] || langData[k].trim() === '');
      parts.push(`\n## Active i18n: ${State.activeI18nLang}`);
      parts.push(`Total keys: ${baseKeys.length}, missing: ${missing.length}`);
      if (missing.length > 0 && missing.length <= 30) {
        parts.push(`Missing keys: ${missing.join(', ')}`);
      }
    }

    // P7.1 — Active skill system prompt injection (with references and templates)
    if (this._activeSkill) {
      const skill = this._skills.find(s => s.id === this._activeSkill);
      if (skill?.prompt) {
        parts.push('\n## Active Skill: ' + skill.name);
        if (skill.description) parts.push('_' + skill.description + '_');
        parts.push(skill.prompt);
        // Inject reference documents (e.g. COMPONENT-GUIDE.md)
        if (skill._refs?.length) {
          for (const ref of skill._refs) {
            parts.push('\n### Skill Reference: ' + ref.name);
            // Truncate very long reference files to keep context manageable
            const content = ref.content.length > 8000
              ? ref.content.slice(0, 8000) + '\n\n[…file truncated for context window…]'
              : ref.content;
            parts.push(content);
          }
        }
        // Inject template files (e.g. component-markers-template.html)
        if (skill._templates?.length) {
          for (const tmpl of skill._templates) {
            const ext = tmpl.name.split('.').pop() || '';
            const lang = ext === 'html' ? 'html' : 'text';
            parts.push('\n### Skill Template: ' + tmpl.name);
            const content = tmpl.content.length > 4000
              ? tmpl.content.slice(0, 4000) + '\n\n[…file truncated…]'
              : tmpl.content;
            parts.push('```' + lang + '\n' + content + '\n```');
          }
        }
      }
    }

    // P7.1 — Active agent persona injection
    if (this._activeAgent) {
      const agent = this._agents.find(a => a.id === this._activeAgent);
      if (agent?.prompt) {
        parts.push('\n## Agent Persona');
        parts.push(agent.prompt);
      }
    }

    // P7 — mode-specific instruction
    if (this._mode === 'plan') {
      parts.push('\n## Current Mode: PLAN');
      parts.push('You are in PLAN mode. Your role is to ANALYZE, THINK, and PLAN — NOT to write final code yet.');
      parts.push('- Understand the user\'s request thoroughly');
      parts.push('- Break it down into clear numbered steps');
      parts.push('- Explain trade-offs, design decisions, and potential issues');
      parts.push('- If you must show code, use small illustrative snippets only — not complete implementations');
      parts.push('- End your response with: "✅ Plan ready. Switch to **Act** mode to implement."');
    } else {
      parts.push('\n## Current Mode: ACT');
      parts.push('You are in ACT mode. Provide complete, executable code and concrete solutions ready to apply directly.');
    }

    parts.push('\nRespond in the same language the user uses. Be concise and practical.');
    return parts.join('\n');
  },

  // ── Render messages ───────────────────────────────────────────────────────────
  _renderMessages() {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    if (!this._conv || this._conv.messages.length === 0) {
      container.innerHTML = this._renderWelcome();
      return;
    }

    const total = this._conv.messages.length;
    container.innerHTML = this._conv.messages.map((msg, idx) => {
      if (msg.role === 'user') {
        return '<div class="ai-bubble ai-bubble--user">'
          + '<div class="ai-bubble-content">' + Utils.escapeHtml(msg.content).replace(/\n/g, '<br>') + '</div>'
          + '<div class="ai-bubble-actions ai-bubble-actions--user">'
          + '<button class="ai-bubble-action" onclick="AiChat._editMessage(' + idx + ')" title="Edit &amp; resend">'
          + '<span class="material-symbols-outlined">edit</span></button>'
          + '</div></div>';
      }
      if (msg.role === 'assistant') {
        const isLast = idx === total - 1;
        return '<div class="ai-bubble ai-bubble--assistant" data-idx="' + idx + '">'
          + '<div class="ai-bubble-avatar"><span class="material-symbols-outlined">smart_toy</span></div>'
          + '<div class="ai-bubble-body">'
          + '<div class="ai-bubble-content ai-md">' + AiMarkdown.render(msg.content) + '</div>'
          + '<div class="ai-bubble-actions">'
          + '<button class="ai-bubble-action" onclick="AiChat._copyMessage(' + idx + ')" title="Copy"><span class="material-symbols-outlined">content_copy</span></button>'
          + (isLast ? '<button class="ai-bubble-action" onclick="AiChat._retryLast()" title="Regenerate"><span class="material-symbols-outlined">refresh</span></button>' : '')
          + '</div></div></div>';
      }
      return '';
    }).join('');
  },

  _renderWelcome() {
    const prov = AiProvider.PROVIDERS[AiProvider.config.provider];
    const configured = AiProvider.config.apiKey || !prov?.needsKey;
    if (!configured) {
      return `<div class="ai-welcome">
        <span class="material-symbols-outlined" style="font-size:36px;color:#444">smart_toy</span>
        <p style="color:#666;font-size:13px;margin-top:12px">AI Assistant</p>
        <p style="color:#555;font-size:11px;margin-top:4px">Configure your API key in <button class="ai-link-btn" onclick="AiChat.switchTab('settings')">Settings</button> to get started.</p>
      </div>`;
    }

    const suggestions = this._getContextSuggestions();
    const contextTag  = this._getContextTag();

    return `<div class="ai-welcome">
      <span class="material-symbols-outlined" style="font-size:36px;color:#6366f1">smart_toy</span>
      <p style="color:#aaa;font-size:13px;margin-top:12px">AI Assistant</p>
      <p style="color:#555;font-size:11px;margin-top:4px">${prov?.name || ''} · ${AiProvider.config.model}</p>
      ${contextTag}
      <div class="ai-suggestions">
        ${suggestions.map(s => `<button class="ai-suggestion-btn" onclick="AiChat.send(${JSON.stringify(s.prompt)})">${Utils.escapeHtml(s.label)}</button>`).join('')}
      </div>
      <div class="ai-slash-hint">
        Tip: prefix with <code>/page</code> <code>/comp</code> <code>/i18n</code> to inject full context
      </div>
    </div>`;
  },

  // Returns context-aware suggestion list based on the active editor view
  _getContextSuggestions() {
    if (State.activePage) {
      const f = State.activePage;
      return [
        { label: '分析页面结构', prompt: `分析当前页面"${f}"的HTML结构，列出改进建议` },
        { label: '优化 SEO 元标签', prompt: `帮我优化当前页面"${f}"的 SEO meta 标签（title, description, og 等）` },
        { label: '添加响应式适配', prompt: `检查"${f}"的响应式布局，用 Tailwind CSS 补充移动端适配` },
        { label: '检查可访问性', prompt: `检查"${f}"的 HTML 无障碍性（ARIA、alt、焦点顺序），给出修改建议` },
      ];
    }
    if (State.activeComponent) {
      const label = State.components?.[State.activeComponent]?.meta?.label || State.activeComponent;
      return [
        { label: '重构组件结构', prompt: `帮我重构"${label}"组件，使其语义化更好、结构更清晰` },
        { label: '添加动画过渡', prompt: `用 Tailwind CSS 为"${label}"组件添加合适的过渡动画` },
        { label: '提取 i18n 文案', prompt: `分析"${label}"组件，建议哪些内容适合提取为 i18n key` },
        { label: '改进移动端样式', prompt: `优化"${label}"组件的 Tailwind 移动端响应式样式` },
      ];
    }
    if (State.activeI18nLang) {
      const base = State.project?.baseLanguage || 'en';
      return [
        { label: '翻译所有缺失文案', prompt: `请把当前 ${State.activeI18nLang} 语言中缺失的文案全部翻译好，参考 ${base} 语言` },
        { label: '校对翻译质量', prompt: `校对当前 ${State.activeI18nLang} 语言的翻译，标出不自然或有误的条目` },
        { label: '补充 SEO 文案', prompt: `为 ${State.activeI18nLang} 语言补充 SEO 相关的页面标题和描述文案` },
      ];
    }
    if (State.activeView === 'theme-editor') {
      return [
        { label: '推荐专业配色方案', prompt: '为一个专业网站推荐一套配色方案，包含主色、强调色、背景色、文字色的十六进制值' },
        { label: '深色模式配色建议', prompt: '如何调整当前主题配色以打造优雅的深色模式？' },
        { label: '字体搭配建议', prompt: '为面向专业用户的网站推荐 Google Fonts 字体搭配方案（标题+正文）' },
      ];
    }
    // Default — no editor open
    return [
      { label: '生成 Hero 区域', prompt: '帮我写一段用 Tailwind CSS 的响应式 Hero 区域 HTML，包含标题、副标题、CTA 按钮' },
      { label: '设计响应式导航栏', prompt: '生成一个支持移动端折叠的 Tailwind CSS 导航栏 HTML 组件' },
      { label: '优化 SEO 模板', prompt: '帮我写一套完整的 SEO meta 标签模板，包含 OG 和 Twitter Cards' },
      { label: '批量翻译 i18n', prompt: '帮我翻译缺失的 i18n 文案，我会把 key 列表发给你' },
    ];
  },

  // Returns a small context indicator chip HTML (or empty string)
  _getContextTag() {
    if (State.activePage)      return `<div class="ai-ctx-tag"><span class="material-symbols-outlined" style="font-size:12px">description</span> ${Utils.escapeHtml(State.activePage)}</div>`;
    if (State.activeComponent) return `<div class="ai-ctx-tag"><span class="material-symbols-outlined" style="font-size:12px">widgets</span> ${Utils.escapeHtml(State.activeComponent)}</div>`;
    if (State.activeI18nLang)  return `<div class="ai-ctx-tag"><span class="material-symbols-outlined" style="font-size:12px">translate</span> i18n: ${Utils.escapeHtml(State.activeI18nLang)}</div>`;
    return '';
  },

  // ── Streaming bubble helpers ──────────────────────────────────────────────────
  _appendStreamingBubble() {
    const container = document.getElementById('ai-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'ai-bubble ai-bubble--assistant ai-bubble--streaming';
    el.innerHTML = `
      <div class="ai-bubble-avatar">
        <span class="material-symbols-outlined">smart_toy</span>
      </div>
      <div class="ai-bubble-body">
        <div class="ai-bubble-content ai-md ai-streaming-content"><span class="ai-cursor"></span></div>
      </div>`;
    container.appendChild(el);
    this._streamingMsgEl = el;
  },

  _updateStreamingBubble(text) {
    if (!this._streamingMsgEl) return;
    const contentEl = this._streamingMsgEl.querySelector('.ai-streaming-content');
    if (contentEl) {
      contentEl.innerHTML = AiMarkdown.render(text) + '<span class="ai-cursor"></span>';
    }
  },

  _finalizeStreamingBubble() {
    if (!this._streamingMsgEl) return;
    const text = this._streamingText;

    // Push to conversation history
    if (text.trim()) {
      this._conv.messages.push({ role: 'assistant', content: text });
      this._conv.updatedAt = Date.now();
      this._saveCurrentConv();
    }

    // Re-render finalized bubble (removes cursor)
    this._streamingMsgEl.classList.remove('ai-bubble--streaming');
    const bodyEl = this._streamingMsgEl.querySelector('.ai-bubble-body');
    const idx = this._conv.messages.length - 1;
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="ai-bubble-content ai-md">${AiMarkdown.render(text)}</div>
        <div class="ai-bubble-actions">
          <button class="ai-bubble-action" onclick="AiChat._copyMessage(${idx})" title="Copy">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
        </div>`;
    }
    this._streamingMsgEl = null;
    this._streamingText = '';
    this._updateTitle();
  },

  _finalizeStreamingBubbleError(errMsg) {
    if (!this._streamingMsgEl) return;
    this._streamingMsgEl.classList.remove('ai-bubble--streaming');
    this._streamingMsgEl.classList.add('ai-bubble--error');
    const bodyEl = this._streamingMsgEl.querySelector('.ai-bubble-body');
    if (bodyEl) {
      bodyEl.innerHTML = `<div class="ai-bubble-content ai-error-msg">
        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">error</span>
        ${Utils.escapeHtml(errMsg)}
      </div>`;
    }
    this._streamingMsgEl = null;
    this._streamingText = '';
  },

  // ── Settings tab ──────────────────────────────────────────────────────────────
  _renderSettings() {
    const container = document.getElementById('ai-settings-pane');
    if (!container) return;

    const cfg = AiProvider.config;
    const prov = AiProvider.PROVIDERS[cfg.provider] || {};
    const provOptions = Object.entries(AiProvider.PROVIDERS)
      .map(([id, p]) => `<option value="${id}" ${id === cfg.provider ? 'selected' : ''}>${p.name}</option>`)
      .join('');
    const modelOptions = (prov.models || [])
      .map(m => `<option value="${m}" ${m === cfg.model ? 'selected' : ''}>${m}</option>`)
      .join('');

    container.innerHTML = `
      <div class="ai-settings-section">
        <div class="ai-settings-label">Provider</div>
        <select class="ai-settings-select" id="ais-provider" onchange="AiChat._onProviderChange(this.value)">
          ${provOptions}
        </select>
      </div>

      <div class="ai-settings-section" id="ais-key-section" style="${!prov.needsKey ? 'display:none' : ''}">
        <div class="ai-settings-label">API Key</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="password" id="ais-apikey" class="ai-settings-input"
            placeholder="sk-…"
            value="${cfg.apiKey ? '••••••••••••' : ''}"
            onfocus="if(this.value==='••••••••••••')this.value=''"
            onblur="if(!this.value)this.value=AiProvider.config.apiKey?'••••••••••••':''">
          <button class="ai-settings-btn" onclick="AiChat._toggleKeyVisibility()" id="ais-key-eye" title="Show/hide">
            <span class="material-symbols-outlined" style="font-size:14px">visibility</span>
          </button>
        </div>
      </div>

      <div class="ai-settings-section" id="ais-endpoint-section">
        <div class="ai-settings-label">
          API Endpoint
          <span style="font-size:10px;color:#555;margin-left:4px">(override)</span>
        </div>
        <input type="text" id="ais-endpoint" class="ai-settings-input"
          placeholder="${prov.endpoint || 'https://api.example.com/v1'}"
          value="${cfg.endpoint || ''}">
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-label">Model</div>
        <div style="display:flex;gap:6px">
          <select class="ai-settings-select" id="ais-model" style="flex:1" onchange="AiChat._onModelChange(this.value)">
            ${modelOptions}
            <option value="__custom__" ${!prov.models?.includes(cfg.model) ? 'selected' : ''}>Custom…</option>
          </select>
        </div>
        <input type="text" id="ais-model-custom" class="ai-settings-input"
          style="margin-top:4px;${prov.models?.includes(cfg.model) ? 'display:none' : ''}"
          placeholder="Model name" value="${!prov.models?.includes(cfg.model) ? cfg.model : ''}">
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-label">Max Tokens</div>
        <input type="number" id="ais-maxtokens" class="ai-settings-input"
          value="${cfg.maxTokens}" min="256" max="32768" step="256">
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-label">Temperature
          <span id="ais-temp-label" style="float:right;color:#6366f1">${cfg.temperature}</span>
        </div>
        <input type="range" id="ais-temp" class="ai-settings-range"
          min="0" max="2" step="0.05" value="${cfg.temperature}"
          oninput="document.getElementById('ais-temp-label').textContent=this.value">
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="ai-settings-save-btn" onclick="AiChat._saveSettings()">
          <span class="material-symbols-outlined" style="font-size:14px">save</span>
          Save
        </button>
        <button class="ai-settings-test-btn" onclick="AiChat._testConnection()" id="ais-test-btn">
          <span class="material-symbols-outlined" style="font-size:14px">wifi</span>
          Test
        </button>
      </div>

      <div id="ais-test-result" style="margin-top:10px;font-size:11px;display:none"></div>
    `;

    // Append Skill + Agent management sections
    const pane = document.getElementById('ai-settings-pane');
    if (pane) pane.insertAdjacentHTML('beforeend', this._renderSkillAgentSettings());
    // Async fill user-lib path display
    this._updateUserLibPathDisplay();
  },

  _renderSkillAgentSettings() {
    const srcBadge = (src) => {
      if (src === 'built-in')  return '<span class="ai-sa-badge ai-sa-badge--builtin">built-in</span>';
      if (src === 'user-lib')  return '<span class="ai-sa-badge ai-sa-badge--userlib">library</span>';
      return '<span class="ai-sa-badge ai-sa-badge--custom">custom</span>';
    };
    const canDel = (src) => src !== 'built-in';

    const renderItem = (item, type) => {
      const delBtn = canDel(item._source)
        ? `<button class="ai-sa-item-del" onclick="AiChat.${type === 'skill' ? 'deleteSkill' : 'deleteAgent'}('${Utils.escapeHtml(item.id)}')" title="Delete">
            <span class="material-symbols-outlined">delete</span>
          </button>`
        : '';
      return `<div class="ai-sa-item">
        <span class="material-symbols-outlined" style="font-size:13px;color:#555;flex-shrink:0">${type === 'skill' ? 'extension' : 'smart_toy'}</span>
        ${srcBadge(item._source)}
        <span class="ai-sa-item-name" title="${Utils.escapeHtml(item.description || item.name)}">${Utils.escapeHtml(item.name)}</span>
        ${delBtn}
      </div>`;
    };

    const skillItems = this._skills.map(s => renderItem(s, 'skill')).join('')
      || '<p style="font-size:10px;color:#444;padding:4px 0">No skills yet.</p>';
    const agentItems = this._agents.map(a => renderItem(a, 'agent')).join('')
      || '<p style="font-size:10px;color:#444;padding:4px 0">No agents yet.</p>';

    // User Library path display
    const isElectron = typeof window.electronAPI !== 'undefined';
    const userLibSection = isElectron ? `
      <div class="ai-sa-section-title" style="margin-top:16px">
        <span class="material-symbols-outlined" style="font-size:12px">folder_open</span> User Library Folder
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <div id="ai-userlib-path" style="flex:1;font-size:10px;color:#555;background:#0a0a12;border:1px solid #1a1a28;border-radius:4px;padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          Loading…
        </div>
        <button class="ai-sa-add-btn" style="flex-shrink:0;padding:4px 8px" onclick="AiChat.pickUserLibFolder()">
          <span class="material-symbols-outlined" style="font-size:13px">folder</span> Choose
        </button>
      </div>
      <p style="font-size:10px;color:#3a3a50;margin-bottom:4px">Place <code style="background:#0d0d18;padding:1px 4px;border-radius:3px;color:#6366f1">*.skill.json</code> / <code style="background:#0d0d18;padding:1px 4px;border-radius:3px;color:#6366f1">*.agent.json</code> files in <code style="background:#0d0d18;padding:1px 4px;border-radius:3px;color:#6366f1">skills/</code> and <code style="background:#0d0d18;padding:1px 4px;border-radius:3px;color:#6366f1">agents/</code> sub-folders.</p>
    ` : '';

    return `
      <div style="border-top:1px solid #111118;margin:14px 0 10px"></div>

      ${userLibSection}

      <div class="ai-sa-section-title" style="margin-top:4px">
        <span class="material-symbols-outlined" style="font-size:12px">extension</span> Skills
      </div>
      <div id="ai-skill-list">${skillItems}</div>
      <div class="ai-sa-add-form" id="ai-skill-form">
        <input type="text" id="ai-skill-name" placeholder="Skill name" maxlength="60">
        <textarea id="ai-skill-prompt" rows="3" placeholder="System prompt fragment for this skill…"></textarea>
        <button class="ai-sa-add-btn" onclick="AiChat._submitSkillForm()">
          <span class="material-symbols-outlined" style="font-size:13px">add</span> Add Custom Skill
        </button>
      </div>

      <div class="ai-sa-section-title" style="margin-top:16px">
        <span class="material-symbols-outlined" style="font-size:12px">smart_toy</span> Agents
      </div>
      <div id="ai-agent-list">${agentItems}</div>
      <div class="ai-sa-add-form" id="ai-agent-form">
        <input type="text" id="ai-agent-name" placeholder="Agent name" maxlength="60">
        <textarea id="ai-agent-prompt" rows="3" placeholder="Persona / system prompt for this agent…"></textarea>
        <button class="ai-sa-add-btn" onclick="AiChat._submitAgentForm()">
          <span class="material-symbols-outlined" style="font-size:13px">add</span> Add Custom Agent
        </button>
      </div>
    `;
  },

  // Fill the user-lib path display asynchronously after the settings pane renders
  async _updateUserLibPathDisplay() {
    const el = document.getElementById('ai-userlib-path');
    if (!el) return;
    const p = await AiDB.get('config', 'ai-user-lib-path');
    el.textContent = p || 'Not configured';
    el.style.color = p ? '#4ade80' : '#555';
  },

  async _submitSkillForm() {
    const name   = document.getElementById('ai-skill-name')?.value.trim();
    const prompt = document.getElementById('ai-skill-prompt')?.value.trim();
    if (!name || !prompt) { Utils.showToast('Name and prompt are required.', 'warn'); return; }
    await this.saveSkill({ name, prompt });
    const n = document.getElementById('ai-skill-name');
    const p = document.getElementById('ai-skill-prompt');
    if (n) n.value = '';
    if (p) p.value = '';
    // Refresh skill list in settings
    const list = document.getElementById('ai-skill-list');
    if (list) list.outerHTML = '<div id="ai-skill-list">'
      + (this._skills.map(s =>
          `<div class="ai-sa-item">
            <span class="material-symbols-outlined" style="font-size:13px;color:#555;flex-shrink:0">extension</span>
            <span class="ai-sa-item-name">${Utils.escapeHtml(s.name)}</span>
            <button class="ai-sa-item-del" onclick="AiChat.deleteSkill('${Utils.escapeHtml(s.id)}')" title="Delete">
              <span class="material-symbols-outlined">delete</span></button>
          </div>`).join('') || '<p style="font-size:10px;color:#444;padding:4px 0">No skills yet.</p>')
      + '</div>';
    Utils.showToast('Skill saved.', 'info');
  },

  async _submitAgentForm() {
    const name   = document.getElementById('ai-agent-name')?.value.trim();
    const prompt = document.getElementById('ai-agent-prompt')?.value.trim();
    if (!name || !prompt) { Utils.showToast('Name and prompt are required.', 'warn'); return; }
    await this.saveAgent({ name, prompt });
    const n = document.getElementById('ai-agent-name');
    const p = document.getElementById('ai-agent-prompt');
    if (n) n.value = '';
    if (p) p.value = '';
    const list = document.getElementById('ai-agent-list');
    if (list) list.outerHTML = '<div id="ai-agent-list">'
      + (this._agents.map(a =>
          `<div class="ai-sa-item">
            <span class="material-symbols-outlined" style="font-size:13px;color:#555;flex-shrink:0">smart_toy</span>
            <span class="ai-sa-item-name">${Utils.escapeHtml(a.name)}</span>
            <button class="ai-sa-item-del" onclick="AiChat.deleteAgent('${Utils.escapeHtml(a.id)}')" title="Delete">
              <span class="material-symbols-outlined">delete</span></button>
          </div>`).join('') || '<p style="font-size:10px;color:#444;padding:4px 0">No agents yet.</p>')
      + '</div>';
    Utils.showToast('Agent saved.', 'info');
  },

  _onProviderChange(providerId) {
    AiProvider.config.provider = providerId;
    const prov = AiProvider.PROVIDERS[providerId] || {};
    // Update model list
    const modelSel = document.getElementById('ais-model');
    if (modelSel) {
      modelSel.innerHTML = (prov.models || [])
        .map(m => `<option value="${m}">${m}</option>`)
        .join('') + '<option value="__custom__">Custom…</option>';
      if (prov.models?.length) {
        AiProvider.config.model = prov.models[0];
        modelSel.value = prov.models[0];
      }
    }
    // Show/hide API key field
    const keySection = document.getElementById('ais-key-section');
    if (keySection) keySection.style.display = prov.needsKey ? '' : 'none';
    // Update endpoint placeholder
    const endpointInput = document.getElementById('ais-endpoint');
    if (endpointInput) endpointInput.placeholder = prov.endpoint || '';
    // Load saved key for new provider (show masked if exists)
    AiProvider._loadApiKey(providerId).then(() => {
      const keyInput = document.getElementById('ais-apikey');
      if (keyInput) keyInput.value = AiProvider.config.apiKey ? '••••••••••••' : '';
    });
  },

  _onModelChange(val) {
    const customInput = document.getElementById('ais-model-custom');
    if (!customInput) return;
    if (val === '__custom__') {
      customInput.style.display = '';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
      AiProvider.config.model = val;
    }
  },

  _toggleKeyVisibility() {
    const input = document.getElementById('ais-apikey');
    const btn = document.getElementById('ais-key-eye');
    if (!input) return;
    if (input.type === 'password') {
      // Only reveal if it's not the placeholder mask
      if (input.value !== '••••••••••••') {
        input.type = 'text';
        if (btn) btn.querySelector('.material-symbols-outlined').textContent = 'visibility_off';
      }
    } else {
      input.type = 'password';
      if (btn) btn.querySelector('.material-symbols-outlined').textContent = 'visibility';
    }
  },

  async _saveSettings() {
    const provId = document.getElementById('ais-provider')?.value || AiProvider.config.provider;
    const rawKey = document.getElementById('ais-apikey')?.value || '';
    const apiKey = rawKey === '••••••••••••' ? undefined : rawKey; // undefined = don't change
    const endpoint = document.getElementById('ais-endpoint')?.value.trim() || '';
    const modelSel = document.getElementById('ais-model')?.value;
    const modelCustom = document.getElementById('ais-model-custom')?.value.trim();
    const model = (modelSel === '__custom__' ? modelCustom : modelSel) || AiProvider.config.model;
    const maxTokens = parseInt(document.getElementById('ais-maxtokens')?.value) || 4096;
    const temperature = parseFloat(document.getElementById('ais-temp')?.value) || 0.7;

    const updates = { provider: provId, endpoint, model, maxTokens, temperature };
    if (apiKey !== undefined) updates.apiKey = apiKey;

    await AiProvider.saveConfig(updates);
    Utils.showToast('AI settings saved.', 'info');

    // Refresh model badge + settings panel
    const badge = document.getElementById('ai-model-badge');
    if (badge) badge.textContent = AiProvider.config.model || '';
    this._renderSettings();
  },

  async _testConnection() {
    const btn = document.getElementById('ais-test-btn');
    const result = document.getElementById('ais-test-result');
    if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
    if (result) { result.style.display = 'block'; result.textContent = 'Connecting…'; result.className = 'ais-test-result ais-test-pending'; }

    // Save current form values first
    await this._saveSettings();

    const r = await AiProvider.testConnection();
    if (result) {
      if (r.ok) {
        result.textContent = `✓ Connected. Response: "${r.sample}"`;
        result.className = 'ais-test-result ais-test-ok';
      } else {
        result.textContent = `✗ ${r.error}`;
        result.className = 'ais-test-result ais-test-fail';
      }
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">wifi</span> Test'; }
  },

  // ── History tab ───────────────────────────────────────────────────────────────
  async _renderHistory() {
    const container = document.getElementById('ai-history-pane');
    if (!container) return;
    container.innerHTML = '<div style="color:#555;font-size:11px;padding:16px;text-align:center">Loading…</div>';

    const metas = await AiHistory.listMeta();
    if (metas.length === 0) {
      container.innerHTML = '<div style="color:#555;font-size:11px;padding:16px;text-align:center">No saved conversations.</div>';
      return;
    }

    container.innerHTML = metas.map(m => {
      const dt = new Date(m.updatedAt || m.createdAt || 0);
      const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isCurrent = m.id === this._conv?.id;
      return `<div class="ai-history-item ${isCurrent ? 'ai-history-item--active' : ''}" onclick="AiChat._loadConversation('${m.id}')">
        <div class="ai-history-title">${Utils.escapeHtml(m.title || 'Untitled')}</div>
        <div class="ai-history-meta">${Utils.escapeHtml(m.model || '')} · ${m.messageCount || 0} msgs · ${Utils.escapeHtml(dateStr)}</div>
        <button class="ai-history-delete" onclick="event.stopPropagation();AiChat._deleteConversation('${m.id}')" title="Delete">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>`;
    }).join('');
  },

  async _loadConversation(id) {
    const conv = await AiHistory.load(id);
    if (!conv) return;
    this._conv = conv;
    await AiDB.set('config', 'last-conv-id', id);
    this.switchTab('chat');
    this._renderMessages();
    setTimeout(() => this._scrollToBottom(), 50);
  },

  async _deleteConversation(id) {
    await AiHistory.delete(id);
    if (this._conv?.id === id) {
      this._newConvObj();
      this._renderMessages();
    }
    this._renderHistory();
  },

  // ── Scroll helpers ─────────────────────────────────────────────────────────────
  _scrollToBottom() {
    const container = document.getElementById('ai-messages');
    if (container) container.scrollTop = container.scrollHeight;
  },

  // ── Copy helpers ──────────────────────────────────────────────────────────────
  _copyMessage(idx) {
    const msg = this._conv?.messages?.[idx];
    if (!msg) return;
    navigator.clipboard?.writeText(msg.content).then(() => {
      Utils.showToast('Copied to clipboard.', 'info');
    });
  },

  _copyCode(btn) {
    const pre = btn.closest('.ai-code-block')?.querySelector('pre');
    if (!pre) return;
    const text = pre.textContent;
    navigator.clipboard?.writeText(text).then(() => {
      Utils.showToast('Code copied.', 'info', 1500);
    });
  },

  // ── Persist current conversation ──────────────────────────────────────────────
  async _saveCurrentConv() {
    if (!this._conv || this._conv.messages.length === 0) return;
    await AiHistory.save(this._conv);
    await AiDB.set('config', 'last-conv-id', this._conv.id);
  },

  // ── Send button state ─────────────────────────────────────────────────────────
  _updateSendBtn(isStreaming) {
    const btn = document.getElementById('ai-send-btn');
    if (!btn) return;
    if (isStreaming) {
      btn.innerHTML = '<span class="material-symbols-outlined">stop_circle</span>';
      btn.title = 'Stop';
      btn.onclick = () => AiChat.cancelStream();
    } else {
      btn.innerHTML = '<span class="material-symbols-outlined">send</span>';
      btn.title = 'Send (Enter)';
      btn.onclick = () => AiChat._sendFromInput();
    }
  },

  _sendFromInput() {
    const input = document.getElementById('ai-input');
    if (!input) return;
    const msg = input.value.trim();
    if (msg) this.send(msg);
  },

  _focusInput() {
    setTimeout(() => document.getElementById('ai-input')?.focus(), 50);
  },

  // ── Panel title (shows current conv title) ────────────────────────────────────
  _updateTitle() {
    const el = document.getElementById('ai-panel-conv-title');
    if (el && this._conv) el.textContent = this._conv.title || 'New Conversation';
  },

  // ── P3 — Code block apply/insert ──────────────────────────────────────────────
  // Called by action buttons inside AI code blocks
  _applyCodeFromBlock(btn, action) {
    const codeEl = btn.closest('.ai-code-block')?.querySelector('pre code');
    if (!codeEl) return;
    this._applyCode(codeEl.textContent, action);
  },

  _applyCode(code, action) {
    if (action === 'page') {
      if (!State.pageCodeMirror || !State.activePage) {
        Utils.showToast('No page editor is open.', 'warn'); return;
      }
      if (!confirm(`Replace the entire content of "${State.activePage}" with this AI-generated code?`)) return;
      State.pageCodeMirror.setValue(code);
      UI.setDirty(`page:${State.activePage}`, true);
      Preview.renderCurrentPage();
      Utils.showToast(`Applied to "${State.activePage}".`, 'info');
    } else if (action === 'component') {
      if (!State.compCodeMirror || !State.activeComponent) {
        Utils.showToast('No component editor is open.', 'warn'); return;
      }
      const lbl = State.components?.[State.activeComponent]?.meta?.label || State.activeComponent;
      if (!confirm(`Replace "${lbl}" component HTML with this AI-generated code?`)) return;
      State.compCodeMirror.setValue(code);
      UI.setDirty(`comp:${State.activeComponent}`, true);
      Utils.showToast(`Applied to component "${lbl}".`, 'info');
    } else if (action === 'insert') {
      const cm = State.pageCodeMirror || State.compCodeMirror;
      if (!cm) { Utils.showToast('No editor is open.', 'warn'); return; }
      cm.replaceSelection(code);
      const key = State.activePage
        ? `page:${State.activePage}`
        : `comp:${State.activeComponent}`;
      if (key) UI.setDirty(key, true);
      Utils.showToast('Inserted at cursor.', 'info');
    }
  },

  // ── P3 — Slash command preprocessor ──────────────────────────────────────────
  // Returns { display, llm } if a slash command is detected, else null.
  _preprocessSlashCmd(msg) {
    const CMDS = {
      '/page':  () => {
        const html = State.pageCodeMirror?.getValue() || '';
        const file = State.activePage || '(no page open)';
        if (!html) return null;
        const snippet = html.length > 6000 ? html.slice(0, 6000) + '\n<!-- [truncated] -->' : html;
        return `${msg.replace(/^\/page\s*/, '') || '请分析以下页面'}\n\n[当前页面 ${file} 完整 HTML]\n\`\`\`html\n${snippet}\n\`\`\``;
      },
      '/comp':  () => {
        const html = State.compCodeMirror?.getValue()
          || State.components?.[State.activeComponent]?.html || '';
        const id = State.activeComponent || '(no component open)';
        if (!html) return null;
        const snippet = html.length > 4000 ? html.slice(0, 4000) + '\n<!-- [truncated] -->' : html;
        return `${msg.replace(/^\/comp\s*/, '') || '请分析以下组件'}\n\n[组件 ${id} 完整 HTML]\n\`\`\`html\n${snippet}\n\`\`\``;
      },
      '/i18n':  () => {
        const base = State.project?.baseLanguage || 'en';
        const baseData = State.i18nData?.[base] || {};
        const entries = Object.entries(baseData).slice(0, 80);
        if (!entries.length) return null;
        const table = entries.map(([k, v]) => `  "${k}": "${v}"`).join(',\n');
        return `${msg.replace(/^\/i18n\s*/, '') || '请处理以下 i18n 数据'}\n\n[${base} 语言 i18n (前80条)]\n\`\`\`json\n{\n${table}\n}\n\`\`\``;
      },
      '/theme': () => {
        const theme = State.project?.theme;
        if (!theme) return null;
        return `${msg.replace(/^\/theme\s*/, '') || '请分析主题配置'}\n\n[主题配置]\n\`\`\`json\n${JSON.stringify(theme, null, 2)}\n\`\`\``;
      },
    };

    for (const [cmd, buildLlm] of Object.entries(CMDS)) {
      if (msg.startsWith(cmd)) {
        const llm = buildLlm();
        if (llm) return { display: msg, llm };
        break;
      }
    }
    return null;
  },

  // ── P4 — Panel drag-resize ────────────────────────────────────────────────────
  _initResize() {
    const panel = document.getElementById('ai-panel');
    if (!panel) return;
    const handle = document.createElement('div');
    handle.className = 'ai-resize-handle';
    panel.prepend(handle);
    let startX = 0, startW = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startW = panel.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const delta = startX - e.clientX;
      const newW = Math.max(280, Math.min(600, startW + delta));
      panel.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', async () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      await AiDB.set('config', 'ai-panel-width', panel.offsetWidth);
    });
    AiDB.get('config', 'ai-panel-width').then(w => {
      if (w && w >= 280 && w <= 600) panel.style.width = w + 'px';
    });
  },

  // ── P4 — Textarea auto-grow ───────────────────────────────────────────────────
  _initAutoGrow() {
    const ta = document.getElementById('ai-input');
    if (!ta) return;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    });
  },

  // ── P4 — Retry last assistant response ───────────────────────────────────────
  _retryLast() {
    if (this._streaming) return;
    const msgs = this._conv && this._conv.messages;
    if (!msgs || msgs.length < 1) return;
    if (msgs[msgs.length - 1].role === 'assistant') msgs.pop();
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const content = msgs[lastUserIdx].content;
    msgs.splice(lastUserIdx, 1);
    this._renderMessages();
    this.send(content);
  },

  // ── P4 — Edit a user message and resend ──────────────────────────────────────
  _editMessage(idx) {
    if (this._streaming) return;
    const msgs = this._conv && this._conv.messages;
    if (!msgs || idx < 0 || idx >= msgs.length || msgs[idx].role !== 'user') return;
    const content = msgs[idx].content;
    msgs.splice(idx);
    this._renderMessages();
    const ta = document.getElementById('ai-input');
    if (ta) {
      ta.value = content;
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    }
  },

  // ── P5 — Vision: init drag/drop + paste handlers ─────────────────────────────
  _initVision() {
    const area = document.querySelector('.ai-input-area');
    const ta   = document.getElementById('ai-input');
    if (!area || !ta) return;

    // Paste image from clipboard
    ta.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) this._addImageFromFile(file);
        }
      }
    });

    // Drag-over: highlight drop zone
    area.addEventListener('dragover', (e) => {
      if ([...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        area.classList.add('ai-input-area--dragover');
      }
    });
    area.addEventListener('dragleave', (e) => {
      if (!area.contains(e.relatedTarget)) {
        area.classList.remove('ai-input-area--dragover');
      }
    });
    area.addEventListener('drop', (e) => {
      area.classList.remove('ai-input-area--dragover');
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      files.slice(0, 4).forEach(f => this._addImageFromFile(f));
    });
  },

  // ── P5 — Read a File/Blob as base64 dataURL and stage it ─────────────────────
  async _addImageFromFile(file) {
    if (this._pendingImages.length >= 4) {
      Utils.showToast('最多附加 4 张图片', 'warn'); return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
      this._pendingImages.push({
        dataUrl,
        mimeType: file.type || 'image/jpeg',
        name: file.name || 'image',
      });
      this._renderImagePreviews();
    } catch (err) {
      Utils.showToast('图片读取失败：' + err.message, 'error');
    }
  },

  // ── P5 — Render the staged image thumbnail strip ──────────────────────────────
  _renderImagePreviews() {
    const area = document.querySelector('.ai-input-area');
    if (!area) return;
    let strip = document.getElementById('ai-image-strip');

    if (this._pendingImages.length === 0) {
      if (strip) strip.remove();
      return;
    }

    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'ai-image-strip';
      strip.className = 'ai-image-strip';
      // Insert before the textarea
      const ta = document.getElementById('ai-input');
      area.insertBefore(strip, ta || area.firstChild);
    }

    strip.innerHTML = this._pendingImages.map((img, i) =>
      '<div class="ai-image-thumb">'
      + '<img src="' + img.dataUrl + '" alt="img' + i + '" title="' + Utils.escapeHtml(img.name) + '">'
      + '<button class="ai-image-remove" onclick="AiChat._removeImage(' + i + ')" title="Remove">'
      + '<span class="material-symbols-outlined">close</span></button>'
      + '</div>'
    ).join('');
  },

  // ── P5 — Remove a staged image ────────────────────────────────────────────────
  _removeImage(idx) {
    this._pendingImages.splice(idx, 1);
    this._renderImagePreviews();
  },

  // ── P6 — Editor Quick Actions ─────────────────────────────────────────────────
  showQuickMenu(anchorEl) {
    this._dismissQuickMenu();
    const actions = this._getQuickActions();
    if (!actions.length) {
      Utils.showToast('请先打开页面或组件编辑器', 'warn'); return;
    }
    this._quickActions = actions;

    const menu = document.createElement('div');
    menu.id = 'ai-quick-menu';
    menu.className = 'ai-quick-menu';
    menu.innerHTML = actions.map((a, i) => {
      if (a.divider) return '<div class="ai-quick-menu-divider"></div>';
      return '<button class="ai-quick-menu-item" onclick="AiChat._runQuickAction(' + i + ')">'
        + '<span class="material-symbols-outlined">' + (a.icon || 'auto_awesome') + '</span>'
        + '<span>' + Utils.escapeHtml(a.label) + '</span>'
        + '</button>';
    }).join('');
    document.body.appendChild(menu);

    // Position below anchor
    const rect = anchorEl.getBoundingClientRect();
    const menuW = 230;
    let left = rect.right - menuW;
    if (left < 4) left = 4;
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.style.left = left + 'px';

    setTimeout(() => {
      this._quickMenuOutside = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) this._dismissQuickMenu();
      };
      this._quickMenuEsc = (e) => { if (e.key === 'Escape') this._dismissQuickMenu(); };
      document.addEventListener('click', this._quickMenuOutside);
      document.addEventListener('keydown', this._quickMenuEsc);
    }, 0);
  },

  _runQuickAction(idx) {
    const action = this._quickActions?.[idx];
    this._dismissQuickMenu();
    if (!action || !action.prompt) return;
    if (!this._open) this.open();
    this.send(action.prompt);
  },

  _dismissQuickMenu() {
    document.getElementById('ai-quick-menu')?.remove();
    if (this._quickMenuOutside) { document.removeEventListener('click', this._quickMenuOutside); this._quickMenuOutside = null; }
    if (this._quickMenuEsc)     { document.removeEventListener('keydown', this._quickMenuEsc);   this._quickMenuEsc = null; }
  },

  // ── P7 — Plan/Act mode ───────────────────────────────────────────────────────
  setMode(mode) {
    this._mode = mode;
    const panel = document.getElementById('ai-panel');
    if (panel) {
      panel.classList.toggle('ai-panel--plan', mode === 'plan');
    }
    // Update toggle button active state
    document.querySelectorAll('#ai-mode-toggle .ai-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    // Persist choice
    AiDB.set('config', 'ai-mode', mode).catch(() => {});
    // Show a brief indicator in the chat area if panel is open
    if (this._open) {
      const lbl = mode === 'plan' ? '🔵 Plan mode — AI will analyse and plan without writing full code.' : '⚡ Act mode — AI will produce complete, executable code.';
      Utils.showToast(lbl, 'info', 2500);
    }
  },

  async _initMode() {
    const saved = await AiDB.get('config', 'ai-mode');
    const mode = saved === 'plan' ? 'plan' : 'act';
    this._mode = mode;
    if (mode !== 'act') {
      // Only need to update UI if non-default
      const panel = document.getElementById('ai-panel');
      if (panel && mode === 'plan') panel.classList.add('ai-panel--plan');
      document.querySelectorAll('#ai-mode-toggle .ai-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
    }
  },

  // ── P7.1 — Model quick-select ────────────────────────────────────────────────
  async setModelQuick(model) {
    if (!model) return;
    await AiProvider.saveConfig({ model });
    // Keep Settings pane in sync if open
    const ms = document.getElementById('ais-model');
    if (ms) {
      const prov = AiProvider.PROVIDERS[AiProvider.config.provider] || {};
      if (prov.models?.includes(model)) {
        ms.value = model;
      } else {
        ms.value = '__custom__';
        const mc = document.getElementById('ais-model-custom');
        if (mc) { mc.value = model; mc.style.display = ''; }
      }
    }
  },

  _renderModelSelect() {
    const sel = document.getElementById('ai-model-select');
    if (!sel) return;
    const cfg = AiProvider.config;
    const prov = AiProvider.PROVIDERS[cfg.provider] || {};
    const models = prov.models || [];
    const current = cfg.model || '';
    let html = models.map(m =>
      '<option value="' + Utils.escapeHtml(m) + '"' + (m === current ? ' selected' : '') + '>'
      + Utils.escapeHtml(m) + '</option>'
    ).join('');
    // If current model is custom (not in list), add it
    if (current && !models.includes(current)) {
      html += '<option value="' + Utils.escapeHtml(current) + '" selected>' + Utils.escapeHtml(current) + '</option>';
    }
    sel.innerHTML = html || '<option value="">—</option>';
  },

  // ── P7.1 — Skill selection ────────────────────────────────────────────────────
  setSkill(id) {
    this._activeSkill = id;
    AiDB.set('config', 'ai-active-skill', id).catch(() => {});
    const skill = this._skills.find(s => s.id === id);
    if (skill && this._open) Utils.showToast('🧩 Skill: ' + skill.name, 'info', 2000);
    else if (!id && this._open) Utils.showToast('Skill cleared', 'info', 1500);
  },

  // ── P7.1 — Agent selection ────────────────────────────────────────────────────
  setAgent(id) {
    this._activeAgent = id;
    AiDB.set('config', 'ai-active-agent', id).catch(() => {});
    const agent = this._agents.find(a => a.id === id);
    if (agent && this._open) Utils.showToast('🤖 Agent: ' + agent.name, 'info', 2000);
    else if (!id && this._open) Utils.showToast('Default agent restored', 'info', 1500);
  },

  // ── P7.2 — Init skills/agents: merge built-in + user-lib + IDB ───────────────
  async _initSkillsAgents() {
    const [builtinSkills, builtinAgents] = await this._loadBuiltinSkillsAgents();
    const [libSkills, libAgents]         = await this._loadUserLibSkillsAgents();
    const idbSkills  = (await AiDB.getAll('skills'));
    const idbAgents  = (await AiDB.getAll('agents'));

    // Tag sources and de-duplicate by id (priority: builtin > user-lib > idb)
    const mergeList = (builtin, lib, idb) => {
      const map = new Map();
      for (const s of idb)     map.set(s.id, { ...s, _source: 'custom' });
      for (const s of lib)     map.set(s.id, { ...s, _source: 'user-lib' });
      for (const s of builtin) map.set(s.id, { ...s, _source: 'built-in' });
      return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    };

    this._skills = mergeList(builtinSkills, libSkills, idbSkills);
    this._agents = mergeList(builtinAgents, libAgents, idbAgents);

    this._populateSkillSelect();
    this._populateAgentSelect();

    // Restore last active selections
    const savedSkill = await AiDB.get('config', 'ai-active-skill');
    if (savedSkill && this._skills.find(s => s.id === savedSkill)) {
      this._activeSkill = savedSkill;
      const sel = document.getElementById('ai-skill-select');
      if (sel) sel.value = savedSkill;
    }
    const savedAgent = await AiDB.get('config', 'ai-active-agent');
    if (savedAgent && this._agents.find(a => a.id === savedAgent)) {
      this._activeAgent = savedAgent;
      const sel = document.getElementById('ai-agent-select');
      if (sel) sel.value = savedAgent;
    }
  },

  // ── YAML front-matter parser (no external deps) ───────────────────────────
  _parseFrontMatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) return { meta: {}, body: text };
    const meta = {};
    match[1].split('\n').forEach(line => {
      const m = line.match(/^([\w-]+)\s*:\s*([\s\S]+)$/);
      if (m) meta[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
    return { meta, body: match[2] };
  },

  // Load built-in skills/agents from builder/builtin/ (Electron or browser)
  async _loadBuiltinSkillsAgents() {
    try {
      if (typeof window.electronAPI !== 'undefined') {
        // Electron: direct file system access
        const builtinPath = await window.electronAPI.getResourcesPath();
        const skills = await this._readSkillEntries(builtinPath + '/skills');
        const agents = await this._readAgentEntries(builtinPath + '/agents');
        return [skills, agents];
      } else {
        // Browser: fetch manifest.json from builtin/
        return await this._loadBuiltinViaBrowser();
      }
    } catch { return [[], []]; }
  },

  // Browser mode: load built-in — prefer inlined __BUILTIN_DATA__ (file:// safe),
  // fall back to fetch manifest.json (http:// only)
  async _loadBuiltinViaBrowser() {
    // Fast path: builtin-data.js was loaded as <script> — works under file://
    if (window.__BUILTIN_DATA__) {
      const d = window.__BUILTIN_DATA__;
      return [d.skills || [], d.agents || []];
    }
    // Fallback: fetch over http://
    try {
      const res = await fetch('builtin/manifest.json');
      if (!res.ok) return [[], []];
      const manifest = await res.json();
      const skills = [], agents = [];
      for (const s of manifest.skills || []) {
        const skill = await this._loadSkillFromBrowser(s);
        if (skill) skills.push(skill);
      }
      for (const a of manifest.agents || []) {
        const agent = await this._loadAgentFromBrowser(a);
        if (agent) agents.push(agent);
      }
      return [skills, agents];
    } catch { return [[], []]; }
  },

  async _loadSkillFromBrowser(entry) {
    try {
      if (entry.type === 'folder') {
        const skillMdRes = await fetch('builtin/' + entry.path + '/SKILL.md');
        if (!skillMdRes.ok) return null;
        const text = await skillMdRes.text();
        const { meta, body } = this._parseFrontMatter(text);
        const skill = { id: entry.id, name: meta.name || entry.id, description: meta.description || '', prompt: body, _refs: [] };
        // Try to load references
        const refRes = await fetch('builtin/' + entry.path + '/references/COMPONENT-GUIDE.md').catch(() => null);
        if (refRes && refRes.ok) skill._refs.push({ name: 'COMPONENT-GUIDE.md', content: await refRes.text() });
        return skill;
      } else {
        const res = await fetch('builtin/' + entry.path);
        if (!res.ok) return null;
        return JSON.parse(await res.text());
      }
    } catch { return null; }
  },

  async _loadAgentFromBrowser(entry) {
    try {
      const res = await fetch('builtin/' + entry.path);
      if (!res.ok) return null;
      const text = await res.text();
      if (entry.type === 'md') {
        const { meta, body } = this._parseFrontMatter(text);
        return { id: entry.id, name: meta.name || entry.id, description: meta.description || '', prompt: body };
      }
      return JSON.parse(text);
    } catch { return null; }
  },

  // Load user-library skills/agents from user-configured folder (Electron only)
  async _loadUserLibSkillsAgents() {
    const libPath = await AiDB.get('config', 'ai-user-lib-path');
    if (!libPath || typeof window.electronAPI === 'undefined') return [[], []];
    try {
      const skills = await this._readSkillEntries(libPath + '/skills');
      const agents = await this._readAgentEntries(libPath + '/agents');
      return [skills, agents];
    } catch { return [[], []]; }
  },

  // Read all skills in a directory (supports both folder/SKILL.md and *.skill.json)
  async _readSkillEntries(dirPath) {
    try {
      const entries = await window.electronAPI.listDir(dirPath);
      const results = [];
      for (const e of entries) {
        if (e.kind === 'directory') {
          // Cline standard format: folder with SKILL.md
          const skill = await this._loadSkillFolder(e.fullPath, e.name);
          if (skill) results.push(skill);
        } else if (e.kind === 'file' && e.name.endsWith('.skill.json')) {
          // Legacy JSON format
          const text = await window.electronAPI.readFile(e.fullPath);
          if (!text) continue;
          try {
            const obj = JSON.parse(text);
            if (obj && obj.id && obj.name && obj.prompt) results.push(obj);
          } catch { /* skip */ }
        }
      }
      return results;
    } catch { return []; }
  },

  // Load a Cline-format skill folder (has SKILL.md + optional references/, templates/)
  async _loadSkillFolder(folderPath, folderName) {
    try {
      const skillMdPath = folderPath + '/SKILL.md';
      const text = await window.electronAPI.readFile(skillMdPath);
      if (!text) return null;
      const { meta, body } = this._parseFrontMatter(text);
      const skill = {
        id: meta.name || folderName,
        name: meta.name || folderName,
        description: meta.description || '',
        prompt: body,
        _refs: [],
        _templates: [],
      };
      // Load references/*.md
      try {
        const refEntries = await window.electronAPI.listDir(folderPath + '/references');
        for (const r of refEntries) {
          if (r.kind === 'file' && r.name.endsWith('.md')) {
            const content = await window.electronAPI.readFile(r.fullPath);
            if (content) skill._refs.push({ name: r.name, content });
          }
        }
      } catch { /* no references dir */ }
      // Load templates/*.html
      try {
        const tmplEntries = await window.electronAPI.listDir(folderPath + '/templates');
        for (const t of tmplEntries) {
          if (t.kind === 'file' && (t.name.endsWith('.html') || t.name.endsWith('.md'))) {
            const content = await window.electronAPI.readFile(t.fullPath);
            if (content) skill._templates.push({ name: t.name, content });
          }
        }
      } catch { /* no templates dir */ }
      return skill;
    } catch { return null; }
  },

  // Read all agents in a directory (supports *.agent.md and *.agent.json)
  async _readAgentEntries(dirPath) {
    try {
      const entries = await window.electronAPI.listDir(dirPath);
      const results = [];
      for (const e of entries) {
        if (e.kind !== 'file') continue;
        if (e.name.endsWith('.agent.md')) {
          const text = await window.electronAPI.readFile(e.fullPath);
          if (!text) continue;
          const { meta, body } = this._parseFrontMatter(text);
          const id = e.name.replace(/\.agent\.md$/, '');
          results.push({
            id: meta.name || id,
            name: meta.name || id,
            description: meta.description || '',
            prompt: body,
          });
        } else if (e.name.endsWith('.agent.json')) {
          const text = await window.electronAPI.readFile(e.fullPath);
          if (!text) continue;
          try {
            const obj = JSON.parse(text);
            if (obj && obj.id && obj.name && obj.prompt) results.push(obj);
          } catch { /* skip */ }
        }
      }
      return results;
    } catch { return []; }
  },

  // Let user pick their personal skill/agent library folder
  async pickUserLibFolder() {
    if (typeof window.electronAPI === 'undefined') {
      Utils.showToast('User Library folder requires the Electron app.', 'warn'); return;
    }
    const chosen = await window.electronAPI.openDirectory({ title: 'Select Your AI Library Folder' });
    if (!chosen) return;
    await AiDB.set('config', 'ai-user-lib-path', chosen);
    // Ensure sub-directories exist
    await window.electronAPI.mkdir(chosen + '/skills');
    await window.electronAPI.mkdir(chosen + '/agents');
    Utils.showToast('User library folder set: ' + chosen, 'info', 3000);
    await this._initSkillsAgents();
    // Refresh settings pane if open
    if (this._activeTab === 'settings') this._renderSettings();
  },

  _populateSkillSelect() {
    const sel = document.getElementById('ai-skill-select');
    if (!sel) return;
    const opts = this._skills.map(s =>
      '<option value="' + Utils.escapeHtml(s.id) + '"'
      + (s.id === this._activeSkill ? ' selected' : '') + '>'
      + Utils.escapeHtml(s.name) + '</option>'
    ).join('');
    sel.innerHTML = '<option value="">No Skill</option>' + opts;
  },

  _populateAgentSelect() {
    const sel = document.getElementById('ai-agent-select');
    if (!sel) return;
    const opts = this._agents.map(a =>
      '<option value="' + Utils.escapeHtml(a.id) + '"'
      + (a.id === this._activeAgent ? ' selected' : '') + '>'
      + Utils.escapeHtml(a.name) + '</option>'
    ).join('');
    sel.innerHTML = '<option value="">Default Agent</option>' + opts;
  },

  // ── P7.1 — Skill/Agent CRUD (called from Settings pane) ──────────────────────
  async saveSkill(skill) {
    // skill = { id, name, prompt }
    if (!skill.id) skill.id = 'skill_' + Date.now();
    await AiDB.set('skills', skill.id, skill);
    await this._initSkillsAgents();
  },

  async deleteSkill(id) {
    await AiDB.del('skills', id);
    if (this._activeSkill === id) { this._activeSkill = ''; AiDB.set('config', 'ai-active-skill', '').catch(() => {}); }
    await this._initSkillsAgents();
  },

  async saveAgent(agent) {
    // agent = { id, name, prompt }
    if (!agent.id) agent.id = 'agent_' + Date.now();
    await AiDB.set('agents', agent.id, agent);
    await this._initSkillsAgents();
  },

  async deleteAgent(id) {
    await AiDB.del('agents', id);
    if (this._activeAgent === id) { this._activeAgent = ''; AiDB.set('config', 'ai-active-agent', '').catch(() => {}); }
    await this._initSkillsAgents();
  },

  _getQuickActions() {
    const acts = [];

    if (State.activePage) {
      const f = State.activePage;
      const sel = State.pageCodeMirror?.getSelection()?.trim();
      if (sel) {
        acts.push({ icon: 'select_all', label: '分析选中代码',
          prompt: '分析并改进以下 HTML 代码：\n```html\n' + sel + '\n```' });
        acts.push({ divider: true });
      }
      acts.push({ icon: 'account_tree', label: '分析页面结构',
        prompt: '/page 分析"' + f + '"的 HTML 结构，找出问题并给出具体改进建议' });
      acts.push({ icon: 'smartphone', label: '检查移动端适配',
        prompt: '/page 检查"' + f + '"的响应式设计，用 Tailwind 补充移动端样式' });
      acts.push({ icon: 'travel_explore', label: '优化 SEO 标签',
        prompt: '/page 审查"' + f + '"的 SEO meta 标签（title, description, og, canonical），给出优化方案' });
      acts.push({ icon: 'accessibility_new', label: '检查可访问性',
        prompt: '/page 检查"' + f + '"的 ARIA roles, alt text, tabindex, 颜色对比，给出修改方案' });
      acts.push({ icon: 'add_circle', label: '生成新内容区块',
        prompt: '为页面"' + f + '"生成一段新的 Tailwind CSS HTML 区块，请描述你需要什么' });

    } else if (State.activeComponent) {
      const id    = State.activeComponent;
      const label = State.components?.[id]?.meta?.label || id;
      const sel   = State.compCodeMirror?.getSelection()?.trim();
      if (sel) {
        acts.push({ icon: 'select_all', label: '分析选中代码',
          prompt: '分析并改进以下组件代码：\n```html\n' + sel + '\n```' });
        acts.push({ divider: true });
      }
      acts.push({ icon: 'architecture', label: '重构组件结构',
        prompt: '/comp 重构"' + label + '"组件，改善语义化、可读性和 Tailwind class 编排' });
      acts.push({ icon: 'animation', label: '添加过渡动画',
        prompt: '/comp 为"' + label + '"组件用 Tailwind CSS 添加合适的过渡/动画效果' });
      acts.push({ icon: 'translate', label: '提取 i18n 文案',
        prompt: '/comp 找出"' + label + '"组件中所有硬编码的文字，给出 i18n key 提取方案' });
      acts.push({ icon: 'smartphone', label: '改进移动端样式',
        prompt: '/comp 优化"' + label + '"组件的 Tailwind 响应式样式（sm → 2xl）' });

    } else if (State.activeI18nLang) {
      const base = State.project?.baseLanguage || 'en';
      acts.push({ icon: 'translate', label: '翻译所有缺失文案',
        prompt: '/i18n 将所有缺失的 ' + State.activeI18nLang + ' 翻译补全，参考 ' + base + ' 语言，输出 JSON' });
      acts.push({ icon: 'spellcheck', label: '校对翻译质量',
        prompt: '/i18n 校对现有 ' + State.activeI18nLang + ' 翻译，标出不自然或有误的条目并给出修正版本' });
    }

    return acts;
  },
};
