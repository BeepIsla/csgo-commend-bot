const sqlite = require("sqlite");
const ChildProcess = require("child_process");
const path = require("path");
const SteamUser = require("steam-user");
const fs = require("fs");
const Target = require("./helpers/Target.js");
const Helper = require("./helpers/Helper.js");
const Account = require("./helpers/account.js");
const config = require("./config.json");

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const colors = {
	reset: "\x1b[0m",
	black: "\x1b[30m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m"
};
const helper = new Helper(config.steamWebAPIKey);
let totalNeeded = 0;
if (config.type && config.type.toUpperCase() === "REPORT") {
	totalNeeded = Math.max(config.report.aimbot, config.report.wallhack, config.report.speedhack, config.report.teamharm, config.report.textabuse, config.report.voiceabuse);
} else {
	totalNeeded = Math.max(config.commend.friendly, config.commend.teaching, config.commend.leader);
}
let db = undefined;
let isNewVersion = false;
let totalSuccess = 0;
let totalFail = 0;
let _consolelog = console.log;
console.log = (color, ...args) => {
	args.unshift(colors[color] ? colors[color] : color);
	args.push(colors.reset);
	_consolelog(...args);
}

(async () => {
	if (typeof config.type === "undefined") {
		config.type = "COMMEND";
	}

	if (!["LOGIN", "SERVER"].includes(config.method.toUpperCase())) {
		console.log("red", "The \"method\" option only allows for \"LOGIN\" or \"SERVER\" value. Please refer to the README for more information.");
		return;
	}

	if (!["REPORT", "COMMEND"].includes(config.type.toUpperCase())) {
		console.log("red", "The \"type\" option only allows for \"REPORT\" or \"COMMEND\" value. Please refer to the README for more information.");
		return;
	}

	if (config.method.toUpperCase() === "LOGIN" && config.type.toUpperCase() === "REPORT") {
		console.log("red", "You cannot use the \"REPORT\" type and \"LOGIN\" method at the same time. You wouldn't want to report yourself?");
		return;
	}

	console.log("white", "Checking for new update...");
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
			console.log("red", "\nA new version is available on Github @ " + repoURL.join("."));
			console.log("red", "Downloading is optional but recommended. Make sure to check if there are any new values to be added in your old \"config.json\"");
			await new Promise(p => setTimeout(p, 5000));
		} else {
			console.log("green", "Up to date!");
		}
	} catch (err) {
		console.error(err);
		console.log("red", "Failed to check for updates");
	}

	console.log("white", "Checking protobufs...");
	let foundProtobufs = helper.verifyProtobufs();
	if (foundProtobufs && !isNewVersion) {
		console.log("green", "Found protobufs");
	} else {
		console.log("red", isNewVersion ? "New version detected, updating protobufs..." : "Failed to find protobufs, downloading and extracting...");
		await helper.downloadProtobufs(__dirname);
	}

	console.log("white", "Opening database...");
	db = await sqlite.open("./accounts.sqlite");

	await Promise.all([
		db.run("CREATE TABLE IF NOT EXISTS \"accounts\" (\"username\" TEXT NOT NULL UNIQUE, \"password\" TEXT NOT NULL, \"sharedSecret\" TEXT, \"lastCommend\" INTEGER NOT NULL DEFAULT -1, \"operational\" NUMERIC NOT NULL DEFAULT 1, PRIMARY KEY(\"username\"))"),
		db.run("CREATE TABLE IF NOT EXISTS \"commended\" (\"username\" TEXT NOT NULL REFERENCES accounts(username), \"commended\" INTEGER NOT NULL, \"timestamp\" INTEGER NOT NULL)")
	]);

	let amount = await db.get("SELECT COUNT(*) FROM accounts WHERE operational = 1;");
	console.log("white", "There are a total of " + amount["COUNT(*)"] + " operational accounts");
	if (amount["COUNT(*)"] < totalNeeded) {
		console.log("red", "Not enough accounts available, got " + amount["COUNT(*)"] + "/" + totalNeeded);
		return;
	}

	let targetAcc = undefined;
	let serverToUse = undefined;
	let matchID = config.matchID;

	if (config.method.toUpperCase() === "LOGIN") {
		console.log("white", "Getting an available server");
		serverToUse = (await helper.GetActiveServer()).shift().steamid;

		console.log("white", "Logging into target account");
		targetAcc = new Target(config.account.username, config.account.password, config.account.sharedSecret);
		await targetAcc.login();
	} else if (config.method.toUpperCase() === "SERVER") {
		console.log("white", "Parsing target account...");
		targetAcc = (await helper.parseSteamID(config.target)).accountid;
	}

	let accountsToUse = await db.all("SELECT accounts.username, accounts.password, accounts.sharedSecret FROM accounts LEFT JOIN commended ON commended.username = accounts.username WHERE accounts.username NOT IN (SELECT username FROM commended WHERE commended = " + (typeof targetAcc === "object" ? targetAcc.accountid : targetAcc) + " OR commended.username IS NULL) AND (" + Date.now() + " - accounts.lastCommend) >= " + config.cooldown + " AND accounts.operational = 1 GROUP BY accounts.username LIMIT " + totalNeeded);
	if (accountsToUse.length < totalNeeded) {
		console.log("red", "Not enough accounts available, got " + accountsToUse.length + "/" + totalNeeded);

		if (targetAcc instanceof Target) {
			targetAcc.logOff();
		}

		await db.close();
		return;
	}

	// Inject what to commend with in our accounts
	if (config.type.toUpperCase() === "REPORT") {
		for (let i = 0; i < accountsToUse.length; i++) {
			let chosen = accountsToUse.filter(a => typeof a.report === "object").length;

			accountsToUse[i].report = {
				rpt_aimbot: config.report.aimbot > chosen ? true : false,
				rpt_wallhack: config.report.wallhack > chosen ? true : false,
				rpt_speedhack: config.report.speedhack > chosen ? true : false,
				rpt_teamharm: config.report.teamharm > chosen ? true : false,
				rpt_textabuse: config.report.textabuse > chosen ? true : false,
				rpt_voiceabuse: config.report.voiceabuse > chosen ? true : false
			}
		}
	} else {
		for (let i = 0; i < accountsToUse.length; i++) {
			let chosen = accountsToUse.filter(a => typeof a.commend === "object").length;

			accountsToUse[i].commend = {
				friendly: config.commend.friendly > chosen ? true : false,
				teaching: config.commend.teaching > chosen ? true : false,
				leader: config.commend.leader > chosen ? true : false
			}
		}
	}

	console.log("white", "Chunking " + accountsToUse.length + " account" + (accountsToUse.length === 1 ? "" : "s") + " into groups of " + config.perChunk + "...");
	let chunks = helper.chunkArray(accountsToUse, config.perChunk);

	if (config.method.toUpperCase() === "LOGIN") {
		console.log("white", "Getting an available server");

		serverToUse = (await helper.GetActiveServer()).shift().steamid;
		console.log("white", "Selected available server " + serverToUse);

		targetAcc.setGamesPlayed(serverToUse);
	} else if (config.method.toUpperCase() === "SERVER") {
		console.log("white", "Parsing server input");

		if (config.serverID.toUpperCase() !== "AUTO") {
			serverToUse = await helper.parseServerID(config.serverID).catch(console.error);
			if (!serverToUse) {
				console.log("red", "Could not find online server for " + config.serverID);

				if (targetAcc instanceof Target) {
					targetAcc.logOff();
				}

				await db.close();
				return;
			}

			console.log("white", "Parsed server input to " + serverToUse);
		}

		if (config.serverID.toUpperCase() === "AUTO" || config.matchID.toUpperCase() === "AUTO") {
			console.log("blue", "Logging into fetcher account...");
			let fetcher = new Account(config.fetcher.askSteamGuard);
			await fetcher.login(config.fetcher.username, config.fetcher.password, config.fetcher.sharedSecret);

			console.log("blue", "Trying to fetch target " + config.fetcher.maxTries + " time" + (config.fetcher.maxTries === 1 ? "" : "s") + " with a delay of " + config.fetcher.tryDelay + "ms");

			let tries = 0;
			if (config.serverID.toUpperCase() === "AUTO") {
				while (!serverToUse) {
					tries++;

					if (tries > config.fetcher.maxTries) {
						console.log("red", "Failed to find server after " + tries + " tr" + (tries === 1 ? "y" : "ies"));
						break;
					}

					serverToUse = await fetcher.getTargetServer(targetAcc).catch((err) => {
						if (err.message) {
							console.log("red", err.message);
						} else {
							console.error(err);
						}
					});

					if (!serverToUse) {
						/*serverToUse = await fetcher.getTargetServerValve(targetAcc).catch((err) => {
							if (err.message) {
								console.log("red", err.message);
							} else {
								console.error(err);
							}
						});*/

						await new Promise(p => setTimeout(p, config.fetcher.tryDelay));
					}
				}

				if (!serverToUse) {
					await db.close();
					return;
				}

				console.log("green", "Found target on " + (serverToUse.isValve ? "Valve" : "Community") + " server " + serverToUse.serverID + " after " + tries + " tr" + (tries === 1 ? "y" : "ies") + " " + (serverToUse.isValve ? "" : ("(" + serverToUse.serverIP + ")")));
				serverToUse = serverToUse.serverID;
			}

			tries = 0;
			let matchIDFind = null;
			if (config.matchID.toUpperCase() === "AUTO") {
				while (!matchIDFind) {
					tries++;

					if (tries > config.fetcher.maxTries) {
						console.log("red", "Failed to find server after " + tries + " tr" + (tries === 1 ? "y" : "ies"));
						break;
					}

					matchIDFind = await fetcher.getTargetServerValve(targetAcc).catch((err) => {
						if (err.message) {
							console.log("red", err.message);
						} else {
							console.error(err);
						}
					});

					if (!matchIDFind) {
						await new Promise(p => setTimeout(p, config.fetcher.tryDelay));
					}
				}

				if (!matchIDFind) {
					await db.close();
					return;
				}

				matchID = matchIDFind.matchID || matchID;
				console.log("green", "Found target on match " + matchID);
			}

			fetcher.logOff();
		}
	}

	let info = await helper.getServerInfo(serverToUse).catch((err) => {
		console.log("red", err.message === "Invalid Server" ? "Server is no longer available" : err);
	});
	if (!info) {
		if (targetAcc instanceof Target) {
			targetAcc.logOff();
		}

		await db.close();
		return;
	}

	for (let i = 0; i < chunks.length; i++) {
		console.log("white", "Logging in on chunk " + (i + 1) + "/" + chunks.length);

		// Do commends
		let result = await handleChunk(chunks[i], (targetAcc instanceof Target ? targetAcc.accountid : targetAcc), serverToUse, matchID);

		totalSuccess += result.success.length;
		totalFail += result.error.length;

		console.log("white", "Chunk " + (i + 1) + "/" + chunks.length + " finished with " + result.success.length + " successful " + (config.type.toUpperCase() === "REPORT" ? "report" : "commend") + (result.success.length === 1 ? "" : "s") + " and " + result.error.length + " failed " + (config.type.toUpperCase() === "REPORT" ? "report" : "commend") + (result.error.length === 1 ? "" : "s"));

		// Wait a little bit and relog target if needed
		if ((i + 1) < chunks.length) {
			console.log("yellow", "Waiting " + config.betweenChunks + "ms...");
			await new Promise(r => setTimeout(r, config.betweenChunks));
		}
	}

	// We are done here!
	if (targetAcc instanceof Target) {
		targetAcc.logOff();
	}

	await db.close();
	console.log("magenta", "Finished all chunks with a total of " + totalSuccess + " successful and " + totalFail + " failed " + (config.type.toUpperCase() === "REPORT" ? "report" : "commend") + (totalFail === 1 ? "" : "s"));

	// Force exit the process if it doesn't happen automatically within 15 seconds
	setTimeout(process.exit, 15000, 1).unref();
})();

