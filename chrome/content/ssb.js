var prefs = undefined;
if(typeof Components != "undefined") {
    try {
        var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
        loader.loadSubScript("resource://people/modules/people.js");
    } catch(err) {}
    try {
        var ps = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService);
        var prefs = ps.getBranch("extensions.socialsidebar.");
    } catch(err) {}
}

var TAB_RECENT = 0;
var TAB_PLACE = 1;
var TAB_PROFILE = 2;
var TAB_FRIENDS = 3;
/** @const */ var debug = false;
/** @const */ var allow_multiple_tos = true;

var use_contacts = false;

/**
 * @constructor
 * @param {string} id
 * @param {string} name
 * @param {string} photo_url
 */
function SBPerson(id, name, photo_url) {
    this.ids = [];
    if(id != undefined)
        this.ids.push(id);
    this.name = name;   
    this.photo_url = photo_url;
}
SBPerson.prototype.assert = function() {
    if(debug) {
        if(person.ids.length < 1) throw('Person must have at least 1 id');
        if(person.name == undefined) throw('Person must have a name');
    }
}
/**
 * @constructor
 * @param {Date} time
 * @param {string} from
 * @param {Array.<string>} to
 * @param {Item} related_item
 * @param {Object} data
 */
function Item(time, from, to, related_item, data) {
    this.id = data["id"];
    if(this.id == undefined) {
        alert('missing item uuid');
        this.id = uuid();
    }
    this.time = time;
    this.from = from;
    this.to = to;
    this.related_item = related_item;
    if(data != undefined)
        this.data = data;
    else
        this.data = {};
};
Item.prototype.assert = function() {
    if(debug) {
        if(item.id == undefined) throw('id for Item must be defined');
        if(item.time == undefined) throw('time for Item must be defined');
        if(item.from == undefined) throw('from for Item must be defined');
        if(item.to == undefined) throw('to for Item must be defined');
        if(item.to.length < 1) throw('to for Item must have at least one member');
    }
};

function Profile(time, from, to, related_item, data) {
    this.id = data["id"];
    if(this.id == undefined) {
        //alert('missing item uuid');
        this.id = uuid();
    }
    this.time = time;
    this.from = from;
    this.to = to;
    this.related_item = related_item;
    if(data != undefined)
        this.data = data;
    else
        this.data = {};
};

//Contains profile's "data" as data
function Request(time, from, to, related_item, data) {
    this.id = data["id"];
    if(this.id == undefined) {
        alert('missing item uuid');
        this.id = uuid();
    }
    this.time = time;
    this.from = from;
    this.to = to;
    this.related_item = related_item;
    if(data != undefined)
        this.data = data;
    else
        this.data = {};
};
Profile.prototype.assert = function() {
    if(debug) {
        if(profile.id == undefined) throw('id for Item must be defined');
        if(profile.time == undefined) throw('time for Item must be defined');
        if(profile.from == undefined) throw('from for Item must be defined');
        if(profile.to == undefined) throw('to for Item must be defined');
        if(profile.to.length < 1) throw('to for Item must have at least one member');
    }
};
//Contains lists such as data["friends"], data["family"], etc. 
function ListCollection(time, from, to, related_item, data) {
    this.id = data["id"];
    if(this.id == undefined) {
        //alert('missing item uuid');
        this.id = uuid();
    }
    this.time = time;
    this.from = from;
    this.to = to;
    this.related_item = related_item;
    if(data != undefined)
        this.data = data;
    else
        this.data = {};
};

/**
 * @interface
 */
function DataSource() {}

/**
 * @param {number} start_token
 * @param {function(Array.<Items>)} on_success
 * @param {function(string)} on_error
 */
DataSource.prototype.getNewItems = function(start_token, on_success, on_error) {};
/**
 * @param {Date} starting_time
 * @param {function(SBPerson)} on_success
 * @param {function(string)} on_error
 */
DataSource.prototype.getPersonInfo = function(id, on_success, on_error) {};
/**
 * @param {Object.<string, string>} options
 * @param {function()} on_success
 * @param {function(string)} on_error
 */
DataSource.prototype.connect = function(options, on_success, on_error) {};
/**
 * @param {function()} on_success
 */
DataSource.prototype.disconnect = function(on_success) {};
/**
 * @return {boolean} isConnected
 */
DataSource.prototype.isConnected = function() {};
/**
 * @return {boolean} isConnected
 */
DataSource.prototype.isOffline = function() {};
/**
 * @return {string} getEmail
 */
DataSource.prototype.getEmail = function() {};

function deep_copy(obj) {
    return $.extend({}, obj);
};
function shallow_copy(obj) {
    return $.extend(true, {}, obj);
};


function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    }).toUpperCase();    
};

/**
 * @constructor
 * @implements {DataSource}
 */
function MrPrivacyDataSource() {
    this.mrp = undefined;
    this.options = undefined;
    this.connected = undefined;
};

MrPrivacyDataSource.prototype.getListCollections = function(id, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to fetch new messages");
    var hits = this.mrp.list(id, "edu.stanford.prpl.socialbar.profile.lists");

    var list_cols = [];
    
    var max_uid = id;
    for(var i = 0; i < hits.length; ++i) {
        var hit = this.mrp.get(hits[i]);
        if(hit == undefined)
            continue;
        list_cols.push(new ListCollection(hit.date, hit.from, hit.to, undefined, hit.obj));
        if(max_uid == undefined || max_uid < hits[i])
            max_uid = hits[i];
    }
    if(list_cols.length > 0) {
        on_success(list_cols, max_uid + 1);
    } else {
        if(id == undefined) {
            //return a blank list if we weren't given a referece id
            // This means that the user hasn't set up any list collections so we initialize an empty one for them
            var new_data = {};
            new_data["id"] = uuid();
            new_data["friends"] = {};
            var brand_new = new ListCollection(new Date(), this.options['email'], this.options['email'], undefined, new_data);
            on_success([brand_new], 0);
        } else {
            this.mrp.wait(id, "edu.stanford.prpl.socialbar.profile.lists", bind(this.getListCollections, this, id, on_success, on_error));
        }
    }
    
};
MrPrivacyDataSource.prototype.sendListCollection = function(to, data, previous_items, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to send a messages");
    var smtp_client = this.smtp_client;

    var from = this.options['email'];
    var real_to = to.slice(0);
    real_to.push(this.options['email']);
    real_to = elimateDuplicateAddreses(real_to);

    var subject = "List Collection";
    
    data["id"] = uuid();
        
    var html = "<html><head></head><body>\n";
    html += "This email contains all of your lists, including Friends."
    html += "</body></html>\n";
    
    var txt = "Friends: ";
    for(var f in this.friends) {
        txt += "" + f + "\n";
    }
    this.mrp.send("edu.stanford.prpl.socialbar.profile.lists", real_to, subject, undefined, html, txt, data, 
        function() {
            on_success(new ListCollection(new Date(), from, real_to, undefined, data));
        },
        function(msg) {
            on_error("Failed to send message", msg);
        }
    );
};
MrPrivacyDataSource.prototype.getProfiles = function(id, on_success, on_error) {

    if(!this.mrp)
        on_error("You must be connected to fetch new messages");
    var hits = this.mrp.list(id, "edu.stanford.prpl.socialbar.profile");

    var profiles = [];
    var max_uid = id;
    for(var i = 0; i < hits.length; ++i) {
        var hit = this.mrp.get(hits[i]);
        if(hit == undefined)
            continue;
        profiles.push(new Profile(hit.date, hit.from, hit.to, undefined, hit.obj));
        if(max_uid == undefined || max_uid < hits[i])
            max_uid = hits[i];
    }
    if(profiles.length > 0) {
        on_success(profiles, max_uid + 1);
    } else {
        if(id == undefined) {
            //return a blank list if we weren't given a referece id
            on_success(profiles, 0);
        } else {
            this.mrp.wait(id, "edu.stanford.prpl.socialbar.profile", bind(this.getProfiles, this, id, on_success, on_error));
        }
    }
    
};
MrPrivacyDataSource.prototype.sendProfile = function(to, data, previous_items, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to send a messages");
    var smtp_client = this.smtp_client;

    var from = this.options['email'];
    var real_to = to.slice(0);
    real_to.push(this.options['email']);
    real_to = elimateDuplicateAddreses(real_to);

    var subject = "Profile: " + data["first_name"] + " " + data["last_name"];
    
    if(previous_items.length > 0)
        subject = "Re: " + subject;

    data["id"] = uuid();
        
    var html = "<html><head></head><body>\n";
    html += data["first_name"] + " has sent you an updated profile."
    html += "</body></html>\n";
    
    var txt = "";
    this.mrp.send("edu.stanford.prpl.socialbar.profile", real_to, subject, undefined, html, txt, data, 
        function() {
            on_success(new Profile(new Date(), from, real_to, undefined, data));
        },
        function(msg) {
            on_error("Failed to send message", msg);
        }
    );
};
MrPrivacyDataSource.prototype.sendFriendRequest = function(to, data, previous_items, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to send a messages");
    var smtp_client = this.smtp_client;
    var to2 = to.split(/,\s*/);
    var from = this.options['email'];
    var real_to = to2.slice(0);
    real_to.push(this.options['email']);
    real_to = elimateDuplicateAddreses(real_to);

    var name = data.first_name + " " + data.last_name;
    var subject = "Friend request from " + name;
   
    data["id"] = uuid();
    
    var html = "<html><head></head><body>\n";
    html += "You have recieved a profile sharing request from " + name + ".<br/>";
    html += "Open SocialBar to accept/decline request and view " + data.first_name + "'s profile";
    html += "</body></html>\n";
    
    var txt = "";
    this.mrp.send("edu.stanford.prpl.socialbar.friendrequest", real_to, subject, undefined, html, txt, data, 
        function() {
            on_success(new Request(new Date(), from, real_to, undefined, data));
        },
        function(msg) {
            on_error("Failed to send friend request", undefined);
        }
    );
};
MrPrivacyDataSource.prototype.getFriendRequests = function(start_token, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to fetch new messages");
    var hits = this.mrp.list(start_token, "edu.stanford.prpl.socialbar.friendrequest");
    var requests = [];
    var max_uid = start_token;
    for(var i = 0; i < hits.length; ++i) {
        var hit = this.mrp.get(hits[i]);
        if(hit == undefined)
            continue;
        requests.push(new Request(hit.date, hit.from, hit.to, undefined, hit.obj));
        if(max_uid == undefined || max_uid < hits[i])
            max_uid = hits[i];
    }
    if(requests.length > 0) {
        on_success(requests, max_uid + 1);
    } else {
        if(start_token == undefined) {
            //return a blank list if we weren't given a referece id
            on_success(requests, 0);
        } else {
            this.mrp.wait(start_token, "edu.stanford.prpl.socialbar.friendrequest", bind(this.getFriendRequests, this, start_token, on_success, on_error));
        }
    }
    
};

