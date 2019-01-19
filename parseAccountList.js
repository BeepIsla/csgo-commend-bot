const AppendToFile = true; // Set this to "false" if you want to fully override the account list in accounts.json instead of appending to it

// Actual stuff
const fs = require("fs");
var accounts =
  AppendToFile === true ? JSON.parse(fs.readFileSync("./accounts.json")) : [];

fs.readFile("./input.txt", (err, data) => {
  if (err) {
    throw err;
  }

  data = data.toString();

  data.split("\n").forEach(a => {
    accpw = [];
    accpw.push(a.trim().slice(0, a.indexOf(":")));
    accpw.push(a.trim().slice(a.indexOf(":") + 1));

    //Check if account is already present in our list
    var repeated = 0;
    for (var i = 0; i < accounts.length; i++) {
      if (accounts[i]["username"] === accpw[0]) {
        repeated = 1;
        break;
      }
    }

    console.log(accpw[0]);
    if (!repeated) {
      accounts.push({
        username: accpw[0],
        password: accpw[1],
        sharedSecret: "",
        operational: true,
        lastCommend: -1,
        lastReport: -1,
        lastServerReport: -1,
        requiresSteamGuard: false,
        commended: []
      });
    } else {
      console.log("Account already present : " + accpw[0]);
    }
  });

  fs.writeFile("./accounts.json", JSON.stringify(accounts, null, 4), err => {
    if (err) {
      throw err;
    }

    console.log("Done");
  });
});
