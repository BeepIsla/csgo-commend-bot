const serializeError = require("serialize-error");
const Account = require("./account.js");

let started = false;

(async () => {
	process.send({
		type: "ready"
	});

	while (!started) {
		await new Promise(r => setTimeout(r, 1000));
	}
})();

process.on("message", async (msg) => {
	started = true;

	const config = msg.config;
	const chunk = msg.chunk;
	const toCommend = msg.toCommend;
	const serverSteamID = msg.serverSteamID;

	try {
		let done = 0;

		for (let acc of chunk) {
			process.send({
				type: "logging",
				username: acc.username
			});

			const a = new Account();

			a.login(acc.username, acc.password, acc.sharedSecret).then(async (hello) => {
				process.send({
					type: "loggedOn",
					username: a.username,
					hello: hello
				});

				await a.commendPlayer(serverSteamID, toCommend, config.matchid ? config.matchid : "0", config.commend.friendly, config.commend.teaching, config.commend.leader).then((response) => {
					process.send({
						type: "commended",
						username: a.username,
						response: response
					});
				}).catch((err) => {
					process.send({
						type: "commendErr",
						username: a.username,
						error: serializeError(err)
					});
				});

				a.logOff();
				done += 1;
			}).catch((err) => {
				process.send({
					type: "failLogin",
					username: a.username,
					error: serializeError(err)
				});

				a.logOff();
				done += 1;
			});
		}

		// The process should automatically exit once all bots have disconnected from Steam but it doesn't
		while (done < chunk.length) {
			await new Promise(p => setTimeout(p, 500));
		}

		await new Promise(p => setTimeout(p, 5000));
		process.exit(0);
	} catch (err) {
		process.send({
			type: "error",
			username: a.username,
			error: serializeError(err)
		});

		await new Promise(p => setTimeout(p, 5000));
		process.exit(0);
	}
});
