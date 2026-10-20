/**
 * Puter Advanced AI Chat
 * Real-time streaming multi-model chat UI powered by Puter.js
 * No backend, no API keys — users pay their own usage.
 *
 * Features:
 * - Streaming responses (for await of puter.ai.chat stream)
 * - Model selector + live listModels() refresh
 * - Conversation history (localStorage)
 * - Image attach for vision models
 * - System prompt, temperature, max tokens
 * - TTS for last assistant reply
 * - Export chat as Markdown
 * - Dark / light theme
 * - Keyboard shortcuts
 */

(function () {
  "use strict";

  // ——— State ———
  const state = {
    conversations: [], // { id, title, model, messages: [{role, content, images?}], updatedAt }
    activeId: null,
    streaming: false,
    abortController: null,
    attachedImage: null, // { url | dataUrl, name }
    settings: {
      temperature: 0.7,
      maxTokens: null,
      systemPrompt: "",
      normalize: true,
      saveHistory: true,
      stream: true,
    },
  };

  const STORAGE_KEY = "puter-ai-chat-v1";
  const THEME_KEY = "puter-ai-chat-theme";

  // ——— DOM ———
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    sidebar: $("#sidebar"),
    historyList: $("#history-list"),
    messages: $("#messages"),
    welcome: $("#welcome"),
    chatContainer: $("#chat-container"),
    promptInput: $("#prompt-input"),
    btnSend: $("#btn-send"),
    modelSelect: $("#model-select"),
    streamToggle: $("#stream-toggle"),
    statusBar: $("#status-bar"),
    statusText: $("#status-text"),
    btnStop: $("#btn-stop"),
    settingsModal: $("#settings-modal"),
    attachPreview: $("#attach-preview"),
    fileInput: $("#file-input"),
    btnTts: $("#btn-tts"),
  };

  // ——— Utils ———
  function uid() {
    return crypto.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function now() {
    return Date.now();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Lightweight markdown → HTML (code, bold, italic, links, lists, paragraphs) */
  function renderMarkdown(text) {
    if (!text) return "";
    let s = escapeHtml(text);

    // Fenced code blocks
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang || "text"}">${code.trim()}</code></pre>`;
    });

    // Inline code
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold / italic
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Links
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );

    // Simple lists
    s = s.replace(/^(?:- |\* )(.+)$/gm, "<li>$1</li>");
    s = s.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

    // Paragraphs
    s = s
      .split(/\n{2,}/)
      .map((p) => {
        if (p.startsWith("<pre") || p.startsWith("<ul") || p.startsWith("<li")) return p;
        return `<p>${p.replace(/\n/g, "<br>")}</p>`;
      })
      .join("");

    return s;
  }

  function titleFromMessages(messages) {
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return "New chat";
    const t = (firstUser.content || "").trim().slice(0, 48);
    return t || "New chat";
  }

  // ——— Persistence ———
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.conversations)) state.conversations = data.conversations;
      if (data.settings) Object.assign(state.settings, data.settings);
      if (data.activeId) state.activeId = data.activeId;
    } catch (e) {
      console.warn("Failed to load history", e);
    }
  }

  function saveState() {
    if (!state.settings.saveHistory) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          conversations: state.conversations,
          activeId: state.activeId,
          settings: state.settings,
        })
      );
    } catch (e) {
      console.warn("Failed to save history", e);
    }
  }

  // ——— Theme ———
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("#btn-theme").textContent = theme === "light" ? "☀️" : "🌙";
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  // ——— Conversations ———
  function getActive() {
    return state.conversations.find((c) => c.id === state.activeId) || null;
  }

  function createConversation(model) {
    const conv = {
      id: uid(),
      title: "New chat",
      model: model || els.modelSelect.value,
      messages: [],
      updatedAt: now(),
    };
    state.conversations.unshift(conv);
    state.activeId = conv.id;
    saveState();
    renderHistory();
    renderMessages();
    return conv;
  }

  function deleteConversation(id) {
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = state.conversations[0]?.id || null;
    }
    saveState();
    renderHistory();
    renderMessages();
  }

  function clearAll() {
    if (!confirm("Delete all conversations?")) return;
    state.conversations = [];
    state.activeId = null;
    saveState();
    renderHistory();
    renderMessages();
  }

  // ——— Render ———
  function renderHistory() {
    els.historyList.innerHTML = "";
    if (!state.conversations.length) {
      els.historyList.innerHTML =
        '<p style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem">No chats yet</p>';
      return;
    }
    for (const c of state.conversations) {
      const btn = document.createElement("button");
      btn.className = "history-item" + (c.id === state.activeId ? " active" : "");
      btn.setAttribute("role", "listitem");
      btn.innerHTML = `
        <span class="title">${escapeHtml(c.title)}</span>
        <span class="del" title="Delete" data-del="${c.id}">✕</span>
      `;
      btn.addEventListener("click", (e) => {
        if (e.target.dataset.del) {
          e.stopPropagation();
          deleteConversation(e.target.dataset.del);
          return;
        }
        state.activeId = c.id;
        els.modelSelect.value = c.model || els.modelSelect.value;
        saveState();
        renderHistory();
        renderMessages();
      });
      els.historyList.appendChild(btn);
    }
  }

  function renderMessages() {
    const conv = getActive();
    els.messages.innerHTML = "";
    if (!conv || !conv.messages.length) {
      els.welcome.hidden = false;
      els.btnTts.disabled = true;
      return;
    }
    els.welcome.hidden = true;

    for (const msg of conv.messages) {
      appendMessageEl(msg.role, msg.content, {
        model: msg.model,
        images: msg.images,
        streaming: false,
      });
    }
    const lastAssist = [...conv.messages].reverse().find((m) => m.role === "assistant");
    els.btnTts.disabled = !lastAssist?.content;
    scrollToBottom();
  }

  function appendMessageEl(role, content, opts = {}) {
    const div = document.createElement("div");
    div.className = `message ${role}` + (opts.streaming ? " streaming" : "");
    div.dataset.role = role;

    const avatar = role === "user" ? "You" : "AI";
    const metaParts = [];
    if (opts.model) metaParts.push(opts.model);
    if (opts.streaming) metaParts.push("streaming…");

    let body = renderMarkdown(content || "");
    if (opts.images?.length) {
      for (const img of opts.images) {
        const src = typeof img === "string" ? img : img.url || img;
        body += `<img class="msg-image" src="${escapeHtml(src)}" alt="attached" />`;
      }
    }

    div.innerHTML = `
      <div class="avatar" aria-hidden="true">${avatar === "You" ? "U" : "◈"}</div>
      <div class="content">
        <div class="bubble">${body || (opts.streaming ? "" : "<em>(empty)</em>")}</div>
        ${metaParts.length ? `<div class="meta">${metaParts.map(escapeHtml).join(" · ")}</div>` : ""}
      </div>
    `;
    els.messages.appendChild(div);
    return div;
  }

  function updateStreamingBubble(el, text) {
    const bubble = el.querySelector(".bubble");
    if (bubble) bubble.innerHTML = renderMarkdown(text);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
    });
  }

  function setStatus(text, showStop = false) {
    if (!text) {
      els.statusBar.hidden = true;
      els.btnStop.hidden = true;
      return;
    }
    els.statusBar.hidden = false;
    els.statusText.textContent = text;
    els.btnStop.hidden = !showStop;
  }

  // ——— Chat core ———
  function buildMessagesForApi(conv) {
    const out = [];
    if (state.settings.systemPrompt?.trim()) {
      out.push({ role: "system", content: state.settings.systemPrompt.trim() });
    }
    for (const m of conv.messages) {
      if (m.role === "user" && m.images?.length) {
        // Multimodal content for vision
        const content = [{ type: "text", text: m.content || "" }];
        for (const img of m.images) {
          content.push({
            type: "image_url",
            image_url: { url: typeof img === "string" ? img : img.url },
          });
        }
        out.push({ role: "user", content });
      } else {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }

  function extractText(response) {
    if (!response) return "";
    // Normalized / ChatResponse
    if (response.message?.content != null) {
      const c = response.message.content;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) {
        return c
          .map((part) => (typeof part === "string" ? part : part.text || part.content || ""))
          .join("");
      }
    }
    // Some models return plain string or .text
    if (typeof response === "string") return response;
    if (response.text) return response.text;
    if (response.content) return String(response.content);
    return "";
  }

  async function sendMessage(userText) {
    if (state.streaming) return;
    const text = (userText || "").trim();
    if (!text && !state.attachedImage) return;

    let conv = getActive();
    if (!conv) conv = createConversation(els.modelSelect.value);

    const model = els.modelSelect.value;
    conv.model = model;

    const userMsg = {
      role: "user",
      content: text || "(image)",
      images: state.attachedImage ? [state.attachedImage.url || state.attachedImage.dataUrl] : undefined,
    };
    conv.messages.push(userMsg);
    conv.title = titleFromMessages(conv.messages);
    conv.updatedAt = now();
    saveState();
    renderHistory();

    els.welcome.hidden = true;
    appendMessageEl("user", userMsg.content, { images: userMsg.images });
    clearAttach();
    els.promptInput.value = "";
    autoResize();
    updateSendEnabled();

    const stream = els.streamToggle.checked && state.settings.stream !== false;
    const options = {
      model,
      stream,
      normalize: state.settings.normalize,
    };
    if (state.settings.temperature != null) options.temperature = Number(state.settings.temperature);
    if (state.settings.maxTokens) options.max_tokens = Number(state.settings.maxTokens);

    state.streaming = true;
    els.btnSend.disabled = true;
    setStatus(stream ? "Streaming…" : "Thinking…", true);

    const assistantEl = appendMessageEl("assistant", "", {
      model,
      streaming: stream,
    });
    scrollToBottom();

    let fullText = "";
    const apiMessages = buildMessagesForApi(conv);

    try {
      if (stream) {
        const resp = await puter.ai.chat(apiMessages, options);
        for await (const part of resp) {
          if (!state.streaming) break; // stopped
          const chunk =
            part?.text ??
            part?.message?.content ??
            (typeof part === "string" ? part : "") ??
            "";
          if (chunk) {
            fullText += chunk;
            updateStreamingBubble(assistantEl, fullText);
            scrollToBottom();
          }
        }
      } else {
        const resp = await puter.ai.chat(apiMessages, options);
        fullText = extractText(resp);
        updateStreamingBubble(assistantEl, fullText);
      }

      assistantEl.classList.remove("streaming");
      conv.messages.push({
        role: "assistant",
        content: fullText,
        model,
      });
      conv.updatedAt = now();
      saveState();
      renderHistory();
      els.btnTts.disabled = !fullText;
    } catch (err) {
      console.error(err);
      assistantEl.classList.remove("streaming");
      const errMsg = err?.message || String(err);
      updateStreamingBubble(assistantEl, `⚠️ Error: ${errMsg}`);
      conv.messages.push({
        role: "assistant",
        content: `⚠️ Error: ${errMsg}`,
        model,
      });
      saveState();
    } finally {
      state.streaming = false;
      state.abortController = null;
      setStatus("");
      updateSendEnabled();
      scrollToBottom();
    }
  }

  function stopStreaming() {
    state.streaming = false;
    setStatus("Stopped");
    setTimeout(() => setStatus(""), 1200);
  }

  // ——— Models ———
  async function refreshModels() {
    setStatus("Loading models…");
    try {
      const models = await puter.ai.listModels();
      // models may be array of strings or objects
      const list = Array.isArray(models) ? models : models?.models || [];
      if (!list.length) {
        setStatus("No models returned (using defaults)");
        setTimeout(() => setStatus(""), 2000);
        return;
      }
      const current = els.modelSelect.value;
      els.modelSelect.innerHTML = "";
      const ids = list.map((m) => (typeof m === "string" ? m : m.id || m.model || m.name)).filter(Boolean);
      // Prefer popular ones first if present
      const preferred = [
        "anthropic/claude-opus-5-5",
        "openai/gpt-5.5",
        "google/gemini-3.8-flash",
        "xai/grok-4.7",
        "deepseek/deepseek-v4-pro",
        "openai/gpt-5.4-nano",
        "anthropic/claude-sonnet-5-5",
      ];
      const ordered = [
        ...preferred.filter((p) => ids.includes(p)),
        ...ids.filter((id) => !preferred.includes(id)),
      ];
      for (const id of ordered.slice(0, 80)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        els.modelSelect.appendChild(opt);
      }
      if (ids.includes(current)) els.modelSelect.value = current;
      setStatus(`Loaded ${ids.length} models`);
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      console.warn("listModels failed", e);
      setStatus("Could not refresh models — using built-in list");
      setTimeout(() => setStatus(""), 2500);
    }
  }

  function addCustomModel() {
    const id = $("#opt-custom-model").value.trim();
    if (!id) return;
    const exists = [...els.modelSelect.options].some((o) => o.value === id);
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      els.modelSelect.prepend(opt);
    }
    els.modelSelect.value = id;
    $("#opt-custom-model").value = "";
  }

  // ——— Attach image ———
  function clearAttach() {
    state.attachedImage = null;
    els.attachPreview.hidden = true;
    els.attachPreview.textContent = "";
    els.fileInput.value = "";
  }

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.attachedImage = { dataUrl: reader.result, name: file.name };
      els.attachPreview.hidden = false;
      els.attachPreview.textContent = file.name;
      updateSendEnabled();
    };
    reader.readAsDataURL(file);
  }

  // ——— TTS ———
  async function speakLast() {
    const conv = getActive();
    if (!conv) return;
    const last = [...conv.messages].reverse().find((m) => m.role === "assistant");
    if (!last?.content) return;
    setStatus("Generating speech…");
    try {
      const result = await puter.ai.txt2speech(last.content.slice(0, 4000));
      // result may be HTMLAudioElement or URL / blob
      if (result instanceof HTMLAudioElement) {
        result.play();
      } else if (result?.url) {
        const audio = new Audio(result.url);
        audio.play();
      } else if (typeof result === "string") {
        const audio = new Audio(result);
        audio.play();
      } else if (result?.play) {
        result.play();
      } else {
        console.log("TTS result", result);
        setStatus("TTS returned unexpected format");
        setTimeout(() => setStatus(""), 2000);
        return;
      }
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("TTS error: " + (e.message || e));
      setTimeout(() => setStatus(""), 3000);
    }
  }

  // ——— Export ———
  function exportMarkdown() {
    const conv = getActive();
    if (!conv?.messages.length) {
      alert("Nothing to export");
      return;
    }
    let md = `# ${conv.title}\n\nModel: \`${conv.model || "unknown"}\`\n\n---\n\n`;
    for (const m of conv.messages) {
      md += `### ${m.role === "user" ? "You" : "Assistant"}\n\n${m.content}\n\n`;
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(conv.title || "chat").replace(/[^\w\-]+/g, "_").slice(0, 40)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ——— Settings UI ———
  function openSettings() {
    $("#opt-temperature").value = state.settings.temperature;
    $("#temp-value").textContent = state.settings.temperature;
    $("#opt-max-tokens").value = state.settings.maxTokens || "";
    $("#opt-system").value = state.settings.systemPrompt || "";
    $("#opt-normalize").checked = !!state.settings.normalize;
    $("#opt-save-history").checked = !!state.settings.saveHistory;
    els.settingsModal.hidden = false;
  }

  function closeSettings() {
    state.settings.temperature = Number($("#opt-temperature").value);
    const mt = $("#opt-max-tokens").value;
    state.settings.maxTokens = mt ? Number(mt) : null;
    state.settings.systemPrompt = $("#opt-system").value;
    state.settings.normalize = $("#opt-normalize").checked;
    state.settings.saveHistory = $("#opt-save-history").checked;
    state.settings.stream = els.streamToggle.checked;
    saveState();
    els.settingsModal.hidden = true;
  }

  // ——— Input helpers ———
  function autoResize() {
    const ta = els.promptInput;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  function updateSendEnabled() {
    const hasText = els.promptInput.value.trim().length > 0;
    const hasImg = !!state.attachedImage;
    els.btnSend.disabled = state.streaming || (!hasText && !hasImg);
  }

  // ——— Events ———
  function bindEvents() {
    $("#btn-new-chat").addEventListener("click", () => {
      createConversation(els.modelSelect.value);
      els.promptInput.focus();
    });

    $("#btn-toggle-sidebar").addEventListener("click", () => {
      els.sidebar.classList.toggle("collapsed");
    });

    $("#btn-settings").addEventListener("click", openSettings);
    $("#btn-clear-all").addEventListener("click", clearAll);
    $("#btn-theme").addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
    });
    $("#btn-export").addEventListener("click", exportMarkdown);
    $("#btn-refresh-models").addEventListener("click", refreshModels);
    $("#btn-stop").addEventListener("click", stopStreaming);
    $("#btn-tts").addEventListener("click", speakLast);
    $("#btn-attach").addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (e) => handleFile(e.target.files?.[0]));

    $("#btn-add-model").addEventListener("click", addCustomModel);

    els.settingsModal.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeSettings);
    });

    $("#opt-temperature").addEventListener("input", (e) => {
      $("#temp-value").textContent = e.target.value;
    });

    els.streamToggle.addEventListener("change", () => {
      state.settings.stream = els.streamToggle.checked;
      saveState();
    });

    $("#composer").addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage(els.promptInput.value);
    });

    els.promptInput.addEventListener("input", () => {
      autoResize();
      updateSendEnabled();
    });

    els.promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!els.btnSend.disabled) sendMessage(els.promptInput.value);
      }
    });

    // Quick prompts
    $$(".quick-prompt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.prompt;
        if (!getActive()) createConversation(els.modelSelect.value);
        sendMessage(p);
      });
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        createConversation(els.modelSelect.value);
        els.promptInput.focus();
      }
      if (e.key === "Escape" && !els.settingsModal.hidden) {
        closeSettings();
      }
    });

    // Drag & drop images
    document.body.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    document.body.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  }

  // ——— Init ———
  function init() {
    initTheme();
    loadState();
    // Apply saved stream preference
    els.streamToggle.checked = state.settings.stream !== false;
    if (!state.activeId && state.conversations.length) {
      state.activeId = state.conversations[0].id;
    }
    renderHistory();
    renderMessages();
    bindEvents();
    updateSendEnabled();

    // Optional: try refresh models after puter is ready
    if (typeof puter !== "undefined") {
      // slight delay so puter finishes init
      setTimeout(() => {
        // silent fail is fine — we have defaults
        puter.ai.listModels?.().then(() => {}).catch(() => {});
      }, 1500);
    }

    console.info(
      "%cPuter Advanced AI Chat",
      "color:#38bdf8;font-weight:bold",
      "— ready. Docs: https://docs.puter.com/AI/"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
