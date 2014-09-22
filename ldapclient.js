var ldap = require('ldapjs');
var assert = require('assert');
var argv = process.argv;

try { var settings = require(__dirname+"/settings.json"); }
catch (e) { 
  console.error('ERROR: failed to load settings.');
  process.exit()
}
try { var settings = require(__dirname+"/settings.local.json"); }
catch (e) { console.log('WARNING: No local settings found.'); }

var pcntrl = new ldap.PagedResultsControl({value: {size: 500}});

var server = settings.server
var port = settings.port
var username = settings.username
var password = settings.password
var baseDN =  settings.baseDN

console.log("INFO: Binding to server ldap://"+server+":"+port)

if(argv[2])
  baseDN = "ou="+argv[2]+','+baseDN;

var entries = 0

var client = ldap.createClient({
  url: 'ldap://'+server+':'+port
});

client.bind(username, password, function(err) {
  if(err) {
    console.log(err);
  } else {
    console.log('authenticated');
  }
});

//client.unbind(function(err) {
//});

//  filter: '(&(l=Seattle)(email=*@foo.com))',
var options = {
  scope: 'sub',		// base|one|sub
  sizeLimit: 1000,	// max no of entries
  timeLimit: 30		// in seconds

/* for new pagecontrol, not in released version:
  paged: {
    pageSize: 100,
    pagePause: true
  }
*/
};

//client.search(baseDN, function(err, res) {
client.search(baseDN, options, pcntrl, function(err, res) {
  assert.ifError(err);

  res.on('searchEntry', function(entry) {
	entries++;
//    console.log('entry: ' + JSON.stringify(entry.object));
	console.log('entry '+entries+': '+entry.dn+' ')
	entry.json.attributes.forEach(function(attr) {
	  if(attr.type === "description")
		return console.log('Description: '+ attr.vals[0])
		
	});
  });
  res.on('searchReference', function(referral) {
    console.log('referral: ' + referral.uris.join());
  });
  res.on('error', function(err) {
    console.error('error: ' + err.message);
  });
  res.on('end', function(result) {
    console.log('status: ' + result.status);
    console.log('Found ' + entries +' entries');
  });

  res.on('page', function (res, cb) {
    // call 'cb' when processing complete for a page
//    asyncWaitForProcessing(cb);
    console.log('status: ' + result.status);
  });

});

