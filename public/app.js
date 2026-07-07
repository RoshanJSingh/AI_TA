/* ============================================================
   AI TA — app logic
   Direct-to-Gemini when the user saved their own API key,
   otherwise via the /api/chat serverless proxy (server env key).
   ============================================================ */
"use strict";

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
];
const DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const HISTORY_LIMIT = 30; // messages sent as context per request
const EMBED_MODEL = "gemini-embedding-001";
const RETRIEVAL_TOP_K = 6;
const RETRIEVAL_MIN_SCORE = 0.5; // below this, nothing in the course matches

const SYSTEM_PROMPT = `You are "AI TA", a friendly, patient and expert teaching assistant for a web development course covering HTML, CSS, JavaScript and general programming.

Guidelines:
- Explain concepts clearly, step by step, like a great tutor would.
- Use Markdown: headings, bullet points, and fenced code blocks with the language tag.
- Give small runnable code examples whenever they help.
- If the student seems confused, break the idea into simpler pieces and use analogies.
- Be encouraging but accurate. If you are not sure, say so honestly.
- Keep answers focused; avoid unnecessary padding.`;

const SUGGESTIONS = [
  { emoji: "🧱", text: "Explain the CSS box model with a simple example" },
  { emoji: "⚡", text: "What's the difference between let, const and var in JavaScript?" },
  { emoji: "🎯", text: "How does flexbox work? Show me the main properties" },
  { emoji: "🔄", text: "Explain async/await and Promises like I'm a beginner" },
  { emoji: "🌐", text: "What happens when I type a URL and press Enter?" },
  { emoji: "📱", text: "How do I make a website responsive with media queries?" },
];

const LS = {
  chats: "aita.chats",
  apiKey: "aita.apiKey",
  theme: "aita.theme",
  model: "aita.model",
  context: "aita.context",
};

const state = {
  chats: [],
  activeId: null,
  streaming: false,
  abort: null,
  courseIndex: null, // loaded from data/index.json when the course was indexed
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const els = {
  sidebar: $("sidebar"),
  backdrop: $("backdrop"),
  menuBtn: $("menuBtn"),
  sidebarClose: $("sidebarClose"),
  newChatBtn: $("newChatBtn"),
  chatList: $("chatList"),
  keyStatus: $("keyStatus"),
  settingsBtn: $("settingsBtn"),
  themeBtn: $("themeBtn"),
  modelSelect: $("modelSelect"),
  scroller: $("scroller"),
  thread: $("thread"),
  input: $("input"),
  sendBtn: $("sendBtn"),
  suggestions: $("suggestions"),
  modalOverlay: $("modalOverlay"),
  modalClose: $("modalClose"),
  modalCancel: $("modalCancel"),
  modalSave: $("modalSave"),
  modalNotice: $("modalNotice"),
  apiKeyInput: $("apiKeyInput"),
  keyToggle: $("keyToggle"),
  contextInput: $("contextInput"),
  clearDataBtn: $("clearDataBtn"),
  toast: $("toast"),
};

/* ---------- Storage ---------- */
function loadChats() {
  try {
    state.chats = JSON.parse(localStorage.getItem(LS.chats) || "[]");
  } catch {
    state.chats = [];
  }
}
function saveChats() {
  try {
    localStorage.setItem(LS.chats, JSON.stringify(state.chats));
  } catch {
    /* storage full — drop oldest chats and retry once */
    state.chats = state.chats.slice(0, 10);
    try { localStorage.setItem(LS.chats, JSON.stringify(state.chats)); } catch {}
  }
}
const getApiKey = () => (localStorage.getItem(LS.apiKey) || "").trim();
const getContext = () => localStorage.getItem(LS.context) || "";

function activeChat() {
  return state.chats.find((c) => c.id === state.activeId) || null;
}

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Markdown rendering (marked + DOMPurify from CDN, graceful fallback) */
function renderMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    const raw = marked.parse(text, { breaks: true, mangle: false, headerIds: false });
    return DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel"] });
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/* Wrap <pre> blocks in a header bar with language + copy button, highlight */
function decorateCodeBlocks(container) {
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.closest(".codebox")) return;
    const code = pre.querySelector("code");
    const langMatch = code && [...code.classList].find((c) => c.startsWith("language-"));
    const lang = langMatch ? langMatch.slice(9) : "code";

    const box = document.createElement("div");
    box.className = "codebox";
    const head = document.createElement("div");
    head.className = "codebox-head";
    head.innerHTML =
      `<span>${escapeHtml(lang)}</span>` +
      `<button class="copy-code" title="Copy code">` +
      `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>Copy</button>`;
    pre.parentNode.insertBefore(box, pre);
    box.appendChild(head);
    box.appendChild(pre);

    head.querySelector(".copy-code").addEventListener("click", () => {
      navigator.clipboard
        .writeText(code ? code.textContent : pre.textContent)
        .then(() => toast("Code copied to clipboard"));
    });

    if (window.hljs && code) {
      try { hljs.highlightElement(code); } catch {}
    }
  });
  container.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener";
  });
}

