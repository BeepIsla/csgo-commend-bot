const sqlite = require("sqlite");
const ChildProcess = require("child_process");
const path = require("path");
const SteamUser = require("steam-user");
const fs = require("fs");
const URL = require("url");
const Helper = require("./helpers/Helper.js");
const Target = require("./helpers/Target.js");
let config = null;

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
let helper = null;
let totalNeeded = 0;
let proxies = undefined;
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
	if (!fs.existsSync("./config.json")) {
		console.log("red", "Failed to find \"config.json\". Did you rename the file to \"config.json.json\"? Make sure to Enable Windows File Extensions");
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

			console.log("red", "Failed to parse \"config.json\":\nError description: " + errPosition + "\nError on line: " + lines.length + "\nText which caused the error: " + lines.pop());
			console.log("red", "Please verify your \"config.json\" and take the \"config.json.example\" file for help")
		}
		return;
	}

	helper = new Helper(config.steamWebAPIKey);

	if (config.type && config.type.toUpperCase() === "REPORT") {
		totalNeeded = Math.max(config.report.aimbot, config.report.wallhack, config.report.speedhack, config.report.teamharm, config.report.abusive);
	} else {
		totalNeeded = Math.max(config.commend.friendly, config.commend.teaching, config.commend.leader);
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

	if (!config.disableUpdateCheck) {
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

			let res = await helper.GetLatestVersion().catch(() => { });
			if (package.version !== res) {
				let repoURL = package.repository.url.split(".");
				repoURL.pop();
				console.log("red", "A new version is available on Github @ " + repoURL.join("."));
				console.log("red", "Downloading is optional but recommended. Make sure to check if there are any new values to be added in your old \"config.json\"");
				await new Promise(p => setTimeout(p, 5000));
			} else {
				console.log("green", "Up to date!");
			}
		} catch (err) {
			console.error(err);
			console.log("red", "Failed to check for updates");
		}
	} else {
		console.log("white", "Update check skipped");
	}

	console.log("white", "Checking protobufs...");
	let foundProtobufs = helper.verifyProtobufs();
	if (foundProtobufs && !isNewVersion) {
		console.log("green", "Found protobufs");
	} else {
		console.log("red", isNewVersion ? "New version detected, updating protobufs..." : "Failed to find protobufs, downloading and extracting...");
		await helper.downloadProtobufs(__dirname);
	}

	if (config.proxy && config.proxy.file && config.proxy.switchProxyEveryXaccounts && config.proxy.enabled) {
		console.log("white", "Loading proxies...");
		let proxyFilePath = path.join(__dirname, config.proxy.file);
		if (!fs.existsSync(proxyFilePath)) {
			console.log("red", "Could not find proxy file \"" + config.proxy.file + "\" (" + proxyFilePath + ")");
			return;
		}

		let proxiesRaw = fs.readFileSync(proxyFilePath).toString();
		try {
			proxies = JSON.parse(proxiesRaw);
		} catch {
			proxies = proxiesRaw.split("\n").map((l) => {
				l = l.trim();
				return l;
			}).filter((l) => {
				return l.length > 0;
			});
		}

		proxies = proxies.map((proxy) => {
			try {
				let url = new URL.URL(proxy);
				url.protocol = "http:"; // Force HTTP protcol
				return url.href;
			} catch {
				if (!proxy.startsWith("http://")) {
					proxy = "http://" + proxy;
				}

				return proxy;
			}
		});

		console.log("green", "Got " + proxies.length + " prox" + (proxies.length === 1 ? "y" : "ies"));
	} else {
		proxies = [];
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

	let sid = undefined;
	if (config.method.toUpperCase() === "LOGIN") {
		console.log("white", "Logging into target account...");

		// Its named sid even though its not really a SteamID but who cares
		sid = new Target();
		let welcome = await sid.login(config.account.username, config.account.password, config.account.sharedSecret).catch(async (err) => {
			console.log("red", "Failed to log into Steam using account as target", err);
			await db.close();

			if (sid instanceof Target) {
				sid.logOff();
			}

			// Force exit the process if it doesn't happen automatically within 15 seconds
			setTimeout(process.exit, 15000, 1).unref();
		});
		if (!welcome) {
			return;
		}
	} else {
		console.log("white", "Parsing target account...");
		sid = await helper.parseSteamID(config.target).catch(async (err) => {
			switch (err.message) {
				case "Failed to parse SteamID": {
					console.log("red", "Input is not in a valid format");
					break;
				}
				case "Invalid Vanity URL": {
					console.log("red", "Input is not a valid SteamID or VanityURL");
					break;
				}
				default: {
					console.error(err);
				}
			}

			await db.close();

			// Force exit the process if it doesn't happen automatically within 15 seconds
			setTimeout(process.exit, 15000, 1).unref();
		});
		if (!sid) {
			return;
		}
	}

	let accountsToUse = await db.all("SELECT accounts.username, accounts.password, accounts.sharedSecret FROM accounts LEFT JOIN commended ON commended.username = accounts.username WHERE accounts.username NOT IN (SELECT username FROM commended WHERE commended = " + sid.accountid + " OR commended.username IS NULL) AND (" + Date.now() + " - accounts.lastCommend) >= " + config.cooldown + " AND accounts.operational = 1 GROUP BY accounts.username LIMIT " + totalNeeded);
	if (accountsToUse.length < totalNeeded) {
		console.log("red", "Not enough accounts available at the current time, got " + accountsToUse.length + "/" + totalNeeded);
		await db.close();

		if (sid instanceof Target) {
			sid.logOff();
		}

		// Force exit the process if it doesn't happen automatically within 15 seconds
		setTimeout(process.exit, 15000, 1).unref();
		return;
	}

	// Inject what to commend with in our accounts
	let proxySwitch = 0;
	for (let i = 0; i < accountsToUse.length; i++) {
		let chosen = accountsToUse.filter(a => typeof a[config.type.toUpperCase() === "REPORT" ? "report" : "commend"] === "object").length;

		if (i > 0 && (i % config.proxy.switchProxyEveryXaccounts) === 0 && config.proxy && config.proxy.enabled) {
			proxySwitch++;
		}

		accountsToUse[i].proxy = proxies[proxySwitch];

		if (config.type.toUpperCase() === "REPORT") {
			accountsToUse[i].proxy = proxies[proxySwitch];
			accountsToUse[i].report = {
				rpt_aimbot: config.report.aimbot > chosen ? true : false,
				rpt_wallhack: config.report.wallhack > chosen ? true : false,
				rpt_speedhack: config.report.speedhack > chosen ? true : false,
				rpt_teamharm: config.report.teamharm > chosen ? true : false,
				rpt_textabuse: config.report.abusive > chosen ? true : false
			}
		} else {
			accountsToUse[i].commend = {
				friendly: config.commend.friendly > chosen ? true : false,
				teaching: config.commend.teaching > chosen ? true : false,
				leader: config.commend.leader > chosen ? true : false
			}
		}
	}

	console.log("white", "Chunking " + accountsToUse.length + " account" + (accountsToUse.length === 1 ? "" : "s") + " into groups of " + config.perChunk + "...");
	let chunks = helper.chunkArray(accountsToUse, config.perChunk);

	for (let i = 0; i < chunks.length; i++) {
		// Setup account every chunk just to make sure its all good
		if (sid instanceof Target) {
			await sid.setup().then((res) => {
				console.log("cyan", "Successfully authenticated to anonymous server with ticket " + res);
			}).catch((err) => {
				if (err.message === "Failed to unauthorize tickets" || err.message.startsWith("Received authlist for ticket") || err.message === "Failed to send message: Timeout") {
					console.log("red", err.message);
				} else {
					console.error(err);
				}
			});
		}

		console.log("white", "Logging in on chunk " + (i + 1) + "/" + chunks.length);

		// Do commends
		let result = await handleChunk(chunks[i], sid.accountid);

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
	await db.close();
	console.log("magenta", "Finished all chunks with a total of " + totalSuccess + " successful and " + totalFail + " failed " + (config.type.toUpperCase() === "REPORT" ? "report" : "commend") + (totalFail === 1 ? "" : "s"));

	if (sid instanceof Target) {
		sid.logOff();
	}

	// Force exit the process if it doesn't happen automatically within 15 seconds
	setTimeout(process.exit, 15000, 1).unref();
})();

