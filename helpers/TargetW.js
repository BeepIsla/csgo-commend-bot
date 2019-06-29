const serializeError = require("serialize-error");
const Account = require("./account.js");
const a = {
	username: process.argv[2],
	password: process.argv[3],
	sharedSecret: process.argv[4]
};
let sg_callback = null;

(async () => {
	try {
		let acc = new Account(true);

		process.on("message", (msg) => {
			if (msg.type === "end") {
				acc.logOff();
				return;
			}

			if (msg.type === "gamesPlayed") {
				acc.setGamesPlayed(msg.steamid);
				return;
			}

			if (msg.type === "steamGuard") {
				if (sg_callback === null) {
					return;
				}

				sg_callback(msg.code);
				sg_callback = null;
				return;
			}
		});

		acc.steamUser.on("steamGuard", (domain, callback, lastCodeWrong) => {
			sg_callback = callback;

			clearTimeout(acc.loginTimeout);
			acc.loginTimeout = null;

			process.send({
				type: "steamGuard",
				username: a.username,
				domain: domain,
				lastCodeWrong: lastCodeWrong
			});
		});

		process.send({
			type: "logging",
			username: a.username
		});

		let hello = await acc.login(a.username, a.password, a.sharedSecret);
		process.send({
			type: "loggedOn",
			username: a.username,
			accountid: acc.steamUser.steamID.accountid,
			hello: hello
		});

		acc.steamUser.on("disconnected", (eresult, msg) => {
			process.send({
				type: "disconnected",
				username: a.username,
				eresult: eresult,
				msg: msg
			});
		});
	} catch (err) {
		process.send({
			type: "error",
			username: a.username,
			error: serializeError(err)
		});
	}
})();