MrPrivacyDataSource.prototype.getNewItems = function(start_token, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to fetch new messages");
    var hits = this.mrp.list(start_token, "edu.stanford.prpl.socialbar");
    var items = [];
    var max_uid = start_token;
    for(var i = 0; i < hits.length; ++i) {
        ///// Integration Point /////
        var hit = this.mrp.get(hits[i]);
        if(hit == undefined)
            continue;
        items.push(new Item(hit.date, hit.from, hit.to, undefined, hit.obj));
        if(max_uid == undefined || max_uid < hits[i])
            max_uid = hits[i];
    }
    if(items.length > 0) {
        on_success(items, max_uid + 1);
    } else {
        if(start_token == undefined) {
            //return a blank list if we weren't given a referece id
            on_success(items, 0);
        } else {
            ///// Integration Point /////
            this.mrp.wait(start_token, "edu.stanford.prpl.socialbar", bind(this.getNewItems, this, start_token, on_success, on_error));
        }
    }
    
};
MrPrivacyDataSource.prototype.postItem = function(to, data, previous_items, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to send a messages");
    var smtp_client = this.smtp_client;

    var from = this.options['email'];
    var real_to = to.slice(0);
    real_to.push(this.options['email']);
    real_to = elimateDuplicateAddreses(real_to);

    var subject = "Link: " + data["title"];
    
    if(previous_items.length > 0)
        subject = "Re: " + subject;

    var html = "<html><head></head><body>\n";
    html += "<p><a href=\"" + data["url"] +"\">" + data["url"] + "</a></p>\n";
    data["id"] = uuid();
    for(var i = 0; i < previous_items.length; ++i) {
        if(previous_items[i].data["comment"]) {
            html += "<div style=\"float:left\"><i>" + previous_items[i].from + "</i></div>:&nbsp;&nbsp;&nbsp;" + textToHtml(previous_items[i].data["comment"]) + "\n";
            html += "<div style=\"clear:both\"></div>\n";
        }
    }
    if(data["comment"]) {
        html += "<div style=\"float:left\"><i>" + this.options['email'] + "</i></div>:&nbsp;&nbsp;&nbsp;" + textToHtml(data["comment"]) + "\n";
        html += "<div style=\"clear:both\"></div>\n";
    }
    html += "<br>\n";
    html += "<font size=\"-2\">Shared from the <a href=\"http://mobisocial.stanford.edu/socialbar/\">Social Sidebar</a>";
    html += " for <a href=\"http://www.mozilla.com\">Mozilla Firefox</a> using <a href=\"http://mrprivacy.me\">Mr. Privacy</a></font>\n"
    html += "</body></html>\n";

    var txt = data["url"] + "\n";
    txt += "\n";
    for(var i = 0; i < previous_items.length; ++i) {
        if(previous_items[i].data["comment"]) {
            txt += previous_items[i].from + ": " + previous_items[i].data["comment"] + "\n";
        }
    }
    if(data["comment"]) {
        txt += this.options['email'] + ": " + data['comment'] + "\n";
    }
    txt += "\n";
    txt += "Shared from the Social Sidebar (http://mobisocial.stanford.edu/socialbar/)";
    txt += " for Mozilla Firefox (http://www.mozilla.com) using Mr. Privacy (http://mrprivacy.me)";
    
    this.mrp.send("edu.stanford.prpl.socialbar", real_to, subject, undefined, html, txt, data, 
        function() {
            on_success(new Item(new Date(), from, real_to, undefined, data));
        },
        function(msg) {
            on_error("Failed to send message", msg);
        }
    );
};
MrPrivacyDataSource.prototype.getPersonInfo = function(id, on_success, on_error) {
    on_error("Person Information", "Not Implemented Yet");
};
MrPrivacyDataSource.prototype.isConnected = function() {
    return this.connected;
};
MrPrivacyDataSource.prototype.isOffline = function() {
    return !this.connected || !this.mrp || !this.mrp.isOnline();
};
MrPrivacyDataSource.prototype.getEmail = function() {
    return this.options['email'];
};

MrPrivacyDataSource.prototype.connect = function(options, on_success, on_error, on_offline_toggle) {
    if(this.mrp)
        on_error("You are already connected");

    this.mrp = new MrPrivacyClient();

    var ds = this;
    this.options = deep_copy(options);
    this.mrp.connect(this.options, 
        function() { 
            ds.connected = true;
            on_success();
        }, function(e) { 
            ds.connected = false;
            ds.mrp = undefined;
            on_error(e);
        }, on_offline_toggle
    );
};
MrPrivacyDataSource.prototype.disconnect = function(on_success) {
    if(this.mrp) {
        this.mrp.disconnect();
        this.mrp = undefined;
    }
    on_success();
};

/**
 * @constructor
 * @implements {DataSource}
 */
function ContactsDataSource() {
    this.mrp = undefined;
    this.connected = undefined;
};
ContactsDataSource.prototype.getNewItems = function(start_token, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to fetch new messages");
    ///// Integration /////
    var hits = this.mrp.list(start_token, "edu.stanford.prpl.socialbar");
    var items = [];
    var max_uid = start_token;
    for(var i = 0; i < hits.length; ++i) {
        ///// Integration Point /////
        var hit = this.mrp.get(hits[i]);
        if(hit == undefined)
            continue;
        items.push(new Item(hit.date, hit.from, hit.to, undefined, hit.obj));
        if(max_uid == undefined || max_uid < hits[i])
            max_uid = hits[i];
    }
    if(items.length > 0) {
        on_success(items, max_uid + 1);
    } else {
        if(start_token == undefined) {
            //return a blank list if we weren't given a referece id
            on_success(items, 0);
        } else {
            ///// Integration Point /////
            this.mrp.wait(start_token, "edu.stanford.prpl.socialbar", bind(this.getNewItems, this, start_token, on_success, on_error));
        }
    }
    
};
ContactsDataSource.prototype.postItem = function(to, data, previous_items, on_success, on_error) {
    if(!this.mrp)
        on_error("You must be connected to send a messages");
    var smtp_client = this.smtp_client;

    var from = this.getEmail();
    var real_to = to.slice(0);
    real_to.push(this.getEmail());
    real_to = elimateDuplicateAddreses(real_to);

    var subject = "Link: " + data["title"];
    
    if(previous_items.length > 0)
        subject = "Re: " + subject;

    var html = "<html><head></head><body>\n";
    html += "<p><a href=\"" + data["url"] +"\">" + data["url"] + "</a></p>\n";
    data["id"] = uuid();
    for(var i = 0; i < previous_items.length; ++i) {
        if(previous_items[i].data["comment"]) {
            html += "<div style=\"float:left\"><i>" + previous_items[i].from + "</i></div>:&nbsp;&nbsp;&nbsp;" + previous_items[i].data["comment"] + "\n";
            html += "<div style=\"clear:both\"></div>\n";
        }
    }
    if(data["comment"]) {
        html += "<div style=\"float:left\"><i>" + this.getEmail() + "</i></div>:&nbsp;&nbsp;&nbsp;" + data["comment"] + "\n";
        html += "<div style=\"clear:both\"></div>\n";
    }
    html += "<br>\n";
    html += "<font size=\"-2\">Shared from the <a href=\"http://mobisocial.stanford.edu/socialbar.php\">Social Sidebar</a>";
    html += " for <a href=\"http://www.mozilla.com\">Mozilla Firefox</a> using <a href=\"http://mrprivacy.me\">Mr. Privacy</a></font>\n"
    html += "</body></html>\n";

    var txt = data["url"] + "\n";
    txt += "\n";
    for(var i = 0; i < previous_items.length; ++i) {
        if(previous_items[i].data["comment"]) {
            txt += previous_items[i].from + ": " + previous_items[i].data["comment"] + "\n";
        }
    }
    if(data["comment"]) {
        txt += this.getEmail() + ": " + data['comment'] + "\n";
    }
    txt += "\n";
    txt += "Shared from the Social Sidebar (http://mobisocial.stanford.edu/socialbar.php)";
    txt += " for Mozilla Firefox (http://www.mozilla.com) using Mr. Privacy (http://mrprivacy.me)";
    
    
    ///// Integration /////
    this.mrp.send("edu.stanford.prpl.socialbar", real_to, subject, undefined, html, txt, data, 
        function() {
            on_success(new Item(new Date(), from, real_to, undefined, data));
        },
        function(msg) {
            on_error("Failed to send message", msg);
        }
    );
};
ContactsDataSource.prototype.getPersonInfo = function(id, on_success, on_error) {
    on_error("Person Information", "Not Implemented Yet");
};
ContactsDataSource.prototype.isConnected = function() {
    return true;
};
ContactsDataSource.prototype.isOffline = function() {
    ///// Integration /////
    return false;
};
ContactsDataSource.prototype.getEmail = function() {
    ///// Integration /////
    return "test@devnull.com";
};

