var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
loader.loadSubScript("chrome://socialsidebar/content/socket.js");

function SslImapClient() {
    this.clearState();
}

/**
 * @interface
 */
function ImapCommandHandler() {}
/**
 * @param {Array.<String>} reply
 */
ImapCommandHandler.prototype.onUntagged = function(reply) {};
/**
 * @param {Array.<String>} reply
 */
ImapCommandHandler.prototype.onResponse = function(reply) {};

SslImapClient.prototype.clearState = function() {
    this.server = undefined;
    this.email = undefined;
    this.username = undefined;
    this.password = undefined;
    this.socket = undefined;
    this.on_login = undefined;
    this.on_bad_password = undefined;
    this.on_disconnect = undefined;
    this.commands = undefined;
    this.pending_commands = undefined;
    this.response_data = undefined;
    this.next_command_id = undefined;
    this.current_reply = undefined;
    this.data_bytes_needed = undefined;
    this.current_folder = undefined;
    this.idling = undefined;
    this.uid_next = undefined;
    this.fully_connected = undefined;
    this.logging = undefined;
    this.capabilities = undefined;
    
};
SslImapClient.prototype.hasCapability = function(cap) {
    return this.capabilities[cap] == true;
}
SslImapClient.prototype.connect = function(server, email, password, on_login, on_bad_password, on_error, on_disconnect, logging) {
    if(this.socket) 
        throw "already connected";
    this.clearState();
    this.server = server;
    this.username = email.split('@', 1)[0];
    this.email = email;
    this.password = password;
    this.logging = logging;
    this.capabilities = {}

    this.socket = new Socket();
    try {
        this.socket.open(server, 993, "ssl", bind(this.onConnect, this));
        var client = this;
        window.setTimeout(function() {
            if(!client.fully_connected) {
                client.on_disconnect = undefined;
                client.disconnect();
                on_error("Unable to contact server! Check you server settings.");
            }
        }, 15000);
    } catch(err) {
        on_error(err)
    } 
    this.on_login = on_login;
    this.on_bad_password = on_bad_password;
    this.on_disconnect = on_disconnect;
    this.commands = [];
    this.next_command_id = 1;
    this.pending_commands = {};
    this.response_data = "";
    this.current_reply = [""];
    this.data_bytes_needed = undefined;
    this.current_folder = undefined;
    this.idling = false;
    this.uid_next = {};
    this.pending_commands["*"] = {"handler":bind(this.onAckConnect, this), "untagged":function(){}};
};
SslImapClient.prototype.onAckConnect = function(reply) {
    this.fully_connected = true;
    // alert("Initial Hello\n" + response + "\n" + extra);
    var client = this;
    var u = encode_utf8(this.username.replace("\\", "\\\\").replace("\"", "\\\""));
    var p = encode_utf8(this.password);
    //this.sendCommand('LOGIN \"' + u + '\" \"' + p + "\"", bind(this.onLogin, this), function() {});
    // var auth = btoa("\0" + u + "\0" + p);
    // this.sendCommand('AUTHENTICATE PLAIN',bind(this.onLogin, this), function() {}, true, 
    //     function() {
    //         if(client.logging)
    //             Cu.reportError("IMAP OUT @ " + new Date() + ":\n" + auth);
    //         client.socket.write(auth + "\r\n");
    //     }
    // );
    this.sendCommand('LOGIN \"' + u + '\" {' + p.length + '}',bind(this.onLogin, this), function() {}, true, 
        function() {
            if(client.logging)
                Cu.reportError("IMAP OUT @ " + new Date() + ":\n" + p);
            client.socket.write(p + "\r\n");
        }
    );
};
SslImapClient.prototype.onLogin = function(reply) {
    var reply = reply[0].split(" ", 1);
    var client = this;
    if(reply == "OK") {
        this.sendCommand("CAPABILITY", 
            function() {
                client.on_login();
            }, 
            function(reply) {
                var parts = reply[0].split(" ");
                if(parts[0] == "CAPABILITY") {
                    parts.shift();
                    for(var i = 0; i < parts.length; ++i) {
                        client.capabilities[parts[i]] = true;
                    }
                }
            }
        );
    } else {
        this.on_disconnect = undefined;
        this.on_bad_password();
        this.disconnect();
    }
};
/*
 * @constructor
 */
function ImapListHandler(since_uid, next_uid, on_success, on_error) {
    this.results = [];
    this.since_uid = since_uid;
    this.next_uid = next_uid;
    this.on_success = on_success;
    this.on_error = on_error;
};
/**
 * @param {Array.<String>} reply
 */
ImapListHandler.prototype.onUntagged = function(reply) {
    if(reply[0].split(" ")[0] != "SEARCH")
        return;
    this.results = reply[0].split(" ");
    this.results.shift();
    if(this.results[this.results.length - 1] == "")
        this.results.pop();
    for(var i = 0; i < this.results.length; ++i) {
        this.results[i] = parseInt(this.results[i]);
    }
};
/**
 * @param {Array.<String>} reply
 */
ImapListHandler.prototype.onResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        if(!this.next_uid) {
            for(var i = 0; i < this.results.length; ++i) {
                if(!this.next_uid || this.results[i] > this.next_uid)
                    this.next_uid = this.results[i] + 1;
                if(this.results[i] < this.since_uid) {
                    this.results.splice(i, 1);
                }
            }
        }
        this.on_success(this.results, this.next_uid);
    }
};
// var month_short_names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/**
 * @param {string} folder
 * @param {string} tag
 * @param {number} after_uid
 * @param {Date} since_date
 * @param {function(Array.<number>, number)} on_success
 * @param {function(string)} on_error
 */
SslImapClient.prototype.listMessages = function(folder, tag, since_uid, mrp, on_success, on_error) {
    if(tag == undefined)
        tag = "[Mr.Privacy][";
    else
        tag = "[Mr.Privacy][" + tag + "]";
    var client = this;
    var next_uid = undefined;
    //you have to issue a select before search or the IMAP server may return a cached set of results (atleast GMAIL does)
    this.sendCommand("SELECT \"" + folder + "\"", function(reply) {
        //alert("got select");
        if(reply[0].split(" ", 1) != "OK") {
            on_error(reply[0]);
        } else {
            client.current_folder = folder;
            if(next_uid && since_uid && since_uid >= next_uid) {
                on_success([], next_uid);
                return;
            }
            var handler = new ImapListHandler(since_uid, next_uid, on_success, on_error);
            // if(since_date) {
            //     since_date = " SENTSINCE " + since_date.getDate() + "-" + month_short_names[since_date.getMonth()] + "-" + since_date.getFullYear();
            // } else {
            //     since_date = "";
            // }
            if(since_uid) {
                since_uid = " UID " + since_uid + ":*";
            } else {
                since_uid = "";
            }
            if(mrp)
                mrp = " SUBJECT \"" + tag + "\" HEADER \"X-MR-PRIVACY\" \"\"";
            else 
                mrp = "";
            client.sendCommand("UID SEARCH" + since_uid + " NOT DELETED" + mrp, bind(handler.onResponse, handler), bind(handler.onUntagged, handler), true);
        }
    }, function(reply) {
        if(reply[0].indexOf("UIDNEXT") != -1) {
            next_uid = parseInt(reply[0].split("UIDNEXT ", 2)[1].split("]")[0]);
        } 
    });
};
/*
 * @constructor
 */
function ImapOpenOrCreateHandler(client, folder, on_success, on_error) {
    this.on_success = on_success;
    this.on_error = on_error;
    this.folder = folder;
    this.client = client;
};
/**
 * @param {Array.<String>} reply
 */
ImapOpenOrCreateHandler.prototype.onUntagged = function(reply) {
};
/**
 * @param {Array.<String>} reply
 */
ImapOpenOrCreateHandler.prototype.onCreateResponse = function(reply) {
    this.client.sendCommand("SELECT \"" + this.folder + "\"", bind(this.onSelectResponse, this), bind(this.onUntagged, this), true);
};
/**
 * @param {Array.<String>} reply
 */
ImapOpenOrCreateHandler.prototype.onSelectResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        this.client.current_folder = this.folder;
        this.on_success();
    }
};
SslImapClient.prototype.openOrCreateFolder = function(folder, on_success, on_error) {
    var handler = new ImapOpenOrCreateHandler(this, folder, on_success, on_error);
    this.sendCommand("CREATE " + folder, bind(handler.onCreateResponse, handler), bind(handler.onUntagged, handler), false);
};

/*
 * @constructor
 */
function ImapCreateHandler(on_success, on_error) {
    this.on_success = on_success;
    this.on_error = on_error;
};
/**
 * @param {Array.<String>} reply
 */
ImapCreateHandler.prototype.onUntagged = function(reply) {
};
/**
 * @param {Array.<String>} reply
 */
ImapCreateHandler.prototype.onResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        this.on_success(this.messages);
    }
};
/**
 * @param {string} folder
 * @param {function()} on_success
 * @param {function(string)} on_error
 */
SslImapClient.prototype.createFolder = function(folder, on_success, on_error) {
    var handler = new ImapCreateHandler(on_success, on_error);
    this.sendCommand("CREATE " + folder, bind(handler.onResponse, handler), bind(handler.onUntagged, handler), false);
}
/*
 * @constructor
 */
