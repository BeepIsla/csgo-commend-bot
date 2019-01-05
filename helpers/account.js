const Events = require("events");
const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const Steam = require("steam-client");

const GameCoordinator = require("./GameCoordinator.js");

module.exports = class Account extends Events {
	constructor(username, password, sharedSecret = undefined, proxy = undefined, timeout = 60000) {
		super();

		// Self reference
		const self = this;

		this.steamClient = new Steam.CMClient();

		if (proxy) {
			this.steamClient.setHttpProxy(proxy);
		}

		this.steamUser = new SteamUser(this.steamClient, {
			promptSteamGuardCode: false
		});
		this.csgoUser = new GameCoordinator(this.steamUser);

		var logonSettings = {
			accountName: username,
			password: password
		};

		if (sharedSecret && sharedSecret.length > 5) {
			logonSettings.twoFactorCode = SteamTotp.getAuthCode(sharedSecret);
		}

		this.steamUser.logOn(logonSettings);

		this.steamUser.once("steamGuard", (domain, callback, lastCodeWrong) => {
			this.emit("steamGuard");
		});

		this.steamUser.once("loggedOn", async () => {
			var success = await new Promise((resolve, reject) => {
				// Check license for CSGO
				if (this.steamUser.licenses !== null) {
					var filter = this.steamUser.licenses.filter(l => l.package_id === 303386 || l.package_id === 54029);
					if (filter.length <= 0) {
						// Request CSGO license
						this.steamUser.requestFreeLicense(730, (err, grantedPackages, grantedAppIDs) => {
							if (err) {
								reject(err);
								return;
							}

							resolve(true);
						});
					}
				}

				// Request CSGO license
				this.steamUser.requestFreeLicense(730, (err, grantedPackages, grantedAppIDs) => {
					if (err) {
						reject(err);
						return;
					}

					resolve(true);
				});
			}).catch((err) => {
				this.emit("error", err);
			});

			if (success !== true) {
				return;
			}

			this.emit("loggedOn");

			this.steamUser.setPersona(SteamUser.Steam.EPersonaState.Online);
			this.steamUser.gamesPlayed([ 730 ]);
			this.csgoUser.start();

			this._timeout = setTimeout(() => {
				self.block = true;
				self.emit("error", new Error("Failed to connect to GC: Timeout"));
			}, timeout);
		});

		this.steamUser.once("error", (err) => {
			if (this.csgoUser._GCHelloInterval) {
				clearInterval(this.csgoUser._GCHelloInterval);
			}

			this.emit("error", err);
		});

		this.csgoUser.on("debug", GC2ClientWelcome);
		function GC2ClientWelcome(event) {
			// We connected despite timing out, lets just ignore that
			if (self.block === true) {
				self.csgoUser.removeListener("debug", GC2ClientWelcome);
				return;
			}

			// Continue as normal if we connected in time
			if (self._timeout) {
				clearTimeout(self._timeout);
			}

			if (event.header.msg === self.csgoUser.Protos.EGCBaseClientMsg.k_EMsgGCClientWelcome) {
				var response = self.csgoUser.Protos.CMsgClientWelcome.decode(event.buffer);

				self.csgoUser.removeListener("debug", GC2ClientWelcome);
				self.emit("ready", response);

				return;
			}
		}
	};

	commend(accountID, timeout = (30 * 1000), friendly = true, teaching = true, leader = true) {
		// Self reference
		const self = this;

		return new Promise((resolve, reject) => {
			if (self.block) {
				reject("previously_timed_out");
				return;
			}

			// Set timeout
			var _timeout = setTimeout(() => {
				this.csgoUser.removeListener("debug", CommendResponse);
				reject(new Error("Failed to send commend: Timeout"));
			}, timeout);

			// Listen to commend
			this.csgoUser.on("debug", CommendResponse);
			function CommendResponse(event) {
				if (event.header.msg === self.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse) {
					var response = self.csgoUser.Protos.CMsgGCCStrike15_v2_ClientReportResponse.decode(event.buffer);

					clearTimeout(_timeout);
					self.csgoUser.removeListener("debug", CommendResponse);

					resolve(response);
					return;
				}
			}

			// Send commend
			this.csgoUser._GC.send({
				msg: this.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientCommendPlayer,
				proto: {}
			}, new this.csgoUser.Protos.CMsgGCCStrike15_v2_ClientCommendPlayer({
				account_id: accountID,
				commendation: {
					cmd_friendly: friendly ? 1 : 0,
					cmd_teaching: teaching ? 1 : 0,
					cmd_leader: leader ? 1 : 0
				}
			}).toBuffer());
		});
	};

	logout() {
		this.steamUser.logOff();
	};
}