if(use_contacts) {
    data_source = new ContactsDataSource();  
} else {
    data_source = new MrPrivacyDataSource();    
}

/**
 * @constructor
 */
function Manager(data_source) {
    this.data_source = data_source;
    this.people = {};
    this.items = {};
    this.root_items = {};
    this.loaded_upto = undefined;
    this.items_to_update = {};
    this.person_filter = undefined;
    this.place_filter = undefined;
    this.current_url = undefined;
    this.already_posted = false;
    this.specificity = 1.0;
    this.tab = undefined;
    this.minutes = 1000 * 60;
    this.url_interval_id = window.setInterval(bind(this.checkUrl, this), 500);
    this.login_interval_id = undefined;
    this.loading_interval_id = undefined;
    this.login_percent = 0;
    this.loading_percent = 0;
    this.enable_gravatars = undefined;
    this.person_filter_commented = true;
    this.profile_filter = undefined;
    this.friends = {};
    this.profiles = {};
    this.requests = {};
    this.sent_requests = {};
    this.list_col = undefined;
    this.profile_loaded_upto = undefined;
    this.requests_loaded_upto = undefined;
    this.lists_loaded_upto = undefined;
    
    if(typeof People != "undefined"){
        var self = this;
    
        function successContactFindCallback(found_people){
            for(var some_contact in found_people) {
                var person = found_people[some_contact];
                if(person.emails && !(person.emails[0] in self.people)) {
                    //put dummy pictures in or the pictures from contacts, gravatars happen later
                    var person_photo = (person.photos && person.photos.length > 0) ? person.photos[0].value : "unknown.png";
                    var person = new SBPerson(person.emails[0].value, person.displayName, person_photo);
                    //add additional emails as well
                    for(var i = 1; i < person.emails.length; ++i) {
                        if(!(person.emails[i] in self.people)) {
                            person.ids.push(person.emails[i].value);
                        }
                    }
                    self.addPerson(person, true);
                }
            }
        }
    
        People.findExternal(['displayName', 'emails', 'photos'],
                                    successContactFindCallback, 
                                    null,
                                    {filter:"@gmail"});
    }
};
/**
 * @param {string} id
 * @return {SBPerson}
*/
Manager.prototype.getPerson = function(id) {
    return this.people[id];
};

/**
 * @param {string} url
 * @return {string}
 */
function extractHost(url) {
    var parts = url.split('/');
    if (parts.length >= 3)
        return parts[2];
    else 
        return url;
}
/**
 * @param {string} url
 * @return {Array.<string>}
 */
function extractParts(url) {
    var parts = url.split('#');
    parts = parts[0].split('/');
    if (parts.length >= 3) {
        var host_parts = parts[2].split('.');
        host_parts.reverse();
        return host_parts.concat(parts.slice(3));
    } else {
        return parts;
    }
}
/**
 * @param {string} email
 * @return {string}
 */
function extractUser(url) {
    return url.split('@')[0];
}
/**
 * @param {Item} item
 */
Manager.prototype.activateRecent = function(context_item) {
    if(!this.data_source.isConnected())
        return;
    this.clearFriends();
    if(this.minutes) {
        $(".post-instance").hide();
        $(".comment-instance").hide();
        var items_to_show = {}
        var now = new Date();
        now = now.getTime();
        for(var i in this.items) {
            var item = this.items[i];
            if((now - item.time.getTime()) / 1000 / 60 < this.minutes) {
                do {
                    items_to_show[item.id] = true;
                    item = item.related_item;
                } while(item);
            }
        }
        for(var i in items_to_show) {
            $("#" + i).show();
        }
    } else {
        $(".post-instance").show();
        $(".comment-instance").show();
    }
    this.onLocationChange(context_item);
};
/**
 * @param {Item} item
 */
Manager.prototype.toggleComment = function(base_item, state) {
    var item_div = $("#" + base_item.id);
    var deactivating = $(".post-commenting", item_div).length > 0;
    //toggle
    if(state == true) {
        //do nothing if its already up
        if(deactivating && base_item.id == item_div.attr("id"))
            return;
    }
    $(".post-commenting").replaceWith("<div class=\"post-spot ui-widget ui-widget-content ui-corner-all\"></div>");
    if(deactivating) {
        //don't show on person tab
        if(this.needsShareDialog())
            $("#share").show();
        return;
    }
    var new_comment = $("#share-comment-template").clone();
    $( ".share-comment-submit-button", new_comment).button().click(bind(manager.onShareComment, manager, base_item));
    var comment_area = $(".share-comment-comment-textarea", new_comment)
    comment_area.click(function() {
        if($(this).val() == "... enter a comment ...")
            $(this).select();
    });
    comment_area.focus();
    comment_area.select();
    
    var group = $(".share-comment-group-autocomplete", new_comment);
    var is_default = true;

    var emails;
    //person tab should show only the person 
    if(this.tab != 1 || !this.person_filter) {
        emails = base_item.to.slice(0);
        for(var i in this.items) {
            if(this.items[i].related_item == base_item) {
                emails.push.apply(emails, this.items[i].to);
            }
        }
        emails = elimateDuplicateAddreses(emails, [this.data_source.getEmail()]);
    } else {
        emails = [this.person_filter];
    }

    group.val(emails.join(", "));
    group.click(function() {
        if(is_default) {
            $(this).select();
            is_default = false;
        }
    });
    new_comment.attr("id", "share-comment-instance");
    var post_spot = $(".post-spot", item_div);
    post_spot.append(new_comment);
    post_spot.removeClass("post-spot");
    post_spot.css("opacity", 1);
    post_spot.addClass("post-commenting");
    new_comment.slideDown("fast");
    post_spot.click(function() {return false;});
    this.updateAutocompletePeople();
    $("#share").hide();
    
};
Manager.prototype.deactivateComment = function() {
    $(".post-commenting").replaceWith("<div class=\"post-spot ui-widget ui-widget-content ui-corner-all\"></div>");
    if(this.needsShareDialog())
        $("#share").show();
    else
        $("#share").hide();
        
    if(this.tab == TAB_PROFILE && this.person_filter) {
        var group = $("#share-group-autocomplete");
        group.val(this.person_filter);
    }

};
Manager.prototype.needsShareDialog = function() {
    if(this.loading_interval_id || !
        this.data_source.isConnected())
        return false;
    if(this.already_posted)
        return false;
    return true;
};
/**
 * @param {string} url
 * @param {Array.<String>} parts
 * @param {number} required_parts
 */
Manager.prototype.placePassesFilter = function(url, parts, required_parts) {
    //always show the current page
    if(urlMatch(url, this.current_url))
        return true;
    if(parts == undefined || required_parts == undefined) {
        if(this.place_filter == undefined && this.current_url == undefined) {
            return true;
        }
        parts = extractParts(this.place_filter || this.current_url);
        required_parts = parts.length * this.specificity;
    }
    var my_parts = extractParts(url);
    var i = 0;
    while(i < required_parts && i < my_parts.length) {
        if(my_parts[i] != parts[i])
            break;
        ++i;
    }
    return i >= required_parts;
    
};
Manager.prototype.activatePlace = function(context_item, from_location_change) {
    if(!this.data_source.isConnected())
        return;
    this.clearFriends();
    var base_item = this.place_filter || this.current_url;
    $(".comment-instance").show();
    if(base_item == undefined) {
        $(".post-instance").show();
        return;
    }
    if(this.place_filter != undefined) {
        $("#place-filter-link").text(this.place_filter);
        $("#place-filter").show();
    } else {
        $("#place-filter").hide();
    }
    var parts = extractParts(base_item);
    var required_parts = parts.length * this.specificity;
    var manager = this;
    $(".post-instance").each(function() {
        var post = $(this);
        var url = $(".post-link", post).attr("href");
        if(manager.placePassesFilter(url, parts, required_parts)) {
            post.show()
        } else {
            post.hide();
        }
    });
    if(!from_location_change)
        this.onLocationChange(context_item);
};
/**
 * @param {number} idx
 */
Manager.prototype.selectTabOrRefresh = function(idx, context_item) {
    if(this.tab != idx) {
        this.tab = idx;
        this.tab_context = context_item;
        $("#tabs").tabs("select", idx);
    } else {
        if(this.tab == TAB_RECENT) {
            this.deactivateComment();
            this.activateRecent(context_item);
        } else if(this.tab == TAB_PLACE) {
            this.deactivateComment();
            this.activatePlace(context_item);
        } else if(this.tab == TAB_PROFILE) {
            this.deactivateComment();
            this.activateProfile(context_item);
        } else if(this.tab == TAB_FRIENDS) {
            this.deactivateComment();
            this.activateFriends(context_item);
        }
    }
};
/**
 * @param {string} person_id
 */