function ImapCopyHandler(on_success, on_error) {
    this.on_success = on_success;
    this.on_error = on_error;
};
/**
 * @param {Array.<String>} reply
 */
ImapCopyHandler.prototype.onUntagged = function(reply) {
};
/**
 * @param {Array.<String>} reply
 */
ImapCopyHandler.prototype.onResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        this.on_success(this.messages);
    }
};
/**
 * @param {string} to
 * @param {string} from
 * @param {number} uid
 * @param {function()} on_success
 * @param {function(string)} on_error
 */
SslImapClient.prototype.copyMessage = function(to, from, uid, on_success, on_error) {
    if(typeof(uid) == "Array")
        uid = uid.join(",");
    var client = this;
    if(this.current_folder != from) {
        this.sendCommand("SELECT \"" + folder + "\"", function(reply) {
            //alert("got select");
            if(reply[0].split(" ", 1) != "OK") {
                on_error(reply[0]);
            } else {
                client.current_folder = from;
                var handler = new ImapCopyHandler(on_success, on_error);
                client.sendCommand("UID COPY " + uid + " " + to, bind(handler.onResponse, handler), bind(handler.onUntagged, handler), true);
            }
        }, function() {});
    } else {
        var handler = new ImapCopyHandler(on_success, on_error);
        client.sendCommand("UID COPY " + uid + " " + to, bind(handler.onResponse, handler), bind(handler.onUntagged, handler), false);
    }
}
/*
 * @constructor
 */
function ImapDeleteHandler(client, uid, on_success, on_error) {
    this.client = client;
    this.on_success = on_success;
    this.on_error = on_error;
    this.uid = uid;
};
/**
 * @param {Array.<String>} reply
 */
ImapDeleteHandler.prototype.onUntagged = function(reply) {
};
/**
 * @param {Array.<String>} reply
 */
ImapDeleteHandler.prototype.onResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        //we don't need to wait for the expunge
        if(!this.client.hasCapability("UIDPLUS")) {
            this.client.sendCommand("EXPUNGE", function() {}, function() {}, true);
        } else {
            this.client.sendCommand("UID EXPUNGE " + this.uid, function() {}, function() {}, true);
        }
        this.on_success(this.messages);
    }
};
/**
 * @param {string} to
 * @param {string} from
 * @param {number} uid
 * @param {function()} on_success
 * @param {function(string)} on_error
 */
SslImapClient.prototype.deleteMessage = function(folder, uid, on_success, on_error) {
    if(typeof(uid) == "Array")
        uid = uid.join(",");
    var client = this;
    if(this.current_folder != folder) {
        this.sendCommand("SELECT \"" + folder + "\"", function(reply) {
            //alert("got select");
            if(reply[0].split(" ", 1) != "OK") {
                on_error(reply[0]);
            } else {
                client.current_folder = folder;
                var handler = new ImapDeleteHandler(client, uid, on_success, on_error);
                client.sendCommand("UID STORE " + uid + " +FLAGS (\\Deleted)", bind(handler.onResponse, handler), bind(handler.onUntagged, handler), true);
            }
        }, function() {});
    } else {
        var handler = new ImapDeleteHandler(client, uid, on_success, on_error);
        client.sendCommand("UID STORE " + uid + " +FLAGS (\\Deleted)", bind(handler.onResponse, handler), bind(handler.onUntagged, handler), false);
    }
}


//TODO: is this according to the RFC
function extractMailAddressRFC(raw) {
    var lt = raw.indexOf('<');
    if(lt != -1) {
        var gt = raw.indexOf('>');
        raw = raw.slice(lt + 1, gt);
    }
    return raw.trim();
}

var message_tokenizer = /\(|\)|\\?[\w\d]+(?:\[[^\]]*\])?|\s+|(?:"(?:[^"\\]|\\.)*")|\{\d*\}/g;

function tokenizeMessage(msg) {
    var match;
    var tokens = [];
    var levels = [tokens];
    message_tokenizer.lastIndex = 0;
    do {
        // Cu.reportError(JSON.stringify(levels));
        var last_index = message_tokenizer.lastIndex;
        match = message_tokenizer.exec(msg);
        //invalid message
        if(!match || last_index + match[0].length != message_tokenizer.lastIndex) {
            // Cu.reportError("skipped @\n" + msg.slice(last_index));
            return undefined;
        }
        if(match[0] == "(") {
            levels.push([]);
            levels[levels.length - 2].push(levels[levels.length - 1]);
        } else if(match[0] == ")") {
            levels.pop();
            if(levels.length == 0) {
                // Cu.reportError("too many )");
                return undefined;
            }
        } else if(!(/^\s+$/.test(match[0]))) {
            levels[levels.length - 1].push(match[0]);
        }
    } while(message_tokenizer.lastIndex != msg.length);
    if(message_tokenizer.lastIndex != msg.length) {
        // Cu.reportError("missed end");
        return undefined;
    }
    return tokens;
}

function mimeBodyStructure(parts) {
    var mime = [];
    if((typeof parts[0]) == "object") {
        for(var i = 0; i < parts.length; ++i) {
            if((typeof parts[i]) == "object")
                mime.push(mimeBodyStructure(parts[i]));
            else
                break;
        }
        return mime;
    }
    return (parts[0].slice(1, parts[0].length - 1) + "/" + parts[1].slice(1, parts[1].length - 1)).toLowerCase();
}

function partsOfType(parts, type) {
    var jsons = [];
    for(var i = 0; i < parts.length; ++i) {
        if(parts[i]  == type) {
            jsons.push("" + (i + 1))
            continue;
        }
        if(typeof parts[i]  != "object")
            continue;
        var p = partsOfType(parts[i], type);
        if(!p)
            continue;
        for(var j = 0; j < p.length; ++j)
            jsons.push("" + (i + 1) + "." + p[j]);
    }
    if(jsons.length == 0)
        return undefined;
    return jsons;
}

/*
 * @constructor
 */
function MrPrivacyMessage() {
    this.id = undefined;
    this.uid = undefined;
    this.tag = undefined;
    this.date = undefined;
    this.from = undefined;
    this.to = undefined;
    this.objs = undefined;
    this.structure = undefined;
}

/*
 * @constructor
 */
function ImapFetchMrpHandler(client, on_success, on_error) {
    this.structures = {};
    this.messages = {};
    this.finished_messages = [];
    this.finished_message_ids = [];
    this.client = client;
    this.on_success = on_success;
    this.on_error = on_error;
};
var whitespace_start_regex = /^\s+/;
/**
 * @param {Array.<String>} reply
 */
ImapFetchMrpHandler.prototype.onUntagged = function(reply) {
    if(reply.length < 2) {
        //this means a header was not returned
        return;
    }
    //TODO: other checks like split(" ")[1] == "FETCH"?
    //TODO: does imap always return them in our requested order?
    var msg = new MrPrivacyMessage();
    msg.uid = parseInt(reply[0].split("UID ", 2)[1].split(" ", 1)[0]);
    var headers = reply[1].split("\r\n");
    for(var i = 0; i < headers.length; ++i) {
        var header = headers[i];
        while(i + 1 < headers.length && whitespace_start_regex.test(headers[i + 1])) {
            var whitespace = whitespace_start_regex.exec(headers[i + 1]);
            header += " " + headers[i + 1].slice(whitespace.length);
            ++i;
        }
        var colon = header.indexOf(":");
        var key = header.slice(0, colon);
        key = key.toLowerCase(); // name will only be lower case
        var value = header.slice(colon + 2); //skip ": "
        switch(key) {
        case "message-id":
            msg.id = value;
            break;
        case "subject":
            var tag_part = /\[Mr\.Privacy\]\[[^\]]+\]/.exec(value);
            if(tag_part) {
                msg.tag = tag_part[0].slice(13);
                msg.tag = msg.tag.slice(0, msg.tag.length - 1);
            } else {
                Cu.reportError("Bad subject for Mr. P:\n" + value + "\n" + JSON.stringify(headers));
            }
            break;
        case "date":
            msg.date = new Date(value);
            break;
        case "from":
            msg.from = extractMailAddressRFC(value);
            break;
        case "to":
            msg.to = value.split(",");
            for(var j = 0; j < msg.to.length; ++j) {
                msg.to[j] = extractMailAddressRFC(msg.to[j]);
            }
            break;
        }
        
    } 
    if(!msg.uid || !msg.tag || !msg.date || !msg.from || !msg.to) {
        return;
    }
    var parts = tokenizeMessage(reply[0]);
    if(!parts) {
        Cu.reportError("failed to parse " + msg.uid + "\n" + reply[0]);
        return;
    }

    parts = parts[2];
    for(var i = 0; i < parts.length - 1; ++i) {
        if(parts[i] == "BODYSTRUCTURE") {
            msg.structure = mimeBodyStructure(parts[i + 1]);
            var s = JSON.stringify(msg.structure);
            if(!(s in this.structures)) {
                this.structures[s] = [];
            }
            this.structures[s].push(msg.uid);
            this.messages[msg.uid] = msg;
            return;
        }
    }
};
ImapFetchMrpHandler.prototype.onUntaggedBody = function(reply) {
    var uid = parseInt(reply[0].split("UID ", 2)[1].split(" ", 1)[0]);
    var msg = this.messages[uid];
    if(msg == undefined) {
        Cu.reportError("unknown uid returned " + uid);
        return;
    }

    if(reply.length < 2) {
        Cu.reportError("missing body for uid " + uid);
        //this means a body was not returned
        delete this.messages[uid];
        return;
    }
    try {
        msg.objs = [];
        for(var i = 1; i < reply.length; ++i) {
            msg.objs.push(objify(decode_utf8(atob(reply[i].replace(/[\r\n]/g, "")))));
        }
        this.finished_messages.push(msg);
        this.finished_message_ids.push(msg.uid);
    } catch (err) {
        delete this.messages[uid];
    }
}
/**
 * @param {Array.<String>} reply
 */
