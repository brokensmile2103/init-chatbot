"""Crawl WordPress (REST API) -> split into chunks -> SQLite (keyword index is ready immediately) -> embeddings, saved batch by batch.
Safe to run repeatedly: only missing embeddings are computed.
Exit codes: 0 = complete, 2 = incomplete because of API quota, 3 = another run is active, anything else = error."""
import os, re, sys, time, html, fcntl, hashlib, argparse
import common, db
from common import EMB, DIM, DailyQuota, QuotaError, APIError, Pacer, est_tokens

ap = argparse.ArgumentParser()
ap.add_argument("--no-embed", action="store_true", help="only build the keyword index (no API calls)")
ap.add_argument("--force", action="store_true", help="skip the 'chunk count dropped by half' safety check")
args = ap.parse_args()

BLOG = os.getenv("BLOG_URL", "").rstrip("/")
DEFAULT_LANG = "vi" if os.getenv("DEFAULT_LANG", "en").lower().startswith("vi") else "en"
# Optional: several sites / languages in one index, for example a WordPress
# multisite with a translated copy:  SITES=en=https://example.com,vi=https://vi.example.com
# When set, it replaces BLOG_URL. Each chunk remembers its language so the app
# can prefer links from the same language as the page the widget runs on.
SITES_RAW = os.getenv("SITES", "").strip()
if SITES_RAW:
    SITES = []
    for part in SITES_RAW.split(","):
        part = part.strip()
        if not part: continue
        if "=" not in part:
            sys.exit(f"SITES has a bad entry '{part}'. Use: en=https://example.com,vi=https://vi.example.com")
        lang, url = part.split("=", 1)
        SITES.append((lang.strip().lower(), url.strip().rstrip("/")))
else:
    if not BLOG:
        sys.exit("BLOG_URL (or SITES) is missing in .env")
    SITES = [(DEFAULT_LANG, BLOG)]
CHUNK = int(os.getenv("CHUNK_SIZE", "1800"))
WP_TYPES = [t.strip() for t in os.getenv("WP_TYPES", "posts").split(",") if t.strip()]
EMB_TPM = int(os.getenv("EMB_TPM", "24000"))
EMB_RPM = int(os.getenv("EMB_RPM", "60"))
BATCH_ITEMS = int(os.getenv("EMB_BATCH_ITEMS", "50"))
BATCH_TOKENS = min(int(os.getenv("EMB_BATCH_TOKENS", "8000")), EMB_TPM)

lock = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.lock"), "w")
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print("Another indexing run is already active, skipping."); sys.exit(3)


# ---------- 1. Fetch ----------
def fetch(kind, BLOG):
    out, page = [], 1
    while True:
        try:
            r = common.SESSION.get(f"{BLOG}/wp-json/wp/v2/{kind}", timeout=60,
                                   params={"per_page": 50, "page": page, "_fields": "id,title,link,content,date"})
        except common.requests.RequestException as e:
            sys.exit(f"Could not reach {BLOG}: {type(e).__name__}. Check BLOG_URL and that this server can open the site (DNS, firewall, Cloudflare/WAF).")
        if r.status_code != 200:
            if page == 1:
                sys.exit(f"Could not fetch '{kind}' from {BLOG} (HTTP {r.status_code}). "
                         "Check BLOG_URL, that the WordPress REST API is enabled, and that no firewall/WAF blocks this server.")
            break
        try:
            items = r.json()
        except ValueError:
            sys.exit(f"{BLOG} did not return JSON (a WAF or Cloudflare rule may be blocking this server).")
        if not items: break
        out += items
        total = int(r.headers.get("X-WP-TotalPages", "0") or 0)
        if total and page >= total: break
        page += 1
    return out


# ---------- 2. Chunking ----------
def to_paras(h):
    h = re.sub(r"(?is)<(script|style|noscript|svg|iframe)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|blockquote|pre|figcaption)>", "\n", h)
    h = re.sub(r"(?i)<h[1-6][^>]*>", "\n\n## ", h)
    h = html.unescape(re.sub(r"<[^>]+>", " ", h))
    h = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", h)             # control characters
    h = re.sub(r"\[/?[a-zA-Z_-]+[^\]]*\]", " ", h)                      # WordPress shortcodes
    lines = (re.sub(r"[ \t\u00a0]+", " ", l).strip() for l in h.split("\n"))
    return [l for l in lines if l]


def split_long(p, size):
    if len(p) <= size: return [p]
    out, cur = [], ""
    for s in re.split(r"(?<=[.!?…])\s+", p):
        while len(s) > size:
            if cur: out.append(cur); cur = ""
            out.append(s[:size]); s = s[size:]
        if cur and len(cur) + len(s) + 1 > size: out.append(cur); cur = s
        else: cur = (cur + " " + s).strip()
    if cur: out.append(cur)
    return out


def chunk_post(paras, size):
    out, buf, n, head, start = [], [], 0, "", ""
    def flush():
        nonlocal buf, n
        if buf: out.append((start, "\n".join(buf))); buf, n = [], 0
    for p in paras:
        if p.startswith("## "):
            h = p[3:].strip()
            if n >= size * 0.5: flush()
            head = h
            if not buf: start = head
            buf.append(h); n += len(h) + 1
            continue
        for piece in split_long(p, size):
            if buf and n + len(piece) + 1 > size: flush()
            if not buf: start = head
            buf.append(piece); n += len(piece) + 1
    flush()
    return out


