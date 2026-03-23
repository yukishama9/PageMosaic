/* ===== wb-ai-provider.js — LLM Provider Layer (P1) ===== */

// ─── AI Database (IndexedDB) ───────────────────────────────────────────────────
const AiDB = {
  _db: null,
  DB_NAME: 'wb-ai-data',
  DB_VERSION: 2,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const stores = ['config', 'secrets', 'crypto', 'conversations', 'conv-meta', 'skills', 'agents'];
        for (const s of stores) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async get(store, key) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  },

  async set(store, key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAll(store) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async getAllKeys(store) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  async del(store, key) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },
};

// ─── API Key Encryption (AES-GCM via Web Crypto API) ─────────────────────────
// Stores a non-exportable CryptoKey in IndexedDB — raw key material never
// leaves the origin. API keys are AES-256-GCM encrypted at rest.
const AiCrypto = {
  _key: null,

  async _getOrCreateKey() {
    if (this._key) return this._key;

    // Try to restore persisted CryptoKey from IndexedDB.
    // CryptoKey objects are structured-cloneable — they CAN be stored in IDB.
    const stored = await AiDB.get('crypto', 'encKey');
    if (stored) {
      // stored is the CryptoKey itself (structured-cloned)
      this._key = stored;
      return this._key;
    }

    // Generate a new non-exportable AES-GCM-256 key
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,          // non-exportable — key material never leaves the runtime
      ['encrypt', 'decrypt']
    );
    await AiDB.set('crypto', 'encKey', key);
    this._key = key;
    return this._key;
  },

  async encrypt(plaintext) {
    const key = await this._getOrCreateKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(cipherBuf)),
    };
  },

  async decrypt(encrypted) {
    if (!encrypted || !encrypted.iv || !encrypted.data) return '';
    const key = await this._getOrCreateKey();
    const iv = new Uint8Array(encrypted.iv);
    const data = new Uint8Array(encrypted.data);
    try {
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      return '';
    }
  },
};

