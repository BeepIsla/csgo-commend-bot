const serializeError = require("serialize-error");
const Account = require("./account.js");

let started = false;

(async () => {
	process.send({
		type: "ready"
	});

	// Keep alive
	while (!started) {
		await new Promise(r => setTimeout(r, 1000));
	}
})();

process.on("message", async (msg) => {
	started = true;

	const chunk = msg.chunk;
	const target = msg.target;
	const serverSteamID = msg.serverSteamID;
	const isReport = msg.isReport;
	const isCommend = msg.isCommend;
	const matchID = msg.matchID;
	const protocol = msg.protocol;

	try {
		let done = 0;

		for (let acc of chunk) {
			process.send({
				type: "logging",
				username: acc.username
			});

			const a = new Account(false, acc.proxy, protocol);

			a.on("error", (err) => {
				process.send({
					type: "halfwayError",
					username: a.username,
					error: serializeError(err)
				});

				done += 1;
				a.logOff();
			});

			a.login(acc.username, acc.password, acc.sharedSecret).then(async (hello) => {
				process.send({
					type: "loggedOn",
					username: a.username,
					hello: hello
				});

				let auth = await a.authenticate(serverSteamID).catch((err) => {
					process.send({
						type: "authError",
						username: a.username,
						error: serializeError(err)
					});

					a.removeAllListeners("error");
					a.logOff();
					done += 1;
				});
				if (!auth) {
					return;
				}

				process.send({
					type: "auth",
					username: a.username,
					crc: auth
				});

				let args = [
					serverSteamID,
					target,
					matchID,
					(isCommend ? [
						acc.commend.friendly,
						acc.commend.teaching,
						acc.commend.leader
					] : [
						acc.report.rpt_aimbot,
						acc.report.rpt_wallhack,
						acc.report.rpt_speedhack,
						acc.report.rpt_teamharm,
						acc.report.rpt_textabuse
					]),
					5000
				].flat();

				await a[isCommend ? "commendPlayer" : "reportPlayer"](...args).then((response) => {
					process.send({
						type: isCommend ? "commended" : "reported",
						username: a.username,
						response: response,
						confirmation: isReport ? response.confirmation_id.toString() : undefined
					});
				}).catch((err) => {
					// Failed? Try again! (Still scuffed as fuck)
					return a[isCommend ? "commendPlayer" : "reportPlayer"](...args).then((response) => {
						process.send({
							type: isCommend ? "commended" : "reported",
							username: a.username,
							response: response,
							confirmation: isReport ? response.confirmation_id.toString() : undefined
						});
					}).catch((err) => {
						process.send({
							type: isCommend ? "commendErr" : "reportErr",
							username: a.username,
							error: serializeError(err)
						});
					});
				}).finally(() => {
					a.removeAllListeners("error");
				});

				a.logOff();
				done += 1;
			}).catch((err) => {
				a.removeAllListeners("error");

				process.send({
					type: "failLogin",
					username: a.username,
					error: serializeError(err)
				});

				a.logOff();
				done += 1;
			});
		}

		while (done < chunk.length) {
			await new Promise(p => setTimeout(p, 500));
		}

		// The process should automatically exit once all bots have disconnected from Steam but it doesn't
		setTimeout(process.exit, 5000, 1).unref();
	} catch (err) {
		process.send({
			type: "error",
			username: a.username,
			error: serializeError(err)
		});

		// The process should automatically exit once all bots have disconnected from Steam but it doesn't
		setTimeout(process.exit, 5000, 1).unref();
	}
});