ImapFetchMrpHandler.prototype.onResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        for(var s in this.structures) {
            // Cu.reportError("" + this.structures[s].length + " messages of type\n" + s);
            var example_msg_uid = this.structures[s][0];
            var st = this.messages[example_msg_uid].structure;
            var uid = "" + this.structures[s].join(",");
            var part = partsOfType(st, "application/json");
            if(!part)
                continue;
            this.client.sendCommand("UID FETCH " + uid + " (BODY.PEEK[" + part.join("] BODY.PEEK[") + "])", bind(this.onResponse, this), bind(this.onUntaggedBody, this), true);
            delete this.structures[s];
            return;
        }

        this.on_success(this.finished_messages, this.finished_message_ids);
    }
};    

/**
 * @param {string} folder
 * @param {number} uid
 * @param {function(Array.<MrPrivacyMessage>)} on_success
 * msgid, tag, date, from, to, obj
 * @param {function(string)} on_error
 */
SslImapClient.prototype.getMrpMessage = function(folder, uid, on_success, on_error) {
    if(typeof(uid) == "Array")
        uid = uid.join(",");
    var client = this;
    //TODO: can we assume that a mime forwarding mailing list will always make our message MIME part one.
    //This code assumes the JSON is either part 2 or 1.2 and relies on the server to return an inline nil for the missing part
    if(this.current_folder != folder) {
        this.sendCommand("SELECT \"" + folder + "\"", function(reply) {
            //alert("got select");
            if(reply[0].split(" ", 1) != "OK") {
                on_error(reply[0]);
            } else {
                client.current_folder = folder;
                var handler = new ImapFetchMrpHandler(client, on_success, on_error);
                client.sendCommand("UID FETCH " + uid + " (BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO DATE FROM TO SUBJECT)] BODYSTRUCTURE)", bind(handler.onResponse, handler), bind(handler.onUntagged, handler), true);
            }
        }, function() {});
    } else {
        var handler = new ImapFetchMrpHandler(client, on_success, on_error);
        client.sendCommand("UID FETCH " + uid + " (BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO DATE FROM TO SUBJECT)] BODYSTRUCTURE)", bind(handler.onResponse, handler), bind(handler.onUntagged, handler), false);
    }
};
/*
 * @constructor
 */
function PlainMessage() {
    this.id = undefined;
    this.uid = undefined;
    this.date = undefined;
    this.from = undefined;
    this.to = undefined;
    this.subject = undefined;
    this.body = undefined;
    this.structure = undefined;
}

/*
 * @constructor
 */
function ImapFetchPlainHandler(client, on_success, on_error) {
    this.structures = {};
    this.messages = {};
    this.finished_messages = [];
    this.finished_message_ids = [];
    this.client = client;
    this.on_success = on_success;
    this.on_error = on_error;
};
var whitespace_start_regex = /^\s+/;
/**
 * @param {Array.<String>} reply
 */
ImapFetchPlainHandler.prototype.onUntagged = function(reply) {
    if(reply.length < 2) {
        //this means a header was not returned
        return;
    }
    //TODO: other checks like split(" ")[1] == "FETCH"?
    //TODO: does imap always return them in our requested order?
    var msg = new PlainMessage();
    msg.uid = parseInt(reply[0].split("UID ", 2)[1].split(" ", 1)[0]);
    var headers = reply[1].split("\r\n");
    for(var i = 0; i < headers.length; ++i) {
        var header = headers[i];
        while(i + 1 < headers.length && whitespace_start_regex.test(headers[i + 1])) {
            var whitespace = whitespace_start_regex.exec(headers[i + 1]);
            header += " " + headers[i + 1].slice(whitespace.length);
            ++i;
        }
        var colon = header.indexOf(":");
        var key = header.slice(0, colon);
        key = key.toLowerCase(); // name will only be lower case
        var value = header.slice(colon + 2); //skip ": "
        switch(key) {
        case "message-id":
            msg.id = value;
            break;
        case "subject":
            msg.subject = value;
            break;
        case "date":
            msg.date = new Date(value);
            break;
        case "from":
            msg.from = extractMailAddressRFC(value);
            break;
        case "to":
            msg.to = value.split(",");
            for(var j = 0; j < msg.to.length; ++j) {
                msg.to[j] = extractMailAddressRFC(msg.to[j]);
            }
            break;
        }
        
    } 
    if(!msg.uid || !msg.date || !msg.from || !msg.to) {
        return;
    }
    var parts = tokenizeMessage(reply[0]);
    if(!parts) {
        Cu.reportError("failed to parse " + msg.uid + "\n" + reply[0]);
        return;
    }

    parts = parts[2];
    for(var i = 0; i < parts.length - 1; ++i) {
        if(parts[i] == "BODYSTRUCTURE") {
            msg.structure = mimeBodyStructure(parts[i + 1]);
            var s = JSON.stringify(msg.structure);
            if(!(s in this.structures)) {
                this.structures[s] = [];
            }
            this.structures[s].push(msg.uid);
            this.messages[msg.uid] = msg;
            return;
        }
    }
};
ImapFetchPlainHandler.prototype.onUntaggedBody = function(reply) {
    var uid = parseInt(reply[0].split("UID ", 2)[1].split(" ", 1)[0]);
    var msg = this.messages[uid];
    if(msg == undefined) {
        Cu.reportError("unknown uid returned " + uid);
        return;
    }

    if(reply.length < 2) {
        Cu.reportError("missing body for uid " + uid);
        //this means a body was not returned
        delete this.messages[uid];
        return;
    }
    try {
        msg.body = [];
        for(var i = 1; i < reply.length; ++i) {
            msg.body.push(decode_utf8(reply[i]));
        }
        this.finished_messages.push(msg);
        this.finished_message_ids.push(msg.uid);
    } catch (err) {
        delete this.messages[uid];
    }
}
/**
 * @param {Array.<String>} reply
 */
ImapFetchPlainHandler.prototype.onResponse = function(reply) {
    if(reply[0].split(" ", 1) != "OK") {
        this.on_error(reply[0]);
    } else {
        for(var s in this.structures) {
            // Cu.reportError("" + this.structures[s].length + " messages of type\n" + s);
            var example_msg_uid = this.structures[s][0];
            var st = this.messages[example_msg_uid].structure;
            var uid = "" + this.structures[s].join(",");
            var part = partsOfType(st, "text/plain");
            if(!part)
                continue;
            this.client.sendCommand("UID FETCH " + uid + " (BODY.PEEK[" + part.join("] BODY.PEEK[") + "])", bind(this.onResponse, this), bind(this.onUntaggedBody, this), true);
            delete this.structures[s];
            return;
        }

        this.on_success(this.finished_messages, this.finished_message_ids);
    }
};    

/**
 * @param {string} folder
 * @param {number} uid
 * @param {function(Array.<PlainMessage>)} on_success
 * msgid, tag, date, from, to, obj
 * @param {function(string)} on_error
 */
SslImapClient.prototype.getPlainMessage = function(folder, uid, on_success, on_error) {
    if(typeof(uid) == "Array")
        uid = uid.join(",");
    var client = this;
    //TODO: can we assume that a mime forwarding mailing list will always make our message MIME part one.
    //This code assumes the JSON is either part 2 or 1.2 and relies on the server to return an inline nil for the missing part
    if(this.current_folder != folder) {
        this.sendCommand("SELECT \"" + folder + "\"", function(reply) {
            //alert("got select");
            if(reply[0].split(" ", 1) != "OK") {
                on_error(reply[0]);
            } else {
                client.current_folder = folder;
                var handler = new ImapFetchPlainHandler(client, on_success, on_error);
                client.sendCommand("UID FETCH " + uid + " (BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO DATE FROM TO SUBJECT)] BODYSTRUCTURE)", bind(handler.onResponse, handler), bind(handler.onUntagged, handler), true);
            }
        }, function() {});
    } else {
        var handler = new ImapFetchPlainHandler(client, on_success, on_error);
        client.sendCommand("UID FETCH " + uid + " (BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO DATE FROM TO SUBJECT)] BODYSTRUCTURE)", bind(handler.onResponse, handler), bind(handler.onUntagged, handler), false);
    }
};

/**
 * @param {string} folder
 */