// ─── AI Provider ──────────────────────────────────────────────────────────────
const AiProvider = {

  // ── Provider presets ──────────────────────────────────────────────────────────
  PROVIDERS: {
    openai: {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
      format: 'openai',
      needsKey: true,
      vision: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    },
    anthropic: {
      name: 'Anthropic',
      endpoint: 'https://api.anthropic.com/v1',
      models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5', 'claude-3-opus-20240229'],
      format: 'anthropic',
      needsKey: true,
      vision: true,
    },
    gemini: {
      name: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      format: 'gemini',
      needsKey: true,
      vision: true,
    },
    grok: {
      name: 'Grok (xAI)',
      endpoint: 'https://api.x.ai/v1',
      models: ['grok-3', 'grok-3-fast', 'grok-3-mini', 'grok-2'],
      format: 'openai',
      needsKey: true,
      vision: ['grok-2'],
    },
    deepseek: {
      name: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      format: 'openai',
      needsKey: true,
    },
    glm: {
      name: '智谱 GLM',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4-0520'],
      format: 'openai',
      needsKey: true,
    },
    kimi: {
      name: 'Moonshot Kimi',
      endpoint: 'https://api.moonshot.cn/v1',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      format: 'openai',
      needsKey: true,
    },
    qwen: {
      name: '通义千问',
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen2.5-72b-instruct', 'qwen2.5-coder-32b-instruct'],
      format: 'openai',
      needsKey: true,
    },
    hunyuan: {
      name: '腾讯混元',
      endpoint: 'https://api.hunyuan.cloud.tencent.com/v1',
      models: ['hunyuan-turbo', 'hunyuan-pro', 'hunyuan-standard', 'hunyuan-code'],
      format: 'openai',
      needsKey: true,
    },
    ollama: {
      name: 'Ollama (本地)',
      endpoint: 'http://localhost:11434/v1',
      models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'qwen2.5-coder', 'deepseek-r1'],
      format: 'openai',
      needsKey: false,
    },
    custom: {
      name: '自定义 (Custom)',
      endpoint: '',
      models: [],
      format: 'openai',
      needsKey: true,
    },
  },

  // ── Loaded config (populated by loadConfig()) ─────────────────────────────────
  config: {
    provider: 'openai',
    endpoint: '',       // custom endpoint override; empty = use provider default
    model: 'gpt-4o',
    planModel: '',      // optional separate model for Plan mode; empty = use model
    maxTokens: 4096,
    temperature: 0.7,
    apiKey: '',         // in-memory only — never written to plain storage
  },

  _loaded: false,

  // ── Load config + decrypt API key ─────────────────────────────────────────────
  async loadConfig() {
    const saved = await AiDB.get('config', 'provider-config');
    if (saved) {
      Object.assign(this.config, saved);
    }
    // Decrypt API key for current provider
    await this._loadApiKey(this.config.provider);
    this._loaded = true;
    return this.config;
  },

  async _loadApiKey(providerId) {
    const enc = await AiDB.get('secrets', providerId);
    if (enc) {
      this.config.apiKey = await AiCrypto.decrypt(enc);
    } else {
      this.config.apiKey = '';
    }
  },

  // ── Save config (+ optionally update API key) ─────────────────────────────────
  async saveConfig(updates = {}) {
    const prevProvider = this.config.provider;
    Object.assign(this.config, updates);

    // If provider changed, load the new provider's key
    if (updates.provider && updates.provider !== prevProvider) {
      await this._loadApiKey(updates.provider);
    }

    // Persist non-sensitive config
    const toStore = { ...this.config };
    delete toStore.apiKey;
    await AiDB.set('config', 'provider-config', toStore);

    // Persist encrypted API key when explicitly provided
    if (Object.prototype.hasOwnProperty.call(updates, 'apiKey')) {
      if (updates.apiKey) {
        const enc = await AiCrypto.encrypt(updates.apiKey);
        await AiDB.set('secrets', this.config.provider, enc);
      } else {
        await AiDB.del('secrets', this.config.provider);
      }
    }
  },

  // ── Effective endpoint for current config ─────────────────────────────────────
  getEndpoint() {
    const prov = this.PROVIDERS[this.config.provider];
    return (this.config.endpoint || '').trim() || prov?.endpoint || '';
  },

  // ── Vision support check ──────────────────────────────────────────────────────
  supportsVision() {
    const prov = this.PROVIDERS[this.config.provider];
    if (!prov || !prov.vision) return false;
    if (prov.vision === true) return true;
    if (Array.isArray(prov.vision)) return prov.vision.includes(this.config.model);
    return false;
  },

  // ── Normalize a message to its API wire format ────────────────────────────────
  // Converts { role, content, images } → provider-specific content structure.
  _normalizeOpenAI(msg) {
    if (!msg.images || !msg.images.length) return { role: msg.role, content: msg.content };
    return {
      role: msg.role,
      content: [
        ...msg.images.map(img => ({ type: 'image_url', image_url: { url: img.dataUrl } })),
        { type: 'text', text: msg.content || '' },
      ],
    };
  },

  _normalizeAnthropic(msg) {
    if (!msg.images || !msg.images.length) return { role: msg.role, content: msg.content };
    return {
      role: msg.role,
      content: [
        ...msg.images.map(img => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType || 'image/jpeg',
            data: img.dataUrl.split(',')[1] || '',
          },
        })),
        { type: 'text', text: msg.content || '' },
      ],
    };
  },

  // ── Chat with mode-aware model selection ─────────────────────────────────────
  // mode: 'plan' | 'act' — uses planModel for plan mode if configured
  chatWithMode(mode, messages, callbacks) {
    const planModel = (this.config.planModel || '').trim();
    if (mode === 'plan' && planModel && planModel !== this.config.model) {
      // Temporarily swap model for this call
      const saved = this.config.model;
      this.config.model = planModel;
      const ac = this.chat(messages, callbacks);
      // Restore after call is initiated (async, so restore immediately after sync setup)
      this.config.model = saved;
      return ac;
    }
    return this.chat(messages, callbacks);
  },

  // ── Unified streaming chat ────────────────────────────────────────────────────
  // messages: [{ role: 'system'|'user'|'assistant', content: string }]
  // callbacks: { onToken(str), onDone(), onError(msg) }
  // Returns an AbortController so the caller can cancel.
  chat(messages, { onToken, onDone, onError } = {}) {
    const ac = new AbortController();

    const run = async () => {
      if (!this._loaded) await this.loadConfig();

      const prov = this.PROVIDERS[this.config.provider];
      if (!prov) { onError?.('Unknown provider: ' + this.config.provider); return; }

      const endpoint = this.getEndpoint();
      if (!endpoint) { onError?.('No API endpoint configured'); return; }

      if (prov.needsKey && !this.config.apiKey) {
        onError?.('API key is not set. Open AI Settings to configure it.');
        return;
      }

      try {
        if (prov.format === 'anthropic') {
          await this._chatAnthropic(messages, endpoint, ac.signal, { onToken, onDone, onError });
        } else if (prov.format === 'gemini') {
          await this._chatGemini(messages, endpoint, ac.signal, { onToken, onDone, onError });
        } else {
          await this._chatOpenAI(messages, endpoint, ac.signal, { onToken, onDone, onError });
        }
      } catch (err) {
        if (err.name === 'AbortError') return; // cancelled by user
        onError?.(err.message || String(err));
      }
    };

    run();
    return ac;
  },

  // ── OpenAI-compatible streaming ───────────────────────────────────────────────
  async _chatOpenAI(messages, endpoint, signal, { onToken, onDone, onError }) {
    const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    const body = {
      model: this.config.model,
      messages: messages.map(m => this._normalizeOpenAI(m)),
      stream: true,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    const resp = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify(body), signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      const msg = this._extractErrorMsg(txt, resp.status);
      onError?.(msg); return;
    }

    await this._readSSE(resp.body, (data) => {
      if (data === '[DONE]') { onDone?.(); return; }
      try {
        const obj = JSON.parse(data);
        const token = obj.choices?.[0]?.delta?.content;
        if (token) onToken?.(token);
        if (obj.choices?.[0]?.finish_reason === 'stop') onDone?.();
      } catch { /* malformed chunk */ }
    });
  },

  // ── Anthropic streaming ───────────────────────────────────────────────────────
  async _chatAnthropic(messages, endpoint, signal, { onToken, onDone, onError }) {
    let system = '';
    const filtered = messages.filter(m => {
      if (m.role === 'system') { system = typeof m.content === 'string' ? m.content : ''; return false; }
      return true;
    });

    const url = `${endpoint.replace(/\/$/, '')}/messages`;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    };
    const body = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      messages: filtered.map(m => this._normalizeAnthropic(m)),
      stream: true,
      ...(system ? { system } : {}),
    };

    const resp = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify(body), signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      onError?.(this._extractErrorMsg(txt, resp.status)); return;
    }

    let doneFired = false;
    await this._readSSE(resp.body, (data) => {
      try {
        const obj = JSON.parse(data);
        if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
          onToken?.(obj.delta.text);
        }
        if (obj.type === 'message_stop' && !doneFired) { doneFired = true; onDone?.(); }
      } catch { /* malformed */ }
    });
  },

  // ── Gemini streaming ──────────────────────────────────────────────────────────
  async _chatGemini(messages, endpoint, signal, { onToken, onDone, onError }) {
    let systemInstruction = null;
    const contents = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemInstruction = { parts: [{ text: typeof m.content === 'string' ? m.content : '' }] };
      } else {
        const textContent = typeof m.content === 'string' ? m.content : '';
        const imageParts = (m.images || []).map(img => ({
          inline_data: {
            mime_type: img.mimeType || 'image/jpeg',
            data: img.dataUrl.split(',')[1] || '',
          },
        }));
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [...imageParts, { text: textContent }],
        });
      }
    }

    const model = this.config.model;
    const url = `${endpoint.replace(/\/$/, '')}/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
    const body = {
      contents,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
      ...(systemInstruction ? { systemInstruction } : {}),
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      onError?.(this._extractErrorMsg(txt, resp.status)); return;
    }

    let doneFired = false;
    await this._readSSE(resp.body, (data) => {
      try {
        const obj = JSON.parse(data);
        const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onToken?.(text);
        const reason = obj.candidates?.[0]?.finishReason;
        if ((reason === 'STOP' || reason === 'MAX_TOKENS') && !doneFired) {
          doneFired = true; onDone?.();
        }
      } catch { /* malformed */ }
    });
  },

  // ── SSE stream reader ─────────────────────────────────────────────────────────
  async _readSSE(body, onData) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop(); // keep partial last line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            if (data) onData(data);
          }
        }
      }
      // flush remaining
      if (buf.trim().startsWith('data:')) {
        onData(buf.trim().slice(5).trim());
      }
    } finally {
      reader.releaseLock();
    }
  },

  // ── Error message extractor ───────────────────────────────────────────────────
  _extractErrorMsg(responseText, status) {
    try {
      const obj = JSON.parse(responseText);
      const msg = obj?.error?.message || obj?.message || obj?.error || responseText;
      return `API error ${status}: ${msg}`;
    } catch {
      return `API error ${status}: ${responseText.slice(0, 200) || 'Unknown error'}`;
    }
  },

  // ── Test connection ────────────────────────────────────────────────────────────
  // Sends a minimal "hello" message to verify the config is working.
  async testConnection() {
    return new Promise((resolve) => {
      let got = false;
      this.chat(
        [{ role: 'user', content: 'Reply with just the word "ok".' }],
        {
          onToken: (t) => { if (!got) { got = true; resolve({ ok: true, sample: t }); } },
          onDone: () => { if (!got) resolve({ ok: true, sample: '' }); },
          onError: (msg) => resolve({ ok: false, error: msg }),
        }
      );
    });
  },
};