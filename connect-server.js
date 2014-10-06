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

/*
var StringDecoder = require('string_decoder').StringDecoder;
var decoder = new StringDecoder('utf8');
var cent = new Buffer([0xC2, 0xA2]);
console.log(cent.toString());
console.log(decoder.write(cent));
var euro = new Buffer([0xE2, 0x82, 0xAC]);
var test = new Error('testerr'); var test2;
console.log(euro.toString());
console.log(decoder.write(euro));
console.log(test.constructor)
console.log(test.message)
console.log("typeof " + typeof(test))
console.log("typeof " + typeof(test2))
console.log("typeof " + typeof('test'))
if(test.constructor === Object) console.log(' is obj ')
process.exit()
*/

try { var settings = require(__dirname+"/settings.json"); }
catch (e) {
  console.error('ERROR: failed to load settings.');
  process.exit()
}
try { var settings = require(__dirname+"/settings.local.json"); }
catch (e) { console.log('WARNING: No local settings found.'); }

var jsonfile = settings.capabilities
//var pcntrl = new ldapjs.PagedResultsControl({value: {size: 500}});
var ldapserver = settings.server
var ldapport = settings.port
var ldapusername = settings.username
var ldappassword = settings.password
var baseDN =  settings.baseDN
var ldap = ldapjs.createClient({url: 'ldap://'+ldapserver+':'+ldapport});

console.log("INFO: Binding to server ldap://"+ldapserver+":"+ldapport)
ldap.bind(ldapusername, ldappassword, function(err) {
  if(err)
    console.log(err);
  else
    console.log('LDAP authenticated');
});

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
  db.createCollection('mappings', function(err, coll){
        if(err) throw err;
  });
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

  dbgroups = db.collection('groups')
  dbgroups.ensureIndex( {"guid": 1}, {unique: true, dropDups: true}, function(err, obj) {
	if(err) throw err;
	console.log(obj)
  });
  dbmaps = db.collection('mappings')
  dbtokens = db.collection('tokens')
  dboauth = db.collection('oauth')
  dboauth.find().nextObject(function (err, doc) {
  	console.log(doc)
  });
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
  'AD search:<br/>' +
  '<form method="post" action="/ldapsearch">' +
  'Group (cn): <input name="input1"/>' +
  ' or User (name): <input name="input2"/>' +
  '<input type="submit" value="Search"/>' +
  '</form>';

  var form2 =
  'AD-group to HipChat room mapping:<br/>' +
//  'Warning: Function overwrites configuration for the room, if any<br/>' +
  '<form method="post" action="/groupmap">' +
  'Map Room (Name): <input name="input2" size="20"/><br/>' +
  ' to Group (DN): <input name="input1" size="100"/>' +
  '<input type="submit" value="Add"/>' +
  '</form><br/>';

  res.write('<html><body>')
  res.write("HipChat Server Management<br/>")
  res.write("<a href='/capabilities'>capabilities description [json]</a><br/>")
  res.write("<a href='/rooms'>List of rooms</a> currently in HipChat Server<br/>")
  res.write("<a href='/newtoken'>New token</a> force a new token from HCS<br/><br/>")
  res.write(form1)
  res.write(form2)
  res.write("</body></html>")
  res.end();
})
app.post('/groupmap', bodyparser.urlencoded({extended: false}), function(req, res) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  console.log("req body: ")
  console.log(req.body)
  var inp1 = req.body.input1, inp2 = req.body.input2;

  res.write('<a href="/">Back</a><br/>')
  if(inp1.length < 1 || inp2.length < 1) {
    res.write('Room/Group missing<br/>')
    return res.end();
  }

//  res.write('trying...<br/>')
  var filter = '(&(objectclass=group)(member=*))';

  ldapsearch(inp1, filter, 1, function (event, item) {
    console.log("typeof: "+typeof(event))
    switch(event) {
	case 'ITEM':
	  console.log("ITEM: "); console.log(item)
	  res.write('Adding the following AD Group mapping to Room "'+inp2+'":')
	  res.write("<table border='1'><tr><td>Nr</td><td>CN</td><td>"
		+"AccountID</td><td>Mail</td><td>DN</td></tr></table>");
	  res.write("<table border='1'><tr><td>"+item.entry+"</td><td>"+item.cn+"</td><td>"
		+item.accountid+"</td><td>"+item.mail+"</td><td>"+item.dn
		+"</td></tr></table>");

//	  item["rooms"]=99
	  updategroup(item, function(err, obj) {
	    if (err) { 
		res.write(err.name+": "+err.message)
	    } //else {

	    res.write("Added/updated group "+item.cn+"<br/>")
	    
	  });

	//  dbmaps.insert(item.object, {w:1}, function (err, objects) { if(err) throw err; })
		
	  break;
	case 'END':
//	  console.log(" END "); //console.log(item)
	  res.write("Found "+item.entry+" entries<br/>")
	  var timer = setTimeout(function() {res.end()}, 500)
	  break;
	default:
	  console.log(event.name+": "+event.message)
	  res.end(event.name+": "+event.message)
    }
  });

//  db.groups.insert

});