function handleChunk(chunk, target) {
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
					isCommend: config.type.toUpperCase() === "COMMEND",
					isReport: config.type.toUpperCase() === "REPORT",

					chunk: chunk,
					target: target
				});
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

			if (msg.type === "authError") {
				console.log("red", "[" + msg.username + "] Failed to authenticate to target server");
				res.error.push(msg.error);
				return;
			}

			if (msg.type === "auth") {
				console.log("magenta", "[" + msg.username + "] Authenticated to anonymous server with ticket " + msg.crc);
				return;
			}

			if (msg.type === "commended" || msg.type === "reported") {
				await db.run("UPDATE accounts SET lastCommend = " + Date.now() + " WHERE username = \"" + msg.username + "\"").catch(() => { });

				if (msg.response.response_result === 2 && msg.type === "commended") {
					// Already commended
					res.error.push(msg.response);

					console.log("red", "[" + msg.username + "] Got response code " + msg.response.response_result + ", already commended target (" + (res.error.length + res.success.length) + "/" + chunk.length + ")");

					await db.run("INSERT INTO commended (username, commended, timestamp) VALUES (\"" + msg.username + "\", " + target + ", " + Date.now() + ")").catch(() => { });
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

					await db.run("INSERT INTO commended (username, commended, timestamp) VALUES (\"" + msg.username + "\", " + target + ", " + Date.now() + ")").catch(() => { });
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

			if (msg.type === "halfwayError") {
				console.log("red", "[" + msg.username + "] Fatal error after logging in and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
				await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
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
					SteamUser.EResult.IPBanned,
					SteamUser.EResult.AccountDisabled
				];

				if (typeof msg.error.eresult === "number" && !ignoreCodes.includes(msg.error.eresult)) {
					console.log("red", "[" + msg.username + "] Failed to login (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
				} else if (msg.error && msg.error.message === "Steam Guard required") {
					console.log("red", "[" + msg.username + "] Requires a Steam Guard code and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				} else if (msg.error && msg.error.message === "VAC Banned") {
					console.log("red", "[" + msg.username + "] Has been VAC banned in CSGO and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				} else if (msg.error && msg.error.message === "Game Banned") {
					console.log("red", "[" + msg.username + "] Has been Game banned in CSGO and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
				} else {
					// Add more possible errors which occur if proxies are not working correctly
					if (((typeof msg.error.message === "string" && /^HTTP CONNECT \d+.*$/i.test(msg.error.message)) || ["Failed to log in within given 60000ms", "Proxy connection timed out"].includes(msg.error.message) || ["ETIMEDOUT"].includes(msg.error.code)) && config.proxy.enabled) {
						console.log("red", "[" + msg.username + "] Failed to login and due to proxy timeout (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
					} else {
						console.log("red", "[" + msg.username + "] Failed to login and has been marked as invalid (" + (res.error.length + res.success.length) + "/" + chunk.length + ")", msg.error);
						await db.run("UPDATE accounts SET operational = 0 WHERE \"username\" = \"" + msg.username + "\"");
					}
				}
				return;
			}
		});

		child.on("exit", () => {
			resolve(res);
		});
	});
}
