const fs = require("fs");
const SteamIDParser = require("./helpers/steamIDParser.js");
const Account = require("./helpers/account.js");
const config = require("./config.json");
const colors = {
  general: "\x1b[37m",
  login: "\x1b[36m",
  loggedIn: "\x1b[33m",
  connectedToGC: "\x1b[35m",
  success: "\x1b[32m",
  error: "\x1b[31m"
};
config.accounts = require("./accounts.json");

var accounts = JSON.parse(fs.readFileSync("./accounts.json"));

var args = process.argv.slice(2);

if (args.indexOf("--available") > -1) {
  var available = config.accounts.filter(
    a =>
      a.operational === true &&
      a.requiresSteamGuard === false &&
      !a.commended.includes(config.AccountToCommend) &&
      new Date().getTime() - a.lastCommend >= config.AccountCooldown
  );
  console.log(
    "Avaiable accounts : " + available.length + "/" + config.accounts.length
  );
} else if (args.indexOf("--delete") > -1) {
  if (args[args.indexOf("--delete")] !== undefined) {
    var usernames = args.slice(args.indexOf("--delete") + 1);
    var deleteCount = 0;

    accounts = accounts.filter(x => {
      for (var i = 0; i < usernames.length; i++) {
        if (x["username"] === usernames[i]) {
          deleteCount++;
          return false;
        }
      }
      return true;
    });

    fs.writeFile("./accounts.json", JSON.stringify(accounts, null, 4), err => {
      if (err) {
        throw err;
      }

      if (!deleteCount) {
        console.log("No accounts found with given usernames");
      } else {
        console.log("Deleted " + deleteCount + " accounts");
      }
    });
  }
} else if (args.indexOf("--clean") > -1) {
  //Remove accounts with missing username or password
  console.log("Removing accounts with empty username/password");
  accounts = accounts.filter(
    x => !(x["username"] == "" || x["password"] == "")
  );

  console.log("Removing duplicate accounts");
  //Remove duplicate accounts
  accounts = accounts.filter((obj, pos, arr) => {
    return (
      arr.map(mapObj => mapObj["username"]).indexOf(obj["username"]) === pos
    );
  });

  fs.writeFile("./accounts.json", JSON.stringify(accounts, null, 4), err => {
    if (err) {
      throw err;
    }

    console.log("Successfully cleaned the account list");
  });
} else {
  console.log(
    "Unknown arguement : " + args[0] + "\nPlease check documentation for help"
  );
}
