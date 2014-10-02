var ldapjs = require('ldapjs');
var assert = require('assert');
var MongoClient = require('mongodb').MongoClient
var http = require('http')
var fs = require('fs');
var app = require('express')()
var bodyparser = require('body-parser') 
//if(!process.argv[2]) process.exit();
var Hipchatter = require('hipchatter');
var db;
var dboauth;
var dbtokens;

try { var settings = require(__dirname+"/settings.json"); }
catch (e) {
  console.error('ERROR: failed to load settings.');
  process.exit()
}
try { var settings = require(__dirname+"/settings.local.json"); }
catch (e) { console.log('WARNING: No local settings found.'); }

var jsonfile = settings.capabilities
var pcntrl = new ldapjs.PagedResultsControl({value: {size: 500}});
var ldapserver = settings.server
var ldapport = settings.port
var ldapusername = settings.username
var ldappassword = settings.password
var baseDN =  settings.baseDN
var ldap = ldapjs.createClient({url: 'ldap://'+ldapserver+':'+ldapport});

// first read Capabilities Descriptor file (once, then buffer, thus sync)
var jsonstr = fs.readFileSync(jsonfile, 'utf8')
//console.log(jsonstr);
var json = tryParseJSON(jsonstr, function(err) {
//  if(!err) return;  // not actually needed
  console.error("Failed to parse JSON file "+jsonfile)
  JSON.parse(jsonstr)  // Helpfully shows the place where error was detected
//  console.error(err)
  process.exit()
});
//console.log(json)

console.log("INFO: connecting to MongoDB")
MongoClient.connect('mongodb://127.0.0.1:27017/hcsmgr', function(err, database) {
  if(err) throw err;
  db = database;
  db.createCollection('groups', function(err, coll){
        if(err) throw err;
  });
  db.createCollection('users', function(err, coll){
        if(err) throw err;
  });
  db.createCollection('oauth', function(err, coll){
        if(err) throw err;
  	coll.count(function(err, count) {
	  console.log("(drop) count "+count)
	  if(count > 1) coll.drop(function(err) {
	    coll.save({'oauthId':null}, {w:0})
	  });
    	});
  });
  db.createCollection('tokens', function(err, coll){
        if(err) throw err;
  });

  dbtokens = db.collection('tokens')
  dboauth = db.collection('oauth')
  dboauth.find().nextObject(function (err, doc) {
  	console.log(doc)
  });
/*
  dbtokens.find().sort({$natural:-1}).limit(1).nextObject(function (err, doc) {
    console.log(doc)
  });
*/
  dbtokens.find().sort({$natural:1}).each(function (err, doc) {
    console.log(doc)
  });
});

//app.use(bodyparser.urlencoded({extended: false}))

// create application/json parser
var jsonParser = bodyparser.json()

// create application/x-www-form-urlencoded parser
// var urlencodedParser = bodyparser.urlencoded({ extended: false })

app.listen(8180)
app.get("/capabilities", function(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(jsonstr);
//  fs.createReadStream(process.argv[2]).pipe(res)
})
app.get('/', function(req, res) {
//  res.writeHead(200, { 'content-type': 'text/plain' })
  var form1 =
  '<form method="post" action="/ldapsearch">' +
  'Search: <input name="input1"><br>' +
  '<input type="submit">' +
  '</form>';

  res.write('<html><body>')
  res.write("HipChat Server Management<br/>")
  res.write("<a href='/capabilities'>capabilities description [json]</a><br/>")
  res.write("<a href='/rooms'>List of rooms</a> currently in HipChat Server<br/>")
  res.write("<a href='/newtoken'>New token</a> force a new token from HCS<br/>")
  res.write(form1)
  res.write("</body></html>")
  res.end();
})
app.get("/newtoken", function(req, res) {
//  res.writeHead(200, { 'Content-Type': 'application/json' })
//  getToken();
  dbtokens.find().sort({$natural:1}).each(function (err, doc) {
    res.end(JSON.stringify(doc))
  });
})
app.get('/rooms', function(req, res) {
  dbtokens.find().sort({$natural:-1}).limit(1).nextObject(function (err, doc) {
    if(err) throw err
    var endpoint = "http://"+settings.hcs+"/v2/"
    var hipchatter = new Hipchatter(doc.access_token, endpoint);
    // this will list all of your rooms
    hipchatter.rooms(function(err, rooms){
	if(err) {
	  console.error(err)
	  res.end(err.name+": "+err.message)
	  return;
	}
	//console.log(rooms)
	//  res.writeHead(200, { 'content-type': 'text/plain' })
	res.write('<html><body>')
	res.write("<a href='/'>Back</a><br/>")
	res.write("List of rooms in HipChat Server ("+endpoint+")<br/><br/>")
	rooms.forEach(function (room, i, arr) {
	  res.write(room.id+" "+room.name+" ")
	  var url = room.links.self
	  res.write("<a href='"+url+"'>"+url+"</a>")
	  res.write("<br/>")
	});
	res.write("</body></html>")
	res.end();
    });
  });

})
app.post('/ldapsearch', bodyparser.urlencoded({extended: false}), function(req, res) {
  res.writeHead(200, { 'content-type': 'text/html' })
  console.log(req.body)
  console.log("INFO: Binding to server ldap://"+ldapserver+":"+ldapport)
  ldap.bind(ldapusername, ldappassword, function(err) {
    if(err) {
      console.log(err);
    } else {
      console.log('authenticated');
    }
    getgroups(req.body.input1, function (event, item) {
	switch(event) {
	case null:
	  console.log(item)
	  res.write(JSON.stringify(item)+"<br/>")
	  break;
	case "END":
	  console.log(item)
	  res.end()
	  break;
	}
    });
  });

});
app.delete('/install/:oaid', function(req, res) {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end()
  console.log("Uninstall request with OAuthID: "+req.params.oaid)
});
app.post('/install', jsonParser, function(req, res) {
  res.writeHead(200, { 'content-type': 'text/plain' })
//  console.log(req)
  console.log("body")
//    console.log(req.toString())
  res.end()

  dboauth.find().nextObject(function (err, doc) {
  	req.body["_id"] = doc._id
  	console.log(req.body)
  	dboauth.save(req.body, {w:1}, function(err, obj) {
          if(err) throw err;
	  getToken()
  	});
  });
});

