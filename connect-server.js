var http = require('http')
var fs = require('fs');
var app = require('express')()
var bodyparser = require('body-parser') 
//if(!process.argv[2]) process.exit();

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
  res.write("Welcome!<br><a href='/capabilities'>cap-desc.json</a>")
  res.write("</body></html>")
  res.end();
})
app.post('/install', jsonParser, function(req, res) {
  res.writeHead(200, { 'content-type': 'text/plain' })
//  console.log(req)
  console.log("body")
  console.log(req.body)
//    console.log(req.toString())
  res.end()

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
options["auth"] = req.body.oauthId +':'+ req.body.oauthSecret;

var tokreq = http.request(options, function(res) {
  console.log('STATUS: ' + res.statusCode);
  console.log('HEADERS: ' + JSON.stringify(res.headers));
  res.setEncoding('utf8');
  res.on('data', function (chunk) {
    console.log('BODY: ' + chunk);
  });
});

tokreq.on('error', function(e) {
  console.log('problem with request: ' + e.message);
});

// write data to request body
tokreq.write("grant_type=client_credentials&scope=admin_group");
tokreq.end();

//});


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
