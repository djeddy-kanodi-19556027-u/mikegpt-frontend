/* =====================================================
   MIKEgpt — chat.js (used by chat.html)
   Drop this next to index.html and style.css.
   Everything extra (chat bubbles, light theme, toasts,
   emoji picker) is injected from here, so your CSS file
   does not need to change.
   ===================================================== */
(() => {
  "use strict";

  /* ---------- Guard: no login, no chat ---------- */
  try {
    if (!localStorage.getItem("mikegpt-user")) { location.replace("index.html"); return; }
  } catch (e) { location.replace("index.html"); return; }

  /* ---------- 0. Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- 1. Injected styles ---------- */
  const css = `
  :root[data-theme="light"]{
    --bg-primary:#f4f7ff; --bg-secondary:#ffffff; --bg-hover:#e6edff;
    --text-primary:#0b1224; --text-secondary:#53607a; --border-color:#c7d4f5;
  }
  html[data-theme="light"] body{background:radial-gradient(circle at top center,#e0e9ff 0%,#f4f7ff 80%)}
  html[data-theme="light"] .prompt-container{background:linear-gradient(180deg,rgba(244,247,255,0) 0%,rgba(244,247,255,.92) 40%)}
  body{transition:background .5s ease,color .3s ease}
  .sidebar,.prompt-form,.new-chat-btn,.theme-toggled-btn,.delete-btn{transition:background .4s ease,border-color .4s ease,color .3s ease,box-shadow .3s ease,transform .3s cubic-bezier(.4,0,.2,1)}

  /* chat area */
  .chat-area{flex:1;min-height:0;overflow-y:auto;scroll-behavior:smooth;padding:8px 0 130px;scrollbar-width:thin;scrollbar-color:var(--border-color) transparent}
  .chat-inner{max-width:980px;margin:0 auto;padding:0 20px;display:flex;flex-direction:column;gap:22px}
  .msg{display:flex;gap:14px;align-items:flex-start;animation:msgIn .45s cubic-bezier(.2,.8,.2,1) both}
  .msg.user{flex-direction:row-reverse}
  .msg .avatar{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-weight:600;font-size:.9rem;color:#fff;background:var(--accent-blue);overflow:hidden}
  .msg .avatar img{width:100%;height:100%;object-fit:cover}
  .msg .bubble{max-width:min(720px,80%);padding:12px 18px;border-radius:20px;line-height:1.6;font-size:1rem;word-wrap:break-word;overflow-wrap:anywhere}
  .msg.user .bubble{background:linear-gradient(135deg,#1d2fff,#3b82f6);color:#fff;border-bottom-right-radius:6px;box-shadow:0 6px 24px rgba(0,0,255,.25)}
  .msg.bot .bubble{background:var(--bg-secondary);border:1px solid var(--border-color);border-bottom-left-radius:6px}
  .bubble code{background:rgba(96,165,250,.18);padding:1px 6px;border-radius:6px;font-family:Consolas,monospace;font-size:.92em}
  .bubble pre{background:rgba(0,0,0,.35);color:#e2e8f0;padding:12px 14px;border-radius:12px;margin:8px 0;overflow-x:auto}
  .bubble pre code{background:none;padding:0}
  .bubble .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
  .caret{display:inline-block;width:2px;height:1.05em;margin-left:2px;vertical-align:text-bottom;background:#60a5fa;animation:blink .8s steps(1) infinite}
  .dots{display:flex;gap:5px;padding:6px 2px}
  .dots i{width:8px;height:8px;border-radius:50%;background:#60a5fa;animation:bounce 1.2s ease-in-out infinite}
  .dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}

  /* header exit */
  .app-header{transition:opacity .45s ease,transform .45s cubic-bezier(.4,0,.2,1)}
  .app-header.leaving{opacity:0;transform:translateY(-24px) scale(.97)}

  /* attachments */
  .attach-bar{display:flex;flex-wrap:wrap;gap:8px;max-width:980px;margin:0 auto 10px;padding:0 20px}
  .chip{display:inline-flex;align-items:center;gap:6px;background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--text-primary);padding:5px 8px 5px 12px;border-radius:999px;font-size:.82rem;animation:pop .3s cubic-bezier(.2,.9,.3,1.4) both}
  .chip button{width:20px;height:20px;font-size:.9rem;color:var(--text-secondary)}
  .msg.user .chip{background:rgba(255,255,255,.18);border-color:transparent;color:#fff;padding:4px 12px}

  /* emoji picker */
  .emoji-picker{position:absolute;bottom:calc(100% + 14px);right:110px;width:300px;max-height:260px;overflow-y:auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:18px;padding:10px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;box-shadow:0 16px 48px rgba(0,0,0,.35);opacity:0;transform:translateY(10px) scale(.96);transform-origin:bottom right;pointer-events:none;transition:opacity .22s ease,transform .22s cubic-bezier(.2,.8,.2,1);z-index:30}
  .emoji-picker.open{opacity:1;transform:none;pointer-events:auto}
  .emoji-picker button{width:100%;aspect-ratio:1;font-size:1.25rem;border-radius:10px}
  .prompt-wrapper{position:relative}

  /* recent list */
  .recent-list{list-style:none;display:flex;flex-direction:column;gap:2px}
  .recent-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:8px;color:var(--text-secondary);font-size:.92rem;cursor:pointer;transition:background .2s,color .2s;animation:msgIn .35s ease both}
  .recent-item span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .recent-item:hover{background:var(--bg-hover);color:var(--text-primary)}
  .recent-item.active{background:rgba(0,0,255,.18);color:var(--text-primary)}
  .recent-empty{padding:0 12px;font-size:.85rem;color:var(--text-secondary);opacity:.7}

  /* toast */
  .toast-host{position:fixed;top:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:100;pointer-events:none}
  .toast{background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);padding:10px 18px;border-radius:999px;font-size:.9rem;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:toastIn .35s cubic-bezier(.2,.9,.3,1.2) both}
  .toast.out{animation:toastOut .3s ease both}

  /* ripple */
  .ripple{position:absolute;border-radius:50%;background:rgba(96,165,250,.45);transform:scale(0);animation:rip .6s ease-out forwards;pointer-events:none}
  button,.new-chat-btn{position:relative;overflow:hidden}

  /* confirm shake / clear */
  .chat-inner.clearing .msg{animation:msgOut .35s ease both}
  .shake{animation:shake .4s ease}
  .send-btn.ready{animation:pop .3s ease both}

  @keyframes msgIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes msgOut{to{opacity:0;transform:translateY(-10px) scale(.97)}}
  @keyframes blink{50%{opacity:0}}
  @keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-6px);opacity:1}}
  @keyframes pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes rip{to{transform:scale(4);opacity:0}}
  @keyframes toastIn{from{opacity:0;transform:translateY(-16px) scale(.95)}to{opacity:1;transform:none}}
  @keyframes toastOut{to{opacity:0;transform:translateY(-10px)}}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
  @media (max-width:768px){.emoji-picker{right:0;width:min(300px,92vw)}.msg .bubble{max-width:86%}}
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- 2. Elements ---------- */
  const container = $(".container");
  const header = $(".app-header");
  const form = $(".prompt-form");
  const input = $(".prompt-input");
  const sendBtn = $("#send-btn");
  const emojiBtn = $("#emoji-btn");
  const fileBtn = $("#add-file-btn");
  const themeBtn = $("#theme-toggled-btn");
  const deleteBtn = $("#delete-btn");
  const newChatBtn = $("#new-chat-btn");
  const wrapper = $(".prompt-wrapper");
  const recentBox = $(".recent-container");
  const logoSrc = $(".logo-img")?.getAttribute("src") || "";

  const chatArea = document.createElement("div");
  chatArea.className = "chat-area";
  const chatInner = document.createElement("div");
  chatInner.className = "chat-inner";
  chatArea.appendChild(chatInner);
  header.after(chatArea);

  const toastHost = document.createElement("div");
  toastHost.className = "toast-host";
  document.body.appendChild(toastHost);

  const attachBar = document.createElement("div");
  attachBar.className = "attach-bar";
  attachBar.hidden = true;
  $(".prompt-container").insertBefore(attachBar, wrapper);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  /* ---------- 3. Toasts ---------- */
  function toast(text, ms = 2200) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    toastHost.appendChild(t);
    setTimeout(() => {
      t.classList.add("out");
      t.addEventListener("animationend", () => t.remove(), { once: true });
    }, ms);
  }

  /* ---------- 4. Ripple on every button ---------- */
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("button, .new-chat-btn");
    if (!b || reduceMotion) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  });

  /* ---------- 5. Theme ---------- */
  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    const icon = $("ion-icon", themeBtn);
    if (icon) icon.setAttribute("name", mode === "light" ? "moon" : "sunny");
    store.set("mikegpt-theme", mode);
  }
  applyTheme(store.get("mikegpt-theme", "dark"));
  themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });

  /* ---------- 6. Conversations ---------- */
  let chats = store.get("mikegpt-chats", []);
  let user = store.get("mikegpt-user", null);
  let activeId = null;
  let busy = false;
  let runToken = 0; // lets us cancel an in-progress reply

  const recentList = document.createElement("ul");
  recentList.className = "recent-list";
  recentBox.appendChild(recentList);

  const activeChat = () => chats.find((c) => c.id === activeId);
  const save = () => store.set("mikegpt-chats", chats);

  /* ---------- Recent list: three dots → Share / Rename / Pin / Delete ---------- */
  const renderedIds = new Set();   // so only NEW items play the slide-in animation
  let menuEl = null;

  // pinned chats first, then the rest (newest first)
  function sortedChats() {
    const all = [...chats].reverse();
    return [...all.filter((c) => c.pinned), ...all.filter((c) => !c.pinned)];
  }

  function renderRecent() {
    recentList.innerHTML = "";
    if (!chats.length) {
      const p = document.createElement("p");
      p.className = "recent-empty";
      p.textContent = "Your chats will show up here.";
      recentList.appendChild(p);
      return;
    }
    sortedChats().forEach((c) => {
      const li = document.createElement("li");
      li.className = "recent-item" + (c.id === activeId ? " active" : "") + (c.pinned ? " pinned" : "");
      li.dataset.id = c.id;
      if (renderedIds.has(c.id)) li.style.animation = "none";
      renderedIds.add(c.id);

      li.innerHTML =
        '<ion-icon class="pin-mark" name="pin"></ion-icon>' +
        '<span class="recent-title-text">' + esc(c.title) + "</span>" +
        '<button type="button" class="dots-btn" title="Options" aria-label="Chat options">' +
        '<ion-icon name="ellipsis-horizontal"></ion-icon></button>';

      const dots = $(".dots-btn", li);
      li.addEventListener("click", () => {
        if (li.classList.contains("editing")) return;
        openChat(c.id);
      });
      dots.addEventListener("click", (e) => { e.stopPropagation(); openMenu(c.id, dots); });
      li.addEventListener("contextmenu", (e) => { e.preventDefault(); openMenu(c.id, dots, e); });
      recentList.appendChild(li);
    });
  }

  function closeMenu() {
    if (!menuEl) return;
    const m = menuEl;
    menuEl = null;
    m.classList.remove("open");
    setTimeout(() => m.remove(), 180);
    $$(".recent-item.menu-open").forEach((x) => x.classList.remove("menu-open"));
  }

  function openMenu(id, anchor, evt) {
    if (menuEl && menuEl.dataset.id === id) return closeMenu();   // click the dots again = close
    closeMenu();
    const c = chats.find((x) => x.id === id);
    if (!c) return;

    const m = document.createElement("div");
    m.className = "chat-menu";
    m.dataset.id = id;
    m.setAttribute("role", "menu");

    const actions = {
      share: () => shareChat(id),
      rename: () => renameChat(id),
      pin: () => togglePin(id),
      delete: () => askDelete(id),
    };
    [
      ["share-social-outline", "Share", "share"],
      ["pencil-outline", "Rename", "rename"],
      [c.pinned ? "pin" : "pin-outline", c.pinned ? "Unpin chat" : "Pin chat", "pin"],
      ["trash-outline", "Delete", "delete", true],
    ].forEach(([icon, label, action, danger]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item" + (danger ? " danger" : "");
      b.setAttribute("role", "menuitem");
      b.innerHTML = '<ion-icon name="' + icon + '"></ion-icon><span>' + label + "</span>";
      b.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); actions[action](); });
      m.appendChild(b);
    });

    document.body.appendChild(m);
    anchor.closest(".recent-item").classList.add("menu-open");

    // position: under the dots (or at the cursor for right-click), kept inside the screen
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = evt ? evt.clientX : r.left;
    let y = evt ? evt.clientY : r.bottom + 6;
    if (x + mw > innerWidth - 8) x = innerWidth - mw - 8;
    if (y + mh > innerHeight - 8) y = Math.max(8, (evt ? evt.clientY : r.top) - mh - 6);
    m.style.left = x + "px";
    m.style.top = y + "px";

    menuEl = m;
    requestAnimationFrame(() => m.classList.add("open"));
  }

  document.addEventListener("click", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", closeMenu);
  $(".sidebar-middle")?.addEventListener("scroll", closeMenu);

  /* ----- Pin ----- */
  function togglePin(id) {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    c.pinned = !c.pinned;
    save();
    renderRecent();
    toast(c.pinned ? "Chat pinned 📌" : "Chat unpinned");
  }

  /* ----- Rename (inline, like ChatGPT) ----- */
  function renameChat(id) {
    const li = $('.recent-item[data-id="' + id + '"]');
    const c = chats.find((x) => x.id === id);
    if (!li || !c) return;

    const label = $(".recent-title-text", li);
    const field = document.createElement("input");
    field.className = "rename-input";
    field.value = c.title;
    field.maxLength = 60;
    li.classList.add("editing");
    label.replaceWith(field);
    field.focus();
    field.select();

    let done = false;
    const finish = (saveIt) => {
      if (done) return;
      done = true;
      const v = field.value.trim();
      if (saveIt && v && v !== c.title) { c.title = v; save(); toast("Chat renamed"); }
      renderRecent();
    };
    field.addEventListener("keydown", (e) => {
      e.stopPropagation();                       // don't trigger the global shortcuts
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    field.addEventListener("click", (e) => e.stopPropagation());
    field.addEventListener("blur", () => finish(true));
  }

  /* ----- Share (copies the conversation) ----- */
  async function shareChat(id) {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    const who = (m) => (m.role === "user" ? (user?.name || "You") : "MIKEgpt");
    const text = c.title + "\n\n" + c.messages.map((m) => who(m) + ": " + m.text).join("\n\n");
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: c.title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast("Chat copied to clipboard 📋");
    } catch (err) {
      if (err && err.name === "AbortError") return;      // user closed the share sheet
      const ta = document.createElement("textarea");      // fallback for older browsers
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Chat copied to clipboard 📋"); }
      catch { toast("Couldn't copy the chat"); }
      ta.remove();
    }
  }

  /* ----- Delete (with confirmation dialog) ----- */
  function askDelete(id) {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      "<h3>Delete chat?</h3><p>This will delete <strong></strong>.</p>" +
      '<div class="modal-actions"><button type="button" class="m-cancel">Cancel</button>' +
      '<button type="button" class="m-delete">Delete</button></div></div>';
    $("strong", ov).textContent = c.title;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("open"));

    const onKey = (e) => { if (e.key === "Escape") close(); };
    const close = () => {
      document.removeEventListener("keydown", onKey);
      ov.classList.remove("open");
      setTimeout(() => ov.remove(), 220);
    };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    $(".m-cancel", ov).addEventListener("click", close);
    $(".m-delete", ov).addEventListener("click", () => { close(); removeChat(id); });
    $(".m-delete", ov).focus();
  }

  function removeChat(id) {
    chats = chats.filter((c) => c.id !== id);
    save();
    if (activeId === id) newChat(); else renderRecent();
    toast("Chat deleted");
  }

  function showChatMode(on) {
    if (on) {
      if (header.style.display === "none") return;
      header.classList.add("leaving");
      setTimeout(() => (header.style.display = "none"), reduceMotion ? 0 : 420);
    } else {
      header.style.display = "";
      requestAnimationFrame(() => header.classList.remove("leaving"));
    }
  }

  function openChat(id) {
    runToken++;
    busy = false;
    activeId = id;
    chatInner.innerHTML = "";
    const c = activeChat();
    if (c) {
      c.messages.forEach((m) => addMessage(m.role, m.text, { instant: true }));
      showChatMode(true);
    }
    renderRecent();
    scrollDown(false);
  }

  function newChat() {
    runToken++;
    busy = false;
    activeId = null;
    chatInner.innerHTML = "";
    clearAttachments();
    showChatMode(false);
    renderRecent();
    input.value = "";
    input.focus();
  }

  /* ---------- 7. Messages ---------- */
  function format(text) {
    return esc(text)
      .replace(/```(?:\w+)?\n?([\s\S]*?)(```|$)/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function scrollDown(smooth = true) {
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
  }

  function addMessage(role, text, opts = {}) {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    if (opts.instant) el.style.animation = "none";

    const av = document.createElement("div");
    av.className = "avatar";
    if (role === "bot" && logoSrc) av.innerHTML = `<img src="${logoSrc}" alt="">`;
    else av.textContent = role === "bot" ? "AI" : (user?.name?.[0] || "M").toUpperCase();

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (opts.files?.length) {
      const chips = document.createElement("div");
      chips.className = "chips";
      opts.files.forEach((f) => {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = "📎 " + f;
        chips.appendChild(c);
      });
      bubble.appendChild(chips);
    }

    const body = document.createElement("div");
    body.className = "body";
    if (text !== null) body.innerHTML = format(text);
    bubble.appendChild(body);

    el.append(av, bubble);
    chatInner.appendChild(el);
    if (!opts.instant) scrollDown();
    return { el, body };
  }

  async function typeInto(body, text, token) {
    if (reduceMotion) { body.innerHTML = format(text); return; }
    const caret = '<span class="caret"></span>';
    let i = 0;
    while (i < text.length) {
      if (token !== runToken) return false;
      // vary speed: pause a bit longer on punctuation for a natural feel
      const ch = text[i];
      i += 1 + (Math.random() > 0.6 ? 1 : 0);
      body.innerHTML = format(text.slice(0, i)) + caret;
      if (i % 12 < 2) scrollDown(false);
      await sleep(/[.!?]/.test(ch) ? 110 : /[,;:]/.test(ch) ? 60 : 16);
    }
    body.innerHTML = format(text);
    return true;
  }

    /* ---------- 8. The "brain": connects to YOUR backend ----------
     POST http://localhost:3000/api/chat   body: { message: "..." }
     your server.js must answer with:      { reply: "..." }
  ------------------------------------------------------------- */
  async function getReply(text) {
    try {
      // earlier messages of this chat, so the AI remembers the conversation
      const chat = activeChat();
      const history = chat
        ? chat.messages.slice(0, -1).slice(-20)
            .filter((m) => m.text)
            .map((m) => ({ role: m.role === "user" ? "user" : "model", text: m.text }))
        : [];

      const res = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      let data = {};
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        return "⚠️ " + (data.error || "The server answered with an error (" + res.status + ").");
      }
      const reply = data.reply || data.response || data.text || data.answer || data.message;
      return reply
        ? String(reply)
        : "⚠️ The server answered but sent no text. Make sure server.js ends with res.json({ reply: ... }).";
    } catch (err) {
      return "⚠️ I can't reach your backend at http://localhost:3000. Open the mikegpt-backend folder in a terminal and run: node server.js";
    }
  }

  /* ---------- Thinking robot (drawn with code: no image file needed) ---------- */
  const thinkStyle = document.createElement("style");
  thinkStyle.textContent = `
  .thinking, .thought { display: flex; align-items: center; gap: 12px; }
  .thought {
    margin-bottom: 10px; padding-bottom: 10px;
    border-bottom: 1px dashed var(--border-color);
    color: var(--text-secondary); font-size: .88rem;
  }
  .think-text { display: flex; flex-direction: column; line-height: 1.25; }
  .think-label { font-size: .98rem; font-weight: 500; transition: opacity .18s ease, transform .18s ease; }
  .think-label.swap { opacity: 0; transform: translateY(4px); }
  .think-time { font-size: .75rem; min-height: 1em; color: var(--text-secondary); opacity: .75; }
  .shimmer {
    background: linear-gradient(90deg, var(--text-secondary) 0%, var(--text-secondary) 35%, #60a5fa 50%, var(--text-secondary) 65%, var(--text-secondary) 100%);
    background-size: 250% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 2s linear infinite;
  }
  @keyframes shimmer { from { background-position: 150% 0; } to { background-position: -150% 0; } }

  /* the robot */
  .rb { --s: 70px; width: var(--s); aspect-ratio: 250 / 164; flex-shrink: 0; display: block;
        transform-origin: 50% 92%; filter: drop-shadow(0 0 6px rgba(59,130,246,.45)); }
  .rb svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .thought .rb { --s: 32px; }

  .rb[data-state="think"] { animation: rbTilt 4.2s ease-in-out infinite, rbGlow 2s ease-in-out infinite alternate; }
  .rb[data-state="talk"]  { animation: rbNod .55s ease-in-out infinite alternate, rbGlow 1.2s ease-in-out infinite alternate; }

  .rb-eye { transform-box: fill-box; transform-origin: center; animation: rbBlink 4.2s infinite; }
  .rb[data-state="idle"] .rb-eye { animation-duration: 5.5s; }
  .rb[data-state="think"] .rb-eyes { animation: rbLook 4.2s ease-in-out infinite; }

  .rb-ball { transform-box: fill-box; transform-origin: center; }
  .rb[data-state="think"] .rb-ball { animation: rbBall .9s ease-in-out infinite alternate; }
  .rb[data-state="think"] .rb-ball.r { animation-delay: .45s; }

  .rb-talk { opacity: 0; transform-box: fill-box; transform-origin: center; }
  .rb[data-state="talk"] .rb-talk { opacity: 1; animation: rbTalk .26s ease-in-out infinite alternate, rbTalkW .7s ease-in-out infinite alternate; }
  .rb[data-state="talk"] .rb-smile { opacity: 0; }

  @keyframes rbTilt {
    0%   { transform: rotate(0deg)  translate(0, 0); }
    15%  { transform: rotate(-7deg) translate(-2%, -3%); }
    35%  { transform: rotate(5deg)  translate(2%, -5%); }
    55%  { transform: rotate(-3deg) translate(-1%, -1%); }
    75%  { transform: rotate(6deg)  translate(2%, -4%); }
    100% { transform: rotate(0deg)  translate(0, 0); }
  }
  @keyframes rbNod  { from { transform: rotate(-1.5deg) translateY(0); } to { transform: rotate(1.5deg) translateY(-3%); } }
  @keyframes rbGlow { from { filter: drop-shadow(0 0 4px rgba(59,130,246,.3)); } to { filter: drop-shadow(0 0 13px rgba(59,130,246,.8)); } }
  @keyframes rbBlink {
    0%, 37% { transform: scaleY(1); } 39% { transform: scaleY(.08); } 41%, 80% { transform: scaleY(1); }
    82% { transform: scaleY(.08); } 84%, 100% { transform: scaleY(1); }
  }
  @keyframes rbLook {
    0%, 100% { transform: translate(0, 0); } 15% { transform: translate(-7px, -2px); }
    35% { transform: translate(8px, -3px); } 55% { transform: translate(-3px, 1px); } 75% { transform: translate(7px, 0); }
  }
  @keyframes rbBall { from { fill: #0e74e4; transform: scale(1); } to { fill: #7ff0ff; transform: scale(1.3); } }
  @keyframes rbTalk  { from { transform: scaleY(.2); } to { transform: scaleY(1); } }
  @keyframes rbTalkW { from { scale: 1 1; } to { scale: .72 1; } }

  @media (prefers-reduced-motion: reduce) {
    .rb, .rb * { animation: none !important; }
    .shimmer { -webkit-text-fill-color: currentColor; background: none; }
  }
  `;
  document.head.appendChild(thinkStyle);

  const ROBOT_SVG = `
  <svg viewBox="0 0 250 164" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g stroke="#0e74e4" stroke-width="6" stroke-linecap="round">
      <line x1="28" y1="22" x2="30" y2="78"/><line x1="222" y1="22" x2="220" y2="78"/>
    </g>
    <circle class="rb-ball l" cx="28" cy="15" r="11" fill="#0e74e4"/>
    <circle class="rb-ball r" cx="222" cy="15" r="11" fill="#0e74e4"/>
    <rect x="3" y="80" width="34" height="58" rx="17" fill="#1a7fe8" stroke="#0b62c4" stroke-width="5"/>
    <rect x="11" y="91" width="14" height="36" rx="7" fill="#4aa3f5"/>
    <rect x="213" y="80" width="34" height="58" rx="17" fill="#1a7fe8" stroke="#0b62c4" stroke-width="5"/>
    <rect x="225" y="91" width="14" height="36" rx="7" fill="#4aa3f5"/>
    <ellipse cx="125" cy="96" rx="92" ry="66" fill="#ffffff" stroke="#0b64c8" stroke-width="6"/>
    <path d="M196 50 C226 82 216 132 164 150 C206 128 210 84 190 52 Z" fill="#d9e6f9"/>
    <rect x="88" y="20" width="74" height="22" rx="9" fill="#ffffff" stroke="#0b64c8" stroke-width="5"/>
    <rect x="44" y="52" width="162" height="88" rx="42" fill="#0c66d4"/>
    <path d="M64 72 Q82 58 114 58" fill="none" stroke="#3f95f0" stroke-width="5" stroke-linecap="round" opacity=".55"/>
    <g class="rb-eyes">
      <g transform="translate(90 88)"><g class="rb-eye">
        <circle r="16" fill="#5ee7ff" opacity=".28"/><circle r="11.5" fill="#8df0ff"/><circle r="5.8" fill="#ffffff"/>
      </g></g>
      <g transform="translate(160 88)"><g class="rb-eye">
        <circle r="16" fill="#5ee7ff" opacity=".28"/><circle r="11.5" fill="#8df0ff"/><circle r="5.8" fill="#ffffff"/>
      </g></g>
    </g>
    <path class="rb-smile" d="M104 114 Q125 131 146 114" fill="none" stroke="#6fdcff" stroke-width="5.5" stroke-linecap="round"/>
    <ellipse class="rb-talk" cx="125" cy="119" rx="13" ry="9" fill="#6fdcff"/>
  </svg>`;

  /* states: "think" (waiting), "talk" (while the answer is being written), "idle" (done) */
  const robotHTML = (state) => '<div class="rb" data-state="' + state + '">' + ROBOT_SVG + "</div>";
  function setHeadState(slot, state) {
    const rb = slot.querySelector(".rb");
    if (rb) rb.setAttribute("data-state", state);
  }

  const THINK_PHRASES = [
    "Thinking",
    "Reading your message",
    "Looking for the best answer",
    "Putting it all together",
  ];

  // shows the thinking robot + a changing label inside `slot`
  function startThinking(slot) {
    slot.innerHTML =
      '<div class="thinking">' + robotHTML("think") +
      '<div class="think-text"><span class="think-label shimmer">' + THINK_PHRASES[0] + "</span>" +
      '<span class="think-time"></span></div></div>';

    const label = $(".think-label", slot);
    const timeEl = $(".think-time", slot);
    const t0 = performance.now();
    let i = 0;

    const clock = setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      timeEl.textContent = s >= 2 ? s + "s" : "";
    }, 500);

    const rotate = setInterval(() => {
      i = (i + 1) % THINK_PHRASES.length;
      label.classList.add("swap");
      setTimeout(() => { label.textContent = THINK_PHRASES[i]; label.classList.remove("swap"); }, 180);
    }, 2400);

    return {
      stop() {                                   // returns how many seconds it thought
        clearInterval(clock);
        clearInterval(rotate);
        return Math.max(1, Math.round((performance.now() - t0) / 1000));
      },
    };
  }

  // the answer is ready: the robot starts "talking" and the label becomes "Thought for Ns"
  function finishThinking(slot, seconds) {
    slot.innerHTML = '<div class="thought">' + robotHTML("talk") + "<span>Thought for " + seconds + "s</span></div>";
  }

  /* ---------- 9. Sending ---------- */
  let attachments = [];

  async function send(text) {
    if (busy) return;
    text = text.trim();
    if (!text && !attachments.length) {
      form.classList.remove("shake");
      void form.offsetWidth;
      form.classList.add("shake");
      return;
    }

    // start a conversation if needed
    if (!activeChat()) {
      const c = { id: uid(), title: (text || attachments[0]).slice(0, 36), messages: [] };
      chats.push(c);
      activeId = c.id;
      showChatMode(true);
      renderRecent();
    }
    const chat = activeChat();
    const files = attachments.map((f) => f.name);

    addMessage("user", text, { files });
    chat.messages.push({ role: "user", text: text || files.map((f) => "📎 " + f).join(", ") });
    save();
    input.value = "";
    clearAttachments();
    updateSendState();

    busy = true;
    const token = ++runToken;

    const bot = addMessage("bot", null);
    const thinkSlot = document.createElement("div");
    const answerSlot = document.createElement("div");
    bot.body.append(thinkSlot, answerSlot);
    const thinking = startThinking(thinkSlot);   // head starts moving + blinking
    scrollDown(false);

    let reply;
    try { reply = await getReply(text || "file"); }
    catch { reply = "Something went wrong reaching the server. Check your connection and try again."; }

    if (token !== runToken) { thinking.stop(); return; } // chat was reset meanwhile
    finishThinking(thinkSlot, thinking.stop());           // robot starts talking
    const finished = await typeInto(answerSlot, reply, token);
    setHeadState(thinkSlot, "idle");                      // robot calms down when the answer is written
    if (finished === false) return;

    chat.messages.push({ role: "bot", text: reply });
    save();
    busy = false;
    scrollDown();
    input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });

  function updateSendState() {
    const ready = input.value.trim().length > 0 || attachments.length > 0;
    sendBtn.style.opacity = ready ? "1" : ".45";
    sendBtn.style.transform = ready ? "scale(1)" : "scale(.9)";
  }
  input.addEventListener("input", updateSendState);
  updateSendState();

  /* ---------- 10. Attachments ---------- */
  function renderAttachments() {
    attachBar.innerHTML = "";
    attachBar.hidden = !attachments.length;
    attachments.forEach((f, i) => {
      const c = document.createElement("span");
      c.className = "chip";
      c.innerHTML = `<span>📎 ${esc(f.name)}</span>`;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.title = "Remove";
      x.addEventListener("click", () => { attachments.splice(i, 1); renderAttachments(); updateSendState(); });
      c.appendChild(x);
      attachBar.appendChild(c);
    });
  }
  function clearAttachments() { attachments = []; renderAttachments(); }

  fileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const max = 10 * 1024 * 1024;
    [...fileInput.files].forEach((f) => {
      if (f.size > max) return toast(`${f.name} is over 10 MB`);
      attachments.push(f);
    });
    fileInput.value = "";
    renderAttachments();
    updateSendState();
  });

  // drag & drop files anywhere
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) return;
    attachments.push(...e.dataTransfer.files);
    renderAttachments();
    updateSendState();
    toast("File added");
  });

  /* ---------- 11. Emoji picker ---------- */
  const emojis = "😀 😁 😂 🤣 😊 😍 😘 😎 🤩 🥳 😇 🙂 😉 😋 🤔 🤗 😴 😅 😭 😡 🥺 😱 🤯 🙄 👍 👎 👏 🙌 🙏 💪 👋 ✌️ 🔥 ✨ 🎉 💯 ❤️ 💙 💜 🖤 🚀 💡 📚 💻 🎧 🎮 ☕ 🍕 🌍 🌙 ⭐ 🌈 🐱 🐶 🦁 🇸🇳".split(" ");
  const picker = document.createElement("div");
  picker.className = "emoji-picker";
  emojis.forEach((em) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = em;
    b.addEventListener("click", () => {
      const s = input.selectionStart ?? input.value.length;
      const e = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, s) + em + input.value.slice(e);
      input.focus();
      input.setSelectionRange(s + em.length, s + em.length);
      updateSendState();
    });
    picker.appendChild(b);
  });
  wrapper.appendChild(picker);

  emojiBtn.addEventListener("click", (e) => { e.stopPropagation(); picker.classList.toggle("open"); });
  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target)) picker.classList.remove("open");
  });

  /* ---------- 12. Delete / new chat / nav ---------- */
  let deleteArmed = false;
  deleteBtn.addEventListener("click", async () => {
    if (!activeChat()) return toast("There's no conversation to delete");
    if (!deleteArmed) {
      deleteArmed = true;
      toast("Click delete again to confirm", 2500);
      deleteBtn.style.color = "#f87171";
      setTimeout(() => { deleteArmed = false; deleteBtn.style.color = ""; }, 2500);
      return;
    }
    deleteArmed = false;
    deleteBtn.style.color = "";
    runToken++;
    chatInner.classList.add("clearing");
    await sleep(reduceMotion ? 0 : 350);
    chats = chats.filter((c) => c.id !== activeId);
    save();
    chatInner.classList.remove("clearing");
    newChat();
    toast("Conversation deleted");
  });

  newChatBtn.addEventListener("click", newChat);

  $$(".nav-item").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      toast(`${$("span", a).textContent} is coming soon ✨`);
    })
  );

  /* ---------- 13. Keyboard shortcuts ---------- */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); newChat(); }
    if (e.key === "Escape") picker.classList.remove("open");
    if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

  /* ---------- 14. Soft parallax glow on the heading ---------- */
  if (!reduceMotion) {
    window.addEventListener("pointermove", (e) => {
      const x = (e.clientX / innerWidth - 0.5) * 10;
      const y = (e.clientY / innerHeight - 0.5) * 6;
      header.style.translate = `${x}px ${y}px`;
    }, { passive: true });
  }

  /* ---------- 15. User + logout ---------- */
  const headingEl = $(".heading");
  const accountName = $(".account-name");
  const accountAvatar = $(".account-avatar");

  function applyUser() {
    const name = user?.name || "";
    accountName.textContent = name || "My Account";
    accountAvatar.textContent = (name[0] || "M").toUpperCase();
    headingEl.textContent = name ? `Hello, ${name.split(" ")[0]}` : "Hello, my friend";
  }

  let logoutArmed = false;
  $(".account-profile")?.addEventListener("click", () => {
    if (!logoutArmed) {
      logoutArmed = true;
      toast("Click again to log out", 2500);
      setTimeout(() => (logoutArmed = false), 2500);
      return;
    }
    try { localStorage.removeItem("mikegpt-user"); } catch {}
    document.body.style.transition = "opacity .35s ease";
    document.body.style.opacity = "0";
    setTimeout(() => location.replace("index.html"), 350);
  });

  /* ---------- 16. Boot ---------- */
  applyUser();
  renderRecent();
  input.focus();
})();