function isNearBottom() {
  const s = els.scroller;
  return s.scrollHeight - s.scrollTop - s.clientHeight < 120;
}
function scrollToBottom(force = false) {
  if (force || isNearBottom()) els.scroller.scrollTop = els.scroller.scrollHeight;
}

/* ---------- Rendering ---------- */
function renderSidebar() {
  els.chatList.innerHTML = "";
  if (!state.chats.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "No chats yet — ask something!";
    els.chatList.appendChild(empty);
    return;
  }
  for (const chat of state.chats) {
    const item = document.createElement("div");
    item.className = "chat-item" + (chat.id === state.activeId ? " active" : "");
    item.innerHTML =
      `<span class="title">${escapeHtml(chat.title || "New chat")}</span>` +
      `<button class="del" title="Delete chat" aria-label="Delete chat">` +
      `<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`;
    item.addEventListener("click", () => selectChat(chat.id));
    item.querySelector(".del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });
    els.chatList.appendChild(item);
  }
}

function welcomeHtml() {
  return `
    <section id="welcome">
      <div class="welcome-badge">🎓</div>
      <h1>Hey, I'm your <span class="grad-text">AI Teaching Assistant</span></h1>
      <p class="welcome-sub">Ask me anything about web development — HTML, CSS, JavaScript, or programming in general. I'll explain step by step, with examples.</p>
      <div class="suggestions" id="suggestions"></div>
    </section>`;
}

function renderSuggestions() {
  const wrap = $("suggestions");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const s of SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.className = "suggestion";
    btn.innerHTML = `<span class="s-emoji">${s.emoji}</span><span class="s-text">${escapeHtml(s.text)}</span>`;
    btn.addEventListener("click", () => {
      els.input.value = s.text;
      autosize();
      sendMessage();
    });
    wrap.appendChild(btn);
  }
}

function buildAssistantRow() {
  const row = document.createElement("div");
  row.className = "msg assistant";
  row.innerHTML = `<div class="avatar">🎓</div><div class="bubble md"></div>`;
  return row;
}