SslImapClient.prototype.waitMessages = function(folder, expected_next_uid, on_success, on_error) {
    var client = this;
    var cancel_idle = false;
    var exists = undefined;
    this.sendCommand("SELECT \"" + folder + "\"", 
        function(reply) {
            //alert("got select");
            if(reply[0].split(" ", 1) != "OK") {
                on_error(reply[0]);
            } else {
                client.current_folder = folder;
                if(cancel_idle) {
                    on_success();
                    return;
                }
                client.sendCommand("IDLE", 
                    function(reply) { 
                        client.idling = false; 
                        if(reply[0].split(" ", 1) != "OK") {
                            on_error(reply[0]);
                        } else {
                            on_success();
                        }
                    }, function(reply) { 
                        if(reply[0].indexOf("EXISTS") != -1) {
                            var new_exists = parseInt(reply[0].split(" ", 1)[0]);
                            if(exists != new_exists) {
                                // alert("exists changed, idle satisfied");
                                cancel_idle = true;
                            }
                            if(client.idling) {
                                this.idling = false;
                                if(this.logging)
                                    Cu.reportError("IMAP OUT @ " + new Date() + ":\nDONE\nReason: cancel after continuation response");
                                client.socket.write("DONE\r\n");
                            }
                        } 
                    }, true, function() { 
                        if(!cancel_idle)
                            client.idling = true;
                        else {
                            this.idling = false;
                            if(this.logging)
                                Cu.reportError("IMAP OUT @ " + new Date() + ":\nDONE\nReason: cancel idle on continuation response");
                            client.socket.write("DONE\r\n");
                        }
                        
                    }
                );
            }
        }, function(reply) {
            if(reply[0].indexOf("UIDNEXT") != -1) {
                var next_uid = parseInt(reply[0].split("UIDNEXT ", 2)[1].split("]")[0]);
                if(expected_next_uid == undefined) {
                    expected_next_uid = next_uid;
                    alert("assuming wait for any new message could lose data" + expected_next_uid);
                } else {
                    if(next_uid > expected_next_uid)
                        cancel_idle = true;
                }
            } 
            if(reply[0].indexOf("EXISTS") != -1) {
                exists = parseInt(reply[0].split(" ", 1)[0]);
            } 
        }
    );
};
SslImapClient.prototype.sendCommand = function(command, on_response, on_untagged, continuation, on_continue) {
    if(on_untagged == undefined)
        on_untagged = function(reply) { alert("untagged\n" + reply); };
    if(on_continue == undefined)
        on_continue = function(reply) { alert("continue\n" + reply); };
    if(!continuation)
        this.commands.push({"command":command, "handler":on_response, "untagged": on_untagged, "continue": on_continue});
    else
        this.commands.unshift({"command":command, "handler":on_response, "untagged": on_untagged, "continue": on_continue});
    this.internalNextCommand();
};
SslImapClient.prototype.internalNextCommand = function() {
    if(!this.idling) {
        for(var id in this.pending_commands) {
            //bail out if there are pending commands
            return;
        }
    }
    if(this.commands.length == 0)
        return;
    if(this.idling && this.commands[0]["command"] != "DONE") {
        //cancel the idle
        this.idling = false;
        if(this.logging)
            Cu.reportError("IMAP OUT @ " + new Date() + ":\nDONE\nReason: cancel because new command was issued: " + JSON.stringify(this.commands[0]));
        this.socket.write("DONE\r\n");
        return;
    }
    var cmd = this.commands.shift();
    var id = "Ax" + this.next_command_id++;
    cmd["id"] = id;
    var data_bit = id + " " + cmd["command"] + "\r\n";
    if(this.logging)
        Cu.reportError("IMAP OUT @ " + new Date() + ":\n" + data_bit);
    this.socket.write(data_bit);
    this.pending_commands[id] = cmd;
};
SslImapClient.prototype.disconnect = function() {
    if(this.socket == undefined)
        return;
    this.socket.close();
    this.socket = undefined;
};
SslImapClient.prototype.onConnect = function() {
    // alert('connected');
    var client = this;
    var socket_cbs = {
        "streamStarted": function (socketContext){ 
            //do nothing, this just means data came in... we'll
            //get it via the receiveData callback
        },
        "streamStopped": function (socketContext, status){ 
            client.onDisconnect();
        },
        "receiveData":   function (data){
            client.onData(data);
        }
    };
    this.socket.async(socket_cbs);
    this.internalNextCommand();
};
SslImapClient.prototype.onDisconnect = function() {
    if(this.socket) {
        this.socket.close();
        this.socket = undefined;
    }
    if(this.on_disconnect)
        this.on_disconnect();
};
SslImapClient.prototype.onData = function(data) {
    if(this.logging)
        Cu.reportError("IMAP IN @ " + new Date() + ":\n" + data);
    this.response_data += data;
    for(;;) {
        if(this.data_bytes_needed) {
            if(this.response_data.length < this.data_bytes_needed)
                return;
            this.current_reply.push(this.response_data.slice(0, this.data_bytes_needed));
            this.response_data = this.response_data.slice(this.data_bytes_needed);
            this.data_bytes_needed = undefined;
            //ok, now we wait for the actual command to complete
            continue;
        }
        var ofs = this.response_data.indexOf('\n');
        //not complete
        if(ofs == -1)
            return;
        var partial = this.response_data.slice(0, ofs - 1);
        var literal_end = partial.lastIndexOf('}');
        if(literal_end == ofs - 2) {
            var literal_start = partial.lastIndexOf('{');
            this.data_bytes_needed = parseInt(partial.slice(literal_start + 1, literal_end));
            this.current_reply[0] += partial.slice(0, literal_start) + "{}";
            this.response_data = this.response_data.slice(ofs + 1);
            //ok now we need the literal
            continue;
        } else {
            this.current_reply[0] += partial;
            this.response_data = this.response_data.slice(ofs + 1);
        }
        var cmd = this.current_reply[0].split(" ", 1)[0];
        this.current_reply[0] = this.current_reply[0].slice(cmd.length + 1);
        if(!(cmd in this.pending_commands)) {
            if(cmd == "*") {
                for(var i in this.pending_commands) {
                    this.pending_commands[i]["untagged"](this.current_reply);
                }
            } else if(cmd == "+") {
                for(var i in this.pending_commands) {
                    this.pending_commands[i]["continue"](this.current_reply);
                }
            } else {
                alert("unknown cmd " + cmd + " " + this.current_reply);
            }
        } else {
            this.pending_commands[cmd]["handler"](this.current_reply);
            delete this.pending_commands[cmd];
        }
        this.current_reply = [""];
        this.internalNextCommand();
    }
};

