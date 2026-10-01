# Init Chatbot under __PATH__/ on your existing Caddy site.
# Paste this INSIDE your existing site block, before any catch-all handler, then: sudo systemctl reload caddy
handle_path __PATH__/* {
    reverse_proxy 127.0.0.1:__PORT__
}
