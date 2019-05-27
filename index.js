const sqlite = require("sqlite");
const ChildProcess = require("child_process");
const path = require("path");
const Helper = require("./helpers/Helper.js");
const Target = require("./helpers/Target.js");
const config = require("./config.json");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

let db = undefined;

(async () => {
	console.log("Checking for new update...");
	try {
		let package = require("./package.json");
		let res = await Helper.GetLatestVersion().catch(console.error);

		if (package.version !== res) {
			let repoURL = package.repository.url.split(".");
			repoURL.pop();
			console.log("A new version is available on Github @ " + repoURL.join(".") + " (Make sure to switch to the \"experimental\" branch first before downloading");
			console.log("Downloading is optional but recommended. Make sure to check if there are any new values to be added in your old \"config.json\"");
		} else {
			console.log("Up to date!");
		}
	} catch (err) {
		console.error(err);
		console.log("Failed to check for updates");
	}

	console.log("Opening database...");
	db = await sqlite.open("./accounts.sqlite");

	await Promise.all([
		db.run("CREATE TABLE IF NOT EXISTS \"accounts\" (\"username\" TEXT NOT NULL UNIQUE, \"password\" TEXT NOT NULL, \"sharedSecret\" TEXT, \"lastCommend\" INTEGER NOT NULL DEFAULT -1, \"operational\" NUMERIC NOT NULL DEFAULT 1, PRIMARY KEY(\"username\"))"),
		db.run("CREATE TABLE IF NOT EXISTS \"commended\" (\"username\" TEXT NOT NULL REFERENCES accounts(username), \"commended\" INTEGER NOT NULL, \"timestamp\" INTEGER NOT NULL)")
	]);

	let amount = await db.get("SELECT COUNT(*) FROM accounts WHERE operational = 1;");
	console.log("There are a total of " + amount["COUNT(*)"] + " operational accounts");
	if (amount["COUNT(*)"] < config.toSend) {
		console.log("Not enough accounts available, got " + amount["COUNT(*)"] + "/" + config.toSend);
		return;
	}

	console.log("Logging into target account...");
	let targetAcc = new Target(config.account.username, config.account.password, config.account.sharedSecret);
	await targetAcc.login();

	let accountsToUse = await db.all("SELECT accounts.username, accounts.password, accounts.sharedSecret FROM accounts LEFT JOIN commended ON commended.username = accounts.username WHERE accounts.username NOT IN (SELECT username FROM commended WHERE commended = " + targetAcc.accountid + " OR commended.username IS NULL) AND (" + Date.now() + " - accounts.lastCommend) >= " + config.cooldown + " AND accounts.operational = 1 GROUP BY accounts.username LIMIT " + config.toSend);
	if (accountsToUse.length < config.toSend) {
		console.log("Not enough accounts available, got " + accountsToUse.length + "/" + config.toSend);
		await targetAcc.logOff();
		return;
	}

	console.log("Chunking " + accountsToUse.length + " account" + (accountsToUse.length === 1 ? "" : "s") + " into groups of 20...");
	let chunks = Helper.chunkArray(accountsToUse, 20); // Chunks are now hardcoded to 20 due to 20 commends being the limit per server

	console.log("Loading sever list...");
	let servers = await Helper.GetServerList(config.steamWebAPIKey);
	console.log("Got " + servers.length + " server" + (servers.length === 1 ? "" : "s"));

	let serverToUse = undefined;
	for (let i = 0; i < chunks.length; i++) {
		serverToUse = servers.shift();

		console.log("Checking server " + serverToUse.steamid + " for online status");
		let res = await Helper.ParseServerID(serverToUse.steamid, config.steamWebAPIKey).catch(() => { });
		if (typeof res !== "string") {
			console.log("Skipping server " + serverToUse.steamid + " because they are offline");
			i -= 1;
			continue;
		}

		console.log("Switching server ID to " + serverToUse.steamid);
		targetAcc.setGamesPlayed(serverToUse.steamid);

		console.log("Logging in on chunk " + (i + 1) + "/" + chunks.length);

		// Do commends
		let result = await handleChunk(chunks[i], targetAcc.accountid, serverToUse.steamid);
		console.log("Chunk " + (i + 1) + "/" + chunks.length + " finished with " + result.success.length + " successful commend" + (result.success.length === 1 ? "" : "s") + " and " + result.error.length + " failed commend" + (result.error.length === 1 ? "" : "s"));

		// Wait a little bit and relog target if needed
		if ((i + 1) < chunks.length) {
			console.log("Waiting " + config.betweenChunks + "ms and relogging account...");
			await Promise.all([
				new Promise(r => setTimeout(r, config.betweenChunks)),
				targetAcc.relog()
			]);
		}
	}

	// We are done here!
	await targetAcc.logOff();
	await db.close();
	console.log("Done!");
})();

function handleChunk(chunk, toCommend, serverSteamID) {
	return new Promise(async (resolve, reject) => {
		let child = ChildProcess.fork("./Bots.js", [], {
			cwd: path.join(__dirname, "helpers"),
			execArgv: process.execArgv.join(" ").includes("--inspect") ? ["--inspect=0"] : []
		});

		child.on("error", console.error);

		let res = {
			success: [],
			error: []
		};

		child.on("message", async (msg) => {
			if (msg.type === "ready") {
				child.send({
					config: config,
					chunk: chunk,
					toCommend: toCommend,
					serverSteamID: serverSteamID
				});
				return; 
			}

			if (msg.type === "error") {
				console.error("The child has exited due to an error", msg.error);
				return;
			}

			if (msg.type === "logging") {
				console.log("[" + msg.username + "] Logging into Steam");
				return;
			}

			if (msg.type === "loggedOn") {
				console.log("[" + msg.username + "] Logged onto Steam - GC Time: " + new Date(msg.hello.rtime32_gc_welcome_timestamp * 1000).toLocaleString());
				return;
			}

			if (msg.type === "commended") {
				await db.run("UPDATE accounts SET lastCommend = " + Date.now() + " WHERE username = \"" + msg.username + "\"").catch(() => { });

				if (msg.response.response_result !== 1) {
					res.error.push(msg.response);

					console.log("[" + msg.username + "] Commended but got invalid success code " + msg.response.response_result + " (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");
					return;
				}

				res.success.push(msg.response);

				console.log("[" + msg.username + "] Successfully sent a commend with response code " + msg.response.response_result + " - Remaining Commends: " + msg.response.tokens + " (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");

				await db.run("INSERT INTO commended (username, commended, timestamp) VALUES (\"" + msg.username + "\", " + toCommend + ", " + Date.now() + ")").catch(() => { });
				return;
			}

			if (msg.type === "commendErr") {
				res.error.push(msg.error);

				console.log("[" + msg.username + "] Failed to commend (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");

				await db.run("UPDATE accounts SET lastCommend = " + Date.now() + " WHERE username = \"" + msg.username + "\"").catch(() => { });
				return;
			}

			if (msg.type === "failLogin") {
				res.error.push(msg.error);

				console.log("[" + msg.username + "] Failed to login and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");

				await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				return;
			}
		});

		child.on("exit", () => {
			resolve(res);
		});
	});
}
