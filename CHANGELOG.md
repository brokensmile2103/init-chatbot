# Changelog

Earlier releases were not recorded here.

## 2026-10-01

Brings the improvements made in the Init HTML edition into the public release. Nothing in `.env`
has to change; the new settings below are optional.

### Search

- **Find an article by its name.** The title index now treats only distinctive words as a signal
  (words that many titles share, such as "plugin" or "wordpress", are ignored) and can add an
  article that neither keyword nor vector search returned. `TITLE_BOOST` now defaults to `0.25`
  (it was `0.15` and counted every shared word). New: `HEAD_BOOST` (the name at the start of a
  title, as in "Name - tagline") and `TITLE_GENERIC_DF` (what counts as a generic word).
- A question made only of stop words no longer produces an empty keyword query.
- The keyword query also includes the phrase made of the question's key words, not only the whole
  question, so how-to titles match even when the question has "how to" or "là gì" around it.
- If SQLite FTS5 rejects the full query, a plain OR query of the key words is tried instead of
  returning nothing.

### Answers

- The prompt tells the model to introduce a tool, plugin or feature from its own article when the
  question is just "What is X?", and to say "no article" only when no document mentions X.
- A "we have no article on that" reply is not cached (a new article is found immediately).
- `CACHE_VER` (default `v1`) versions the answer cache. Change it to discard all cached answers.
  The first start after upgrading clears the old answers once. `/health` shows the version.
- A gap left before punctuation when a duplicate `[[n]]` link is dropped is closed, never inside
  code blocks.
- Small talk: "what can you do" style phrases only get the capability reply when nothing else is
  in the message; a real question that contains them is searched. "plugin / theme / cách đó" are
  recognised as follow-up words, and a few more greeting lines were added.

### Widget

- New header button (desktop) for a wider, taller chat window; the choice is remembered.
- Server error messages are shown as sent; a generic error now includes the HTTP status.
- `widget.min.js` rebuilt. Add or bump a version on the script URL (for example `?v=3`) so browsers
  load the new file.

### Installer

- `setup.sh` keeps a copy of the working systemd service file in `.backup/` and puts it back if
  the service does not pass its health check after an upgrade.