Manager.prototype.personPassesFilter = function(url, person_id, filter_person) {
    // if(urlMatch(url, this.current_url))
    //     return true;
    if(filter_person == undefined) {
        if(this.person_filter == undefined)
            return true;
        filter_person = this.people[this.person_filter];
    }
    var person = this.people[person_id];
    if(person == undefined) {
        //weird case because the person object doesn't exist if info is fetching
        if(filter_person == undefined) {
            return person_id == this.person_filter;
        }
        return false;
    } else {
        return person == filter_person;
    }
};
/**
 * @param {string} person_id
 */
Manager.prototype.activatePerson = function(context_item, from_location_change) {
    if(!this.data_source.isConnected())
        return;
    
    this.clearFriends();
    var person_id = this.profile_filter;
    $(".comment-instance").show();
    if(person_id == undefined) {
        $(".post-instance").show();
        if(!from_location_change)
            this.onLocationChange(context_item);
        return;
    }
    var include_commented = this.person_filter_commented;

    var person = this.people[person_id];
    var associated_posts = {};
    
    var now = new Date();
    now = now.getTime();
    for(var i in this.items) {
        var item = this.items[i];
        if(!this.personPassesFilter(item.data["url"], item.from, person) || this.minutes != undefined && (now - item.time.getTime()) / 1000 / 60 > this.minutes)
            continue;
        if(!include_commented && item.related_item != undefined) {
            continue;
        }
        while(item.related_item != undefined)
            item = item.related_item;
        if(item in associated_posts)
            continue;
        
        associated_posts[item.id] = item;
    }
    $(".post-instance").each(function() {
        var post = $(this);
        if(post.attr("id") in associated_posts) {
            return post.show(); 
        } else {
            return post.hide(); 
        }
    });
    if(!from_location_change)
        this.onLocationChange(context_item);
};
/**
 * @param {Item} item
 * @return {boolean}
*/
Manager.prototype.addItem = function(item, no_anim) {
    var manager = this;
    item.assert();
    //drop dupes
    if(item.id in this.items)
        return false;
    this.items[item.id] = item;
    if(item.data['url'] in this.root_items)
        item.related_item = this.root_items[item.data['url']];
    else 
        this.root_items[item.data['url']] = item;

    if(item.related_item == undefined) {
        var new_entry = $("#post-template").clone();
        new_entry.attr("id", item.id);

        if(item.from in this.people) {
            var person = this.people[item.from];
            $(".post-image", new_entry).attr("src", person.photo_url);
            $(".post-name", new_entry).text(person.name);
        } else {
            $(".post-name", new_entry).text(extractUser(item.from));
        }
        var down_time = undefined;
        $(".post-left", new_entry).click(function() {
            manager.profile_filter = item.from;
            manager.selectTabOrRefresh(TAB_PROFILE, item);
            return false;
        }).mousedown(function() {
            down_time = new Date();
            return true;
        }).mouseup(function() {
            var now = new Date();
            if(now.getTime() - down_time.getTime() > 350) {
                manager.person_filter_commented = true;
            } else {
                manager.person_filter_commented = false;
            }
            return true;
        });
        $(".post-location", new_entry).click(function() {
            manager.place_filter = item.data["url"];
            manager.selectTabOrRefresh(TAB_PLACE, item);
            return false;
        });
        if(item.data["title"].trim().length == 0) {
            item.data["title"] = "Unknown";
        }
        $(".post-link", new_entry).text(item.data["title"])
            .attr("href", item.data["url"]);
        $(".post-location", new_entry).text(extractHost(item.data["url"]));
        
        if("content-type" in item.data) {
            var img_url = undefined;
            if(item.data["content-type"] == "text/html") {
                if(isYouTubeVideo(item.data["url"])) {
                    img_url = getYouTubeScreen(item.data["url"]);
                }
            }
            if(item.data["content-type"].startsWith("image/")) {
                img_url = item.data["url"];
                $(".post-title", new_entry).addClass("hidden");
            }
            if(img_url) {
                $(".post-picture", new_entry).attr("src", img_url);
                $(".post-picture-area", new_entry).removeClass("hidden");
                $(".post-picture-link", new_entry).attr("href", item.data["url"])
                    .click(function() {
                       try {
                           content.window.location.href = item.data["url"];
                       } catch(err) {
                       }
                       return false; 
                    });
            }
        }
        $(".post-comment", new_entry).html(textToHtml(item.data["comment"]));
        new_entry.mouseenter(function() { 
            $(".post-spot", new_entry).animate({'opacity': '1'}, "fast");
        }).mouseleave(function() { 
            $(".post-spot", new_entry).animate({'opacity': '0'}, "fast");
        }).click(function(e) {
            if(e && e.target && e.target.tagName == "A") return true;
            manager.profile_filter = item.from;
            manager.toggleComment(item);
            return false;
        });
        new_entry.addClass("post-instance");
        $("#top").after(new_entry);
        if(urlMatch(item.data["url"], this.current_url)) {
            this.already_posted = true;
            new_entry.addClass("current-url");
            this.toggleComment(item);
        }
        var show = false;
        //handle new item filtering
        if(this.tab == TAB_RECENT) {
            show = true;
        } else if(this.tab == TAB_PROFILE) {
            if(this.personPassesFilter(item.data["url"], item.from))
                show = true;
        } else if(this.tab == TAB_PLACE) {
            manager.activatePlace();
        }
        if(show) {
            if(!no_anim)
                new_entry.slideDown("slow");
            else
                new_entry.show();
        }
    } else {
        var new_entry = $("#comment-template").clone();
        new_entry.addClass("comment-instance").attr("id", item.id);
        if(item.from in this.people) {
            var person = this.people[item.from];
            $(".comment-image", new_entry).attr("src", person.photo_url);
            $(".comment-name", new_entry).text(person.name);
        } else {
            $(".comment-name", new_entry).text(extractUser(item.from));
        }
        var down_time;
        $(".comment-left", new_entry).click(function() {
            manager.profile_filter = item.from;
            manager.selectTabOrRefresh(TAB_PROFILE, item);
            return false;
        }).mousedown(function() {
            down_time = new Date();
            return true;
        }).mouseup(function() {
            var now = new Date();
            if(now.getTime() - down_time.getTime() > 350) {
                manager.person_filter_commented = true;
            } else {
                manager.person_filter_commented = false;
            }
            return true;
        });
        if($.trim(item.data["comment"]).length == 0)
            item.data["comment"] = "...also shared this link...";
        $(".comment-comment", new_entry).html(textToHtml(item.data["comment"]));
        $(".post-children", $("#" + item.related_item.id)).append(new_entry);
        new_entry.addClass("comment-instance");
        if(!no_anim)
            new_entry.slideDown("slow");
        else 
            new_entry.show();
        //handle new item filtering
        var show_parent = false;
        if(this.tab == TAB_RECENT) {
        } else if(this.tab == TAB_PROFILE) {
            if(this.personPassesFilter(item.data["url"], item.from))
                show_parent = true;
        } else if(this.tab == TAB_PLACE) {
        }
        if(show_parent) {
            if(!no_anim)
                $("#" + item.related_item.id).slideDown("slow");
            else
            $("#" + item.related_item.id).show();
        }
    }
    
    //recent
    if(this.tab == TAB_RECENT && this.minutes) {
        //can't be addding a root when the child is already there, that doesn't make sense
        var items_to_show = {}
        var now = new Date();
        now = now.getTime();
        var i = item;
        if((now - i.time.getTime()) / 1000 / 60 < this.minutes) {
            do {
                items_to_show[i.id] = true;
                i = i.related_item;
            } while(i);
            for(var i in items_to_show) {
                $("#" + i).show();
            }
        } else {
            $("#" + item.id).hide();
        }
    }
    return true;
};

/**
 * @param {SBPerson} person
*/
Manager.prototype.addPerson = function(person, early) {
    if(!early && this.enable_gravatars && person.photo_url == "unknown.png") {
        person.photo_url = "http://www.gravatar.com/avatar/" + md5(person.ids[0].toLowerCase().trim());
    }
    for(var j = 0; j < person.ids.length; ++j) {
        var person_id = person.ids[j];
        this.people[person_id] = person;
        if(person_id in this.items_to_update) {
            var to_update = this.items_to_update[person_id];
            for(var i = 0; i < to_update.length; ++i) {
                this.updateItem(to_update[i]);
            }
            delete this.items_to_update[person_id];
        }
    }
    this.updateAutocompletePeople();
}
/**
 * @constructor
 * @param {SBPerson} person
 */