function handleChunk(chunk, toCommend, serverSteamID, matchID) {
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
				if (config.type.toUpperCase() === "COMMEND") {
					child.send({
						isCommend: true,
						isReport: false,

						chunk: chunk,
						toCommend: toCommend,
						serverSteamID: serverSteamID,
						matchID: matchID
					});
				} else {
					child.send({
						isCommend: false,
						isReport: true,

						chunk: chunk,
						toReport: toCommend /* Variable is named "toCommend" but its just the account ID so whatever */,
						serverSteamID: serverSteamID,
						matchID: matchID
					});
				}
				return;
			}

			if (msg.type === "error") {
				console.error("The child has exited due to an error", msg.error);
				return;
			}

			if (msg.type === "logging") {
				console.log("yellow", "[" + msg.username + "] Logging into Steam");
				return;
			}

			if (msg.type === "loggedOn") {
				console.log("cyan", "[" + msg.username + "] Logged onto Steam - GC Time: " + new Date(msg.hello.rtime32_gc_welcome_timestamp * 1000).toLocaleString());
				return;
			}

			if (msg.type === "commended" || msg.type === "reported") {
				await db.run("UPDATE accounts SET lastCommend = " + Date.now() + " WHERE username = \"" + msg.username + "\"").catch(() => { });

				if (msg.response.response_result === 2 && msg.type === "commended") {
					// Already commended
					res.error.push(msg.response);

					console.log("red", "[" + msg.username + "] Got response code " + msg.response.response_result + ", already commended target (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");

					await db.run("INSERT INTO commended (username, commended, timestamp) VALUES (\"" + msg.username + "\", " + toCommend + ", " + Date.now() + ")").catch(() => { });
					return;
				}

				if (msg.response.response_result === 1) {
					// Success commend
					res.success.push(msg.response);

					if (msg.type === "commended") {
						console.log("green", "[" + msg.username + "] Successfully sent a commend with response code " + msg.response.response_result + " - Remaining Commends: " + msg.response.tokens + " (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");
					} else {
						console.log("green", "[" + msg.username + "] Successfully sent a report with response code " + msg.response.response_result + " - " + msg.confirmation + " (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");
					}

					await db.run("INSERT INTO commended (username, commended, timestamp) VALUES (\"" + msg.username + "\", " + toCommend + ", " + Date.now() + ")").catch(() => { });
					return;
				}

				// Unknown response code
				res.error.push(msg.response);

				console.log("red", "[" + msg.username + "] " + (config.type.toUpperCase() === "REPORT" ? "Reported" : "Commended") + " but got invalid success code " + msg.response.response_result + " (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");
				return;
			}

			if (msg.type === "commendErr" || msg.type === "reportErr") {
				res.error.push(msg.error);

				console.log("red", "[" + msg.username + "] Failed to " + (config.type.toUpperCase() === "REPORT" ? "report" : "commend") + " (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);

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

				if (typeof msg.error.eresult === "number" && !ignoreCodes.includes(msg.error.eresult)) {
					console.log("red", "[" + msg.username + "] Failed to login (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
				} else if (msg.error && msg.error.message === "Steam Guard required") {
					console.log("red", "[" + msg.username + "] Requires a Steam Guard code and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				} else if (msg.error && msg.error.message === "VAC Banned") {
					console.log("red", "[" + msg.username + "] Has been VAC banned in CSGO and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				} else {
					console.log("red", "[" + msg.username + "] Failed to login and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
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
