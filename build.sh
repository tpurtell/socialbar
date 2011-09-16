TOP=`pwd`
#cd chrome/content
#java -jar $TOP/compiler.jar --compilation_level ADVANCED_OPTIMIZATIONS --js ssb.js --js email.js --js utils.js --externs jquery.min.js --externs jquery-ui.min.js --externs jquery.scrollTo.min.js > ssb.min.js

#sed 's/"\([a-zA-Z0-9\-\.]*\)\.js"/"\1.min.js"/g' < ssb.html > ssb.min.html
#cd $TOP

# TODO, remove unminified

rm -f social-sidebar.xpi
find chrome chrome.manifest install.rdf | \
    xargs zip -r social-sidebar.xpi