function AutocompletePerson(id, person) {
    this['label'] = person.name; 
    this['value'] = id
}
Manager.prototype.updateAutocompletePeople = function() {
    var ac_people = [];
    for(var i in this.people) {
        ac_people.push(new AutocompletePerson(i, this.people[i]));
    }
    $("input#share-group-autocomplete, input.share-comment-group-autocomplete").autocomplete({
        'source': function( request, response ) {
            if(!allow_multiple_tos) {
                response($.ui.autocomplete.filter(ac_people, request['term']));
                return;
            }
            // delegate back to autocomplete, but extract the last term
            response( $.ui.autocomplete.filter(
                ac_people, request['term'].split( /[;,]\s*/ ).pop()));
        },
        'focus': function() {
            // prevent value inserted on focus
            return false;
        },
        'select': function( event, ui ) {
            if(!allow_multiple_tos)
                return true;
            var terms = this.value.split( /[;,]\s*/ );
            terms.pop();
            terms.push( ui.item.value );
            terms.push( "" );
            this.value = terms.join( ", " );
            return false;
        }
    }).each(function() { $(this).data( "autocomplete" )._renderItem = function( ul, item ) {
        return $( "<li></li>" )
            .data( "item.autocomplete", item )
            .append( "<a>" + item.label + "<br><font size='-2'>" + item.value + "</font></a>" )
            .appendTo( ul );
    };});
}
/**
 * @param {string} msg
*/
Manager.prototype.onFetchPersonError = function(msg) {
}
Manager.prototype.fetchPerson = function(person_id, item) {
    if(person_id in this.items_to_update) {
        this.items_to_update[person_id].push(item);
    } else {
        this.items_to_update[person_id] = [item];
        this.data_source.getPersonInfo(person_id, bind(this.addPerson, this), bind(this.onFetchPersonError, this));
    }
}


Manager.prototype.onProfileError = function(msg, detail) {
    this.modalError("Fetching Profile", msg, detail);
}

//updates an item's person data
/**
 * @param {Item} item
*/
Manager.prototype.updateItem = function(item) {
    var new_entry = $("#" + item.id);
    if(item.related_item == undefined) {
        if(item.from in this.people) {
            var person = this.people[item.from];
            $(".post-image", new_entry).attr("src", person.photo_url);
            $(".post-name", new_entry).text(person.name);
        } else {
            $(".post-name", new_entry).text(extractUser(item.from));
        }
        //handle updated item filtering
        var show = false;
        if(this.tab == TAB_RECENT) {
            show = true;
        } else if(this.tab == TAB_PROFILE) {
            if(this.personPassesFilter(item.data["url"], item.from))
                show = true;
        } else if(this.tab == TAB_PLACE) {
            manager.activatePlace();
        }
        if(show)
            new_entry.slideDown("slow");
    } else {
        if(item.from in this.people) {
            var person = this.people[item.from];
            $(".comment-image", new_entry).attr("src", person.photo_url);
            $(".comment-name", new_entry).text(person.name);
        } else {
            $(".comment-name", new_entry).text(extractUser(item.from));
        }
        //handle updated item filtering
        var show_parent = false;
        if(this.tab == TAB_RECENT) {
        } else if(this.tab == TAB_PROFILE) {
            if(this.personPassesFilter(item.data["url"], item.from))
                show_parent = true;
        } else if(this.tab == TAB_PLACE) {
        }
        if(show_parent) {
            $("#" + item.related_item.id).slideDown("slow");
        }
    }
}


/**
 * @param {Array.<Item>} items
 * @param {boolean} local_insert
 */
Manager.prototype.onNewItems = function(items, next_token, local_insert) {
    for(var i = 0; i < items.length; ++i) {
        var item = items[i];
        //add people first so they can be used by add item
        if(!(item.from in this.people)) {
            this.addPerson(new SBPerson(item.from, extractUser(item.from), "unknown.png"));
            this.fetchPerson(item.from, item);
        }
        for(var j = 0; j < item.to.length; ++j) {
            if(!(item.to[j] in this.people)) {
                this.addPerson(new SBPerson(item.to[j], extractUser(item.to[j]), "unknown.png"));
                this.fetchPerson(item.to[j], item);
            }
        }
        //no flashy anim for first load
        if(!this.addItem(item, this.loaded_upto == undefined))
            continue;
    }
    if(next_token != undefined)
        this.loaded_upto = next_token;
    if(!local_insert)
        this.data_source.getNewItems(this.loaded_upto, bind(this.onNewItems, this), bind(this.onNewItemsError, this));
}
Manager.prototype.refresh = function() {
    this.data_source.getNewItems(this.loaded_upto, bind(this.onNewItems, this), bind(this.onNewItemsError, this));
}
Manager.prototype.onNewItemsError = function(msg, detail) {
    this.modalError("Fetching Items", msg, detail);
}
/**
 * @param {Array.<Item>} items
 */
Manager.prototype.onConnectSuccess = function() {
    if(!use_contacts && prefs) {
        var email = this.data_source.getEmail();
        prefs.setCharPref("email", email);
        var email_pref = email.replace(/\.@/g, "_");
        var domain_pref = email.split('@', 2)[1].replace(/\./g, "_");
        prefs.setCharPref(email_pref + "_imap", $("#login-imap-input").val());
        prefs.setCharPref(email_pref + "_smtp", $("#login-smtp-input").val());
        prefs.setCharPref(domain_pref + "_imap", $("#login-imap-input").val());
        prefs.setCharPref(domain_pref + "_smtp", $("#login-smtp-input").val());
        prefs.setBoolPref(email_pref + "_gravatar", this.enable_gravatars);
    }
    $("#login-cache-checkbox").attr("checked", false);
    $("#login-logging-checkbox").attr("checked", false);
    window.clearInterval(this.login_interval_id);
    this.login_interval_id = undefined;
    $("#login-input").slideDown("slow");
    $("#login-status").slideUp("slow");
    $("#loading").slideDown("slow");
    this.loading_percent = 0;
    this.loading_interval_id = window.setInterval(bind(this.updateLoadingProgress, this), 100);

    $("#login").slideUp("slow", function() { $("#login-submit-button").button("enable"); });
    $("#tabs").show();
    $("#tab-spacer").css("height", parseInt($("#tabs").css("height")) + 2);
    this.deactivateComment();
    //Get user info
    this.addPerson(new SBPerson(this.data_source.options['email'], extractUser(this.data_source.options['email']), "unknown.png"));
    this.data_source.getNewItems(this.loaded_upto, bind(this.onFirstNewItems, this), bind(this.onFirstNewItemsError, this));
    
    //This order is important...
    this.data_source.getListCollections(this.list_loaded_upto, bind(this.onListCollections, this), bind(this.onListCollectionError, this));
    this.data_source.getFriendRequests(this.request_loaded_upto, bind(this.onFriendRequests, this), bind(this.onFriendRequestError, this));
    this.data_source.getProfiles(this.profile_loaded_upto, bind(this.onGetProfiles, this), bind(this.onGetProfilesError, this));
    
}
Manager.prototype.onFirstNewItems = function(items) {
    $("#loading").slideUp("slow");
    this.onNewItems(items);
    window.clearInterval(this.loading_interval_id);
    this.loading_interval_id = undefined;
    try {
        this.onLocationChange();
    } catch(err) {}
}
Manager.prototype.onFirstNewItemsError = function(msg, detail) {
    window.clearInterval(this.loading_interval_id);
    this.loading_interval_id = undefined;
    $("#loading").slideUp("fast");
    this.onNewItemsError(msg, detail)
}
/**
 * @param {string} msg
 */
Manager.prototype.modalError = function(title, msg, detail) {
    $("#error-message-text").text(msg);
    if(detail == undefined) {
        $("#error-message-expander").addClass("hidden");
    } else {
        $("#error-message-expander").removeClass("hidden");
        $("#error-message-detail").text(detail);
    }
    $("#error-message").attr("title", title);
    $("#error-message").dialog({
        "position": 'center',
        "width" : "90%",
        "modal": true,
        "buttons": {
            Ok: function() {
                $( this ).dialog( "close" );
            }
        }
    });
}
/**
 * @param {Array.<Item>} msg
 */
