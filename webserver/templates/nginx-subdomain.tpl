# Init Chatbot on its own (sub)domain: __HOST__
# Install:  sudo cp nginx.conf /etc/nginx/sites-available/init-chatbot
#           sudo ln -s /etc/nginx/sites-available/init-chatbot /etc/nginx/sites-enabled/
#           sudo nginx -t && sudo systemctl reload nginx
# HTTPS:    sudo certbot --nginx -d __HOST__
server {
    listen 80;
    server_name __HOST__;

    client_max_body_size 8k;

    location / {
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
