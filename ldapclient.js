var ldapjs = require('ldapjs');
var assert = require('assert');
var MongoClient = require('mongodb').MongoClient
//var format = require('util').format;
var argv = process.argv;
var db;

try { var settings = require(__dirname+"/settings.json"); }
catch (e) { 
  console.error('ERROR: failed to load settings.');
  process.exit()
}
try { var settings = require(__dirname+"/settings.local.json"); }
catch (e) { console.log('WARNING: No local settings found.'); }

var pcntrl = new ldapjs.PagedResultsControl({value: {size: 500}});
var server = settings.server
var port = settings.port
var username = settings.username
var password = settings.password
var baseDN =  settings.baseDN
if(argv[2]) baseDN = argv[2]+','+baseDN;
var ldap = ldapjs.createClient({url: 'ldap://'+server+':'+port});

console.log("INFO: connecting to MongoDB")
MongoClient.connect('mongodb://127.0.0.1:27017/hcsmgr', function(err, database) {
  if(err) throw err;
  db = database;
	/*
  var collection = db.collection('test_insert');
  collection.insert({a:2}, function(err, docs) {

   collection.count(function(err, count) {
    console.log(format("count = %s", count));
   });

   // Locate all the entries using find
   collection.find().toArray(function(err, results) {
    console.dir(results);
    // Let's close the db
    db.close();
   });
  });
	*/

  console.log("INFO: Binding to server ldap://"+server+":"+port)
  ldap.bind(username, password, function(err) {
    if(err) {
      console.log(err);
    } else {
      console.log('authenticated');
    }
    getgroups();
  });
  //ldap.unbind(function(err) {});
  
})

var entries = 0

function getgroups()
{

var options = {
  scope: 'sub'		// base|one|sub
 ,sizeLimit: 1000	// max no of entries
 ,timeLimit: 30		// in seconds
 ,filter: '(&(objectClass=group)(member=*))'
// ,attributes: 'cn, member'

//  filter: '(&(l=Seattle)(email=*@foo.com))',
/* for new pagecontrol, not in released version:
  paged: {
    pageSize: 100,
    pagePause: true
  }
*/
};
//if(argv[3]) options["filter"] = argv[3]

//ldap.search(baseDN, function(err, res) {
ldap.search(baseDN, options, pcntrl, function(err, res) {
  assert.ifError(err);

  res.on('searchEntry', function(entry) {
    entries++;
    if(entries > 2) process.exit(0);
//    var group = {};
    console.log('entry '+entries+': '+entry.dn+' ')
//    console.log('entry: ' + JSON.stringify(entry.object));
//    console.log(entry.object);
//    console.log(entry.json);

    db.groups.save(entry.json);
/*
    entry.json.attributes.forEach(function(attr) {
	switch(attr.type) {
	  case "description":
		console.log('Description: '+ attr.vals[0])
		break;
	  case "objectGUID":
		console.log('GUID: '+ attr.vals[0])
		
		break;

	}			
	db.groups.save(
    });
*/
//	  if(attr.type === "description")
//		return console.log('Description: '+ attr.vals[0])
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

}