Manager.prototype.onConnectError = function(msg, detail) {
    window.clearInterval(this.login_interval_id);
    this.login_interval_id = undefined;
    $("#login-input").slideDown("fast");
    $("#login-status").slideUp("fast");
    $("#login-submit-button").button("enable");

    this.modalError("Login Error", msg, detail);
}
Manager.prototype.onConnectDisconnect = function() {
    this.modalError("Session", "Disconnected!");
}
Manager.prototype.checkUrl = function() {
    //just bail out if we aren't connected
    if(!this.data_source.isConnected())
        return;
    //for viewing outside of the plugin
    try {
        if(this.current_url != content.window.location.href) {
            this.onLocationChange();
        }
    } catch(err) {}
}
Manager.prototype.setSpecificity = function(specificity) {
    this.specificity = specificity;
    this.activatePlace();
}
Manager.prototype.setMinutes = function(minutes) {
    this.minutes = minutes;
    if(this.minutes) {
        var unit = " minutes";
        if(minutes > 60) {
            minutes /= 60;
            unit = " hours";        
            if(minutes > 24) {
                minutes /= 24;
                unit = " days";
                if(minutes > 7) {
                    minutes /= 7;
                    unit = " weeks";
                    if(minutes > 4) {
                        minutes /= 4;
                        unit = " months";
                        if(minutes > 12) {
                            minutes /= 12;
                            unit = " years";
                        }
                    }
                }
            }
        }
        minutes = Math.round(minutes * 10) / 10;
        $("#time-text").html("<i>" + minutes + unit + "</i>");
    } else {
        $("#time-text").html("<i>All</i>");
    }
    this.activateRecent();
}
Manager.prototype.onLocationChange = function(scroll_to) {
    try {
        this.content_type = content.document.contentType;
        $("#share-title-textarea").val($("title", content.document).text().trim());
        this.current_url = content.window.location.href;
    } catch (err) {
        this.content_type = undefined;
        $("#share-title-textarea").val("Unknown");
        this.current_url = undefined;
    }
    $(".current-url").removeClass("current-url");
    var comment = $("#share-comment-textarea").val("... enter a comment ...");
    this.already_posted = false;
    var current_item = undefined;
    var dont_scroll_to_post = this.tab == TAB_RECENT;
    $("#tab-spacer").css("height", parseInt($("#tabs").css("height")) + 5);
    var tab_height = -parseInt($("#tabs").css("height")) - 2;
    for(var i in this.items) {
        var item = this.items[i];
        if (urlMatch(item.data["url"], this.current_url)) {
            this.already_posted = true;
            while(item.related_item != undefined)
                item = related_item;
            current_item = $("#" + item.id);
            current_item.addClass("current-url");
            this.toggleComment(item, true);
            if(!dont_scroll_to_post) {
                if(scroll_to) {
                    $.scrollTo($("#" + scroll_to.id), {duration:0, offset:tab_height});
                } else {
                    $.scrollTo(current_item, {duration:0, offset:tab_height});
                }
            }
            break;
        }
    }
    if(!dont_scroll_to_post && !current_item && scroll_to) {
        $.scrollTo($("#" + scroll_to.id), {duration:0, offset:tab_height});
    }
    if(!this.needsShareDialog()) {
        $("#share").hide();
    } else {
        this.deactivateComment();
        if(!dont_scroll_to_post) {
            if(scroll_to) {
                $.scrollTo($("#" + scroll_to.id), {duration:0, offset:tab_height});
            } else {
                $.scrollTo(0, tab_height, {duration:0});
            }
        }
    }
        
    if(this.tab == TAB_RECENT) {
    } else if(this.tab == TAB_PROFILE) {
        this.activateProfile(undefined, true);
    } else if(this.tab == TAB_PLACE) {
        this.activatePlace(undefined, true);
    }
}
Manager.prototype.onShare = function() {
    var to_raw = $("#share-group-autocomplete").val();
    var to = to_raw.split(/,\s*/);
    var comment = $("#share-comment-textarea").val();
    if(comment == "... enter a comment ...") {
        comment = undefined;
    }
    if(to_raw == "With...") {
        this.modalError("Sharing Incomplete", "Please type an email to share with...");
        return false;
    }
    var title = $("#share-title-textarea").val();
    var url = this.current_url;
    var data = {"url":url, "title":title, "comment":comment};
    if(this.content_type)
        data["content-type"] = this.content_type;
    var manager = this;
    $("#share-submit-button").button("disable");
    var previous_items = [];
    this.data_source.postItem(to, data, previous_items,
        function(item) {
            //a data source may not necessarily return a local item for us,
            //we may need to wait
            if(item)
                manager.onNewItems([item], undefined, true);
            $("#share-submit-button").button("enable");
            //once we post, make the post visible if it wouldn't fit the filter
            //TODO, colors to show new
        }, function(msg, detail) {
            manager.modalError("Share Error", msg, detail);
            $("#share-submit-button").button("enable");
        }
    );
    return false;
}
Manager.prototype.onShareComment = function(related_item) {
    var post = $("#" + related_item.id);
    var to_raw = $(".share-comment-group-autocomplete", post).val();
    var to = to_raw.split(/,\s*/);
    var comment = $(".share-comment-comment-textarea", post).val();
    if(comment == "... enter a comment ..." || $.trim(comment).length == 0) {
        this.modalError("Sharing Incomplete", "Please type a comment...");
        return false;
    }
    if($.trim(to_raw).length == 0) {
        this.modalError("Sharing Incomplete", "Please type an email to share with...");
        return false;
    }
    var data = shallow_copy(related_item.data);
    data["comment"] = comment;
    var manager = this;
    $(".share-comment-submit-button", post).button("disable");
    var previous_items = [ related_item ];
    for(var i in this.items) {
        if(this.items[i].related_item == related_item) {
            previous_items.push(this.items[i]);
        }
    }
    previous_items.sort(function(a,b) {
       return a.date < b.date;
    });
    this.data_source.postItem(to, data, previous_items,
        function(item){
            manager.deactivateComment();
            //a data source may not necessarily return a local item for us,
            //we may need to wait
            if(item)
                manager.onNewItems([item], undefined, true);
            //no need to re-enable share button, because we kill this comment
        }, function(msg, detail) {
            manager.modalError("Comment Error", msg, detail);
            $(".share-comment-submit-button", post).button("enable");
        }
    );
    return false;
}
Manager.prototype.clearPlaceFilter = function() {
    this.place_filter = undefined;
    this.activatePlace();
};
Manager.prototype.onOfflineToggle = function() {
    if(this.data_source.isOffline())
        $( "#offline" ).show();
    else
        $( "#offline" ).hide();
}
Manager.prototype.updateLoadingProgress = function() {
    this.loading_percent = (this.loading_percent + 11) % 100;
    $( "#loading-progress" ).progressbar("option", "value", this.loading_percent);
}
Manager.prototype.updateLoginProgress = function() {
    this.login_percent = (this.login_percent + 11) % 100;
    $( "#login-progress" ).progressbar("option", "value", this.login_percent);
}
Manager.prototype.onLogin = function() {
    //prevents confusion on first use
    if($("#login-imap-input").val().trim().length == 0 || $("#login-smtp-input").val().trim().length == 0) {
        $("#login-accordion").accordion("activate", 1);
        return;
    }
        
    $("#login-submit-button").button("disable");
    $("#login-input").slideUp("slow");
    $("#login-status").slideDown("slow");    
    
    var params = {};
    params['email'] = $("#login-username-input").val();
    params['password'] = $("#login-password-input").val();
    params['imap_server'] = $("#login-imap-input").val();
    params['smtp_server'] = $("#login-smtp-input").val();
    params['logging'] = $("#login-logging-checkbox").attr("checked");
    params['clear_cache'] = $("#login-cache-checkbox").attr("checked");
    
    this.enable_gravatars = $("#gravatar-checkbox").attr("checked");
    var my_photo = "unknown.png";
    if(this.enable_gravatars) {
        my_photo = "http://www.gravatar.com/avatar/" + md5(params['email'].toLowerCase().trim());
        for(var email in this.people) {
            if(this.people[email].ids[0] == email && this.people[email].photo_url == "unknown.png") {
                this.people[email].photo_url = "http://www.gravatar.com/avatar/" + md5(email.toLowerCase().trim());
            }
        }
    } 
    $(".share-comment-photo-image").attr("src", my_photo);
    $("#share-photo-image").attr("src", my_photo);

    this.login_percent = 0;
    this.login_interval_id = window.setInterval(bind(this.updateLoginProgress, this), 100);
    data_source.connect(params, bind(manager.onConnectSuccess, manager), bind(manager.onConnectError, manager), bind(manager.onOfflineToggle, manager));
};

///// Integration Point /////
Manager.prototype.onDirectConnect = function() {
    $("#login-submit-button").button("disable");
    $("#login-input").slideUp("slow");
    $("#login-status").slideDown("slow");    
    
    this.enable_gravatars = $("#gravatar-checkbox").attr("checked");
    var my_photo = "unknown.png";
    if(this.enable_gravatars) {
        my_photo = "http://www.gravatar.com/avatar/" + md5(data_source.getEmail().toLowerCase().trim());
        for(var email in this.people) {
            if(this.people[email].ids[0] == email && this.people[email].photo_url == "unknown.png") {
                this.people[email].photo_url = "http://www.gravatar.com/avatar/" + md5(email.toLowerCase().trim());
            }
        }
    } 
    $(".share-comment-photo-image").attr("src", my_photo);
    $("#share-photo-image").attr("src", my_photo);

    this.login_percent = 0;
    this.login_interval_id = window.setInterval(bind(this.updateLoginProgress, this), 100);

    ///// Integration Point /////
    //dunno what elese might need to be done here
    
    this.onConnectSuccess();
};

