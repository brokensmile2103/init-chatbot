# Init Chatbot on its own (sub)domain: __HOST__  (Caddy issues the HTTPS certificate automatically)
# Add this to your Caddyfile, then: sudo systemctl reload caddy
__HOST__ {
    encode zstd gzip
    reverse_proxy 127.0.0.1:__PORT__
}
