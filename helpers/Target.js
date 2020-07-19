const Account = require("./account.js");
let previous = null;

module.exports = class Target {
	constructor(protocol) {
		this.acc = new Account(true, undefined, protocol);
	}

	get accountid() {
		return this.acc.steamUser.steamID.accountid;
	}

	login(username, password, sharedSecret) {
		return this.acc.login(username, password, sharedSecret);
	}

	logOff() {
		this.acc.unauthenticate().catch(() => { });
		return this.acc.logOff();
	}

	setGamesPlayed(serverID) {
		return new Promise(async (resolve, reject) => {
			this.acc.setGamesPlayed(serverID);

			if (previous) {
				let deauth = await this.acc.unauthenticate().catch(reject);
				if (!deauth) {
					return;
				}
			}

			this.acc.authenticate(serverID).then((res) => {
				previous = res;
				resolve(res);
			}).catch(reject);
		});
	}
}