Manager.prototype.clearCanvas = function() {
        //Hide all posts
    $(".post-instance").each(function() {
        var post = $(this);
        post.hide();
        
    }); 
    $("#share").hide();
    $(".mini-profile-instance").each(function() {
        $(this).hide();
    }); 
}
Manager.prototype.clearFriends = function() {
    $(".mini-profile-instance").each(function() {
        $(this).hide();
    }); 
}
Manager.prototype.profileAlert = function(msg) {
    $("#profile-alert").text(msg);
    $("#profile-alert-container").show();
}
Manager.prototype.displayProfile = function(profile) {
    var manager = this;
        
    if(profile != undefined) {
        var container = $(".profile-container");
        $("#profile-first-name .display").text(profile.data.first_name);
        $("#profile-last-name .display").text(profile.data.last_name);
        $("#profile-email .display").text(profile.from);
        $("#profile-school .display").text(profile.data.school);
        $("#profile-geo .display").text(profile.data.geo);
        $("#profile-birthdate .display").text(profile.data.birthdate);
        
        
        var person = this.people[profile.from];
        $("#profile-img > .perm").attr("src", person.photo_url);
    }
    //Switch to view mode   
    $("#profile-container .display").show();
    $("#profile-container .edit").hide();
    //Disable edit button if it's not my profile
    if(profile != undefined && profile.from != manager.data_source.options['email']) {
        $("#profile-edit").hide();
    } else {
        $("#profile-edit").show();
    }
    return true;
};
Manager.prototype.activateProfile = function(context_item, from_location_change) {
    var manager = this;
    if(!this.data_source.isConnected())
        return;
    
    var my_email = this.data_source.options['email'];
    //Hide all posts
    this.clearCanvas();
    $("#profile-spinner").hide();
    

    //Reset
    $("#friend-request-container").hide();
    $("#profile-container").show();
    $("#profile-alert-container").hide();
    
    
    
    if(manager.profile_filter == undefined) {
        manager.profile_filter = my_email;
    }
    var profile = this.profiles[manager.profile_filter];
    //Show profile-filter for debugging purposes
    //$("#profile-filter").text(this.profile_filter);
    if(profile == undefined) {
        //If cannot find profile
        if(manager.profile_filter == this.data_source.options['email']) {
            //If trying to look at my own profile and it's not there
            manager.profileAlert("Your profile is empty, click Edit to tell your friends about yourself.");
            //Preload my picture and email
            $("#profile-email .display").text(manager.profile_filter);
            var person = this.people[manager.profile_filter];
            $("#profile-img > .perm").attr("src", person.photo_url);
            this.displayProfile(undefined);
            
        } else if(this.friends[manager.profile_filter] == undefined) {
            //Trying too look at someone else's profile and they are not in friends list
            var my_profile = this.profiles[my_email]
            if(my_profile) {
                //If I have created a profile
                
                //Show my own profile
                this.displayProfile(my_profile);
                
                $("#friend-request-msg").text("The profile for " + this.profile_filter + " is unavailable.  Do you want to exchange profiles?");
                //$("#friend-request-email-field").val(this.profile_filter);
                $("#friend-request-status").hide();
                
                
                $("#friend-request-container").show();
                $("#profile-container").hide();
            } else {
                //Have not yet created profile, so show edit.
                $("#friend-request-container").hide();
                this.profileAlert("You are not friends with " + manager.profile_filter + ", but you must fill your profile before sending friend requests.");
                $("#profile-container").show()
                
                    //Preload my picture and email
                $("#profile-email .display").text(manager.profile_filter);
                var person = this.people[manager.profile_filter];
                $("#profile-img > .perm").attr("src", person.photo_url);
                }
        
        } else {
            // Trying to look at someone else's profile and they are a friend, but cannot find
            $("#friend-request-container").hide();
            manager.profileAlert("You are friends with " + manager.profile_filter + " but you do not have a copy of their profile!");
        }
    } else {
        //profile found, display it.s
        this.displayProfile(profile);
    }
    this.activatePerson(context_item, from_location_change);
};
Manager.prototype.onGetProfiles = function(profiles, next_token, local_insert) {
    //is.showProfile(profile);
    for(var p in profiles) {
        var profile = profiles[p];
        this.profiles[profile.from] = profiles[p];
        
        //If I am not already friends with this person, treat them sending me their
        //profile as a friend request.
        this.onFriendRequests([new Request(profile.time, profile.from, profile.to, profile.related_item, profile.data)], 
                            undefined,
                            true);
        
        if(!(profile.from in this.people)) {
            this.addPerson(new SBPerson(profile.from, extractUser(profile.from), "unknown.png"));
            //this.fetchPerson(profile.from, profile);
        }
        for(var j = 0; j < profile.to.length; ++j) {
            if(!(profile.to[j] in this.people)) {
                this.addPerson(new SBPerson(profile.to[j], extractUser(profile.to[j]), "unknown.png"));
                //this.fetchPerson(profile.to[j], profile);
            }
        }
        //If i'm currently looking at this profile, refresh it. Or it could be while im trying to
        // send a request and editing my profile, in which case it's from me. 
        if(profile.from == this.profile_filter || profile.from == this.data_source.options['email']) {
            this.displayProfile(profile);
        }
    }
    if(next_token != undefined)
        this.profile_loaded_upto = next_token;
    if(!local_insert)
        this.data_source.getProfiles(this.profile_loaded_upto, bind(this.onGetProfiles, this), bind(this.onGetProfileError, this));

    
}
Manager.prototype.onGetProfileError = function() {
    alert("Error getting profiles");
}
Manager.prototype.onUpdateProfile = function() {
    var first_name = $("#profile-first-name-field").val();
    var last_name = $("#profile-last-name-field").val();
    var school = $("#profile-school-field").val();
    var geo = $("#profile-geo-field").val();
    var birthdate = $("#profile-birthdate-field").val();
 
    
    var data = {"first_name":first_name, "last_name":last_name, "school":school, "geo":geo, "birthdate":birthdate};
    var manager = this;
    $("#update-profile-submit-button").button("disable");
    var previous_items = [];
    //Send profile to all friends
    var to = [];
    for(var email in this.friends) {
        to.push(email);
    }
    $("#profile-spinner-text").text("Updating profile...");
    $("#profile-spinner").show();
    this.data_source.sendProfile(to, data, previous_items,
        function(profile) {
            $("#profile-spinner").hide();
            if(profile)
                manager.onGetProfiles([profile], undefined, true);
            manager.activateProfile(undefined);
        }, function(msg, detail) {
            $("#profile-spinner").hide();
            manager.modalError("Update Profile Error", msg, detail);
        }
    );
    return false;
}
Manager.prototype.onFriendRequests = function(requests, next_token, local_insert) {
    //is.showProfile(profile);
    for(var r in requests) {

        var request = requests[r];
        if(request.from == this.data_source.options['email']) {
            //Outgoing requests
            for(var out in request.to) {    
                this.sent_requests[request.to[out]] = requests[r];
            }
        } else {
            //Incoming requests
            this.requests[request.from] = request;
            //alert("in coming from: " + request.from);
            //Add profiles
            this.profiles[request.from] = new Profile(request.time, request.from, request.to, undefined, request.data); 
            if(this.friends[request.from] == undefined && this.sent_requests[request.from] != undefined) {
                //Get a request from a person to which i sent a request, and they are not yet my friend..
                manager.addToFriends(request.from, function() {
                    //alert(request.from + " has accepted your friend request");
                });
            }
        }
        if(!(request.from in this.people)) {
            this.addPerson(new SBPerson(request.from, extractUser(request.from), "unknown.png"));
            //this.fetchPerson(request.from, request);
        }
        for(var j = 0; j < request.to.length; ++j) {
            if(!(request.to[j] in this.people)) {
                this.addPerson(new SBPerson(request.to[j], extractUser(request.to[j]), "unknown.png"));
                //this.fetchPerson(request.to[j], request);
            }
        }
    }
    //alert("request.length: " + this.requests.length + " sent_requests.length: " + this.sent_requests.length);
    if(next_token != undefined)
        this.requests_loaded_upto = next_token;
    if(!local_insert)
        this.data_source.getFriendRequests(this.requests_loaded_upto, bind(this.onFriendRequests, this), bind(this.onFriendRequestError, this));

}
Manager.prototype.onListCollections = function(list_cols, next_token, local_insert) {
    //is.showProfile(profile);
    for(var c in list_cols) {
        this.list_col = list_cols[c];
        //Make the most recent entry the current list_col
    }
    if(this.list_col != undefined)
        this.friends = this.list_col.data['friends'];
    
    
}
Manager.prototype.onListCollectionError = function() {

}
Manager.prototype.friendsAlert = function(msg) {
    $("#friends-alert").text(msg);
    $("#friends-alert-container").show();
}
Manager.prototype.activateFriends = function(context_item) {
    var manager = this;
    if(!this.data_source.isConnected())
        return;
        
    $("#tab-spacer").css("height", parseInt($("#tabs").css("height")) + 5);
    $("#friends-alert-container").hide();
    
    this.clearCanvas();
    $("#friends-spinner").hide();
    
    var my_profile = this.profiles[this.data_source.options['email']];
    if(my_profile) {
        //I already have a profile
        var requests_toshow = {};
        for(var r in this.requests) {
            var request = this.requests[r];
            if(this.friends[request.from] == undefined) {
                requests_toshow[request.from] = request;
            }
        }
        
        //Hide all miniprofiles
        $(".mini-profile-instance").each(function() {
            $(this).remove();
        }); 
        
        
        //Show friend mini profiles
        for(var f in this.friends) {
            var profile = this.profiles[f];
            if(profile) {
                this.addMiniProfile(profile, false);
            }
        }
        this.addMiniProfile(my_profile, false);
        
        
        for(var r in requests_toshow) {
            var request = requests_toshow[r];
            this.addMiniProfile(request, true);
        }
    } else {
        this.friendsAlert("Please complete your profile to start making friends");
    }
    

}