function SslSmtpClient() {
    this.clearState();
};
SslSmtpClient.prototype.clearState = function() {
    this.server = undefined;
    this.username = undefined;
    this.email = undefined;
    this.password = undefined;
    this.socket = undefined;
    this.on_login = undefined;
    this.on_bad_password = undefined;
    this.on_disconnect = undefined;
    this.commands = undefined;
    this.pending_command = undefined;
    this.response_data = undefined;
    this.current_reply = undefined;
    this.fully_connected = undefined;
    this.logging = undefined;
};
SslSmtpClient.prototype.connect = function(server, email, password, on_login, on_bad_password, on_error, on_disconnect, logging) {
    if(this.socket) 
        throw "already connected";
    this.clearState();
    this.server = server;
    this.username = email.split('@', 1)[0];
    this.email = email;
    this.password = password;
    this.logging = logging;

    this.socket = new Socket();
    try {
        this.socket.open(server, 465, "ssl", bind(this.onConnect, this));
        var client = this;
        window.setTimeout(function() {
            if(!client.fully_connected) {
                client.on_disconnect = undefined;
                client.disconnect();
                on_error("Unable to contact server! Check you server settings.");
            }
        }, 15000);
    } catch(err) {
        on_error(err);
        return;
    }
    this.on_login = on_login;
    this.on_bad_password = on_bad_password;
    this.on_disconnect = on_disconnect;
    this.commands = []
    this.response_data = "";
    this.current_reply = [];
    this.pending_command = bind(this.onAckConnect, this);
};
SslSmtpClient.prototype.onAckConnect = function(reply) {
    this.fully_connected = true;
    this.sendCommand('EHLO somehost', bind(this.onShake, this));
};
SslSmtpClient.prototype.onShake = function(reply) {
    // alert("on shake");
    var u = encode_utf8(this.username);
    var p = encode_utf8(this.password);
    var auth = btoa("\0" + u + "\0" + p);
    this.sendCommand("AUTH PLAIN " + auth, bind(this.onLogin, this));
};
SslSmtpClient.prototype.sendMessage = function(tag, to, subject, related, html, txt, obj, on_success, on_error) {
    if(!this.fully_connected) {
        on_error("SMTP is not fully connected");
        return;
    }
    if(to.length < 1)
        throw "at least one destination email is required";
    var data = "";

    data += "X-Mr-Privacy: " + tag + "\r\n";
    if(related) 
        data += "In-Reply-To: " + related + "\r\n";
    
    data += "MIME-Version: 1.0\r\n";
    data += "To:";
    for(var i = 0; i < to.length - 1; ++i) {
        data += " " + encode_utf8(to[i]) + ",";
    }
    data += " " + to[to.length - 1] + "\r\n";

    data += "From: " + encode_utf8(this.email) + "\r\n";
    data += "Subject: " + encode_utf8(subject) + " [Mr.Privacy][" + tag + "]\r\n";
    
    var divider = "------------xxxxxxxxxxxxxxxxxxxxxxxx".replace(/x/g, function(c) { return (Math.random()*16|0).toString(10); });
    
    data += "Content-Type: multipart/alternative; boundary=\"" + divider + "\"\r\n";
    data += "\r\n";
    data += "This is a multi-part message in MIME format.\r\n";
    
    data += "--" + divider + "\r\n";
    ///////////
    data += "Content-Type: text/plain; charset=\"utf-8\"\r\n"
    data += "Content-Transfer-Encoding: 8bit\r\n";
    data += "\r\n";
    data += encode_utf8(txt.replace(/(^|[^\r])(?=\n)/g, function(c) { return c + "\r"; }));
    data += "\r\n";
    ///////////

    data += "--" + divider + "\r\n";
    ///////////
    data += "Content-Type: application/json; charset=\"us-ascii\"\r\n"
    data += "Content-Transfer-Encoding: base64\r\n";
    data += "\r\n";
    var encoded = btoa(encode_utf8(jsonify(obj)));
    for(var i = 0; i < encoded.length; i += 74) {
        data += encoded.slice(i, i + 74) + "\r\n";
    }
    ///////////

    data += "--" + divider + "\r\n";
    ///////////
    data += "Content-Type: text/html; charset=\"utf-8\"\r\n"
    data += "Content-Transfer-Encoding: 8bit\r\n";
    data += "\r\n";        
    data += encode_utf8(html.replace(/(^|[^\r])(?=\n)/g, function(c) { return c + "\r"; }));
    data += "\r\n";
    ///////////
    data += "--" + divider + "--\r\n";
    data += ".";
    
    var send_cmd = {"to":to.slice(0), "data":data, "success":on_success, "error":on_error};
    var client = this;
    client.sendCommand("MAIL FROM: <" + this.email + "> BODY=8BITMIME", function(reply) {
        var code = reply[0].split(" ", 1);
        if(code != "250" && code != "354") {
            send_cmd["error"](reply.join("\n"));
            return;
        }
        if("to" in send_cmd && send_cmd["to"].length > 0) {
            //send recipients 1 by 1
            client.sendCommand("RCPT TO: <" + send_cmd.to.pop() + ">", arguments.callee, true);
        } else if("to" in send_cmd) {
            //then send the data message
            delete send_cmd["to"];
            client.sendCommand("DATA", arguments.callee, true);
        } else if("data" in send_cmd){
            //then send actual data
            var data = send_cmd["data"];
            delete send_cmd["data"];
            client.sendCommand(data, arguments.callee, true)
        } else {
            send_cmd["success"]();
        }
    });
    
};
SslSmtpClient.prototype.onLogin = function(reply) {
    var code = reply[0].split(" ", 1);
    if(code == "235") {
        this.on_login();
    } else {
        this.on_disconnect = undefined;
        this.on_bad_password();
        this.disconnect();
    }
};
SslSmtpClient.prototype.sendCommand = function(command, on_response, continuation) {
    if(!continuation)
        this.commands.push({"command":command, "handler":on_response});
    else 
        this.commands.unshift({"command":command, "handler":on_response});
    this.internalNextCommand();
};
SslSmtpClient.prototype.internalNextCommand = function() {
    if(this.pending_command)
        return;
    if(this.commands.length == 0)
        return;
    var cmd = this.commands.shift();
    var data_bit = cmd["command"] + "\r\n";
    if(this.logging)
        Cu.reportError("SMTP OUT @ " + new Date() + ":\n" + data_bit);
    this.socket.write(data_bit);
    this.pending_command = cmd["handler"];
};
SslSmtpClient.prototype.disconnect = function() {
    if(this.socket == undefined)
        return;
    this.socket.close();
    this.socket = undefined;
};
SslSmtpClient.prototype.onConnect = function() {
    // alert('connected');
    var client = this;
    var socket_cbs = {
        "streamStarted": function (socketContext){ 
            //do nothing, this just means data came in... we'll
            //get it via the receiveData callback
        },
        "streamStopped": function (socketContext, status){ 
            client.onDisconnect();
        },
        "receiveData":   function (data){
            client.onData(data);
        }
    };
    this.socket.async(socket_cbs);
    this.internalNextCommand();
};
SslSmtpClient.prototype.onDisconnect = function() {
    if(this.socket) {
        this.socket.close();
        this.socket = undefined;
    }
    if(this.on_disconnect)
        this.on_disconnect();
};
SslSmtpClient.prototype.onData = function(data) {
    if(this.logging)
        Cu.reportError("SMTP IN @ " + new Date() + ":\n" + data);
    this.response_data += data;
    for(;;) {
        var ofs = this.response_data.indexOf('\n');
        //not complete
        if(ofs == -1) {
            // alert("bailing\n" + this.response_data);
            return;
        }
        //TODO: handle gibbrish respone (not a 3 dig number with a space or - after it)
        var reply = this.response_data.slice(0, ofs - 1);
        this.response_data = this.response_data.slice(ofs + 1);
        this.current_reply.push(reply);
        // alert("adding\n" + reply);
        if(reply[3] == "-")
            continue;
        // alert("issuing\n" + this.current_reply);
        if(this.pending_command)
            this.pending_command(this.current_reply);
        else {
            var code = this.current_reply[0].split(" ", 1)[0];
            if(code == "451" || code == "421") {
                this.disconnect();
                //SMTP timeout, just pass on the disconnect message
            } else {
                alert("unexpected reply: " + this.current_reply);
            }
        }
        this.current_reply = []
        this.pending_command = undefined;
        this.internalNextCommand();
    }
};


/**
 * @param {Array.<string>} emails
 */
function elimateDuplicateAddreses(emails, skip) {
    var mushed = {};
    for(var i = 0; i < emails.length; ++i) {
        mushed[emails[i]] = true;
    }
    if(skip) {
        for(var i = 0; i < skip.length; ++i) {
            delete mushed[skip[i]];
        }
    }
    var remaining = [];
    for(var i in mushed) {
        i = i.trim();
        if(i.length == 0)
            continue;
        remaining.push(i);
    }
    return remaining;
}

function MrPrivacyObject() {
    this.tag = undefined;
    this.date = undefined;
    this.from = undefined;
    this.to = undefined;
    this.obj = undefined;
}


function MrPrivacyClient() {
    this.inbox = undefined;
    this.mrprivacy = undefined;
    this.sender = undefined;
    this.options = undefined;
    this.idle = undefined;
    this.phases_left = undefined;
    this.connect_errors = undefined;
    this.db = undefined;
    this.next_inbox_uid = undefined;
    this.next_mrprivacy_uid = undefined;
    this.mrprivacy_folder_id = undefined;
    this.inbox_folder_id = undefined;
    this.offline_toggles = [];
    this.waiters = {};
}

MrPrivacyClient.prototype.onConnectFailed = function(on_error) {
    this.disconnect();
    on_error("Check your account and server settings.  Also make sure you are connected.\n\n" + this.connect_errors.join("\n"));
}
MrPrivacyClient.prototype.onConnectPhaseSuccess = function(phase, on_success, on_error, on_offline_toggle) {
    this.phases_left--;
    if(this.phases_left > 0)
        return;
    if(this.connect_errors.length > 0) {
        this.onConnectFailed(on_error);
        return;
    }
    this.idle = this.inbox.hasCapability("IDLE");
    var mrp = this;
    mrp.mrprivacy.openOrCreateFolder("MrPrivacy", 
        function() {
            Cu.reportError("mrp client mrprivacy all connected");
            try {
                mrp.openDatabase();
                mrp.startInboxProcessing();
                mrp.startObjectImport();
            } catch(err) {
                mrp.disconnect();
                on_error("Opening database failed: " + err)
                return;
            }
            mrp.offline_toggles.push(on_offline_toggle);
            on_success();
        }, function(e) {
            mrp.disconnect();
            on_error(e);
        }
    );
}
MrPrivacyClient.prototype.onConnectPhaseError = function(phase, on_error, error) {
    var err_msg = "" + error;
    if(err_msg.indexOf('OFFLINE') != -1) {
        err_msg = "Offline, cannot connect";
    }
    this.connect_errors.push(phase + " says " + err_msg + ".");
    this.phases_left--;
    if(this.phases_left > 0)
        return;
    this.onConnectFailed(on_error);
}
MrPrivacyClient.prototype.isOnline = function() {
    return this.inbox && this.inbox.socket && this.mrprivacy && this.mrprivacy.socket && this.inbox.fully_connected && this.mrprivacy.fully_connected;
}

