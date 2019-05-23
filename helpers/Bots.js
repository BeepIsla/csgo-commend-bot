const Worker = require("worker_threads");
const serializeError = require("serialize-error");
const Account = require("./account.js");

const config = Worker.workerData.config;
const chunk = Worker.workerData.chunk;
const toCommend = Worker.workerData.toCommend;
const serverSteamID = Worker.workerData.serverSteamID;

(async () => {
	try {
		for (let acc of chunk) {
			Worker.parentPort.postMessage({
				type: "logging",
				username: acc.username
			});

			const a = new Account();

			a.login(acc.username, acc.password, acc.sharedSecret).then(async (hello) => {
				Worker.parentPort.postMessage({
					type: "loggedOn",
					username: a.username,
					hello: hello
				});

				await a.commendPlayer(serverSteamID, toCommend, config.matchid ? config.matchid : "0", config.commend.friendly, config.commend.teaching, config.commend.leader).then((response) => {
					Worker.parentPort.postMessage({
						type: "commended",
						username: a.username,
						response: response
					});
				}).catch((err) => {
					Worker.parentPort.postMessage({
						type: "commendErr",
						username: a.username,
						error: serializeError(err)
					});
				});

				a.logOff();
			}).catch((err) => {
				Worker.parentPort.postMessage({
					type: "failLogin",
					username: a.username,
					error: serializeError(err)
				});

				a.logOff();
			});
		}

		// The worker will automatically exit once all bots have disconnected from Steam
	} catch (err) {
		throw err;
	}
})();
