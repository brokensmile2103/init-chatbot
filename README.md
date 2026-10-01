# Init Chatbot

> A self-hosted question-and-answer chatbot for WordPress sites, powered by Google Gemini.

![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-Google-8E75B2?logo=googlegemini&logoColor=white)
![WordPress](https://img.shields.io/badge/WordPress-6.x-21759B?logo=wordpress&logoColor=white)
![License MIT](https://img.shields.io/badge/License-MIT-green?logo=opensourceinitiative&logoColor=white)

## What is Init Chatbot?

Init Chatbot reads your posts through the WordPress REST API, finds the passages that best match each question (keyword search plus Gemini embeddings), and lets a Gemini model write a short answer that **links back to your own articles**. It runs on a small VPS (1 GB of RAM is enough), keeps your Gemini API key on the server, and adds a lightweight chat widget to your site with a single `<script>` tag.

- **Answers with real links.** The model cites articles by number; the server replaces each number with the article title and its URL from your database. The model never writes a URL itself.
- **Works immediately.** A keyword index (SQLite FTS5) is ready in seconds. Semantic search from embeddings is added in the background and improves as it finishes.
- **Built for the Gemini free tier.** Paces embedding calls, resumes after quota limits, and falls back to a second model when the first one runs out (free-tier quota is counted per model, so this roughly doubles the answers per day). When every model is used up it degrades gracefully to "related articles".
- **Answers once, reuses often.** Identical and near-identical questions (same meaning, different wording) are answered from a cache that survives restarts and expires by itself when a source article changes. A "we have no article on that" reply is never cached, so a newly published article is found at once.
- **Finds articles by name.** Asking about a product, plugin or tool ("What is X?") finds the article about exactly that, even when keyword and semantic search both miss it, because distinctive words in article titles get their own weight (generic words such as "plugin" do not).
- **Understands real visitors.** Greetings, thanks, "who are you" and similar small talk get an instant, fitting reply without using quota; follow-ups such as "what about the free one?" use the previous question; politeness ("hi, could you tell me...") is ignored when searching; Vietnamese typed without accents finds accented articles; keyboard mashing is filtered out.
- **Framework-free widget.** No jQuery, no UI kit, about 9 KB gzipped. Inline SVG icons, automatic dark mode, English and Vietnamese built in, a wider chat window on desktop (remembered between visits), natural waiting messages with reassurance on slow answers, and a silent retry when the connection drops.
- **Fits the server you already have.** Init Chatbot listens on `127.0.0.1` only and never touches your web server. Connect it with a ready-made Nginx, Apache or Caddy config, on its own (sub)domain or under a path such as `example.com/chatbot/` of an existing WordPress (LEMP/LAMP) site.
- **Hardened by default.** Origin allow-list, per-visitor and global rate limits, request-size limit, security headers and a locked-down systemd service.

## How it works

```
Visitor -> widget (your site) -> your web server (Nginx / Apache / Caddy) -> 127.0.0.1:8000 (Init Chatbot)
                                         |
                    +--------------------+--------------------+
                    | 0. small talk / spam / cache check      |
                    | 1. keyword search (SQLite FTS5 / BM25)  |
                    | 2. vector search (Gemini embeddings)    |
                    | 3. merge (rank fusion + title match)    |
                    | 4. Gemini writes the answer from the    |
                    |    top passages, citing them as [[n]]   |
                    |    (next model in the chain on failure) |
                    | 5. server turns [[n]] into real links   |
                    +-----------------------------------------+
WordPress REST API --(nightly, cron)--> index.py --> chatbot.db
```

## Requirements

- A server running **Ubuntu 24.04** (the reference platform; other Debian-based systems may work) with 1 GB of RAM or more, and a normal user with `sudo`. It can be the same server that runs WordPress.
- A **web server that can reverse-proxy**: Nginx, Apache or Caddy. Init Chatbot does not install or change one for you.
- Either a **subdomain** for the chatbot (its DNS `A` record pointing to the server) or a **path** on a site you already serve, such as `https://example.com/chatbot/`.
- A WordPress site with the **REST API enabled** (the default) that the server can reach.
- A **Google Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey).

## Quick start

1. **Get an API key** at <https://aistudio.google.com/apikey>.
2. **Upload and unpack** the release, then configure it:

   ```bash
   unzip init-chatbot.zip && cd init-chatbot
   cp env.example .env
   nano .env
   ```

   Fill in `GEMINI_API_KEY`, `BLOG_URL` and `ALLOWED_ORIGIN`. Set `PUBLIC_URL` to where visitors will reach the chatbot, for example `https://chatbot.your-blog.com` or `https://your-blog.com/chatbot`.
3. **Install:**

   ```bash
   chmod +x setup.sh && ./setup.sh
   ```

   The script installs the dependencies, builds the keyword index, starts a hardened systemd service (`init-chatbot`) on `127.0.0.1:8000`, schedules the re-index job, starts the embeddings in the background and writes ready-made web server configs into `webserver/`. It does not modify any web server or firewall.
4. **Connect your web server** with the file for the server you use (see [Connect your web server](#connect-your-web-server)). Add HTTPS the way you normally do (for example `certbot`).
5. **Check it:**

   ```bash
   curl https://chatbot.your-blog.com/health
   ```

   You should see `{"ok":true,"chunks":...,"vectors":...,"models":{...},"cache":{...}}`.
6. **Add the widget** to your site (for example in the footer):

   ```html
   <script src="https://chatbot.your-blog.com/widget.min.js" defer></script>
   ```

## Connect your web server

`setup.sh` writes these files for the `PUBLIC_URL` you set: `webserver/nginx.conf`, `webserver/apache.conf` and `webserver/Caddyfile`. Run `./setup.sh` again after changing `PUBLIC_URL`. The sources are in `webserver/templates/`.

### Its own (sub)domain

**Nginx**

```bash
sudo cp webserver/nginx.conf /etc/nginx/sites-available/init-chatbot
sudo ln -s /etc/nginx/sites-available/init-chatbot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chatbot.your-blog.com     # HTTPS
```

**Apache**

```bash
sudo a2enmod proxy proxy_http
sudo cp webserver/apache.conf /etc/apache2/sites-available/init-chatbot.conf
sudo a2ensite init-chatbot && sudo apachectl configtest && sudo systemctl reload apache2
sudo certbot --apache -d chatbot.your-blog.com    # HTTPS
```

**Caddy** (automatic HTTPS): add `webserver/Caddyfile` to your Caddyfile and run `sudo systemctl reload caddy`.

### Under a path of your existing site (WordPress on LEMP/LAMP)

Set `PUBLIC_URL=https://your-blog.com/chatbot`, run `./setup.sh`, then paste the generated block into your site's existing configuration. No new domain, DNS record or certificate is needed, and the widget calls its own origin.

- **Nginx:** paste `webserver/nginx.conf` inside your existing `server { }` block. The `^~` in `location ^~ /chatbot/` matters: without it, WordPress' usual static-file rule (`location ~* \.(js|css|...)$`) captures `/chatbot/widget.min.js` and returns 404.
- **Apache:** paste `webserver/apache.conf` inside your existing `<VirtualHost>` and enable `proxy` and `proxy_http`. WordPress rules in `.htaccess` do not interfere. If your `<VirtualHost>` has its own catch-all `RewriteRule`, add `RewriteCond %{REQUEST_URI} !^/chatbot/` above it.
- **Caddy:** paste `webserver/Caddyfile` (a `handle_path` block) inside your existing site block.

All of these configs were tested against Nginx 1.24, Apache 2.4.58 and Caddy 2.6.2.

### Notes for any setup

- **Client IP.** The rate limits use the visitor's IP. The generated configs pass it on and the app trusts `X-Forwarded-For` only from `127.0.0.1`. Set `FORWARDED_ALLOW_IPS` in `.env` if your proxy is on another machine or in a container. Behind Cloudflare, configure your web server to restore the visitor IP (for example Nginx `real_ip`), otherwise every visitor appears as a Cloudflare address.
- **Request size.** The app rejects bodies over 4 KB. The generated configs also limit them at the proxy.
- **Ports.** The app listens on `127.0.0.1:${PORT}` (default 8000). Nothing else needs to be opened for it.

## Choosing Gemini models

Two models are used, and both are set in `.env`.

| Purpose | Setting | Recommended | Why |
| --- | --- | --- | --- |
| Writing answers | `GEN_MODEL` | `gemini-3.5-flash-lite` | Fast and cheap, and its free tier allows far more requests per day than the larger Flash models |
| Fallback for answers | `GEN_FALLBACK_MODELS` | `gemini-3.1-flash-lite` | Used when `GEN_MODEL` is out of quota, rate limited or failing. Quota is counted per model, so it adds a second daily allowance |
| Embeddings | `EMB_MODEL` | `gemini-embedding-001` | Multilingual, with a free tier that suits a blog |

Model IDs and free-tier limits change often and differ per account. Check the IDs your key can use:

```bash
curl -s -H "x-goog-api-key: YOUR_KEY" "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" | grep '"name"'
```

and the limits in AI Studio under *Usage → Rate limit*. As an example, one free-tier account showed the following (requests per minute / tokens per minute / requests per day):

| Model | RPM | TPM | RPD |
| --- | --- | --- | --- |
| Gemini 3.5 Flash-Lite | 15 | 250K | 500 |
| Gemini 3.5 Flash (and other Flash models) | 5 | 250K | 20 |
| Gemini Embedding | 100 | 30K | 1,000 |

With a limit of 20 requests per day, a regular Flash model would run out after a handful of questions, so pick Flash-Lite models on the free tier. `GEN_DAILY_LIMIT=450` and `GEN_RPM=12` apply to **each** model in the chain and keep the app just under the Flash-Lite limits above; lower them if your limits are lower.

**Fallback models.** When the first model hits its daily quota, a temporary rate limit or an error, the next model in `GEN_FALLBACK_MODELS` answers instead. A model ID your key cannot use (HTTP 404) is switched off until the next day, so a wrong fallback never breaks anything; `/health` shows each model's usage and whether it is `off`. The whole chain is limited by `GEN_DEADLINE` (40 s by default) so replies always arrive before the 60 s proxy timeout.

> **Do not change `EMB_MODEL`, `EMB_DIM` or `CHUNK_SIZE` after the first indexing.** Existing embeddings become unusable and everything must be embedded again.

### Indexing time on the free tier

Embedding a whole site can take days on the free tier. For example, a site with about 1,800 posts becomes roughly 6,000 chunks, and a free embedding quota of about 1,000 requests per day means the semantic index fills in over several days. The chatbot works from the first minute using keyword search, and the scheduled job continues automatically after each daily quota reset. Enabling billing on the Gemini project removes the wait.

## Widget configuration

Options are `data-*` attributes on the script tag:

```html
<script src="https://chatbot.example.com/widget.min.js" defer
        data-title="Help"
        data-site="My Blog"
        data-accent="#0f766e"
        data-suggest="How do I install it?|Is it free?"></script>
```

| Attribute | Default | Description |
| --- | --- | --- |
| `data-lang` | page language, then browser | `en` or `vi`. Other languages fall back to English |
| `data-title` | `Ask` / `Hỏi đáp` | Panel title |
| `data-site` | host name of the page | Site name used in the subtitle and greeting |
| `data-hello` | built in | Greeting. `{site}` is replaced by the site name |
| `data-sub` | built in | Second line under the greeting |
| `data-placeholder` | built in | Input placeholder |
| `data-note` | built in | Small disclaimer under the input |
| `data-suggest` | none | Up to four suggested questions, separated by `\|` |
| `data-accent` | `#2563eb` | Accent colour (hex) |
| `data-theme` | `auto` | `auto`, `light` or `dark` |
| `data-dark-class` | none | A class on `<html>` or `<body>` that marks your site's dark mode (for example `dark`). When set, the widget follows it instead of the operating system setting |
| `data-position` | `right` | `right` or `left` |
| `data-offset-x`, `data-offset-y` | `20` | Distance from the screen edge in pixels |
| `data-avoid` | none | CSS selector of another fixed button; the chat button is placed above it |
| `data-hide-when` | none | CSS selector; the widget hides while it matches (for example `html.modal-open`) |
| `data-z-index` | `9999` | Stacking order |
| `data-endpoint` | `chat` next to the script | API URL. By default it is resolved relative to the script URL, so it also works under a path prefix such as `/chatbot/` |
| `data-hotkey` | none (disabled) | Optional keyboard shortcut that opens/closes the widget from anywhere on the page, for example `data-hotkey="?"` (Shift+/) or `data-hotkey="ctrl+k"`. Off by default - only set if you want one. Never fires while the visitor is typing in any input, textarea, select or editable field, including the widget's own chat box |

JavaScript API, usable before the widget has finished loading:

```js
InitChatbot.open();
InitChatbot.close();
InitChatbot.toggle();
```

**Conversation.** The widget sends the visitor's previous question along with each new one, so short follow-ups work. While waiting it rotates through short status lines at a random pace and, after about 12 seconds, switches to reassuring messages. A dropped connection or a quick proxy error is retried once silently, and an offline device gets a clear message.

**Window size.** On screens wider than 640 px the header has a button that makes the chat window wider and taller (and back). The choice is remembered in the browser (`localStorage`, key `init-chatbot:wide`); the conversation itself stays in `sessionStorage`. If the server answers with an error, the widget shows its message when it sent one, otherwise a generic text with the HTTP status, for example "Something went wrong (502)".

**Languages.** The widget and the server messages support English (default) and Vietnamese. Small-talk replies follow the language the visitor typed in. The widget sends its language with every question, and the model answers in the language of the question. To add another language, add an entry to `I18N` in `widget.js` and to `MESSAGES` in `app.py`, then regenerate `widget.min.js`.

## Configuration reference

All settings live in `.env`. Only `GEMINI_API_KEY`, `BLOG_URL` and `ALLOWED_ORIGIN` are required; the rest have sensible defaults. Do not write comments on the same line as a value.

| Variable | Default | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | | Your Gemini API key |
| `BLOG_URL` | | WordPress site to index |
| `ALLOWED_ORIGIN` | | Sites allowed to call the API (comma separated) |
| `PUBLIC_URL` | `https://chatbot.example.com` | Where visitors reach the chatbot: a (sub)domain or a path such as `https://your-blog.com/chatbot`. Used to write the web server configs and the widget snippet |
| `GEN_MODEL` | `gemini-3.5-flash-lite` | Model that writes answers |
| `EMB_MODEL` | `gemini-embedding-001` | Embedding model |
| `WP_TYPES` | `posts` | REST types to index, for example `posts,pages` |
| `SITES` | unset | Several sites/languages in one chatbot, for example `en=https://example.com,vi=https://vi.example.com`. Replaces `BLOG_URL` for indexing; answers prefer links in the page's language |
| `GEN_FALLBACK_MODELS` | `gemini-3.1-flash-lite` | Comma-separated fallback models for answers. Empty disables the fallback |
| `SITE_NAME` | host of `BLOG_URL` | Name used in answers |
| `DEFAULT_LANG` | `en` | Language of server messages when the widget sends none (`en` or `vi`) |
| `PORT` | `8000` | Local port of the app (it listens on `127.0.0.1` only; your web server proxies to it) |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | IPs allowed to set `X-Forwarded-For`. Change only if your reverse proxy is not on this machine |
| `GEN_DAILY_LIMIT` | `450` | Answers per day for **each** model (Pacific Time day, like Google's quota) |
| `GEN_RPM` | `12` | Answers per minute for **each** model |
| `GEN_TIMEOUT` | `25` | Seconds for one model call |
| `GEN_DEADLINE` | `40` | Seconds for the whole model chain; keep it under your proxy timeout |
| `RATE_PER_MIN` | `6` | Questions per minute per visitor |
| `MAX_INFLIGHT` | `6` | Concurrent Gemini calls |
| `TOPK` | `5` | Passages given to the model |
| `CACHE_TTL_HOURS` | `48` | How long answers are remembered. They also expire as soon as a source article changes |
| `CACHE_VER` | `v1` | Version tag of the answer cache. Change it (`v2`, `v3`...) to discard every cached answer at once, for example after editing the prompt or the search settings. Letters and digits only |
| `PERSIST_CACHE` | `1` | Keep the answer cache in `answers.db` so restarts do not lose it. `0` = memory only |
| `SMALLTALK_REPLIES` | `1` | Instant replies to greetings, thanks, goodbyes, "who are you"... without using quota |
| `FOLLOWUP_CONTEXT` | `1` | Use the previous question to understand follow-ups |
| `GEN_MAX_TOKENS` | `1024` | Maximum answer length. Raise it if answers come back empty |
| `GEN_THINKING_LEVEL` | unset | Only if the model reports a thinking-related error, try `minimal` |
| `REQUIRE_ORIGIN` | `1` | Reject requests without an allowed `Origin`. Use `0` to test with `curl` |
| `LOG_QUESTIONS` | `1` | Set `0` to keep question text out of the logs |
| `MIN_SIM` | `0` | Optional similarity threshold for off-topic questions (see the `sim=` value in the logs to tune it) |
| `RETRIEVE_FETCH_N` | `30` | Candidates pulled from each retrieval source (keyword, vector) before merging |
| `RRF_K` | `60` | Standard RRF constant used to merge keyword + vector rankings |
| `WEIGHT_VEC`, `WEIGHT_FTS` | `1.0`, `1.0` | Relative weight of the semantic (vector) vs keyword (BM25) signal when merging |
| `TITLE_BOOST` | `0.25` | Bonus when the article title contains the question's distinctive words (not generic ones many titles share). It can also bring in an article that neither keyword nor vector search found, and helps search-only mode surface the right article first |
| `HEAD_BOOST` | `0.15` | Extra bonus when the name at the start of the title ("Name - tagline") matches the question |
| `TITLE_GENERIC_DF` | `0.08` | A word found in more than this share of all titles (and in more than 8 titles) is generic and earns no title bonus |
| `LANG_BOOST` | `0.2` | Bonus for passages in the same language as the page (with `SITES`) |
| `RECENCY_BOOST`, `RECENCY_HALFLIFE_DAYS` | `0.08`, `365` | Small bonus for newer articles, halving every N days. `RECENCY_BOOST=0` turns it off |
| `CHUNK_SIZE`, `EMB_DIM` | `1800`, `768` | Do not change after the first indexing |

## Security

- The Gemini key stays on the server and is sent in a header, never in a URL.
- `/chat` accepts only the origins in `ALLOWED_ORIGIN` (CORS plus a server-side check), and limits request bodies to 4 KB.
- Per-visitor limits (IPv6 visitors are grouped by /64), a short pause for visitors who keep sending meaningless input, per-model answers-per-minute caps, daily answer budgets and a cap on concurrent Gemini calls protect your quota.
- The prompt treats retrieved text as data, and links in answers are generated only from your own database.
- The widget escapes everything before rendering; only a small set of formatting is allowed.
- The app listens on `127.0.0.1` only; your web server is the only way in, so TLS and HSTS stay under your control.
- The systemd service runs as your user with `NoNewPrivileges`, a read-only file system except its own folder, restricted address families and a memory cap.

## Operations

```bash
curl https://chatbot.example.com/health   # chunks, embeddings, per-model usage today, cache sizes and version
sudo journalctl -u init-chatbot -f        # live application log
tail -f index.log reindex.log             # indexing progress
./reindex.sh                              # refresh from WordPress now
./diagnose.sh                             # one-shot report for troubleshooting
```

The index is refreshed twice a day by cron (08:30 and 20:00 server time; the first run falls just after Google's daily quota reset on most cloud images that use UTC). The running app reloads the index by itself when it changes.

Back up `.env` and `chatbot.db`. The database can always be rebuilt from your site, but rebuilding costs embedding quota. `answers.db` only holds cached answers and can be deleted at any time.

## Upgrading

Unpack the new release over your installation (your `.env`, `chatbot.db` and `answers.db` are kept), then run the installer again:

```bash
unzip -o init-chatbot.zip && cd init-chatbot && ./setup.sh
```

Existing embeddings stay valid, so nothing is embedded again. Databases from older releases are upgraded automatically on the next indexing run. The answer cache is versioned (`CACHE_VER`), so the first start after upgrading from a release without it clears the old cached answers once; they are rebuilt as visitors ask. If the service fails to start with the new files, `setup.sh` puts the previous service file back (a copy is kept in `.backup/`) and tells you to read the log. Compare your `.env` with `env.example` for new optional settings, and add a version to the widget URL (for example `widget.min.js?v=2`) so browsers load the new widget instead of a cached one.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `502 Bad Gateway` from your web server | The service is not running or the port differs. Run `systemctl status init-chatbot` and check that `PORT` matches the proxy target |
| `404` for `/chatbot/widget.min.js` on Nginx | The location must be `location ^~ /chatbot/` (with `^~`) so WordPress' static-file rules do not capture it |
| `404` for `/chatbot/...` on Apache | A catch-all `RewriteRule` in the `<VirtualHost>` runs before `ProxyPass`. Add `RewriteCond %{REQUEST_URI} !^/chatbot/` above it |
| Widget shows "This request is not allowed." | `REQUIRE_ORIGIN` blocks calls from origins missing in `ALLOWED_ORIGIN` (include `https://www...` if you use it) |
| Widget shows "Something went wrong (502)" or another number | The number is the HTTP status the server answered with. 502/503/504 come from the web server (the service is down or restarting, see below); 500 is in the application log: `sudo journalctl -u init-chatbot -n 50` |
| Everyone shares one rate limit | The proxy is not passing the client IP, or it is on another machine (`FORWARDED_ALLOW_IPS`), or you are behind Cloudflare without restoring the visitor IP |
| Answers are "related articles only" | Every model in the chain is out of daily quota, or the model IDs are wrong. Check `"models"` in `/health` and `sudo journalctl -u init-chatbot -n 50` |
| A fallback model shows `"off": true` in `/health` from the start | Your key cannot use that model ID. List the IDs (see [Choosing Gemini models](#choosing-gemini-models)) and fix `GEN_FALLBACK_MODELS` |
| Indexing stops with a quota message | Normal on the free tier. It resumes at the next scheduled run |
| `Could not fetch 'posts'` | The WordPress REST API is disabled or blocked by a security plugin/WAF for this server |

## Uninstall

```bash
sudo systemctl disable --now init-chatbot
sudo rm /etc/systemd/system/init-chatbot.service && sudo systemctl daemon-reload
crontab -l | grep -v reindex.sh | crontab -
```

Then remove the Init Chatbot block or site file you added to your web server, reload it, and delete the project folder.

## Project layout

```
setup.sh          installer (run once)
env.example       configuration template
app.py            web app: small talk, hybrid search, model chain, caches, links, protection layer
index.py          WordPress crawler, chunking, embeddings
common.py         Gemini API client and rate pacing
db.py             SQLite schema
widget.js         chat widget (readable)
widget.min.js     chat widget (minified, served to visitors)
reindex.sh        scheduled re-index (run by cron)
CHANGELOG.md      release notes
diagnose.sh       troubleshooting report
webserver/        ready-made Nginx / Apache / Caddy configs (written by setup.sh; sources in templates/)
```

## Limitations

- Content is read from the WordPress REST API. Private and draft posts are not indexed, and custom post types are indexed only when they are exposed in the REST API (`show_in_rest`).
- Built for one site (or one set of language versions via `SITES`) per installation, and the search index is held in memory, which suits small and medium sites (thousands of posts).
- The installer targets Ubuntu 24.04. HTTPS is handled by the web server you connect.