MrPrivacyClient.prototype.openDatabase = function() {
    var file = Components.classes["@mozilla.org/file/directory_service;1"]
                         .getService(Components.interfaces.nsIProperties)
                         .get("ProfD", Components.interfaces.nsIFile);
    var db_name = this.options['email'].replace(/[^\w\d\.]/g, function(c) { return "" + c.charCodeAt(0); });
    file.append(db_name + ".sqlite");

    var storageService = Components.classes["@mozilla.org/storage/service;1"]
                            .getService(Components.interfaces.mozIStorageService);
    this.db = storageService.openDatabase(file); // Will also create the file if it does not exist
    
    var version = 1;
    var db_version = 0;
    //if the table doesn't exist then we should update
    try {
        var st_version = this.db.createStatement("SELECT version FROM versions");
        while(st_version.step()) {
            db_version = st_version.row.version;
        }
        st_version.finalize();
    } catch(e) {}

    if(this.options["clear_cache"] || db_version != version) {
        this.db.beginTransaction();
        var st_table = this.db.createStatement("SELECT name FROM sqlite_master WHERE type='table'");
        var tables = [];
        while(st_table.step()) {
            tables.push(st_table.row.name);
        }
        for(var i = 0; i < tables.length; ++i) {
            try { this.db.executeSimpleSQL("DROP TABLE " + tables[i]); } catch(e) {}
        }
        this.db.commitTransaction();
        this.db.executeSimpleSQL("VACUUM");
    }
    this.db.beginTransaction();
    try {
        if(!this.db.tableExists("versions")) {
            var fields = [
                "version INTEGER UNIQUE"
            ];        
            this.db.createTable("versions", fields.join(", "));
            this.db.executeSimpleSQL("INSERT INTO versions (version) VALUES (" + version + ") ");
        }
        if(!this.db.tableExists("objects")) {
            var fields = [
                "object_id INTEGER PRIMARY KEY",
                "message_id INTEGER",               //tells what message the object came from, for finding attachments, etc
            ];        
            this.db.createTable("objects", fields.join(", "));
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX objects_by_object_id ON objects (object_id)");
            this.db.executeSimpleSQL("CREATE INDEX objects_by_message_id ON objects (message_id)");
        }
        if(!this.db.tableExists("people")) {
            var fields = [
                "person_id INTEGER PRIMARY KEY",
                "name TEXT",                        //the name of the person
                "email TEXT UNIQUE",                 //the email of the person
            ];
            this.db.createTable("people", fields.join(", "));
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX people_by_person_id ON people (person_id)");
        }
        if(!this.db.tableExists("groups")) {
            var fields = [
                "group_id INTEGER PRIMARY KEY",
                "name TEXT",                        //the name for a group if this is a user defined group
                "flattened TEXT",                   //flattened array of people ids e.g. 1:2:5:10 in sorted order
            ];
            this.db.createTable("groups", fields.join(", "));
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX groups_by_group_id ON groups (group_id)");
            this.db.executeSimpleSQL("CREATE INDEX groups_by_flattened ON groups (flattened)");
        }
        if(!this.db.tableExists("members")) {
            var fields = [
                "group_id INTEGER",                 //a group that contains
                "person_id INTEGER",                //this member
            ];
            this.db.createTable("members", fields.join(", "));
            this.db.executeSimpleSQL("CREATE INDEX members_by_group_id ON members (group_id)");
        }
        this.db.executeSimpleSQL("CREATE TRIGGER IF NOT EXISTS group_add_member AFTER INSERT ON members BEGIN UPDATE groups SET flattened = (SELECT GROUP_CONCAT(pid, ':') FROM(SELECT members.person_id AS pid FROM members WHERE members.group_id = new.group_id ORDER BY members.person_id)) WHERE new.group_id = groups.group_id; END;");
        this.db.executeSimpleSQL("CREATE TRIGGER IF NOT EXISTS group_delete_member AFTER DELETE ON members BEGIN UPDATE groups SET flattened = (SELECT GROUP_CONCAT(pid, ':') FROM(SELECT members.person_id AS pid FROM members WHERE members.group_id = old.group_id ORDER BY members.person_id)) WHERE old.group_id = groups.group_id; END;");
        if(!this.db.tableExists("folders")) {
            var fields = [
                "folder_id INTEGER PRIMARY KEY",
                "name TEXT UNIQUE",                        //name of an imap folder (INBOX, MrPrivacy, Sent)
                "next_uid INTEGER",                        //next id to consider when scanning
            ];
            this.db.createTable("folders", fields.join(", "));
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX folders_by_folder_id ON folders (folder_id)");
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX folders_by_name ON folders (name)");
        }
        this.db.executeSimpleSQL("INSERT OR IGNORE INTO folders (name, next_uid) VALUES ('INBOX', 1)");
        this.db.executeSimpleSQL("INSERT OR IGNORE INTO folders (name, next_uid) VALUES ('MrPrivacy', 1)");
        var qfs = this.db.createStatement("SELECT folder_id FROM folders WHERE name = :folder");
        qfs.params.folder = "INBOX";
        while(qfs.step()) {
            this.inbox_folder_id = qfs.row.folder_id;
        }
        qfs.params.folder = "MrPrivacy";
        while(qfs.executeStep()) {
            this.mrprivacy_folder_id = qfs.row.folder_id;
        }
        qfs.finalize();
        if(!this.db.tableExists("messages")) {
            var fields = [
                "message_id INTEGER PRIMARY KEY",
                "folder_id INTEGER",
                "message_unique TEXT",
                "date INTEGER",
                "imap_uid INTEGER",
                "from_id INTEGER",
                "to_id INTEGER",
                "type TEXT",                        //mr privacy tag
            ];
            this.db.createTable("messages", fields.join(", "));
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX messages_by_message_id ON messages (folder_id, message_id)");
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX messages_by_type_and_imap_uid ON messages (folder_id, type, imap_uid)");
            this.db.executeSimpleSQL("CREATE UNIQUE INDEX messages_by_unique ON messages (folder_id, message_unique)");
            this.db.executeSimpleSQL("CREATE INDEX messages_by_type_and_date ON messages (folder_id, type, date)");
        }
        if(!this.db.tableExists("properties")) {
            var fields = [
                "object_id INTEGER",
                "property TEXT",
                "value",
            ];
            this.db.createTable("properties", fields.join(", "));
            this.db.executeSimpleSQL("CREATE INDEX properties_by_object_id ON properties (object_id)");
            this.db.executeSimpleSQL("CREATE INDEX properties_by_object_id_and_property ON properties (object_id, property)");
            this.db.executeSimpleSQL("CREATE INDEX properties_by_object_id_and_property_and_value ON properties (object_id, property, value)");
        }
        if(!this.db.tableExists("attachments")) {
            var fields = [
                "message_id INTEGER",
                "part TEXT",
                "content_type TEXT",
                "cache_path TEXT",
            ];
            this.db.createTable("attachments", fields.join(", "));
            this.db.executeSimpleSQL("CREATE INDEX attachments_by_message_id ON attachments (message_id)");
        }
        this.db.commitTransaction();
    } catch(e) {
        this.db.rollbackTransaction();
        throw e;
    }
    this.st_folder_has_uid = this.db.createStatement("SELECT 1 FROM messages WHERE messages.folder_id = :folder AND messages.imap_uid = :uid");
    this.st_get_person_by_email = this.db.createStatement("SELECT person_id FROM people WHERE email = :email");
    this.st_insert_person = this.db.createStatement("INSERT INTO people (email) VALUES (:email);");
    this.st_get_group_by_flattened = this.db.createStatement("SELECT group_id FROM groups WHERE flattened = :flattened");
    this.st_create_generic_group = this.db.createStatement("INSERT INTO groups (flattened) VALUES ('');");
    this.st_insert_group_member = this.db.createStatement("INSERT INTO members (group_id, person_id) VALUES (:group, :person)");
    this.st_insert_message = this.db.createStatement("INSERT INTO messages (folder_id, message_unique, date, imap_uid, from_id, to_id, type) " +
        "VALUES (" + this.mrprivacy_folder_id + ", :unique, :date, :uid, :from, :to, :type);");
    this.st_insert_object = this.db.createStatement("INSERT INTO objects (message_id) VALUES (:message);");
    this.st_insert_property = this.db.createStatement("INSERT INTO properties (object_id, property, value) VALUES (:object, :property, :value)");
    this.st_get_object = this.db.createStatement("SELECT properties.property, properties.value FROM objects LEFT OUTER JOIN properties ON properties.object_id = objects.object_id WHERE objects.object_id = :object");
    this.st_get_object_meta = this.db.createStatement("SELECT messages.message_id, messages.date, messages.type, people.email FROM objects JOIN messages ON messages.message_id = objects.message_id, people ON messages.from_id = people.person_id WHERE objects.object_id = :object");
    this.st_get_object_to = this.db.createStatement("SELECT people.email FROM objects JOIN messages ON messages.message_id = objects.message_id JOIN members ON messages.to_id = members.group_id JOIN people ON people.person_id = members.person_id WHERE objects.object_id = :object");
    //TODO: needs to pick mrp folder...
    this.st_list_objects = this.db.createStatement("SELECT objects.object_id FROM messages JOIN objects ON messages.message_id = objects.message_id WHERE messages.type = :type AND messages.folder_id = :folder ORDER BY messages.date");
    this.st_list_objects_starting_at = this.db.createStatement("SELECT objects.object_id FROM messages JOIN objects ON messages.message_id = objects.message_id WHERE messages.type = :type AND objects.object_id >= :start  AND messages.folder_id = :folder ORDER BY messages.date");
    this.st_set_next_uid = this.db.createStatement("UPDATE folders SET next_uid = :next WHERE name = :folder");
    this.st_get_next_uid = this.db.createStatement("SELECT next_uid FROM folders WHERE name = :folder");
}

