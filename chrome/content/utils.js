var Cu = Components.utils;
function encode_utf8( s )
{
  return unescape( encodeURIComponent( s ) );
}

function decode_utf8( s )
{
  return decodeURIComponent( escape( s ) );
}
function bind(method, obj) {
    var bound = [];
    for(var i = 2; i < arguments.length; i++)
        bound.push(arguments[i]);
    return function() {
        var new_args = bound.slice(0);
        new_args.push.apply(new_args, arguments);
        return method.apply(obj, new_args);
    }
};

String.prototype.trim = function () {
    return this.replace(/^\s*/, "").replace(/\s*$/, "");
}
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
String.prototype.startsWith = function(prefix) {
    return this.lastIndexOf(prefix, 0) === 0;
};
//courtesy mit license from quicksilver
String.prototype.score = function (abbreviation) { 
  if(abbreviation.length == 0) return 0.9;
  if(abbreviation.length > this.length) return 0.0;

  for (var i = abbreviation.length; i > 0; i--) {
    var sub_abbreviation = abbreviation.substring(0,i);
    var index = this.indexOf(sub_abbreviation);


    if(index < 0) continue;
    if(index + abbreviation.length > this.length) continue;

    var next_string       = this.substring(index+sub_abbreviation.length)
    var next_abbreviation = null;

    if(i >= abbreviation.length)
      next_abbreviation = '';
    else
      next_abbreviation = abbreviation.substring(i);
 
    var remaining_score   = next_string.score(next_abbreviation,index);
 
    if (remaining_score > 0) {
      var score = this.length-next_string.length;

      if(index != 0) {
        var j = 0;

        var c = this.charCodeAt(index-1)
        if(c==32 || c == 9) {
          for(var j=(index-2); j >= 0; j--) {
            c = this.charCodeAt(j);
            score -= ((c == 32 || c == 9) ? 1 : 0.15);
          }
        } else {
          score -= index;
        }
      }
   
      score += remaining_score * next_string.length;
      score /= this.length;
      return score;
    }
  }
  return 0.0;
};

if(typeof Components != "undefined") {
    var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
        createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
    var cryptohasher = Components.classes["@mozilla.org/security/hash;1"]
                       .createInstance(Components.interfaces.nsICryptoHash);

    converter.charset = "UTF-8";
    
    // return the two-digit hexadecimal code for a byte
    function toHexString(charCode)
    {
      return ("0" + charCode.toString(16)).slice(-2);
    }

    function md5(str) {
        var result = {};
        var data = converter.convertToByteArray(str, result);
        cryptohasher.init(cryptohasher.MD5);
        cryptohasher.update(data, data.length);
        var hash = cryptohasher.finish(false);
        var s = "";
        for(var i = 0; i < hash.length; ++i) {
            s += toHexString(hash.charCodeAt(i)); 
        }
        return s;
    }
} else {
    //fallback for running in chrome
    function md5(str) {
        return "e4d909c290d0fb1ca068ffaddf22cbd0";
    }
}
function extractFinalDomain(domain) {
    var parts = domain.split(".");
    if(parts.length < 2)
        return undefined;
    return parts.slice(parts.length - 2).join(".");
}

function urlMatch(a, b) {
    if(!b)
        return false;
    return a.split("/").slice(1).join("/") == b.split('/').slice(1).join('/');
}
function isYouTubeVideo(url) {
    return /^http:\/\/www\.youtube\.com\/watch/.test(url);
}

function getYouTubeScreen( url, size )
{
  if(url === null){ return undefined; }

  size = (size === null) ? "small" : size;
  var vid;
  var results;

  results = url.match("[\\?&]v=([^&#]*)");

  vid = ( results === null ) ? undefined : results[1];

  if(size == "small"){
    return "http://img.youtube.com/vi/"+vid+"/2.jpg";
  } else {
    return "http://img.youtube.com/vi/"+vid+"/0.jpg";
  }
}
function jsonify(o) {
    if(typeof o != "object")
        return JSON.stringify(o);
    var c = {};
    for(var p in o) {
        if(o[p] instanceof Array && c.unordered)
            c[p] = {"@set":o[p]};
        else
            c[p] = o[p];
    }
    return JSON.stringify(c);
}
function objify(j) {
    o = JSON.parse(j);
    if(typeof o != "object")
        return o;
    var c = {};
    for(var p in o) {
        if(typeof o[p] == "object" && "@set" in o[p]) {
            c[p] = o[p]["@set"];
        } else {
            c[p] = o[p];
        }
    }
    return c;
}
var Cu = Components.utils;

function textToHtml(text) {
    if(!text)
        return "";
    var escaped = text;
    var findReplace = [[/&/g, "&amp;"], [/</g, "&lt;"], [/>/g, "&gt;"], [/"/g, "&quot;"], [/\n/g, "\n<br/>\n"]];
    for(var i = 0; i < findReplace.length; ++i)
        escaped = escaped.replace(findReplace[i][0], findReplace[i][1]);
    
    escaped = escaped.replace(/http:\/\/\S+/g, function(x) { return "<a class=\"inline-link\" target=\"_main\" href=\"" + x + "\">" + x + "</a>"});
    return escaped;
}