const Worker = require("worker_threads");
const serializeError = require("serialize-error");
const Account = require("./account.js");
const a = Worker.workerData;

(async () => {
	try {
		let acc = new Account();

		Worker.parentPort.postMessage({
			type: "logging",
			username: a.username
		});

		let hello = await acc.login(a.username, a.password, a.sharedSecret);
		Worker.parentPort.postMessage({
			type: "loggedOn",
			username: a.username,
			accountid: acc.steamUser.steamID.accountid,
			hello: hello
		});

		acc.steamUser.on("disconnected", (eresult, msg) => {
			Worker.parentPort.postMessage({
				type: "disconnected",
				username: a.username,
				eresult: eresult,
				msg: msg
			});
		});

		Worker.parentPort.on("message", (msg) => {
			if (msg.type === "end") {
				acc.logOff();
				return;
			}

			if (msg.type === "gamesPlayed") {
				acc.setGamesPlayed(msg.steamid);
				return;
			}
		});
	} catch (err) {
		Worker.parentPort.postMessage({
			type: "error",
			username: a.username,
			error: serializeError(err)
		});
	}
})();
