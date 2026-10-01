# Init Chatbot under __PATH__/ on your existing site (for example a WordPress LEMP server).
# Paste this location block INSIDE your existing "server { ... }" block, then:
#           sudo nginx -t && sudo systemctl reload nginx
# ^~ matters: it stops regex rules such as "location ~* \.(js|css)$" from catching __PATH__/widget.min.js.
location ^~ __PATH__/ {
    client_max_body_size 8k;
    proxy_pass http://127.0.0.1:__PORT__/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
