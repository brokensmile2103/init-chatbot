/*! Init Chatbot widget | framework-free, no dependencies | <script src="https://YOUR-CHATBOT-DOMAIN/widget.min.js" defer></script> */
(function () {
  "use strict";
  if (window.InitChatbot && window.InitChatbot.loaded) return;

  var script = document.currentScript || document.querySelector('script[src*="/widget"]');
  var D = (script && script.dataset) || {};
  function endpointFor(el) {   // "chat" resolved next to the script, so it works on a (sub)domain and under a path prefix such as /chatbot/
    try { if (el && el.src) return new URL("chat", el.src).href; } catch (e) {}
    return "/chat";
  }

  /* ------------------------------------------------------------------ public API (works before the widget is ready) */
  var pending = [], api = null;
  window.InitChatbot = {
    loaded: true,
    open: function () { api ? api.open() : pending.push("open"); },
    close: function () { api ? api.close() : pending.push("close"); },
    toggle: function () { api ? api.toggle() : pending.push("toggle"); }
  };

  /* ------------------------------------------------------------------ optional keyboard shortcut (off by default)
     Opt-in only: set data-hotkey on the script tag to enable it, for example:
       data-hotkey="?"          (Shift+/ on most layouts - the produced character, not the physical key)
       data-hotkey="ctrl+k"     (a control combo: modifiers do not change e.key, so they must be named)
     No data-hotkey attribute -> no listener is registered at all, and no key is intercepted. */
  function parseHotkey(s) {
    s = (s || "").trim();
    if (!s) return null;
    var parts = s.split("+").map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parts.length) return null;
    var key = parts.pop().toLowerCase();
    var mod = { ctrl: false, alt: false, meta: false }, shift = false;
    parts.forEach(function (p) {
      p = p.toLowerCase();
      if (p === "ctrl" || p === "control") mod.ctrl = true;
      else if (p === "alt" || p === "option") mod.alt = true;
      else if (p === "cmd" || p === "meta" || p === "command" || p === "win") mod.meta = true;
      else if (p === "shift") shift = true;
    });
    // "shift+/" is easier to write than "?", so translate common shifted symbols
    // (US layout) to what Shift actually produces - e.key already reflects Shift
    // for letters, so only punctuation/digit keys need this.
    var SHIFT_MAP = { "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
      "-": "_", "=": "+", "[": "{", "]": "}", "\\": "|", ";": ":", "'": "\"", ",": "<", ".": ">", "/": "?", "`": "~" };
    if (shift && SHIFT_MAP[key]) key = SHIFT_MAP[key];
    return { key: key, mod: mod };
  }
  function typingEl(el) {   // walks into open Shadow DOMs (including the widget's own) to find the real focused element
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (!el) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" || !!el.isContentEditable;
  }
  var HOTKEY = parseHotkey(D.hotkey);
  if (HOTKEY) {
    document.addEventListener("keydown", function (e) {
      if ((e.key || "").toLowerCase() !== HOTKEY.key) return;
      if (e.ctrlKey !== HOTKEY.mod.ctrl || e.altKey !== HOTKEY.mod.alt || e.metaKey !== HOTKEY.mod.meta) return;
      if (typingEl(document.activeElement)) return;   // never hijacks typing, anywhere on the page or inside the widget
      e.preventDefault();
      window.InitChatbot.toggle();
    });
  }

  /* ------------------------------------------------------------------ text (English default, Vietnamese built in) */
  var I18N = {
    en: {
      title: "Ask", hello: "Hi! What would you like to know about {site}?",
      sub: "I answer from the articles and guides on this site.", ph: "Type your question…",
      note: "AI answers can be wrong. Please check the original article.",
      open: "Open chat", close: "Close chat", newChat: "New conversation", send: "Send question", question: "Your question",
      related: "Related articles", retry: "Try again", copy: "Copy code",
      expand: "Expand chat window", shrink: "Shrink chat window",
      // Waiting lines, shown in random order at an uneven pace so it feels natural.
      waiting: ["Looking for an answer…", "Reading through the related articles…", "Almost there, just a moment…", "This one needs a bit more thought…", "Cross-checking a couple of sources…", "Narrowing it down to the best answer…"],
      // Reassurance once the wait runs long (~12 s): still working, not stuck, question not lost.
      waitingLate: ["Sorry, this one's taking a bit longer. Still working on it…", "Thanks for your patience, almost done here…", "Still processing your question, just a little longer please…", "Things are a bit slow right now, but I haven't given up. Hang tight…"],
      errNet: ["Can't connect to the server. Please check your connection and try again.", "Your connection seems unstable, so the question didn't go through. Please try again.", "Connection interrupted. Check your Internet and try again."],
      errTimeout: ["No response yet after a while. Please try again, your question wasn't lost.", "This is taking longer than expected. Please try again.", "Still no reply from the server. Sorry about that, please try again."],
      errGeneric: ["Something went wrong (%s). Please try again in a moment.", "Sorry, a technical issue came up (%s). Please try again in a few minutes."],
      errOffline: ["Looks like your device is offline. Reconnect, then tap try again.", "I can't detect an Internet connection. Once you're back online, please try again."]
    },
    vi: {
      title: "Hỏi đáp", hello: "Xin chào! Bạn muốn tìm hiểu điều gì trong {site}?",
      sub: "Mình trả lời dựa trên các bài viết và hướng dẫn có sẵn.", ph: "Nhập câu hỏi của bạn…",
      note: "Trả lời do AI tạo, có thể chưa chính xác. Hãy đối chiếu với bài viết gốc.",
      open: "Mở hỏi đáp", close: "Đóng hỏi đáp", newChat: "Cuộc trò chuyện mới", send: "Gửi câu hỏi", question: "Câu hỏi của bạn",
      related: "Bài viết liên quan", retry: "Thử lại", copy: "Sao chép mã",
      expand: "Mở rộng khung chat", shrink: "Thu nhỏ khung chat",
      waiting: ["Đang tìm câu trả lời…", "Đang đọc kỹ các bài viết liên quan…", "Sắp xong rồi, chờ mình chút nhé…", "Câu này cần suy nghĩ thêm một chút…", "Đang đối chiếu vài nguồn khác nhau…", "Đang chọn lọc thông tin chính xác nhất cho bạn…"],
      waitingLate: ["Xin lỗi bạn, câu này hơi mất thời gian một chút, mình vẫn đang xử lý…", "Cảm ơn bạn đã kiên nhẫn chờ, mình sắp có câu trả lời rồi…", "Câu hỏi vẫn đang được xử lý, mong bạn thông cảm chờ thêm chút nữa nhé…", "Hệ thống hơi bận một chút, nhưng mình chưa bỏ cuộc đâu, chờ mình xíu nhé…"],
      errNet: ["Không kết nối được tới máy chủ. Bạn kiểm tra mạng rồi thử lại nhé.", "Có vẻ mạng đang chập chờn, mình chưa gửi được câu hỏi đi. Bạn thử lại giúp mình nhé.", "Kết nối bị gián đoạn. Bạn kiểm tra Internet rồi bấm thử lại giúp mình nha."],
      errTimeout: ["Câu hỏi này hơi lâu chưa có phản hồi. Bạn thử lại giúp mình nhé, câu hỏi của bạn vẫn còn nguyên.", "Mình chờ hơi lâu mà chưa có phản hồi. Bạn bấm thử lại giúp mình nha.", "Có vẻ đang mất nhiều thời gian hơn bình thường. Bạn thử lại nhé, mình xin lỗi vì sự bất tiện này."],
      errGeneric: ["Có lỗi xảy ra (%s). Bạn thử lại sau nhé.", "Xin lỗi, có trục trặc kỹ thuật (%s). Bạn vui lòng thử lại sau ít phút nhé."],
      errOffline: ["Có vẻ thiết bị của bạn đang mất kết nối mạng. Bạn kết nối lại rồi bấm thử lại nhé.", "Mình không thấy kết nối Internet. Khi có mạng trở lại, bạn bấm thử lại giúp mình nha."]
    }
  };
  var LANG = /^vi/i.test(D.lang || document.documentElement.lang || navigator.language || "") ? "vi" : "en";
  var T = I18N[LANG];
  function rnd(v) { return typeof v === "string" ? v : v[(Math.random() * v.length) | 0]; }   // one message picked at random
  var SITE = D.site || location.hostname.replace(/^www\./, "");

  var C = {
    api: D.endpoint || endpointFor(script),
    title: D.title || T.title,
    hello: (D.hello || T.hello).replace("{site}", SITE),
    sub: D.sub || T.sub,
    ph: D.placeholder || T.ph,
    note: D.note || T.note,
    suggest: (D.suggest || "").split("|").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4),
    accent: /^#[0-9a-f]{3,8}$/i.test(D.accent || "") ? D.accent : "#2563eb",
    theme: /^(light|dark)$/.test(D.theme || "") ? D.theme : "auto",
    darkClass: D.darkClass || "",
    side: D.position === "left" ? "left" : "right",
    ox: parseInt(D.offsetX, 10) >= 0 ? parseInt(D.offsetX, 10) : 20,
    oy: parseInt(D.offsetY, 10) >= 0 ? parseInt(D.offsetY, 10) : 20,
    avoid: D.avoid || "", hideWhen: D.hideWhen || "",
    z: parseInt(D.zIndex, 10) || 9999
  };
  var KEY = "init-chatbot:v1", MAXMSG = 30, FAB = 52;

  /* ------------------------------------------------------------------ icons (own inline SVG, 24px grid) */
  var ICONS = {
    chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 4v-4h-1A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" stroke-width="2.4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M12 19V5"/><path d="M6.5 10.5L12 5l5.5 5.5"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5v4.7h-4.7"/>',
    doc: '<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/><path d="M9.5 12.5h5M9.5 16h5"/>',
    external: '<path d="M8 16L16 8"/><path d="M9.5 8H16v6.5"/>',
    copy: '<rect x="9" y="9" width="10.5" height="11" rx="2"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v8A2.5 2.5 0 0 0 6.5 17H9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    shrink: '<path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16h.01" stroke-width="2.4"/>'
  };
  function ic(name, size, cls) {
    return '<svg class="ic' + (cls ? " " + cls : "") + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
  }

  /* ------------------------------------------------------------------ styles (theme with CSS variables, light + dark) */
  var CSS = [
    ":host{all:initial}*{box-sizing:border-box}",
    ".w{--accent:" + C.accent + ";--ink:#111827;--muted:#6b7280;--surface:#ffffff;--surface2:#f3f4f6;--sunken:#e5e7eb;--border:rgba(17,24,39,.12);",
    "--shadow:0 18px 50px -12px rgba(17,24,39,.28),0 2px 8px rgba(17,24,39,.08);--link:var(--accent);--danger:#dc2626;",
    "font:14px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif;color:var(--ink);-webkit-text-size-adjust:100%}",
    ":host(.dark) .w{--ink:#f3f4f6;--muted:#9ca3af;--surface:#1a1c21;--surface2:#121316;--sunken:#0b0c0e;--border:rgba(255,255,255,.12);",
    "--shadow:0 18px 50px -12px rgba(0,0,0,.7),0 2px 8px rgba(0,0,0,.4);--link:color-mix(in srgb,var(--accent) 55%,#fff);--danger:#f87171}",
    ":host(.dark){color-scheme:dark}",
    "button{font:inherit;color:inherit;cursor:pointer}.ic{display:block;flex:none}",
    ".fab{position:fixed;z-index:2;bottom:calc(var(--by) + env(safe-area-inset-bottom,0px));width:" + FAB + "px;height:" + FAB + "px;padding:0;border:0;border-radius:50%;",
    "display:flex;align-items:center;justify-content:center;background:var(--accent);color:#fff;",
    "box-shadow:0 8px 22px -6px color-mix(in srgb,var(--accent) 60%,transparent),0 2px 6px rgba(17,24,39,.18);transition:transform .15s ease,filter .15s ease}",
    ".right .fab,.right .panel{right:var(--ox)}.left .fab,.left .panel{left:var(--ox)}",
    ".fab:hover{filter:brightness(1.08);transform:translateY(-1px)}",
    ".fab:focus-visible,.ib:focus-visible,.chip:focus-visible,.sa:focus-visible,.cp:focus-visible,.retry:focus-visible,.send:focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
    ".fab .x{display:none}.open .fab .c{display:none}.open .fab .x{display:block}",
    /* opens instantly: no slide, no fade */
    ".panel{position:fixed;z-index:1;bottom:calc(var(--by) + " + (FAB + 12) + "px + env(safe-area-inset-bottom,0px) + var(--kb,0px));width:392px;max-width:calc(100vw - 24px);",
    "height:auto;min-height:min(430px,calc(var(--vh,100vh) - var(--by) - " + (FAB + 28) + "px));max-height:min(600px,calc(var(--vh,100vh) - var(--by) - " + (FAB + 28) + "px));",
    "display:none;flex-direction:column;overflow:hidden;background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);",
    "transition:width .2s ease,min-height .2s ease,max-height .2s ease}",
    /* wider and taller panel, desktop only (the button is hidden on small screens) */
    ".panel.wide{width:488px;min-height:min(560px,calc(var(--vh,100vh) - var(--by) - " + (FAB + 28) + "px));max-height:min(760px,calc(var(--vh,100vh) - var(--by) - " + (FAB + 28) + "px))}",
    ".open .panel{display:flex}",
    ".hd{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;border-bottom:1px solid var(--border)}",
    ".av{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}",
    ".ti{flex:1;min-width:0;line-height:1.25}.ti b{display:block;font-size:15px;font-weight:650}.ti span{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".ib{width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center;transition:background-color .15s,color .15s}",
    ".ib:hover{background:var(--surface2);color:var(--ink)}",
    ".msgs{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 14px;display:flex;flex-direction:column;gap:12px}",
    ".m{max-width:92%;padding:9px 13px;border-radius:16px;overflow-wrap:anywhere}.m>*:first-child{margin-top:0}.m>*:last-child{margin-bottom:0}",
    ".m p{margin:0 0 8px}.m ul,.m ol{margin:0 0 8px;padding-left:20px}.m li{margin:2px 0}",
    ".m a{color:var(--link);text-decoration:underline;text-underline-offset:2px}.m p a,.m li a{font-weight:600}",
    ".b{align-self:flex-start;background:var(--surface2);border-top-left-radius:6px}",
    ".u{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:6px}",
    ".hint{margin-top:6px;font-size:12.5px;color:var(--muted)}",
    ".m code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:var(--sunken);padding:1px 5px;border-radius:6px}",
    ".code{position:relative;margin:0 0 8px}.code pre{margin:0;padding:10px 40px 10px 12px;background:var(--sunken);border:1px solid var(--border);border-radius:10px;overflow-x:auto}",
    ".code pre code{background:none;padding:0;font-size:12.5px;line-height:1.5;white-space:pre}",
    ".cp{position:absolute;top:6px;right:6px;width:28px;height:28px;padding:0;border-radius:8px;background:var(--surface);color:var(--muted);display:flex;align-items:center;justify-content:center;border:1px solid var(--border)}",
    ".cp:hover{color:var(--ink)}",
    ".src{margin-top:10px;display:flex;flex-direction:column;gap:6px}.sl{font-size:12px;font-weight:600;color:var(--muted)}",
    ".sa{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--ink);text-decoration:none;font-size:13px;line-height:1.35;transition:border-color .15s,color .15s}",
    ".m .sa{color:var(--ink);text-decoration:none}.sa:hover,.m .sa:hover{border-color:var(--accent);color:var(--link)}",
    ".sa span{flex:1;min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.sa .ic{color:var(--muted)}.sa:hover .ic{color:inherit}",
    ".chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:-4px}",
    ".chip{padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--ink);font-size:13px;line-height:1.3;text-align:left;transition:border-color .15s,color .15s}",
    ".chip:hover{border-color:var(--accent);color:var(--link)}",
    ".wait{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}",
    ".dots{display:inline-flex;gap:3px}.dots i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:bl 1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}",
    "@keyframes bl{0%,80%,100%{opacity:.25}40%{opacity:1}}",
    ".err{display:flex;gap:8px;align-items:flex-start}.err .ic{color:var(--danger);margin-top:2px}",
    ".retry{margin-top:6px;padding:4px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-size:13px}.retry:hover{border-color:var(--accent);color:var(--link)}",
    ".ft{padding:10px 12px 12px;border-top:1px solid var(--border);margin:0}.field{position:relative}",
    ".field input{width:100%;height:42px;padding:0 48px 0 16px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);color:var(--ink);font:inherit;font-size:14.5px;outline:0;transition:border-color .15s,box-shadow .15s,background-color .15s}",
    ".field input::placeholder{color:var(--muted)}.field input:focus{border-color:var(--accent);background:var(--surface);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}",
    ".send{position:absolute;top:5px;right:5px;width:32px;height:32px;padding:0;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent);color:#fff;transition:filter .15s,background-color .15s}",
    ".send:hover:not(:disabled){filter:brightness(1.1)}.send:disabled{background:var(--sunken);color:var(--muted);cursor:default}",
    ".note{margin:8px 4px 0;font-size:11.5px;line-height:1.4;color:var(--muted);text-align:center}",
    "@media (max-width:640px){.panel,.panel.wide{left:12px!important;right:12px!important;width:auto;max-width:none;min-height:min(430px,calc(var(--vh,100vh) - var(--by) - " + (FAB + 28) + "px));max-height:min(600px,calc(var(--vh,100vh) - var(--by) - " + (FAB + 28) + "px))}.ib.wide{display:none}.field input{font-size:16px}}",
    "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}",
    "@media print{:host{display:none!important}}"
  ].join("");

  /* ------------------------------------------------------------------ helpers */
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u); }
  function isSame(u) { return u.indexOf(location.origin + "/") === 0 || u === location.origin; }
  function nb(t) { return t.replace(/ (\S+)$/, "&nbsp;$1"); }   // keep the last word from wrapping alone

  /* Safe mini-markdown: everything is escaped first; only a small set of tags is produced. */
  function md(src) {
    var codes = [], ins = [], t = String(src || "").replace(/\r/g, "");
    t = t.replace(/```[\w+-]*\n([\s\S]*?)```/g, function (_, c) { codes.push(c.replace(/\n+$/, "")); return "\n\u0000" + (codes.length - 1) + "\u0000\n"; });
    t = esc(t).replace(/`([^`\n]+)`/g, function (_, c) { ins.push(c); return "\u0001" + (ins.length - 1) + "\u0001"; });
    t = t.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, x, u) {
      return '<a href="' + u + '"' + (isSame(u.replace(/&amp;/g, "&")) ? "" : ' target="_blank" rel="noopener noreferrer"') + ">" + x + "</a>";
    });
    var out = [], list = null;
    function shut() { if (list) { out.push("</" + list + ">"); list = null; } }
    t.split("\n").forEach(function (l) {
      var c = l.match(/^\u0000(\d+)\u0000$/);
      if (c) { shut(); out.push('<div class="code"><button type="button" class="cp" aria-label="' + esc(T.copy) + '" title="' + esc(T.copy) + '">' + ic("copy", 16) + "</button><pre><code>" + esc(codes[+c[1]]) + "</code></pre></div>"); return; }
      var b = l.match(/^\s*[-*•]\s+(.*)/), n = l.match(/^\s*\d+[.)]\s+(.*)/);
      if (b || n) { var k = b ? "ul" : "ol"; if (list !== k) { shut(); out.push("<" + k + ">"); list = k; } out.push("<li>" + (b ? b[1] : n[1]) + "</li>"); return; }
      shut(); if (l.trim()) out.push("<p>" + l + "</p>");
    });
    shut();
    return out.join("").replace(/\u0001(\d+)\u0001/g, function (_, i) { return "<code>" + ins[+i] + "</code>"; });
  }

  /* ------------------------------------------------------------------ widget (built when the browser is idle) */
  function init() {
    if (document.getElementById("init-chatbot")) return;
    var html = document.documentElement;
    var host = document.createElement("div");
    host.id = "init-chatbot";
    host.style.setProperty("--ox", C.ox + "px");
    host.style.setProperty("--by", C.oy + "px");
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" + CSS + "</style>" +
      '<div class="w ' + C.side + '" id="w" style="z-index:' + C.z + '">' +
      '<section class="panel" id="p" role="dialog" aria-label="' + esc(C.title) + '">' +
      '<header class="hd"><div class="av">' + ic("chat", 20) + '</div><div class="ti"><b></b><span></span></div>' +
      '<button type="button" class="ib wide" id="wb" aria-pressed="false">' + ic("expand", 16) + "</button>" +
      '<button type="button" class="ib new" aria-label="' + esc(T.newChat) + '" title="' + esc(T.newChat) + '">' + ic("refresh", 18) + "</button>" +
      '<button type="button" class="ib cl" aria-label="' + esc(T.close) + '" title="' + esc(T.close) + '">' + ic("close", 20) + "</button></header>" +
      '<div class="msgs" id="m" aria-live="polite"></div>' +
      '<form class="ft" id="f" autocomplete="off"><div class="field"><input id="q" type="text" maxlength="500" enterkeyhint="send">' +
      '<button type="submit" class="send" aria-label="' + esc(T.send) + '" disabled>' + ic("send", 20) + "</button></div>" +
      '<p class="note"></p></form></section>' +
      '<button type="button" class="fab" id="b" aria-expanded="false" aria-controls="p" aria-label="' + esc(T.open) + '" title="' + esc(C.title) + '">' +
      ic("chat", 26, "c") + ic("close", 26, "x") + "</button></div>";
    document.body.appendChild(host);

    var $ = function (q) { return root.querySelector(q); };
    var w = $("#w"), msgs = $("#m"), form = $("#f"), input = $("#q"), send = $(".send"), fab = $("#b"), panel = $("#p"), wideBtn = $("#wb");
    $(".ti b").textContent = C.title;
    $(".ti span").textContent = SITE;
    $(".note").textContent = C.note;
    input.placeholder = C.ph;
    input.setAttribute("aria-label", T.question);

    /* wide mode (desktop): the choice is remembered between visits, separately from the conversation */
    var WIDE_KEY = "init-chatbot:wide";
    function setWide(on, remember) {
      panel.classList.toggle("wide", on);
      wideBtn.setAttribute("aria-pressed", on ? "true" : "false");
      wideBtn.setAttribute("aria-label", on ? T.shrink : T.expand);
      wideBtn.title = on ? T.shrink : T.expand;
      wideBtn.innerHTML = ic(on ? "shrink" : "expand", 16);
      if (remember) { try { localStorage.setItem(WIDE_KEY, on ? "1" : "0"); } catch (e) {} }
    }
    setWide((function () { try { return localStorage.getItem(WIDE_KEY) === "1"; } catch (e) { return false; } })(), false);
    wideBtn.addEventListener("click", function () { setWide(!panel.classList.contains("wide"), true); });

    /* state: conversation is kept for the browser session, so it survives page changes */
    var hist = [], busy = false, isOpen = false, lastQ = "";
    function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ o: isOpen ? 1 : 0, h: hist.slice(-MAXMSG) })); } catch (e) {} }
    function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
    function down() { msgs.scrollTop = msgs.scrollHeight; }

    function addMsg(role, h, cls) {
      var d = document.createElement("div");
      d.className = "m " + role + (cls ? " " + cls : "");
      d.innerHTML = h;
      msgs.appendChild(d);
      return d;
    }
    function srcHtml(list) {
      var items = (list || []).filter(function (x) { return x && safeUrl(x.url); }).slice(0, 3);
      if (!items.length) return "";
      return '<div class="src"><div class="sl">' + esc(T.related) + "</div>" + items.map(function (x) {
        return '<a class="sa" href="' + esc(x.url) + '"' + (isSame(x.url) ? "" : ' target="_blank" rel="noopener noreferrer"') + ">" + ic("doc", 16) + "<span>" + esc(x.title || x.url) + "</span>" + ic("external", 14) + "</a>";
      }).join("") + "</div>";
    }
    function showBot(box, m) { box.className = "m b"; box.innerHTML = md(m.t) + srcHtml(m.s); }
    function greet() {
      addMsg("b", "<p>" + nb(esc(C.hello)) + '</p><p class="hint">' + esc(C.sub) + "</p>");
      if (C.suggest.length) {
        var ch = document.createElement("div");
        ch.className = "chips";
        ch.innerHTML = C.suggest.map(function (x) { return '<button type="button" class="chip">' + esc(x) + "</button>"; }).join("");
        msgs.appendChild(ch);
      }
    }
    function draw() {
      msgs.innerHTML = "";
      greet();
      if (hist.length) { var c = msgs.querySelector(".chips"); if (c) c.remove(); }
      hist.forEach(function (m) { if (m.r === "u") addMsg("u", esc(m.t)); else showBot(addMsg("b", ""), m); });
      down();
    }
    function fail(text) {
      return '<div class="err">' + ic("alert", 16) + "<div>" + esc(text) + '<div><button type="button" class="retry">' + esc(T.retry) + "</button></div></div></div>";
    }

    async function ask(q) {
      q = (q || "").trim();
      if (!q || busy) return;
      busy = true; lastQ = q; send.disabled = true; input.value = "";
      var c = msgs.querySelector(".chips"); if (c) c.remove();
      // The previous question goes along so the server can understand follow-ups
      // such as "what about the free one?" (the server decides whether to use it).
      var prevQ = "";
      for (var hi = hist.length - 1; hi >= 0; hi--) if (hist[hi].r === "u") { prevQ = hist[hi].t; break; }
      hist.push({ r: "u", t: q });
      addMsg("u", esc(q));
      var box = addMsg("b", '<div class="wait"><span class="dots"><i></i><i></i><i></i></span><span class="wt">' + esc(rnd(T.waiting)) + "</span></div>");
      down();
      // Rotate the waiting line at a RANDOM pace (not a fixed interval) and never
      // repeat the previous line. After ~12 s switch to reassurance lines.
      var wt = box.querySelector(".wt"), t0 = Date.now(), waitTimer = null, lastLine = "";
      (function nextLine() {
        var late = Date.now() - t0 >= 12000, pool = late ? T.waitingLate : T.waiting, line = rnd(pool), n = 0;
        while (line === lastLine && pool.length > 1 && n++ < 5) line = rnd(pool);
        lastLine = line;
        if (wt) wt.textContent = line;
        waitTimer = setTimeout(nextLine, late ? 4200 + Math.random() * 3300 : 3200 + Math.random() * 2600);
      })();
      // 58 s: just under the 60 s read timeout of the bundled proxy configs.
      var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 58000);
      var payload = JSON.stringify({ q: q, lang: LANG, ctx: prevQ.slice(0, 300) });
      function call() { return fetch(C.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: ctl.signal }); }
      function pause(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
      try {
        if (navigator.onLine === false) throw { msg: rnd(T.errOffline) };
        var r;
        // One silent retry for a dropped connection or a quick 502/503/504 from the
        // proxy (for example while the service restarts); visitors only see an error
        // if the second attempt fails too.
        try { r = await call(); } catch (e1) {
          if (e1 && e1.name === "AbortError") throw e1;
          await pause(1200 + Math.random() * 800);
          if (navigator.onLine === false) throw { msg: rnd(T.errOffline) };
          r = await call();
        }
        if ((r.status === 502 || r.status === 503 || r.status === 504) && Date.now() - t0 < 15000) { await pause(1500 + Math.random() * 1000); r = await call(); }
        var data = await r.json().catch(function () { return {}; });
        if (!r.ok) throw { msg: typeof data.detail === "string" ? data.detail : rnd(T.errGeneric).replace("%s", r.status) };
        var m = { r: "b", t: data.answer || "", s: data.sources || [] };
        hist.push(m);
        showBot(box, m);
        msgs.scrollTop = Math.max(0, box.offsetTop - 14);
      } catch (e) {
        hist.pop();
        box.className = "m b";
        box.innerHTML = fail(e && e.msg ? e.msg : e && e.name === "AbortError" ? rnd(T.errTimeout) : rnd(T.errNet));
        down();
      } finally {
        clearTimeout(timer); clearTimeout(waitTimer); busy = false; send.disabled = !input.value.trim(); save();
        if (matchMedia("(pointer:fine)").matches) input.focus();
      }
    }

    /* open / close */
    function setOpen(v, focus) {
      isOpen = !!v;
      w.classList.toggle("open", isOpen);
      fab.setAttribute("aria-expanded", isOpen ? "true" : "false");
      fab.setAttribute("aria-label", isOpen ? T.close : T.open);
      if (isOpen) { fit(); down(); if (focus !== false && matchMedia("(pointer:fine)").matches) setTimeout(function () { input.focus(); }, 40); }
      save();
    }
    function reset() { if (busy) return; hist = []; draw(); save(); input.focus(); }

    fab.addEventListener("click", function () { setOpen(!isOpen); });
    $(".cl").addEventListener("click", function () { setOpen(false); fab.focus(); });
    $(".new").addEventListener("click", reset);
    form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
    input.addEventListener("input", function () { send.disabled = busy || !input.value.trim(); });
    root.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) { setOpen(false); fab.focus(); } });
    msgs.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("button") : null;
      if (!t) return;
      if (t.classList.contains("chip")) ask(t.textContent);
      else if (t.classList.contains("retry")) { var er = msgs.lastChild; if (er.previousSibling) er.previousSibling.remove(); er.remove(); ask(lastQ); }
      else if (t.classList.contains("cp")) {
        var txt = t.parentNode.querySelector("code").textContent;
        var done = function () { t.innerHTML = ic("check", 16); setTimeout(function () { t.innerHTML = ic("copy", 16); }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () {});
        else { var a = document.createElement("textarea"); a.value = txt; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); done(); } catch (x) {} a.remove(); }
      }
    });

    /* fit the page: dark mode, hiding, avoiding other floating buttons, mobile keyboard */
    var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
    function hasClass(n) { return html.classList.contains(n) || (document.body && document.body.classList.contains(n)); }
    function sync() {
      var dark = C.theme === "dark" ? true : C.theme === "light" ? false : C.darkClass ? hasClass(C.darkClass) : !!(mq && mq.matches);
      host.classList.toggle("dark", dark);
      var hide = false;
      if (C.hideWhen) { try { hide = !!document.querySelector(C.hideWhen); } catch (e) {} }
      host.style.display = hide ? "none" : "";
    }
    function place() {
      var b = C.oy;
      if (C.avoid) {
        try {
          var t = document.querySelector(C.avoid);
          if (t) {
            var cs = getComputedStyle(t);
            if (cs.display !== "none" && cs.visibility !== "hidden" && (cs.position === "fixed" || cs.position === "sticky")) {
              var r = t.getBoundingClientRect();
              if (r.width) b = Math.max(b, Math.round(innerHeight - r.top) + 12);
            }
          }
        } catch (e) {}
      }
      host.style.setProperty("--by", b + "px");
    }
    var vv = window.visualViewport;
    function fit() {
      var h = vv ? vv.height : innerHeight;
      var kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
      host.style.setProperty("--vh", h + "px");
      host.style.setProperty("--kb", (kb > 80 ? kb : 0) + "px");
    }
    var tm; function later() { clearTimeout(tm); tm = setTimeout(function () { place(); sync(); }, 120); }
    new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ["class"] });
    if (document.body) {
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      new MutationObserver(later).observe(document.body, { childList: true });
    }
    if (mq && mq.addEventListener) mq.addEventListener("change", sync);
    addEventListener("resize", function () { later(); fit(); });
    addEventListener("load", place);
    if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
    sync(); place(); fit();

    var st = load();
    if (st && st.h && st.h.length) hist = st.h;
    draw();
    if (st && st.o) setOpen(true, false);

    api = { open: function () { setOpen(true); }, close: function () { setOpen(false); }, toggle: function () { setOpen(!isOpen); } };
    pending.forEach(function (n) { api[n](); });
    pending = [];
  }
  if ("requestIdleCallback" in window) requestIdleCallback(init, { timeout: 1500 }); else setTimeout(init, 200);
})();
