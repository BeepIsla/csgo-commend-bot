const inquirer = require("inquirer");
const sqlite = require("sqlite");
const path = require("path");
const fs = require("fs");
const Helper = require("./helpers/Helper.js");
let config = null;
let helper = null;

(async () => {
	if (!fs.existsSync("./config.json")) {
		console.log("Failed to find \"config.json\". Did you rename the file to \"config.json.json\"? Make sure to Enable Windows File Extensions");
		return;
	}

	try {
		config = require("./config.json");
	} catch (err) {
		let errPosition = err.message.split(": ").pop().trim();
		let match = errPosition.match(/^Unexpected (?<type>.*) in JSON at position (?<position>.*)$/i);
		if (!match || isNaN(parseInt(match.groups.position))) {
			console.error(err);
		} else {
			let configRaw = fs.readFileSync("./config.json").toString();
			let part = configRaw.slice(0, parseInt(match.groups.position));
			let lines = part.split("\n").map(l => l.trim()).filter(l => l.length > 0);

			console.log("Failed to parse \"config.json\":\nError description: " + errPosition + "\nError on line: " + lines.length + "\nText which caused the error: " + lines.pop());
			console.log("Please verify your \"config.json\" and take the \"config.json.example\" file for help")
		}
		return;
	}

	helper = new Helper(config.steamWebAPIKey);

	console.log("Opening database...");
	let db = await sqlite.open("./accounts.sqlite");

	await Promise.all([
		db.run("CREATE TABLE IF NOT EXISTS \"accounts\" (\"username\" TEXT NOT NULL UNIQUE, \"password\" TEXT NOT NULL, \"sharedSecret\" TEXT, \"lastCommend\" INTEGER NOT NULL DEFAULT -1, \"operational\" NUMERIC NOT NULL DEFAULT 1, PRIMARY KEY(\"username\"))"),
		db.run("CREATE TABLE IF NOT EXISTS \"commended\" (\"username\" TEXT NOT NULL REFERENCES accounts(username), \"commended\" INTEGER NOT NULL, \"timestamp\" INTEGER NOT NULL)")
	]);

	(async function askInput() {
		console.log("");

		let r = await inquirer.prompt({
			type: "list",
			name: "response",
			message: "What would you like to do?",
			pageSize: 11,
			choices: [
				"Export account list",
				"List commends for user",
				"Reset commends for user",
				"Remove account from database",
				"Add account(s) to database",
				"List not working accounts",
				"Remove all not working accounts",
				"Get last commend target and time",
				"Set account operational",
				"Reset Database",
				"Exit"
			]
		});

		switch (r.response) {
			case "Set account operational": {
				let input = await inquirer.prompt({
					type: "input",
					name: "username",
					message: "Enter username you want to set as operational"
				});

				let data = await db.run("UPDATE accounts SET operational = 1 WHERE username = \"" + input.username + "\"").catch(() => { });
				if (data.changes <= 0) {
					console.log("Failed to set operational status of \"" + input.username + "\" to True - Username not found.");
				} else {
					console.log("Successfully set operational status of \"" + input.username + "\" to True");
				}
				break;
			}

			case "Get last commend target and time": {
				let lastCommend = await db.get("SELECT username,lastCommend FROM accounts ORDER BY lastCommend DESC LIMIT 1");
				console.log("The latest commend has been sent by account " + lastCommend.username + " at " + new Date(lastCommend.lastCommend).toLocaleString());
				break;
			}

			case "Remove all not working accounts": {
				let _export = await inquirer.prompt({
					type: "list",
					name: "response",
					message: "Do you want to export all not working accounts to a file called \"notworking.txt\" as well?",
					choices: [
						"Yes",
						"No",
					]
				});

				if (_export.response === "Yes") {
					let data = await db.all("SELECT username, password FROM accounts WHERE operational = 0");
					fs.writeFileSync("notworking.txt", data.map(s => s.username + ":" + s.password).join("\n"));
				}

				await db.run("DELETE FROM accounts WHERE operational = 0");

				// We keep the "commended" list, if the account start working again for some reason we don't want to have the list wiped

				console.log("Successfully removed all not working accounts");
				break;
			}

			case "Reset Database": {
				let confirm = await inquirer.prompt({
					type: "confirm",
					name: "confirm",
					message: "Are you sure you want to remove ALL entries in the database?"
				});

				if (!confirm.confirm) {
					break;
				}

				let data = await Promise.all([
					db.run("DELETE FROM commended"),
					db.run("DELETE FROM accounts")
				]);

				console.log("Successfully dropped " + data[0].changes + " commend history entries and " + data[1].changes + " account entries");
				break;
			}

			case "List not working accounts": {
				let data = await db.all("SELECT username FROM accounts WHERE operational = 0");

				if (data.length <= 0) {
					console.log("All accounts are working!");
				} else {
					console.log("Got " + data.length + " account" + (data.length === 1 ? "" : "s") + "\n" + data.map(d => d.username).join(", "));
				}
				break;
			}

			case "Add account(s) to database": {
				let selection = await inquirer.prompt({
					type: "list",
					name: "selection",
					message: "What would you like to do?",
					choices: [
						"Import from JSON file",
						"Import from username:password file",
						"Manually add account"
					]
				});

				let list = [];

				if (selection.selection !== "Manually add account") {
					let file = await inquirer.prompt({
						type: "input",
						name: "file",
						message: "Enter the name of the file you want to import"
					});

					let filePath = selection.selection === "Import from JSON file" ? (path.join(__dirname, file.file.endsWith(".json") ? file.file : (file.file + ".json"))) : (path.join(__dirname, file.file.endsWith(".txt") ? file.file : (file.file + ".txt")));

					if (!fs.existsSync(filePath)) {
						console.log("Failed to find file at \"" + filePath + "\"");
						break;
					}

					switch (selection.selection) {
						case "Import from JSON file": {
							list = JSON.parse(fs.readFileSync(filePath));
							break;
						}

						case "Import from username:password file": {
							list = fs.readFileSync(filePath).toString().trim().split("\n").map(s => s.trim());
							break;
						}
					}
				} else {
					let input = await inquirer.prompt({
						type: "input",
						name: "input",
						message: "Enter username and password separated by a \":\" - \"username:password\""
					});

					list.push(input.input);
				}

				if (typeof list[0] === "string") {
					list = list.map((s) => {
						let parts = s.split(":");
						let username = parts.shift();
						let password = parts.join(":");

						return {
							username: username.trim(),
							password: password.trim(),
							sharedSecret: ""
						}
					});
				}

				if (list.length <= 0) {
					console.log("Cannot insert zero accounts");
					break;
				}

				let data = await db.run("INSERT OR IGNORE INTO accounts (\"username\", \"password\", \"sharedSecret\") VALUES " + list.map(s => "(\"" + s.username + "\", \"" + s.password + "\", \"" + s.sharedSecret + "\")").join(", "));
				console.log("Successfully added " + data.changes + " account" + (data.changes === 1 ? "" : "s") + ". Duplicates have been ignored.");
				break;
			}

			case "Remove account from database": {
				let input = await inquirer.prompt({
					type: "input",
					name: "input",
					message: "Enter username you want to remove"
				});

				let data = await Promise.all([
					db.run("DELETE FROM commended WHERE username = \"" + input.input + "\""),
					db.run("DELETE FROM accounts WHERE username = \"" + input.input + "\"")
				]);

				console.log("Successfully removed " + data[0].changes + " entr" + (data[0].changes === 1 ? "y" : "ies") + " from the commend history and " + data[1].changes + " account" + (data[1].changes === 1 ? "" : "s"));
				break;
			}

			case "Reset commends for user": {
				let input = await inquirer.prompt({
					type: "input",
					name: "input",
					message: "Enter the SteamID or profile URL you want to reset commend history of"
				});

				let sid = await helper.parseSteamID(input.input).catch(() => {});
				if (!sid) {
					console.log("Failed to find SteamID of input");
					break;
				}

				let data = await db.run("DELETE FROM commended WHERE commended = " + sid.accountid);
				console.log("Removed " + data.changes + " entr" + (data.changes === 1 ? "y" : "ies") + " from the commend history");
				break;
			}

			case "List commends for user": {
				let input = await inquirer.prompt({
					type: "input",
					name: "input",
					message: "Enter the SteamID or profile URL you want to list the commend history of"
				});

				let sid = await helper.parseSteamID(input.input).catch(() => {});
				if (!sid) {
					console.log("Failed to find SteamID of input");
					break;
				}

				let data = await db.all("SELECT * FROM commended WHERE commended = " + sid.accountid);
				if (data.length <= 0) {
					console.log("This user is not in the commend history");
					break;
				}

				let highest = Math.max(data.map(s => s.username.length));
				console.log("User has been commended " + data.length + " time" + (data.length === 1 ? "" : "s") + "\n" + data.map(s => " ".repeat(highest - s.username.length) + s.username + " - " + new Date(s.timestamp).toString()));
				break;
			}

			case "Exit": {
				console.log("Safely closing database...");
				await db.close();
				return;
			}

			case "Export account list": {
				let _export = await inquirer.prompt({
					type: "list",
					name: "response",
					message: "Do you want to export all accounts or only working ones?",
					choices: [
						"Export all accounts",
						"Exports only working accounts",
					]
				});

				let query = "SELECT username, password FROM accounts";
				if (_export.response === "Exports only working accounts") {
					query = "SELECT username, password FROM accounts WHERE operational = 1";
				}

				let input = await inquirer.prompt({
					type: "input",
					name: "input",
					message: "What do you want to name the output file?"
				});

				let filePath = path.join(__dirname, input.input.includes(".") ? input.input : (input.input + ".txt"));
				if (fs.existsSync(filePath)) {
					console.log("File already exists.");
					break;
				}

				let data = await db.all(query);
				if (data.length <= 0) {
					console.log("No data to export");
					break;
				}

				fs.writeFileSync(filePath, data.map(s => s.username + ":" + s.password).join("\n"));
				console.log("Successfully exported " + data.length + " accounts to \"" + filePath + "\"");
			}
		}

		askInput();
	})();
})();
