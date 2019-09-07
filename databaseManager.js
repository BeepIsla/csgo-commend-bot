const inquirer = require("inquirer");
const sqlite = require("sqlite");
const path = require("path");
const fs = require("fs");
const Helper = require("./helpers/Helper.js");
const config = require("./config.json");

const helper = new Helper(config.steamWebAPIKey);

(async () => {
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
			pageSize: 10,
			choices: [
				"Export account list",
				"List commends for user",
				"Reset commends for user",
				"Remove account from database",
				"Add account(s) to database",
				"List not working accounts",
				"Reset Database",
				"Exit"
			]
		});

		switch (r.response) {
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
				console.log("Safely losing database...");
				await db.close();
				return;
			}

			case "Export account list": {
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

				let data = await db.all("SELECT username, password FROM accounts");
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
