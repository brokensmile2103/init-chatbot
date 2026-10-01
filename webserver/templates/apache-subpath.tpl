# Init Chatbot under __PATH__/ on your existing site.
# Paste these lines INSIDE your existing <VirtualHost> block, then:
#           sudo a2enmod proxy proxy_http
#           sudo apachectl configtest && sudo systemctl reload apache2
# If your <VirtualHost> has its own catch-all RewriteRule (not one in .htaccess), add this line above that rule so it skips the chatbot:
#           RewriteCond %{REQUEST_URI} !^__PATH__/
ProxyPass __PATH__/ http://127.0.0.1:__PORT__/
ProxyPassReverse __PATH__/ http://127.0.0.1:__PORT__/
<Location __PATH__/>
    LimitRequestBody 8192
</Location>
