const Worker = require("worker_threads");

module.exports = class Target {
	constructor(username, password, sharedSecret) {
		this.username = username;
		this.password = password;
		this.sharedSecret = sharedSecret;

		this.accountid = 0;
		this.worker = null;
	}

	login() {
		return new Promise((resolve, reject) => {
			this._res_loggedOn = resolve;
			this._rej_loggedOn = reject;

			this.worker = new Worker.Worker("./helpers/TargetW.js", {
				workerData: {
					username: this.username,
					password: this.password,
					sharedSecret: this.sharedSecret
				}
			});

			this.worker.on("error", console.error);

			this.worker.on("message", (msg) => {
				if (msg.type === "logging") {
					return;
				}

				if (msg.type === "loggedOn") {
					if (typeof this._res_loggedOn !== "function") {
						return;
					}

					this.accountid = msg.accountid;
					this._res_loggedOn(msg.hello);
					this._rej_loggedOn = null;
					this._res_loggedOn = null;
					return;
				}

				if (msg.type === "error") {
					if (typeof this._rej_error !== "function") {
						console.error(msg.error);
						return;
					}

					this._rej_loggedOn(msg.error);
					this._rej_loggedOn = null;
					this._res_loggedOn = null;
					return;
				}

				if (msg.type === "disconnected") {
					if (typeof this._res_disconnected !== "function") {
						return;
					}

					this._res_disconnected({
						eresult: msg.eresult,
						msg: msg.msg
					});
					this._res_disconnected = null;

					this.worker = null;
					return;
				}
			});
		});
	}

	logOff() {
		return new Promise((resolve, reject) => {
			this._res_disconnected = resolve;

			this.worker.postMessage({
				type: "end"
			});
		});
	}

	setGamesPlayed(serverID) {
		this.worker.postMessage({
			type: "gamesPlayed",
			steamid: serverID
		});
	}

	relog() {
		return new Promise((resolve, reject) => {
			this.logOff().then(async () => {
				await new Promise(p => setTimeout(p, 500));
				this.login().then(resolve).catch(reject);
			}).catch(reject);
		});
	}
}
