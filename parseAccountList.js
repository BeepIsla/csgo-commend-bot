const AppendToFile = true; // Set this to "false" if you want to fully override the account list in accounts.json instead of appending to it



// Actual stuff
const fs = require("fs");

var accounts = (AppendToFile === true ? JSON.parse(fs.readFileSync("./accounts.json")) : []);

fs.readFile("./input.txt", (err, data) => {
	if (err) {
		throw err;
	}

	data = data.toString();

	data.split("\n").forEach(a => {
		accpw = a.trim().split(":");

		// Check if an account is already present in our list
		if (accounts.map(a => a.username).indexOf(accpw[0]) >= 0) {
			console.log("Account already present : " + accpw[0]);
			return;
		}

		console.log(accpw[0]);
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
	});

	fs.writeFile("./accounts.json", JSON.stringify(accounts, null, 4), (err) => {
		if (err) {
			throw err;
		}

		console.log("Done");
	});
});