function renderThread() {
  const chat = activeChat();
  if (!chat || !chat.messages.length) {
    els.thread.innerHTML = welcomeHtml();
    renderSuggestions();
    return;
  }
  els.thread.innerHTML = "";
  chat.messages.forEach((message, index) => {
    if (message.role === "user") {
      const row = document.createElement("div");
      row.className = "msg user";
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = message.text;
      row.appendChild(bubble);
      els.thread.appendChild(row);
    } else {
      const row = buildAssistantRow();
      const bubble = row.querySelector(".bubble");
      if (message.error) {
        bubble.classList.add("error-bubble");
        bubble.textContent = message.text;
      } else {
        bubble.innerHTML = renderMarkdown(message.text);
        decorateCodeBlocks(bubble);
        if (message.stopped) {
          const note = document.createElement("div");
          note.className = "stopped-note";
          note.textContent = "— stopped by you —";
          bubble.appendChild(note);
        }
        if (message.sources && message.sources.length) {
          const wrap = document.createElement("div");
          wrap.className = "sources";
          const seen = new Set();
          for (const source of message.sources) {
            const dedupeKey = `${source.video}@${source.start}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            const chip = document.createElement("span");
            chip.className = "source-chip";
            chip.title = source.title;
            chip.textContent = `📍 Video ${source.video} · ${fmtTime(source.start)}–${fmtTime(source.end)}`;
            wrap.appendChild(chip);
          }
          bubble.appendChild(wrap);
        }
      }
      appendMessageActions(row, index);
      els.thread.appendChild(row);
    }
  });
  scrollToBottom(true);
}

function appendMessageActions(row, messageIndex) {
  const chat = activeChat();
  const message = chat.messages[messageIndex];
  const meta = document.createElement("div");
  meta.className = "meta";

  const copyBtn = document.createElement("button");
  copyBtn.className = "meta-btn";
  copyBtn.innerHTML =
    `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>Copy`;
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(message.text).then(() => toast("Copied to clipboard"));
  });
  meta.appendChild(copyBtn);

  if (messageIndex === chat.messages.length - 1 && !state.streaming) {
    const regenBtn = document.createElement("button");
    regenBtn.className = "meta-btn";
    regenBtn.innerHTML =
      `<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-2.6-6.4M21 3v6h-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Regenerate`;
    regenBtn.addEventListener("click", regenerate);
    meta.appendChild(regenBtn);
  }

  row.querySelector(".bubble").insertAdjacentElement("afterend", meta);
  row.style.flexWrap = "wrap";
  meta.style.marginLeft = "46px";
  meta.style.flexBasis = "100%";
}

/* ---------- Chat management ---------- */
function newChat() {
  state.activeId = null;
  renderSidebar();
  renderThread();
  closeSidebarMobile();
  els.input.focus();
}

function selectChat(id) {
  if (state.streaming) stopStreaming();
  state.activeId = id;
  renderSidebar();
  renderThread();
  closeSidebarMobile();
}

function deleteChat(id) {
  if (state.streaming && state.activeId === id) stopStreaming();
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.activeId === id) state.activeId = null;
  saveChats();
  renderSidebar();
  renderThread();
}

function ensureActiveChat(firstMessage) {
  let chat = activeChat();
  if (!chat) {
    chat = {
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: firstMessage.length > 44 ? firstMessage.slice(0, 44).trimEnd() + "…" : firstMessage,
      messages: [],
      createdAt: Date.now(),
    };
    state.chats.unshift(chat);
    state.activeId = chat.id;
  }
  return chat;
}

/* ---------- Course retrieval (RAG) ---------- */
async function loadCourseIndex() {
  try {
    const response = await fetch("data/index.json", { cache: "no-cache" });
    if (!response.ok) return;
    const index = await response.json();
    if (!Array.isArray(index.chunks) || !index.chunks.length || !Array.isArray(index.videos)) return;
    state.courseIndex = index;

    const badge = $("ragBadge");
    if (badge) {
      badge.hidden = false;
      badge.textContent = `📚 Course data · ${index.videos.length} videos`;
      badge.title = `${index.chunks.length} transcript sections indexed — answers cite video numbers and timestamps`;
    }
    SUGGESTIONS.unshift({ emoji: "📚", text: "Where is flexbox taught in this course?" });
    renderSuggestions();
  } catch {
    /* no course index deployed — general mode */
  }
}

function fmtTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function embedQuery(text, dim) {
  const userKey = getApiKey();
  let response;
  if (userKey) {
    response = await fetch(`${GEMINI_BASE}/${EMBED_MODEL}:embedContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": userKey },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: dim,
      }),
    });
  } else {
    response = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, dim }),
    });
  }
  if (!response.ok) throw new Error(`Embedding failed (HTTP ${response.status})`);
  const values = (await response.json()).embedding?.values;
  if (!Array.isArray(values)) throw new Error("Embedding response malformed");
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

