import os, sqlite3, time

PATH = os.getenv("DB_PATH") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "chatbot.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY, hash TEXT NOT NULL, title TEXT, head TEXT, url TEXT, text TEXT, lang TEXT NOT NULL DEFAULT 'en', date TEXT);
CREATE INDEX IF NOT EXISTS chunks_hash ON chunks(hash);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(title, body, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS emb(hash TEXT PRIMARY KEY, v BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
"""


def connect_rw():
    con = sqlite3.connect(PATH, timeout=30)
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    # Upgrade databases created by older releases (before the lang/date columns).
    # Existing rows and embeddings are kept; nothing needs to be embedded again.
    for stmt in ("ALTER TABLE chunks ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'",
                 "ALTER TABLE chunks ADD COLUMN date TEXT"):
        try:
            con.execute(stmt)
        except sqlite3.OperationalError:
            pass   # column already exists
    return con


def connect_read():
    con = sqlite3.connect(PATH, timeout=10)
    con.execute("PRAGMA query_only=ON")     # the web app never writes to the database
    return con


def bump(con):
    con.execute("INSERT OR REPLACE INTO meta VALUES('version', ?)", (str(time.time_ns()),))
