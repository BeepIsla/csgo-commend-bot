const ChildProcess = require("child_process");
const inquirer = require("inquirer");

module.exports = class Target {
	constructor(username, password, sharedSecret) {
		this.username = username;
		this.password = password;
		this.sharedSecret = sharedSecret;

		this.accountid = 0;
		this.childProcess = null;
	}

	login() {
		return new Promise((resolve, reject) => {
			this._res_loggedOn = resolve;
			this._rej_loggedOn = reject;

			this.childProcess = ChildProcess.fork("./TargetW.js", [
				this.username,
				this.password,
				this.sharedSecret
			], {
				cwd: __dirname,
				execArgv: process.execArgv.join(" ").includes("--inspect") ? ["--inspect=0"] : []
			});

			this.childProcess.on("error", console.error);

			this.childProcess.on("message", async (msg) => {
				if (msg.type === "logging") {
					return;
				}

				if (msg.type === "steamGuard") {
					let r = await inquirer.prompt({
						type: "input",
						name: "code",
						message: "Steam Guard Code (" + (msg.domain ? msg.domain : "Mobile") + ")"
					});

					this.childProcess.send({
						type: "steamGuard",
						code: r.code
					});
					return;
				}

				if (msg.type === "loggedOn") {
					if (!this._res_loggedOn) {
						return;
					}

					this.accountid = msg.accountid;
					this._res_loggedOn(msg.hello);
					this._rej_loggedOn = null;
					this._res_loggedOn = null;
					return;
				}

				if (msg.type === "error") {
					if (!this._rej_error) {
						console.error(msg.error);
						return;
					}

					this._rej_loggedOn(msg.error);
					this._rej_loggedOn = null;
					this._res_loggedOn = null;
					return;
				}

				if (msg.type === "disconnected") {
					if (!this._res_disconnected) {
						return;
					}

					this._res_disconnected({
						eresult: msg.eresult,
						msg: msg.msg
					});
					this._res_disconnected = null;

					this.childProcess.kill();
					this.childProcess = null;
					return;
				}
			});
		});
	}

	logOff() {
		return new Promise((resolve, reject) => {
			this._res_disconnected = resolve;

			this.childProcess.send({
				type: "end"
			});
		});
	}

	setGamesPlayed(serverID) {
		this.childProcess.send({
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