MrPrivacyClient.prototype.startInboxProcessing = function() {
    this.st_get_next_uid.params.folder = "INBOX";
    while(this.st_get_next_uid.step()) {
        this.next_inbox_uid = this.st_get_next_uid.row.next_uid;
    }
    // alert("next inbox: " + this.next_inbox_uid);
    this.onNewInbox();
}
MrPrivacyClient.prototype.onNewInbox = function() {
    var mrp = this;
    mrp.inbox.listMessages("INBOX", undefined, this.next_inbox_uid, true, 
        function(ids, next_uid) {
            if(ids.length == 0) {
                mrp.next_inbox_uid = next_uid;
                if(!mrp.idle) {
                    window.setTimeout(bind(mrp.onNewInbox, mrp), 30000);
                    return;                    
                } else {
                    mrp.inbox.waitMessages("INBOX", mrp.next_inbox_uid, 
                        bind(mrp.onNewInbox, mrp),
                        function(error) {
                            Cu.reportError("failed to wait for inbox messages, reconnect needed..." + error);
                        }
                    )
                    return;
                }
            }
            mrp.next_inbox_uid = next_uid;
            mrp.inbox.copyMessage("MrPrivacy", "INBOX", ids, 
                function() {
                    mrp.inbox.deleteMessage("INBOX", ids, 
                        function() {
                            mrp.st_set_next_uid.params.folder = "INBOX";
                            mrp.st_set_next_uid.params.next = next_uid;
                            while(mrp.st_set_next_uid.step()) {};
                            //if there is no idle, we won't wake up so do it this way
                            if(!mrp.idle) 
                                mrp.onNewMrPrivacy();
                        }, function(error) {
                            //hmm...this is BAD
                            Cu.reportError("failed to delete messages, mailbox will be getting wastefully full" + error);
                        }
                    );
                    //TODO: if no idle then do the alternative
                    if(!mrp.idle) {
                        window.setTimeout(bind(mrp.onNewInbox, mrp), 30000);
                    } else {
                        mrp.inbox.waitMessages("INBOX", mrp.next_inbox_uid, 
                            bind(mrp.onNewInbox, mrp),
                            function(error) {
                                Cu.reportError("failed to wait for message messages, reconnect needed..." + error);
                            }
                        );
                    }
                },
                function(e) {
                    Cu.reportError("failed to copy messages, items will be temporarily lost" + error);
                }
            );
        }, function(e) {
            alert("Listing inbox failed!\n" + e);
        }
    );
}
MrPrivacyClient.prototype.startObjectImport = function() {
    this.st_get_next_uid.params.folder = "MrPrivacy";
    while(this.st_get_next_uid.step()) {
        this.next_mrprivacy_uid = this.st_get_next_uid.row.next_uid;
    }
    // alert("next mrp: " + this.next_mrprivacy_uid);
    this.onNewMrPrivacy();
}
MrPrivacyClient.prototype.getOrInsertPerson = function(email) {
    var person_id = undefined;
    this.st_get_person_by_email.params.email = email;
    while(this.st_get_person_by_email.step()) {
        person_id = this.st_get_person_by_email.row.person_id;
    }
    if(person_id != undefined)
        return person_id;
    this.st_insert_person.params.email = email;
    while(this.st_insert_person.step()) {};
    return this.db.lastInsertRowID;
}
MrPrivacyClient.prototype.getOrInsertGroup = function(emails) {
    var pid_map = {};
    for(var i = 0; i < emails.length; ++i) {
        pid_map[this.getOrInsertPerson(emails[i])] = emails[i];
    }
    var pids = [];
    for(var i in pid_map) {
        pids.push(i);
    }
    pids.sort();
    var group_id = undefined;
    this.st_get_group_by_flattened.params.flattened = pids.join(":");
    while(this.st_get_group_by_flattened.step()) {
        group_id = this.st_get_group_by_flattened.row.group_id;
    }
    if(group_id != undefined)
        return group_id;
    while(this.st_create_generic_group.step()) {};
    group_id = this.db.lastInsertRowID;
    for(var i = 0; i < pids.length; ++i) {
        this.st_insert_group_member.params.group = group_id;
        this.st_insert_group_member.params.person = pids[i];
        while(this.st_insert_group_member.step()) {};
    }
    return group_id;
}
MrPrivacyClient.prototype.onNewMrPrivacy = function() {
    var mrp = this;
    if(mrp.mrprivacy_timeout) {
        window.clearTimeout(mrp.mrprivacy_timeout);
        mrp.mrprivacy_timeout = undefined;
    }
    mrp.mrprivacy.listMessages("MrPrivacy", undefined, this.next_mrprivacy_uid, true, 
        function(ids, next_uid) {
            if(ids.length == 0) {
                mrp.next_mrprivacy_uid = next_uid;
                if(!mrp.idle) {
                    mrp.mrprivacy_timeout = window.setTimeout(bind(mrp.onNewMrPrivacy, mrp), 30000);
                    return;
                } else {
                    mrp.mrprivacy.waitMessages("MrPrivacy", mrp.next_mrprivacy_uid, 
                        bind(mrp.onNewMrPrivacy, mrp),
                        function(error) {
                            Cu.reportError("failed to wait for mrp messages, reconnect needed..." + error);
                        }
                    )
                    return;
                }
            }
            mrp.next_mrprivacy_uid = next_uid;
            //TODO: if there are a bunch of bad messages at the head of the inbox, then they get redownloaded and scanned each
            //start until a valid one comes in
            mrp.mrprivacy.getMrpMessage("MrPrivacy", ids,
                function(hits) {
                    if(hits.length == 0) {
                        Cu.reportError("no new messages parsed successfully...");
                        return;
                    }
                    
                    var tags = {};
                    //need to sort by uid to ensure that the "first message wins" dedupe strategy works
                    hits.sort(function(a, b) { return a.uid < b.uid; });
                    mrp.db.beginTransaction();
                    try {
                        for(var i = 0; i < hits.length; ++i) {
                            var msg = hits[i];
                            // Cu.reportError(JSON.stringify(msg));
                            mrp.st_insert_message.params.unique = msg.id;
                            mrp.st_insert_message.params.date = msg.date.getTime();
                            mrp.st_insert_message.params.uid = msg.uid;
                            mrp.st_insert_message.params.from = mrp.getOrInsertPerson(msg.from);
                            mrp.st_insert_message.params.to = mrp.getOrInsertGroup(msg.to);
                            mrp.st_insert_message.params.type = msg.tag;
                            try {
                                while(mrp.st_insert_message.step()) {};
                            } catch(e) {
                                if(mrp.db.lastError == 19) {
                                    mrp.st_insert_message.reset();
                                    mrp.st_folder_has_uid.params.folder = mrp.mrprivacy_folder_id;
                                    mrp.st_folder_has_uid.params.uid = msg.uid;
                                    var duplicate_by_uid = false;
                                    while(mrp.st_folder_has_uid.step()) {
                                        duplicate_by_uid = true;
                                        //if it is duplicated by UID then we still want to wake up because 
                                        //some other mrp client inserted it into the db (another ffx window)
                                        tags[msg.tag] = true;
                                    }
                                    if(!duplicate_by_uid) {
                                        mrp.mrprivacy.deleteMessage("MrPrivacy", msg.uid, function() {}, function() {});
                                    }
                                    continue;
                                } else {
                                    throw e;
                                }
                            }
                            tags[msg.tag] = true;
                            var message_id = mrp.db.lastInsertRowID;
                            mrp.st_insert_object.params.message = message_id;
                            for(var j = 0; j < msg.objs.length; ++j) {
                                while(mrp.st_insert_object.step()) {};
                                var object_id = mrp.db.lastInsertRowID;
                                var obj = msg.objs[j];
                                for(var prop in obj) {
                                    var v = obj[prop];
                                    if(v instanceof Array && v.unordered)  {
                                        for(var k = 0; k < v.length; ++k) {
                                            mrp.st_insert_property.params.object = object_id;
                                            mrp.st_insert_property.params.property = prop;
                                            mrp.st_insert_property.params.value = JSON.stringify(v[k]);
                                            while(mrp.st_insert_property.step()) {};
                                        }
                                    } else {
                                        mrp.st_insert_property.params.object = object_id;
                                        mrp.st_insert_property.params.property = prop;
                                        mrp.st_insert_property.params.value = JSON.stringify(v);
                                        while(mrp.st_insert_property.step()) {};
                                    }
                                }
                            }
                            
                        }
                        mrp.db.commitTransaction();
                    } catch(e) {
                        alert("failed inserting objects:\n" + e + "\n" + mrp.db.lastErrorString);
                        mrp.db.rollbackTransaction();
                    }
                    var cbs = [];
                    for(var t in tags) {
                        if(t in mrp.waiters) {
                            cbs.push.apply(cbs, mrp.waiters[t]);
                            delete mrp.waiters[t];
                        }
                    }
                    mrp.st_set_next_uid.params.folder = "MrPrivacy";
                    mrp.st_set_next_uid.params.next = next_uid;
                    while(mrp.st_set_next_uid.step()) {};

                    for(var i = 0; i < cbs.length; ++i) {
                        cbs[i]();
                    }
                    //TODO: if no idle then do the alternative
                    if(!mrp.idle) {
                        mrp.mrprivacy_timeout = window.setTimeout(bind(mrp.onNewMrPrivacy, mrp), 30000);
                    } else {
                        mrp.mrprivacy.waitMessages("MrPrivacy", mrp.next_mrprivacy_uid, 
                            bind(mrp.onNewMrPrivacy, mrp),
                            function(error) {
                                Cu.reportError("failed to wait for mrp messages, reconnect needed..." + error);
                            }
                        );
                    }
                }, function(msg) {
                    on_error("Fetching messages failed", msg);
                }
            );
        }, function(e) {
            alert("Listing mrprivacy failed!\n" + e);
        }
    );
}
MrPrivacyClient.prototype.handlePartialReconnect = function() {
    if(this.isOnline()) {
        for(var i in this.offline_toggles) {
            this.offline_toggles[i]();
        }
    }
}
MrPrivacyClient.prototype.onInboxDisconnect = function() {
    Cu.reportError("mrp client inbox disconnect");
    this.inbox = undefined;
    for(var i in this.offline_toggles) {
        this.offline_toggles[i]();
    }
    if(!this.reconnect_inbox_timeout)
        this.reconnect_inbox_timeout = window.setTimeout(bind(this.tryInboxAgain, this), 30000);
}
MrPrivacyClient.prototype.tryInboxAgain = function() {
    if(this.inbox) {
        alert("inbox already connected");
        return;
    }
    var mrp = this;
    mrp.reconnect_inbox_timeout = undefined;
    this.inbox = new SslImapClient();
    this.inbox.connect(this.options["imap_server"], this.options['email'], this.options['password'], 
        function() {
            Cu.reportError("mrp client inbox reconnected");
            mrp.handlePartialReconnect();
            mrp.startInboxProcessing();
        }, function() {
            mrp.inbox = undefined;
            alert("Email password rejected, Mr Privacy will be disabled!");
        }, function(e) {
            mrp.inbox = undefined;
            mrp.reconnect_inbox_timeout = window.setTimeout(bind(mrp.tryInboxAgain, mrp), 30000);
        },
        bind(this.onInboxDisconnect, this), 
        this.options['logging']
    );    
}
MrPrivacyClient.prototype.onMrPrivacyDisconnect = function() {
    Cu.reportError("mrp client mrprivacy disconnect");
    this.mrprivacy = undefined;
    for(var i in this.offline_toggles) {
        this.offline_toggles[i]();
    }
    if(!this.reconnect_mrprivacy_timeout)
        this.reconnect_mrprivacy_timeout = window.setTimeout(bind(this.tryMrPrivacyAgain, this), 30000);
}
MrPrivacyClient.prototype.tryMrPrivacyAgain = function() {
    if(this.mrprivacy) {
        alert("mrp already connected");
        return;
    }
    var mrp = this;
    mrp.reconnect_mrprivacy_timeout = undefined;
    this.mrprivacy = new SslImapClient();
    this.mrprivacy.connect(this.options["imap_server"], this.options['email'], this.options['password'], 
        function() {
            Cu.reportError("mrp client mrp reconnected");
            mrp.handlePartialReconnect();
            mrp.startObjectImport();
        }, function() {
            mrp.mrprivacy = undefined;
            alert("Email password rejected, Mr Privacy will be disabled!");
        }, function(e) {
            mrp.mrprivacy = undefined;
            mrp.reconnect_mrprivacy_timeout = window.setTimeout(bind(mrp.tryMrPrivacyAgain, mrp), 30000);
        },
        bind(this.onMrPrivacyDisconnect, this), 
        this.options['logging']
    );    
}
MrPrivacyClient.prototype.onSenderDisconnect = function() {
    Cu.reportError("mrp client sender disconnect");
    this.sender = undefined;
}

