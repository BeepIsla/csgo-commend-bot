const sqlite = require("sqlite");
const ChildProcess = require("child_process");
const path = require("path");
const SteamUser = require("steam-user");
const fs = require("fs");
const Target = require("./helpers/Target.js");
const Helper = require("./helpers/Helper.js");
const config = require("./config.json");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const helper = new Helper(config.steamWebAPIKey);
let db = undefined;
let isNewVersion = false;

(async () => {
	if ([ "LOGIN", "SERVER" ].includes(config.method.toUpperCase()) === false) {
		console.log("The \"method\" option only allows for \"LOGIN\" or \"SERVER\" value. Please refer to the README for more information.");
		return;
	}

	console.log("Checking for new update...");
	try {
		let package = require("./package.json");

		if (!fs.existsSync("./data/dev")) {
			if (fs.existsSync("./data/version")) {
				let version = fs.readFileSync("./data/version").toString();
				isNewVersion = version !== package.version;
			}
	
			if (!fs.existsSync("./data")) {
				fs.mkdirSync("./data");
			}
			fs.writeFileSync("./data/version", package.version);
		}

		let res = await helper.GetLatestVersion().catch(console.error);

		if (package.version !== res) {
			let repoURL = package.repository.url.split(".");
			repoURL.pop();
			console.log("\nA new version is available on Github @ " + repoURL.join("."));
			console.log("Downloading is optional but recommended. Make sure to check if there are any new values to be added in your old \"config.json\"");
			await new Promise(p => setTimeout(p, 5000));
		} else {
			console.log("Up to date!");
		}
	} catch (err) {
		console.error(err);
		console.log("Failed to check for updates");
	}

	console.log("Checking protobufs...");
	let foundProtobufs = helper.verifyProtobufs();
	if (foundProtobufs === true && !isNewVersion) {
		console.log("Found protobufs");
	} else {
		console.log(isNewVersion ? "New version detected, updating protobufs..." : "Failed to find protobufs, downloading and extracting...");
		await helper.downloadProtobufs(__dirname);
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

	let targetAcc = undefined;
	let serverToUse = undefined;

	if (config.method.toUpperCase() === "LOGIN") {
		console.log("Getting an available server");
		serverToUse = (await helper.GetActiveServer()).shift().steamid;

		console.log("Logging into target account");
		targetAcc = new Target(config.account.username, config.account.password, config.account.sharedSecret);
		await targetAcc.login();
	} else if (config.method.toUpperCase() === "SERVER") {
		console.log("Parsing target account...");
		targetAcc = (await helper.parseSteamID(config.target)).accountid;
	}

	let accountsToUse = await db.all("SELECT accounts.username, accounts.password, accounts.sharedSecret FROM accounts LEFT JOIN commended ON commended.username = accounts.username WHERE accounts.username NOT IN (SELECT username FROM commended WHERE commended = " + (typeof targetAcc === "object" ? targetAcc.accountid : targetAcc) + " OR commended.username IS NULL) AND (" + Date.now() + " - accounts.lastCommend) >= " + config.cooldown + " AND accounts.operational = 1 GROUP BY accounts.username LIMIT " + config.toSend);
	if (accountsToUse.length < config.toSend) {
		console.log("Not enough accounts available, got " + accountsToUse.length + "/" + config.toSend);

		if (typeof targetAcc === "object") {
			targetAcc.logOff();
		}

		await db.close();
		return;
	}

	console.log("Chunking " + accountsToUse.length + " account" + (accountsToUse.length === 1 ? "" : "s") + " into groups of " + config.perChunk + "...");
	let chunks = helper.chunkArray(accountsToUse, config.perChunk);

	if (config.method.toUpperCase() === "LOGIN") {
		console.log("Getting an available server");
		serverToUse = (await helper.GetActiveServer()).shift().steamid;
		targetAcc.setGamesPlayed(serverToUse);
	} else if (config.method.toUpperCase() === "SERVER") {
		console.log("Parsing server input");
		serverToUse = await helper.parseServerID(config.serverID);
	}

	for (let i = 0; i < chunks.length; i++) {
		console.log("Logging in on chunk " + (i + 1) + "/" + chunks.length);

		// Do commends
		let result = await handleChunk(chunks[i], (typeof targetAcc === "object" ? targetAcc.accountid : targetAcc), serverToUse);
		console.log("Chunk " + (i + 1) + "/" + chunks.length + " finished with " + result.success.length + " successful commend" + (result.success.length === 1 ? "" : "s") + " and " + result.error.length + " failed commend" + (result.error.length === 1 ? "" : "s"));

		// Wait a little bit and relog target if needed
		if ((i + 1) < chunks.length) {
			console.log("Waiting " + config.betweenChunks + "ms...");
			await new Promise(r => setTimeout(r, config.betweenChunks));
		}
	}

	// We are done here!
	if (typeof targetAcc === "object") {
		targetAcc.logOff();
	}

	await db.close();
	console.log("Done!");

	// Force exit the process if it doesn't happen automatically within 15 seconds
	setTimeout(process.exit, 15000, 1).unref();
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

				console.log("[" + msg.username + "] Failed to commend (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);

				await db.run("UPDATE accounts SET lastCommend = " + Date.now() + " WHERE username = \"" + msg.username + "\"").catch(() => { });
				return;
			}

			if (msg.type === "failLogin") {
				res.error.push(msg.error);

				let ignoreCodes = [
					SteamUser.EResult.Fail,
					SteamUser.EResult.InvalidPassword,
					SteamUser.EResult.AccessDenied,
					SteamUser.EResult.Banned,
					SteamUser.EResult.AccountNotFound,
					SteamUser.EResult.Suspended,
					SteamUser.EResult.AccountLockedDown,
					SteamUser.EResult.IPBanned
				];

				if (typeof msg.error.eresult === "number" && ignoreCodes.includes(msg.error.eresult) === false) {
					console.log("[" + msg.username + "] Failed to login (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
				} if (msg.error && msg.error.message === "Steam Guard required") {
					console.log("[" + msg.username + "] Requires a Steam Guard code and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				} else {
					console.log("[" + msg.username + "] Failed to login and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				}
				return;
			}
		});

		child.on("exit", () => {
			resolve(res);
		});
	});
}
