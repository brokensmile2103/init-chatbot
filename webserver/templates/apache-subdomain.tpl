# Init Chatbot on its own (sub)domain: __HOST__
# Install:  sudo a2enmod proxy proxy_http
#           sudo cp apache.conf /etc/apache2/sites-available/init-chatbot.conf
#           sudo a2ensite init-chatbot && sudo apachectl configtest && sudo systemctl reload apache2
# HTTPS:    sudo certbot --apache -d __HOST__
<VirtualHost *:80>
    ServerName __HOST__

    ProxyRequests Off
    ProxyPreserveHost On
    ProxyTimeout 60
    LimitRequestBody 8192

    ProxyPass / http://127.0.0.1:__PORT__/
    ProxyPassReverse / http://127.0.0.1:__PORT__/
</VirtualHost>
