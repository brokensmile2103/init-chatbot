"""Google Gemini API client (embeddings + answer generation) with rate-limit handling."""
import os, re, sys, time
from collections import deque
import numpy as np
import requests

KEY = os.getenv("GEMINI_API_KEY", "")
if not KEY or "PASTE_YOUR" in KEY:
    sys.exit("GEMINI_API_KEY is missing. Set it in .env")
EMB = os.getenv("EMB_MODEL", "gemini-embedding-001").removeprefix("models/")
GEN = os.getenv("GEN_MODEL", "gemini-3.5-flash-lite").removeprefix("models/")
DIM = int(os.getenv("EMB_DIM", "768"))
CPT = float(os.getenv("EMB_CHARS_PER_TOKEN", "2.5"))   # conservative estimate, safe for Vietnamese too
BASE = "https://generativelanguage.googleapis.com/v1beta/models"

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "Mozilla/5.0 (compatible; InitChatbot/1.0)"
_adapter = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=16, max_retries=0)
SESSION.mount("https://", _adapter)
SESSION.mount("http://", _adapter)


class APIError(Exception): pass
class QuotaError(Exception): pass          # per-minute limit reached
class DailyQuota(QuotaError): pass         # per-day limit reached
class ModelMissing(APIError): pass         # wrong or retired model ID (HTTP 404)


def est_tokens(text):
    return int(len(text) / CPT) + 8


def _retry_delay(txt):
    m = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', txt)
    return min(float(m.group(1)) if m else 30.0, 120.0)


def post(model, method, payload, retries=3, wait429=True, timeout=60):
    url = f"{BASE}/{model}:{method}"
    for n in range(retries):
        last = n == retries - 1
        try:
            r = SESSION.post(url, json=payload, timeout=timeout, headers={"x-goog-api-key": KEY})
        except requests.RequestException as e:
            if last: raise APIError(f"Network error: {e}")
            time.sleep(2 * (n + 1)); continue
        if r.ok:
            return r.json()
        txt = r.text
        if r.status_code == 429:
            if "perday" in txt.lower().replace(" ", ""):
                raise DailyQuota(txt[:300])
            if wait429 and not last:
                time.sleep(_retry_delay(txt) + 1); continue
            raise QuotaError(txt[:300])
        if r.status_code >= 500 and not last:
            time.sleep(3 * (n + 1)); continue
        if r.status_code == 404: raise ModelMissing(f"HTTP 404 ({model}): {txt[:200]}")
        raise APIError(f"HTTP {r.status_code}: {txt[:300]}")


def embed(texts, task, retries=3, wait429=True, timeout=60):
    j = post(EMB, "batchEmbedContents", retries=retries, wait429=wait429, timeout=timeout, payload={
        "requests": [{"model": f"models/{EMB}", "content": {"parts": [{"text": t}]},
                      "taskType": task, "outputDimensionality": DIM} for t in texts]})
    v = np.array([e["values"] for e in j["embeddings"]], dtype="float32")
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)


def _thinking_cfg(model):
    """thinkingLevel only exists on Gemini 3.x and thinkingBudget on 2.x; sending the
    wrong one is an HTTP 400. Choosing by model name lets a fallback model of another
    generation work with the same .env."""
    think = {}
    lvl, bud = os.getenv("GEN_THINKING_LEVEL"), os.getenv("GEN_THINKING_BUDGET")
    if model.startswith("gemini-2"):
        if bud: think["thinkingBudget"] = int(bud)
    else:
        if lvl: think["thinkingLevel"] = lvl
        elif bud: think["thinkingBudget"] = int(bud)
    return think


def generate(system, prompt, model=None, timeout=None):
    model = (model or GEN).removeprefix("models/")
    cfg = {"temperature": float(os.getenv("GEN_TEMPERATURE", "0.2")), "maxOutputTokens": int(os.getenv("GEN_MAX_TOKENS", "1024"))}
    think = _thinking_cfg(model)
    if think: cfg["thinkingConfig"] = think
    # One attempt per model: on failure the app moves on to the next fallback model
    # instead of retrying the same one and making the visitor wait.
    j = post(model, "generateContent", retries=1, wait429=False, timeout=timeout or int(os.getenv("GEN_TIMEOUT", "25")), payload={
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": cfg})
    cand = (j.get("candidates") or [{}])[0]
    parts = (cand.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
    return text, cand.get("finishReason")


class Pacer:
    """Sliding 60-second window so we stay under the tokens-per-minute / requests-per-minute limits."""
    def __init__(self, tpm, rpm):
        self.tpm, self.rpm, self.log = tpm, rpm, deque()

    def wait(self, tokens):
        while True:
            now = time.time()
            while self.log and now - self.log[0][0] >= 60: self.log.popleft()
            used = sum(t for _, t in self.log)
            if (not self.log or used + tokens <= self.tpm) and len(self.log) < self.rpm:
                break
            time.sleep(max(self.log[0][0] + 60 - now, 0) + 0.5)
        self.log.append((time.time(), tokens))
