rm social-sidebar.xpi
find chrome chrome.manifest install.rdf | \
    xargs zip -r social-sidebar.xpi

scp social-sidebar.xpi prpl:/home/www/prpl/mrprivacy/social-sidebar-direct.xpi