function updategroup(item, callback)
{
	  dbgroups.insert(item, {w:1}, function (err, obj) { 
	    if(err.code == 11000) {
		dbgroups.findOne({"guid":item.guid}, function (err, dup) { 
		  if(err) throw err;	// err shouldnt happen here... prob
//		  console.log(dup)
		  dbgroups.remove({"guid":item.guid}, {w:1}, function (err, n) {
			if(err) console.log(err);
			console.log("Removed "+n+" docs for guid "+item.guid)
//			item["entry"]=99	//debug
			dbgroups.insert(item, {w:1}, function (err, obj) {
			  if(err) throw err;
			  return callback(null, obj)
			});
		  });
		});
//		res.write("dup "+ err.name+": "+err.message)
		console.log("dup "+ err.name+": "+err.message)
	    }
	    else if(err) {
		console.log(err.name+": "+err.message)
		console.log(err)
		return callback(err)
	    }
	    else
  	      return callback(null, obj)
	  });
}

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
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
//  console.log("req body: ")
//  console.log(req.body)
  var filter, inp = req.body.input1, inp2 = req.body.input2;
  var basedn = baseDN;

  if(inp.length > 0) {
	filter = '(&(objectclass=group)(member=*)(|(cn='+inp+')(displayname='+inp+')))';
  }
  else if(inp2.length > 0) {
	filter = '(&(objectclass=user)'
	+'(|(sn='+inp2+')(givenName='+inp2+')(sAMAccountName='+inp2+')(mail='+inp2+'))'
	+')';
  }
  res.write('<a href="/">Back</a><br/>')
  res.write("<table border='1'><tr><td>Nr</td><td>CN</td><td>"
	+"AccountID</td><td>Mail</td><td>DN</td></tr></table>");

  ldapsearch(basedn, filter, null, function (event, item) {
//  	console.log("typeof: "+typeof(event))
    switch(event) {
	case 'ITEM':
//	  console.log("ITEM: "); console.log(item)
//	  res.write(JSON.stringify(item)+"<br/>")
	  res.write("<table border='1'><tr><td>"+item.entry+"</td><td>"+item.cn+"</td><td>"
		+item.accountid+"</td><td>"+item.mail+"</td><td>"+item.dn
		+"</td></tr></table>");
	  break;
	case 'END':
//	  console.log(" END "); //console.log(item)
	  res.write("Found "+item.entry+" entries<br/>")
	  res.end()
	  break;
	default:
	  console.log(event.name+": "+event.message)
	  res.end(event.name+": "+event.message)
    }
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


function ldapsearch(basedn, filter, limit, callback)
{
var entries = 0
if(!filter || filter.length < 1) return callback(new Error("No filter specified"));
if(!basedn || basedn.length < 1) return callback(new Error("No baseDN specified"));
if(!ldap) return callback(new Error("LDAP server not bound"));

try {
  var dn = ldapjs.parseDN(basedn)
//  dn = dn.toString()
}
catch(err) {
//    console.error('error: ' + err.message);
    return callback(err)
}

var options = {
  scope: 'sub'		// base|one|sub
 ,sizeLimit: 1000	// max no of entries
 ,timeLimit: 10		// in seconds
 ,sizeLimit: 50		// max nr of entries (dft: unlimited)
 ,attributes: ['dn','cn','description','uSNChanged','objectGUID','sAMAccountName','mail','member']
};
options["filter"] = filter;
if(limit) options["sizeLimit"] = limit
//console.log(options)

//ldap.search(basedn, options, pcntrl, function(err, res) {
ldap.search(basedn, options, function(err, res) {
  assert.ifError(err);

  res.on('searchEntry', function(entry) {
    entries++;
//    if(entries > 2) process.exit(0);
    var item = {};
//    console.log('entry '+entries+': '+entry.dn+' ')
//    console.log('entry: ' + JSON.stringify(entry.object));
//    console.log(entry.json);
//    console.log(entry.object);

    item["dn"]=entry.object.dn
    item["cn"]=entry.object.cn
    item["description"]=entry.object.description
    item["rev"]=entry.object.uSNChanged
    item["guid"]=entry.object.objectGUID
//    item["memberof"]=entry.object.memberOf
    item["accountid"]=entry.object.sAMAccountName
    item["mail"]=entry.object.mail
    item["members"]=entry.object.member
    item["entry"]=entries
    return callback("ITEM", item)
  });
  res.on('searchReference', function(referral) {
    console.log('referral: ' + referral.uris.join());
  });
  res.on('error', function(err) {
//    console.error('error: ' + err.message);
    return callback(err)
  });
  res.on('end', function(result) {
//    console.log('END status: ' + result.status);
//    console.log(result);
//    console.log('Found ' + entries +' entries');
    result["entry"] = entries
    return callback("END", result)
  });
  res.on('page', function (res, cb) {
    // call 'cb' when processing complete for a page
//    asyncWaitForProcessing(cb);
    console.log('PAGE status: ' + result.status);
    return callback("PAGE", result)
  });
}); //ldap.search

} //ldapsearch()
