const Events = require("events");
const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const SteamID = require("steamid");
const StdLib = require("@doctormckay/stdlib");
const GameCoordinator = require("./GameCoordinator.js");

module.exports = class Account extends Events {
	constructor(isTarget = false, proxy = undefined) {
		super();

		this.steamUser = new SteamUser({
			autoRelogin: false,
			enablePicsCache: false,
			picsCacheAll: false,
			httpProxy: proxy
		});
		this.csgoUser = new GameCoordinator(this.steamUser, 730);
		this.loginTimeout = null;
		this.isTarget = isTarget;
		this.errored = false;
		this.gamesPlayedInterval = null;
	}

	_steamErrorHandler(err) {
		if (this.errored) {
			return;
		}
		this.errored = true;

		this.emit("error", err);
	}

	/**
	 * Log into an account
	 * @param {String} username Steam Username
	 * @param {String} password Steam Password
	 * @param {String|undefined} sharedSecret Optional shared secret for 2FA
	 * @param {Number} timeout Timeout before rejecting promise
	 * @returns {Promise.<Object>}
	 */
	login(username, password, sharedSecret = undefined, timeout = 60000) {
		this.username = username;

		return new Promise((resolve, reject) => {
			this.loginTimeout = setTimeout(() => {
				this.steamUser.logOff();
				this.steamUser.removeListener("error", error);
				this.steamUser.removeListener("loggedOn", loggedOn);

				reject(new Error("Failed to log in within given " + timeout + "ms"));
			}, timeout);

			let logonSettings = {
				accountName: username,
				password: password,
				twoFactorCode: (typeof sharedSecret === "string" && sharedSecret.length > 5) ? SteamTotp.getAuthCode(sharedSecret) : undefined
			};

			this.steamUser.logOn(logonSettings);

			let error = (err) => {
				clearTimeout(this.loginTimeout);
				this.loginTimeout = null;

				this.steamUser.logOff();
				this.steamUser.removeListener("error", error);
				this.steamUser.removeListener("loggedOn", loggedOn);
				this.steamUser.removeListener("steamGuard", steamGuard);

				reject(err);
			};

			let msTimeVacNoResponse = 0;
			let loggedOn = async () => {
				clearTimeout(this.loginTimeout);
				this.loginTimeout = null;

				this.steamUser.removeListener("error", error);
				this.steamUser.removeListener("loggedOn", loggedOn);
				this.steamUser.removeListener("steamGuard", steamGuard);

				while (!this.steamUser.vac) {
					// No response for 2 seconds, assume no bans
					if (msTimeVacNoResponse > 2000) {
						this.steamUser.vac = {
							appids: []
						};
						break;
					}

					msTimeVacNoResponse++;
					await new Promise(p => setTimeout(p, 1));
				}

				if (this.steamUser.vac.appids.includes(730)) {
					this.steamUser.logOff();
					reject(new Error("VAC Banned"));
					return;
				}

				await this.steamUser.requestFreeLicense(730);

				this.steamUser.on("error", this._steamErrorHandler);
				this.steamUser.setPersona(SteamUser.EPersonaState.Online);
				this.steamUser.gamesPlayed(730);

				let welcome = undefined;
				let fails = 0;
				while (!welcome) {
					welcome = await this.csgoUser.sendMessage(
						730,
						this.csgoUser.Protos.csgo.EGCBaseClientMsg.k_EMsgGCClientHello,
						{},
						this.csgoUser.Protos.csgo.CMsgClientHello,
						{},
						this.csgoUser.Protos.csgo.EGCBaseClientMsg.k_EMsgGCClientWelcome,
						this.csgoUser.Protos.csgo.CMsgClientWelcome,
						5000
					).catch(() => { });

					if (!welcome) {
						if (++fails <= 10) {
							continue;
						}

						this.steamUser.logOff();
						reject(new Error("GC connection timeout - Hello"));
						return;
					}
				}

				this.csgoUser.sendMessage(
					730,
					this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingClient2GCHello,
					{},
					this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingClient2GCHello,
					{},
					this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
					this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
					10000
				).then((mmHello) => {
					if (mmHello.vac_banned) {
						this.steamUser.logOff();
						reject(new Error("VAC Banned"));
						return;
					}

					/*
						8: This account is permanently Untrusted
						10: Convicted by Overwatch - Majorly Disruptive
						11: Convicted by Overwatch - Minorly Disruptive
						14: This account is permanently Untrusted
						15: Global Cooldown
						19: A server using your game server login token has been banned. Your account is now permanently banned from operating game servers, and you have a cooldown from connecting to game servers.
					*/
					if ([8, 10, 11, 14, 15, 19].includes(mmHello.penalty_reason)) {
						this.steamUser.logOff();
						reject(new Error("Game Banned"));
						return;
					}

					this.setGamesPlayed(this.getAnonymousServerID());
					resolve(welcome);
				}).catch((err) => {
					this.steamUser.logOff();
					reject(new Error("GC connection timeout - MMHello"));
				});
			};

			let steamGuard = () => {
				clearTimeout(this.loginTimeout);
				this.loginTimeout = null;

				this.steamUser.logOff();
				this.steamUser.removeListener("error", error);
				this.steamUser.removeListener("loggedOn", loggedOn);
				this.steamUser.removeListener("steamGuard", steamGuard);

				reject(new Error("Steam Guard required"));
			}

			this.steamUser.on("error", error);
			this.steamUser.on("loggedOn", loggedOn);

			if (!this.isTarget) {
				this.steamUser.on("steamGuard", steamGuard);
			}
		});
	}

	/**
	 * Set games played with server ID
	 * @param {String} serverID ServerID
	 * @returns {undefined}
	 */
	setGamesPlayed(serverID) {
		if (this.errored) {
			return;
		}

		if (this.gamesPlayedInterval) {
			clearInterval(this.gamesPlayedInterval);
			this.gamesPlayedInterval = null;
		}

		if (this.isTarget) {
			this.gamesPlayedInterval = setInterval(() => {
				if (!this.steamUser || !this.steamUser.steamID) {
					clearInterval(this.gamesPlayedInterval);
					this.gamesPlayedInterval = null;
					return;
				}

				this.steamUser.gamesPlayed({
					game_id: 730,
					steam_id_gs: serverID
				});
			}, 5 * 60 * 1000);
			this.gamesPlayedInterval.unref();
		}

		this.steamUser.gamesPlayed({
			game_id: 730,
			steam_id_gs: serverID
		});
	}

	getAnonymousServerID() {
		let sid = new SteamID();
		sid.universe = SteamID.Universe.PUBLIC;
		sid.type = SteamID.Type.ANON_GAMESERVER;
		sid.instance = 14196;
		sid.accountid = 1;
		return sid.getSteamID64();
	}

	authenticate() {
		return new Promise(async (resolve, reject) => {
			let authTicket = await this.steamUser.getAuthSessionTicket(730).catch(reject);
			if (!authTicket) {
				return;
			}

			let ticketCrc = StdLib.Hashing.crc32(authTicket.appTicket);
			this.csgoUser.sendMessage(
				undefined,
				this.csgoUser.Protos.steam.EMsg.k_EMsgClientAuthList,
				{},
				undefined, // this.csgoUser.Protos.steam.CMsgClientAuthList - (Steam-User automatically encodes this for us)
							// TODO: Change sendMessage() to make this more consistent
				{
					tokens_left: this.steamUser._gcTokens.length,
					last_request_seq: this.steamUser._authSeqMe,
					last_request_seq_from_server: this.steamUser._authSeqThem,
					tickets: [
						{
							estate: 2,
							eresult: 0,
							steamid: this.getAnonymousServerID(),
							gameid: 730,
							h_steam_pipe: this.steamUser._hSteamPipe,
							ticket_crc: ticketCrc,
							ticket: authTicket.appTicket
						}
					],
					app_ids: [730],
					message_sequence: ++this.steamUser._authSeqMe
				},
				this.csgoUser.Protos.steam.EMsg.k_EMsgClientAuthListAck,
				this.csgoUser.Protos.steam.CMsgClientAuthListAck,
				20000
			).then((ticketRes) => {
				if (!ticketRes.ticket_crc || ticketRes.ticket_crc.length <= 0 || ticketRes.ticket_crc[0] !== ticketCrc) {
					reject(new Error("Received authlist for ticket " + ticketRes.ticket_crc[0] + " but expected " + ticketCrc));
					return;
				}

				resolve(ticketCrc);
			}).catch(reject);
		});
	}

	unauthenticate() {
		return new Promise(async (resolve, reject) => {
			this.csgoUser.sendMessage(
				undefined,
				this.csgoUser.Protos.steam.EMsg.k_EMsgClientAuthList,
				{},
				undefined, //this.csgoUser.Protos.steam.CMsgClientAuthList - (Steam-User automatically encodes this for us)
							// TODO: Change sendMessage() to make this more consistent
				{
					tokens_left: this.steamUser._gcTokens.length,
					last_request_seq: this.steamUser._authSeqMe,
					last_request_seq_from_server: this.steamUser._authSeqThem,
					app_ids: [730],
					message_sequence: ++this.steamUser._authSeqMe
				},
				this.csgoUser.Protos.steam.EMsg.k_EMsgClientAuthListAck,
				this.csgoUser.Protos.steam.CMsgClientAuthListAck,
				5000
			).then((ticketRes) => {
				if (ticketRes.ticket_crc && ticketRes.ticket_crc.length >= 1) {
					reject(new Error("Failed to unauthorize tickets"));
					return;
				}

				resolve(true);
			}).catch(reject);
		});
	}

	/**
	 * Commend a player
	 * @param {Number} accountID AccountID of our target
	 * @param {Boolean|Number} cmd_friendly Do we want to commend as friendly?
	 * @param {Boolean|Number} cmd_teaching Do we want to commend as teaching?
	 * @param {Boolean|Number} cmd_leader Do we want to commend as leader?
	 * @returns {Promise.<Object>}
	 */
	commendPlayer(accountID, cmd_friendly, cmd_teaching, cmd_leader) {
		return new Promise((resolve, reject) => {
			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientCommendPlayer,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientCommendPlayer,
				{
					account_id: accountID,
					match_id: "0",
					commendation: {
						cmd_friendly: cmd_friendly ? 1 : 0,
						cmd_teaching: cmd_teaching ? 1 : 0,
						cmd_leader: cmd_leader ? 1 : 0
					}
				},
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse,
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientReportResponse,
				20000
			).then(resolve).catch(reject);
		});
	}

	/**
	 * Report a player
	 * @param {Number} accountID AccountID of our target
	 * @param {Boolean|Number} rpt_aimbot Do we want to report as aimbotting?
	 * @param {Boolean|Number} rpt_wallhack Do we want to report as wallhacking?
	 * @param {Boolean|Number} rpt_speedhack Do we want to report as other hacking?
	 * @param {Boolean|Number} rpt_teamharm Do we want to report as griefing?
	 * @param {Boolean|Number} rpt_textabuse Do we want to report as text abusing?
	 * @returns {Promise.<Object>}
	 */
	reportPlayer(accountID, rpt_aimbot, rpt_wallhack, rpt_speedhack, rpt_teamharm, rpt_textabuse) {
		return new Promise((resolve, reject) => {
			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportPlayer,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientReportPlayer,
				{
					account_id: accountID,
					match_id: "0",
					rpt_aimbot: rpt_aimbot ? 1 : 0,
					rpt_wallhack: rpt_wallhack ? 1 : 0,
					rpt_speedhack: rpt_speedhack ? 1 : 0,
					rpt_teamharm: rpt_teamharm ? 1 : 0,
					rpt_textabuse: rpt_textabuse ? 1 : 0,
					rpt_voiceabuse: 0,
					report_from_demo: false
				},
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse,
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientReportResponse,
				20000
			).then(resolve).catch(reject);
		});
	}

	/**
	 * Log out from the account
	 */
	logOff() {
		this.steamUser.removeListener("error", this._steamErrorHandler);
		this.steamUser.logOff();
	}
}
