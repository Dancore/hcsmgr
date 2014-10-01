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
  res.write('<html><body>')
  res.write("HipChat Server Management<br/>")
  res.write("<a href='/capabilities'>capabilities description [json]</a><br/>")
  res.write("<a href='/rooms'>List of rooms</a> currently in HipChat Server<br/>")
  res.write("<a href='/newtoken'>New token</a> force a new token from HCS<br/>")
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
app.post('/uninstall', jsonParser, function(req, res) {
  res.writeHead(200, { 'content-type': 'text/plain' })
  console.log(req)
  console.log("body")
//    console.log(req.toString())
  res.end()
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