print(f"Fetching {', '.join(WP_TYPES)} from {', '.join(f'{l}={u}' for l, u in SITES)} ...", flush=True)
rows = []   # (hash, title, head, url, text, embedding_text, lang, date)
posts = 0
for lang, blog in SITES:
    site_posts = 0
    for kind in WP_TYPES:
        for p in fetch(kind, blog):
            title = html.unescape(re.sub(r"<[^>]+>", "", p["title"]["rendered"])).strip()
            if not re.match(r"https?://", p.get("link", "")): continue
            paras = to_paras(p["content"]["rendered"])
            if not paras: continue
            posts += 1; site_posts += 1
            date = p.get("date") or None   # ISO 8601; only used to slightly favour newer articles
            for head, text in chunk_post(paras, CHUNK):
                if len(text) < 30 and len(paras) > 1: continue
                etxt = title + (f" › {head}" if head and head != title else "") + "\n" + text
                # The hash formula must not change (lang/date are NOT part of it), so
                # upgrading keeps every existing embedding instead of re-embedding.
                h = hashlib.sha1(f"{EMB}|{DIM}|{etxt}".encode()).hexdigest()
                rows.append((h, title, head, p["link"], text, etxt, lang, date))
    if len(SITES) > 1: print(f"  {lang}: {site_posts} items", flush=True)
if not rows:
    sys.exit("No content to index.")
print(f"{posts} items -> {len(rows)} chunks", flush=True)

# ---------- 3. Write SQLite + keyword index (no API needed) ----------
con = db.connect_rw()
old = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
if old >= 50 and len(rows) < old * 0.5 and not args.force:
    sys.exit(f"Stopped: chunk count dropped from {old} to {len(rows)} (the site may be having problems). Use --force if this is intended.")
with con:
    con.execute("DELETE FROM chunks"); con.execute("DELETE FROM fts")
    for i, (h, title, head, url, text, _, lang, date) in enumerate(rows, 1):
        con.execute("INSERT INTO chunks(id,hash,title,head,url,text,lang,date) VALUES(?,?,?,?,?,?,?,?)", (i, h, title, head, url, text, lang, date))
        con.execute("INSERT INTO fts(rowid,title,body) VALUES(?,?,?)", (i, title, (head + "\n" if head else "") + text))
    db.bump(con)
print("Keyword index updated (the chatbot can already answer).", flush=True)
if args.no_embed:
    sys.exit(0)

# ---------- 4. Embeddings, saved after every batch ----------
have = {r[0] for r in con.execute("SELECT hash FROM emb")}
todo, seen = [], set()
for r in rows:
    if r[0] not in have and r[0] not in seen:
        seen.add(r[0]); todo.append(r)
total_tok = sum(est_tokens(r[5]) for r in todo)
print(f"{len(todo)} chunks need embeddings (~{total_tok:,} tokens, estimated).", flush=True)


def batches(items):
    b, t = [], 0
    for it in items:
        k = est_tokens(it[5])
        if b and (len(b) >= BATCH_ITEMS or t + k > BATCH_TOKENS):
            yield b; b, t = [], 0
        b.append(it); t += k
    if b: yield b


pacer, done, t0, incomplete = Pacer(EMB_TPM, EMB_RPM), 0, time.time(), False
for b in batches(todo):
    pacer.wait(sum(est_tokens(x[5]) for x in b))
    try:
        vs = common.embed([x[5] for x in b], "RETRIEVAL_DOCUMENT")
    except DailyQuota as e:
        print("DAILY Gemini quota reached. Progress is saved; the next run continues from here.\n" + str(e)[:200], flush=True)
        incomplete = True; break
    except QuotaError as e:
        print("Still rate limited per minute after several retries. Progress is saved.\n" + str(e)[:200], flush=True)
        incomplete = True; break
    except APIError as e:
        if done == 0: sys.exit(f"API error (check GEMINI_API_KEY / EMB_MODEL): {e}")
        print(f"API error: {e}. Progress is saved.", flush=True); incomplete = True; break
    with con:
        con.executemany("INSERT OR REPLACE INTO emb VALUES(?,?)", [(x[0], v.tobytes()) for x, v in zip(b, vs)])
        db.bump(con)
    done += len(b)
    eta = (time.time() - t0) / done * (len(todo) - done)
    print(f"  {done}/{len(todo)} chunks | about {eta/60:.0f} min left", flush=True)

n_vec = con.execute("SELECT COUNT(*) FROM chunks c JOIN emb e ON e.hash=c.hash").fetchone()[0]
print(f"Result: {n_vec}/{len(rows)} chunks have embeddings.", flush=True)
if incomplete:
    print("INCOMPLETE: the rest will be filled in by the next scheduled run. Keyword search works in the meantime.")
    sys.exit(2)
cur = {r[0] for r in rows}
stale = [(h,) for (h,) in con.execute("SELECT hash FROM emb") if h not in cur]
if stale:
    with con: con.executemany("DELETE FROM emb WHERE hash=?", stale)
print("Done.")