MrPrivacyClient.prototype.connect = function(options, on_success, on_error, on_offline_toggle) {
    if(this.connected)
        on_error("You are already connected");
    if(options['email'] == undefined || options['email'].length == 0)
        return on_error("Missing email!");
    if(options['email'].indexOf('@') == -1)
        return on_error("Email address invalid.");
    if(options['password'] == undefined || options['password'].length == 0)
        return on_error("Missing password!");
    if(options['imap_server'] == undefined || options['imap_server'].length == 0)
        return on_error("Missing IMAP server!");
    if(options['smtp_server'] == undefined || options['smtp_server'].length == 0)
        return on_error("Missing SMTP server!");

    if(options['email'].indexOf('@') == -1)
        return on_error("Email address invalid.");

    var validated = options['validated'];
    this.options = deep_copy(options);
    
    this.connect_errors = [];
    if(!validated) {
        this.phases_left = 2;
        this.inbox = new SslImapClient();
        this.inbox.connect(options["imap_server"], options['email'], options['password'], 
            bind(this.onConnectPhaseSuccess, this, "IMAP inbox", on_success, on_error, on_offline_toggle), 
            bind(this.onConnectPhaseError, this, "IMAP inbox", on_error, "bad username or password"), 
            bind(this.onConnectPhaseError, this, "IMAP inbox", on_error), 
            bind(this.onInboxDisconnect, this), 
            options['logging']
        );
        this.mrprivacy = new SslImapClient();
        this.mrprivacy.connect(options["imap_server"], options['email'], options['password'], 
            bind(this.onConnectPhaseSuccess, this, "IMAP aux", on_success, on_error, on_offline_toggle), 
            bind(this.onConnectPhaseError, this, "IMAP aux", on_error, "bad username or password"), 
            bind(this.onConnectPhaseError, this, "IMAP aux", on_error), 
            bind(this.onMrPrivacyDisconnect, this), 
            options['logging']
        );
    } 
    this.phases_left++;
    this.sender = new SslSmtpClient();
    this.sender.connect(options["smtp_server"], options['email'], options['password'], 
        bind(this.onConnectPhaseSuccess, this, "SMTP sender", on_success, on_error, on_offline_toggle), 
        bind(this.onConnectPhaseError, this, "SMTP sender", on_error, "bad username or password"), 
        bind(this.onConnectPhaseError, this, "SMTP sender", on_error), 
        bind(this.onSenderDisconnect, this), 
        options['logging']
    );
}
MrPrivacyClient.prototype.disconnect = function() {
    if(this.inbox) {
        this.inbox.disconnect();
        this.inbox = undefined;
    }
    if(this.mrprivacy) {
        this.mrprivacy.disconnect();
        this.mrprivacy = undefined;
    }
    if(this.sender) {
        this.sender.disconnect()
        this.sender = undefined;
    }
    if(this.db) {
        try {
            this.db.close();
        } catch (e) {}
        this.db = undefined;
    }
}
MrPrivacyClient.prototype.getData = function(id) {
    this.st_get_object.params.object = id;
    var obj = undefined;
    while(this.st_get_object.step()) {
        if(!obj) {
            obj = {};
        }
        var val;
        try {
            val = JSON.parse(this.st_get_object.row.value);
        } catch(e) {
            Cu.reportError("failed to parse property data: \n" + this.st_get_object.row.value);
            this.st_get_object.reset();
            return undefined;
        }
        if(this.st_get_object.row.property in obj) {
            if(obj[this.st_get_object.row.property].unordered) {
                obj[this.st_get_object.row.property].push(val);
            } else {
                var s = [];
                s.push(obj[this.st_get_object.row.property]);
                s.push(val);
                s.unordered = true;
                obj[this.st_get_object.row.property] = s;
            }
        } else {
            obj[this.st_get_object.row.property] = val;
        }
    }
    return obj;
}
MrPrivacyClient.prototype.get = function(id) {
    var obj = new MrPrivacyObject();
    obj.obj = this.getData(id);
    if(obj.obj == undefined)
        return undefined;
    this.st_get_object_meta.params.object = id;
    while(this.st_get_object_meta.step()) {
        obj.tag = this.st_get_object_meta.row.type;
        obj.date = new Date(this.st_get_object_meta.row.date);
        obj.from = this.st_get_object_meta.row.email;
    }
    this.st_get_object_to.params.object = id;
    obj.to = [];
    while(this.st_get_object_to.step()) {
        obj.to.push(this.st_get_object_to.row.email);
    }
    return obj;
}
MrPrivacyClient.prototype.list = function(start_id, tag) {
    var st;
    if(start_id != undefined) {
        st = this.st_list_objects_starting_at;
        st.params.start = start_id;
    } else {
        st = this.st_list_objects;
    }
    st.params.folder = this.mrprivacy_folder_id;
    st.params.type = tag;
    var objects = [];
    while(st.step()) {
        objects.push(st.row.object_id);
    }
    return objects;
}
MrPrivacyClient.prototype.wait = function(start_id, tag, on_success) {
    //we do the list inside because if there was any async handling in between the callers
    //last call to list, we want to catch it... not really necessary right now though    
    if(this.list(start_id, tag).length > 0) {
        on_success();
        return;
    }
    if(!(tag in this.waiters)) this.waiters[tag] = [];
    this.waiters[tag].push(on_success);
}
MrPrivacyClient.prototype.send = function(tag, to, subject, related, html, txt, obj, on_success, on_error) {
    if(this.sender) {
        this.sender.sendMessage(tag, to, subject, related, html, txt, obj, on_success, on_error);
        return;
    }

    var mrp = this;
    mrp.sender = new SslSmtpClient();
    mrp.sender.connect(mrp.options["smtp_server"], mrp.options['email'], mrp.options['password'], 
        function() {
            Cu.reportError("sender connected");
            mrp.sender.sendMessage(tag, to, subject, related, html, txt, obj, on_success, on_error);
        }, function() {
            mrp.sender = undefined;
            on_error("SMTP says bad username/password");
        }, function(err) {
            mrp.sender = undefined;
            var err_msg = "" + err;
            if(err_msg.indexOf('OFFLINE') != -1) {
                on_error("Offline, cannot connect to " + mrp.options["smtp_server"], err_msg);
                return;
            }
            on_error("Failed to connect to " + mrp.options["smtp_server"], err_msg);
        }, 
        bind(this.onSenderDisconnect, this), 
        mrp.options['logging']
    );
}