//Can pass in a profile or a request, both of which contain profile information
//in "data"
Manager.prototype.addMiniProfile = function(source, is_request) {
    var manager = this;
    var my_profile = this.profiles[this.data_source.options['email']];
    
    var new_entry = $("#mini-profile-template").clone();
    new_entry.attr("id", source.from);
    new_entry.addClass("mini-profile-instance");
    
    var person = this.people[source.from];
    $(".mini-profile-image", new_entry).attr("src", person.photo_url);
    var down_time = undefined;
    $(".mini-profile-image", new_entry).click(function() {
        manager.profile_filter = source.from;
        manager.selectTabOrRefresh(TAB_PROFILE, source);
        return false;
    }).mousedown(function() {
        down_time = new Date();
        return true;
    }).mouseup(function() {
        var now = new Date();
        if(now.getTime() - down_time.getTime() > 350) {
            manager.person_filter_commented = true;
        } else {
            manager.person_filter_commented = false;
        }
        return true;
    });
    $(".mini-profile-name", new_entry).text(source.data.first_name + " " + source.data.last_name + ((my_profile == source) ? " (Me)" : ""));
    $(".mini-profile-email", new_entry).text(source.from);
    $(".mini-profile-school", new_entry).text(source.data.school);
    $(".mini-profile-geo", new_entry).text(source.data.geo);
    if(is_request) {
        $(".mini-profile-request-options", new_entry).show();
        $(".request-accept-button", new_entry).click(function() {
            manager.confirmFriend(source.from, function() {
                manager.activateFriends(undefined);
            });
        });
    } else {
        $(".mini-profile-request-options", new_entry).hide();
    }
    
    $("#top").after(new_entry);
    new_entry.slideDown("slow");
}
Manager.prototype.confirmFriend = function(friend_email, on_success) {
    $("#friends-spinner-text").text("Exchanging profiles...");
    $("#friends-spinner").show();
    var manager = this;
    var my_profile = this.profiles[this.data_source.options['email']];
    manager.data_source.sendFriendRequest(friend_email,
        my_profile.data,
        null,
        function(request) {
            $("#friends-spinner").hide();
            if(request) {
                manager.onFriendRequests([request], undefined, true);

                //Add to friends list, then add friends list to list_col, and save to inbox.
                manager.addToFriends(friend_email, on_success);
            }
        }, function(msg, detail) {
            $("#friends-spinner").hide();
            manager.modalError("Error replying to friend request", msg, detail);
        }
    );
}
Manager.prototype.addToFriends = function(friend_email, on_success) {
    manager.friends[friend_email] = 1;
    manager.list_col.data["friends"] = manager.friends;
    $("#friends-spinner-text").text("Updating friends list...");
    $("#friends-spinner").show();
    manager.data_source.sendListCollection([manager.data_source.options['email']], manager.list_col.data, undefined,
        function(list_col) {
            $("#friends-spinner").hide();
            if(list_col)
                manager.onListCollections([list_col], undefined, true);
            on_success();
        }, function(msg, detail) {
            $("#friends-spinner").hide();
            manager.modalError("Error saving list collections.", msg, detail);
        }
    );
}

var manager = new Manager(data_source);

$(document).ready(
    function(){
        $( "#tabs" ).tabs({
            "show": function(event, ui) {
                //in firefox this is called even if the element wasn't visible, so 
                //the activate functions must handle "non-connectedness"
                var selected = $("#tabs").tabs("option", "selected");
                manager.deactivateComment();
                manager.tab = selected;
                //TODO: better management of tab context... jquery show on tabs is annoying.
                if(selected == 0) {
                    //always scroll to share part for recent
                    var tab_height = -parseInt($("#tabs").css("height")) - 2;
                    $.scrollTo(0, tab_height);
                    manager.activateRecent(manager.tab_context);
                } else if(selected == 1) {
                    manager.activatePlace(manager.tab_context);
                } else if(selected == 2) {
                    manager.activateProfile(manager.tab_context);
                } else if(selected == 3) {
                    manager.activateFriends(manager.tab_context);
                }
                this.tab_context = undefined;
            }
        });
        $("#login-username-input").keypress(function(e) { if(e.which == 13) { $("#login-password-input").focus(); return false;} return true;})
        $("#login-password-input").keypress(function(e) { if(e.which == 13) { $("#login-submit-button").click(); return false;} return true;})
        $("#login-progress").progressbar({"value":50});
        $("#loading-progress").progressbar({"value":50});
        $( "#login-submit-button").button().click(bind(manager.onLogin, manager));
        $( "#share-submit-button").button().click(bind(manager.onShare, manager));
        $("#share-comment-textarea").click(function() {
            if($(this).val() == "... enter a comment ...")
                $(this).select();
        });
        $("#share-group-autocomplete").click(function() {
            if($(this).val() == "With...")
                $(this).select();
        });
        manager.updateAutocompletePeople();
        $("#specificity-slider").slider({
            "value":0,
            "min":0,
            "max":20,
            "step":1,
            "slide": function(event, ui) {
                manager.setSpecificity(1.0 - ui.value / 20);
            }
        });
        $("#time-slider").slider({
            "value":0,
            "min":0,
            "max":(1000 * 60),
            "step":1,
            "slide": function(event, ui) {
                if(ui.value != 0) {
                    var v = 1000 * 60 - ui.value;
                    v = v * v * v / (1000 * 60 * 1000 * 60);
                    manager.setMinutes(v);
                    if(prefs) {
                        prefs.setIntPref("minutes", v);
                    }
                } else {
                    manager.setMinutes(undefined);
                    if(prefs) {
                        prefs.setIntPref("minutes", undefined);
                    }
                }
            }
        });
        if(prefs && prefs.prefHasUserValue("minutes")) {
            var m = prefs.getIntPref("minutes");
            if(m == 0) {
                m = undefined;
            } else {
                var v = 1000 * 60 - Math.pow(m *  (1000 * 60 * 1000 * 60), 1.0 / 3);
                $("#time-slider").slider("value", v);
            }
            manager.setMinutes(m);
        }
            
        $("#place-filter").click(bind(manager.clearPlaceFilter, manager));
        $( "#error-message-expander" ).click(function() {
            $("#error-message-detail").slideToggle("fast");
        });
        $("#login-accordion").accordion();
        $("#login-back-button").button().click(function() {
            $("#login-accordion").accordion("activate", 0);
        });
        $("#login-username-input").change(function() {
            if(!use_contacts && prefs) {
                var email = $(this).val();
                var email_pref = email.replace(/\.@/g, "_");
                if(email.trim().length > 0 && email.indexOf('@') != -1) {
                    var domain_pref = email.split('@', 2)[1].replace(/\./g, "_");
                    if(email.split('@', 2)[1] == "gmail.com") {
                        $("#login-imap-input").val("imap.gmail.com");
                        $("#login-smtp-input").val("smtp.gmail.com");
                    }
                    if(email.split('@', 2)[1] == "yahoo.com") {
                        $("#login-imap-input").val("imap.mail.yahoo.com");
                        $("#login-smtp-input").val("smtp.mail.yahoo.com");
                    }
                    if(prefs.prefHasUserValue(domain_pref + "_imap")) {
                        $("#login-imap-input").val(prefs.getCharPref(domain_pref + "_imap"));
                    }
                    if(prefs.prefHasUserValue(domain_pref + "_smtp")) {
                        $("#login-smtp-input").val(prefs.getCharPref(domain_pref + "_smtp"));
                    }
                    if(prefs.prefHasUserValue(email_pref + "_imap")) {
                        $("#login-imap-input").val(prefs.getCharPref(email_pref + "_imap"));
                    }
                    if(prefs.prefHasUserValue(email_pref + "_smtp")) {
                        $("#login-smtp-input").val(prefs.getCharPref(email_pref + "_smtp"));
                    }
                    if(prefs.prefHasUserValue(email_pref + "_gravatar")) {
                        $("#gravatar-checkbox").attr("checked", prefs.getBoolPref(email_pref + "_gravatar"));
                    }
                }
            }
        });
        if(!use_contacts && prefs) {
            var email = undefined;
            if(prefs.prefHasUserValue("email")) {
                email = prefs.getCharPref("email");
                $("#login-username-input").val(email);
                $("#login-username-input").change();
            }
        }
        if(use_contacts) {
            manager.onDirectConnect();
        }
        
        //Set up mouse events for profile
        $("#profile-edit-button").click(function() {
            //Copy over profile information into form, then switch over to form
            $("#profile-first-name-field").val($("#profile-first-name > .display").text());
            $("#profile-last-name-field").val($("#profile-last-name > .display").text());
            $("#profile-school-field").val($("#profile-school > .display").text());
            $("#profile-geo-field").val($("#profile-geo > .display").text());
            $("#profile-birthdate-field").val($("#profile-birthdate > .display").text());
            $("#profile-container .display").hide();
            $("#profile-container .edit").show();
        });
        
        $("#profile-save-button").click(function() {
            manager.onUpdateProfile();
            $("#profile-container > .edit").hide();
        });
        
        $("#profile-back-button").click(function() {    
            manager.profile_filter = manager.data_source.options['email'];
            manager.activateProfile(undefined);
        });
        var down_time = undefined;
        $("#profile-img > .perm").click(function() {
            manager.selectTabOrRefresh(TAB_PROFILE, undefined);
            return false;
        }).mousedown(function() {
            down_time = new Date();
            return true;
        }).mouseup(function() {
            var now = new Date();
            if(now.getTime() - down_time.getTime() > 350) {
                manager.person_filter_commented = true;
            } else {
                manager.person_filter_commented = false;
            }
            return true;
        });
        
        $("#friend-request-button").click(function() {
            $("#profile-spinner-text").text("Requesting profile...");
            $("#profile-spinner").show();
            manager.data_source.sendFriendRequest(manager.profile_filter,
                manager.profiles[manager.data_source.options['email']].data,
                null,
                 function(request) {
                 
                    if(request) {
                        $("#profile-spinner").hide();
                        manager.onFriendRequests([request], undefined, true);
                        $("#friend-request-status").text("Profile request sent!").show();
                    }
                }, function(msg, detail) {
                    $("#profile-spinner").hide();
                    manager.modalError("Send Friend Request Error", msg, detail);
                    $("#share-submit-button").button("enable");
                }
            );
        });
    }
);