/* Returns { block, sources } with transcript excerpts relevant to the
   question, or null when there is no index / retrieval fails. */
async function retrieveCourseContext(question) {
  const index = state.courseIndex;
  if (!index) return null;
  try {
    const queryVec = await embedQuery(question.slice(0, 2000), index.dim);
    const scored = index.chunks
      .map((chunk) => {
        let score = 0;
        const emb = chunk.embedding;
        for (let i = 0; i < queryVec.length; i++) score += queryVec[i] * emb[i];
        return { chunk, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVAL_TOP_K);
    // keep only chunks reasonably close to the best match
    const cutoff = Math.max(RETRIEVAL_MIN_SCORE, (scored[0]?.score || 0) * 0.85);
    const kept = scored.filter((item) => item.score >= cutoff);
    if (!kept.length) return null;

    const lines = [];
    const sources = [];
    let budget = 9000;
    for (const { chunk } of kept) {
      const header = `[Video ${chunk.video} "${chunk.title}" ${fmtTime(chunk.start)} - ${fmtTime(chunk.end)}]`;
      const line = `${header} ${chunk.text}`;
      if (line.length > budget) break;
      budget -= line.length;
      lines.push(line);
      sources.push({
        video: chunk.video,
        title: chunk.title,
        start: chunk.start,
        end: chunk.end,
      });
    }
    if (!lines.length) return null;
    return { block: lines.join("\n\n"), sources };
  } catch (error) {
    console.warn("Course retrieval skipped:", error);
    return null;
  }
}

/* ---------- Gemini API ---------- */
function buildRequestBody(chat, retrieval) {
  const recent = chat.messages
    .filter((m) => !m.error)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

  let system = SYSTEM_PROMPT;
  const courseContext = getContext().trim();
  if (courseContext) {
    system += `\n\nCourse notes provided by the student (prefer these when answering questions about their course):\n"""\n${courseContext}\n"""`;
  }

  if (state.courseIndex) {
    const outline = state.courseIndex.videos
      .map((video) => `- Video ${video.no}: ${video.title}`)
      .join("\n");
    system += `\n\nThis student is taking a specific course. Course outline:\n${outline}`;
  }
  if (retrieval) {
    system += `\n\nTranscript excerpts relevant to the student's current question:\n${retrieval.block}\n\nWhen the answer is found in these excerpts, cite the exact place like "Video 14 (02:10 - 05:45)". If the excerpts do not cover the question, say the course transcripts don't mention it and then answer from general knowledge.`;
  } else if (state.courseIndex) {
    system += `\n\nNo transcript excerpts matched the current question. If the student asks where something is taught in the course, use the outline above; otherwise answer from general knowledge and say the transcripts don't mention it.`;
  }

  return {
    model: els.modelSelect.value || DEFAULT_MODEL,
    contents: recent,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: 0.7 },
  };
}

async function streamGemini(body, signal, onDelta) {
  const userKey = getApiKey();
  const url = userKey
    ? `${GEMINI_BASE}/${body.model}:streamGenerateContent?alt=sse`
    : "/api/chat";
  const headers = { "Content-Type": "application/json" };
  if (userKey) headers["x-goog-api-key"] = userKey;

  const payload = userKey
    ? {
        contents: body.contents,
        systemInstruction: body.systemInstruction,
        generationConfig: body.generationConfig,
      }
    : body;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status}).`;
    let code = null;
    try {
      const errBody = await response.json();
      const err = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
      if (err?.message) message = err.message;
      if (err?.code) code = err.code;
    } catch {}
    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete tail
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      let json;
      try { json = JSON.parse(data); } catch { continue; }

      const blockReason = json.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`The request was blocked by safety filters (${blockReason}).`);
      }
      const parts = json.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text && !part.thought) {
          full += part.text;
          onDelta(full);
        }
      }
    }
  }
  return full;
}

/* ---------- Send / stream flow ---------- */
function setStreamingUI(streaming) {
  state.streaming = streaming;
  els.sendBtn.classList.toggle("streaming", streaming);
  els.sendBtn.disabled = streaming ? false : !els.input.value.trim();
  els.sendBtn.title = streaming ? "Stop generating" : "Send";
}

function stopStreaming() {
  if (state.abort) state.abort.abort();
}

async function sendMessage() {
  if (state.streaming) return;
  const text = els.input.value.trim();
  if (!text) return;

  els.input.value = "";
  autosize();

  const chat = ensureActiveChat(text);
  chat.messages.push({ role: "user", text });
  saveChats();
  renderSidebar();
  renderThread();

  await generateReply(chat);
}

async function regenerate() {
  const chat = activeChat();
  if (!chat || state.streaming) return;
  while (chat.messages.length && chat.messages[chat.messages.length - 1].role === "assistant") {
    chat.messages.pop();
  }
  if (!chat.messages.length) return;
  saveChats();
  renderThread();
  await generateReply(chat);
}

async function generateReply(chat) {
  const row = buildAssistantRow();
  const bubble = row.querySelector(".bubble");
  bubble.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
  els.thread.appendChild(row);
  scrollToBottom(true);

  const controller = new AbortController();
  state.abort = controller;
  setStreamingUI(true);

  let lastPaint = 0;
  let finalText = "";
  let failed = false;
  let stopped = false;
  let retrieval = null;

  try {
    const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
    if (lastUser && state.courseIndex) {
      retrieval = await retrieveCourseContext(lastUser.text);
      if (controller.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
    }
    finalText = await streamGemini(buildRequestBody(chat, retrieval), controller.signal, (fullText) => {
      finalText = fullText;
      const now = performance.now();
      if (now - lastPaint > 90) {
        lastPaint = now;
        bubble.innerHTML = renderMarkdown(fullText) + `<span class="cursor-blink"></span>`;
        scrollToBottom();
      }
    });
    if (!finalText) {
      throw new Error("The model returned an empty response. Try again or switch models.");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      stopped = true;
    } else {
      failed = true;
      finalText = friendlyError(error);
    }
  } finally {
    state.abort = null;
    setStreamingUI(false);
  }

  if (stopped && !finalText) {
    row.remove();
    renderSidebar();
    return;
  }

  chat.messages.push({
    role: "assistant",
    text: finalText,
    error: failed || undefined,
    stopped: stopped || undefined,
    sources: !failed && retrieval ? retrieval.sources : undefined,
  });
  saveChats();
  renderThread();
  updateKeyStatus();
}

function friendlyError(error) {
  const message = error.message || "Something went wrong.";
  if (error.code === "NO_SERVER_KEY" || error.status === 503) {
    setTimeout(() => openSettings("This site has no built-in API key. Add your own free Gemini key below to start chatting."), 400);
    return "No API key is configured. Open Settings and add your Gemini API key (it's free at aistudio.google.com/apikey).";
  }
  if (error.status === 400 && /api key/i.test(message)) {
    setTimeout(() => openSettings("Your API key was rejected by Google. Please check it and try again."), 400);
    return "Your API key looks invalid. Please check it in Settings.";
  }
  if (error.status === 429) {
    return "Rate limit reached for this API key. Wait a moment and try again, or use your own key (Settings).";
  }
  if (/Failed to fetch|NetworkError|load failed/i.test(message)) {
    return "Network error — check your internet connection and try again.";
  }
  return message;
}

/* ---------- Settings ---------- */
function openSettings(notice) {
  els.apiKeyInput.value = getApiKey();
  els.apiKeyInput.type = "password";
  els.contextInput.value = getContext();
  if (notice) {
    els.modalNotice.textContent = notice;
    els.modalNotice.hidden = false;
  } else {
    els.modalNotice.hidden = true;
  }
  els.modalOverlay.hidden = false;
  setTimeout(() => els.apiKeyInput.focus(), 50);
}

function closeSettings() {
  els.modalOverlay.hidden = true;
}

function saveSettings() {
  const key = els.apiKeyInput.value.trim();
  if (key) localStorage.setItem(LS.apiKey, key);
  else localStorage.removeItem(LS.apiKey);
  localStorage.setItem(LS.context, els.contextInput.value);
  updateKeyStatus();
  closeSettings();
  toast("Settings saved");
}

function updateKeyStatus() {
  const statusEl = els.keyStatus;
  const textEl = statusEl.querySelector(".key-status-text");
  if (getApiKey()) {
    statusEl.className = "key-status ok";
    textEl.textContent = "Using your API key";
  } else {
    statusEl.className = "key-status warn";
    textEl.textContent = "Using site's built-in key";
  }
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(LS.theme, theme);
}

/* ---------- Composer ---------- */
function autosize() {
  const input = els.input;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
  if (!state.streaming) els.sendBtn.disabled = !input.value.trim();
}

/* ---------- Mobile sidebar ---------- */
function openSidebarMobile() {
  els.sidebar.classList.add("open");
  els.backdrop.classList.add("show");
}
function closeSidebarMobile() {
  els.sidebar.classList.remove("open");
  els.backdrop.classList.remove("show");
}

/* ---------- Init ---------- */
function init() {
  applyTheme(localStorage.getItem(LS.theme) || "dark");

  for (const model of MODELS) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    els.modelSelect.appendChild(option);
  }
  els.modelSelect.value = localStorage.getItem(LS.model) || DEFAULT_MODEL;
  els.modelSelect.addEventListener("change", () =>
    localStorage.setItem(LS.model, els.modelSelect.value)
  );

  loadChats();
  renderSidebar();
  renderThread();
  updateKeyStatus();

  els.newChatBtn.addEventListener("click", newChat);
  els.settingsBtn.addEventListener("click", () => openSettings());
  els.themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  els.sendBtn.addEventListener("click", () => {
    if (state.streaming) stopStreaming();
    else sendMessage();
  });
  els.input.addEventListener("input", autosize);
  els.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  els.menuBtn.addEventListener("click", openSidebarMobile);
  els.sidebarClose.addEventListener("click", closeSidebarMobile);
  els.backdrop.addEventListener("click", closeSidebarMobile);

  els.modalClose.addEventListener("click", closeSettings);
  els.modalCancel.addEventListener("click", closeSettings);
  els.modalSave.addEventListener("click", saveSettings);
  els.modalOverlay.addEventListener("click", (event) => {
    if (event.target === els.modalOverlay) closeSettings();
  });
  els.keyToggle.addEventListener("click", () => {
    els.apiKeyInput.type = els.apiKeyInput.type === "password" ? "text" : "password";
  });
  els.clearDataBtn.addEventListener("click", () => {
    if (!confirm("Delete ALL chats, your saved API key and course notes from this browser?")) return;
    localStorage.removeItem(LS.chats);
    localStorage.removeItem(LS.apiKey);
    localStorage.removeItem(LS.context);
    state.chats = [];
    state.activeId = null;
    renderSidebar();
    renderThread();
    updateKeyStatus();
    closeSettings();
    toast("All data cleared");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.modalOverlay.hidden) closeSettings();
      else closeSidebarMobile();
    }
  });

  autosize();
  els.input.focus();
  loadCourseIndex();
}

init();