// Better handling & detection of malformed JSON
function tryParseJSON (jsonString, callb){
  try {
    var o = JSON.parse(jsonString);

    // Handle non-exception-throwing cases:
    // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
    // but... JSON.parse(null) returns 'null', and typeof null === "object", 
    // so we must check for that, too.
    if (o && typeof o === "object" && o !== null) {
      return o;
    }
  }
  catch (e) { callb(e); }

  return false;
};

// get a new Token and save it to DB:
function getToken()
{
var tokreq;

//  res.on('finish', function() {
var options = {
  host: settings.hcs,
  path: '/v2/oauth/token',
  port: 80,
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
};
dboauth.find().nextObject(function (err, doc) {
  options["auth"] = doc.oauthId +':'+ doc.oauthSecret;

tokreq = http.request(options, function(res) {
  console.log('STATUS: ' + res.statusCode);
  console.log('HEADERS: ' + JSON.stringify(res.headers));
  res.setEncoding('utf8');
  res.on('data', function (chunk) {
    console.log('token BODY: ' + chunk);

    var json = tryParseJSON(chunk, function(err) {
	if(err) throw err;
    });

    var T = new Date()
    var timestamp = T.getTime()
    json["validto"] = timestamp + json.expires_in

    console.log("token is: "+json.access_token)
    console.log("Now accessing "+settings.hcs+"/v2")

    dbtokens.insert(json, {w:1}, function (err, objects) { if(err) throw err; })

  });
});

tokreq.on('error', function(e) {
  console.log('problem with request: ' + e.message);
});

// write data to request body
tokreq.write("grant_type=client_credentials&scope=view_group+admin_room");
tokreq.end();

});  //find

} //getToken()



function getgroups(filter, callback)
{
var entries = 0

var options = {
  scope: 'sub'		// base|one|sub
 ,sizeLimit: 1000	// max no of entries
 ,timeLimit: 30		// in seconds
// ,filter: '(&(objectClass=group)(member=*))'
// ,attributes: 'cn, member'
};
options["filter"] = "("+filter+")";

ldap.search(baseDN, options, pcntrl, function(err, res) {
  assert.ifError(err);

  res.on('searchEntry', function(entry) {
    entries++;
//    if(entries > 2) process.exit(0);
    var group = {};
//    console.log('entry '+entries+': '+entry.dn+' ')
//    console.log('entry: ' + JSON.stringify(entry.object));
//    console.log(entry.json);
//    console.log(entry.object);

    group["dn"]=entry.object.dn
    group["cn"]=entry.object.cn
    group["description"]=entry.object.description
    group["rev"]=entry.object.uSNChanged
    group["guid"]=entry.object.objectGUID
//    group["memberof"]=entry.object.memberOf
    group["members"]=entry.object.member
    callback(null, group)
  });
  res.on('searchReference', function(referral) {
    console.log('referral: ' + referral.uris.join());
  });
  res.on('error', function(err) {
    console.error('error: ' + err.message);
    callback(err)
  });
  res.on('end', function(result) {
    console.log('status: ' + result.status);
    console.log(result);
    console.log('Found ' + entries +' entries');
    callback("END", entries)
  });
  res.on('page', function (res, cb) {
    // call 'cb' when processing complete for a page
//    asyncWaitForProcessing(cb);
    console.log('status: ' + result.status);
    callback("PAGE", result)
  });
}); //ldap.search

} //getgroups()
