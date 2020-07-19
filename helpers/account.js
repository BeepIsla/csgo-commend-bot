const Events = require("events");
const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const SteamID = require("steamid");
const StdLib = require("@doctormckay/stdlib");
const GameCoordinator = require("./GameCoordinator.js");
const Helper = require("./Helper.js");
const VDF = require("./VDF.js");
const protocols = {
	"AUTO": 0,
	"TCP": 1,
	"WEBSOCKET": 2,

	"WEBCOMPATIBILITY": 2
};

module.exports = class Account extends Events {
	constructor(isTarget = false, proxy = undefined, protocol = undefined) {
		super();

		this.steamUser = new SteamUser({
			autoRelogin: false,
			enablePicsCache: false,
			picsCacheAll: false,
			httpProxy: proxy,
			protocol: protocols[String(protocol).toUpperCase()] || 0,
			webCompatibilityMode: String(protocol).toUpperCase() === "WEBCOMPATIBILITY"
		});
		this.csgoUser = new GameCoordinator(this.steamUser, 730);
		this.loginTimeout = null;
		this.isTarget = isTarget;
		this.errored = false;
		this.gamesPlayedInterval = null;
		this.helper = new Helper(""); // No API key needed for this single usage
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

				await this.steamUser.requestFreeLicense(730).catch(() => { });

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

	authenticate(serverID) {
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
							steamid: serverID,
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
				5000
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
				undefined, //this.csgoUser.Protos.steam.CMsgClientAuthList,
				{
					tokens_left: this.steamUser._gcTokens.length,
					last_request_seq: this.steamUser._authSeqMe,
					last_request_seq_from_server: this.steamUser._authSeqThem,
					app_ids: [730],
					message_sequence: ++this.steamUser._authSeqMe
				},
				this.csgoUser.Protos.steam.EMsg.k_EMsgClientAuthListAck,
				this.csgoUser.Protos.steam.CMsgClientAuthListAck,
				1000
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
	 * @param {String} serverID ServerID of our target
	 * @param {Number} accountID AccountID of our target
	 * @param {String} matchID Optional MatchID
	 * @param {Boolean|Number} cmd_friendly Do we want to commend as friendly?
	 * @param {Boolean|Number} cmd_teaching Do we want to commend as teaching?
	 * @param {Boolean|Number} cmd_leader Do we want to commend as leader?
	 * @param {Number} timeout Maximum amount of time to wait before rejecting in milliseconds
	 * @returns {Promise.<Object>}
	 */
	commendPlayer(serverID, accountID, matchID, cmd_friendly, cmd_teaching, cmd_leader, timeout) {
		return new Promise(async (resolve, reject) => {
			this.setGamesPlayed(serverID);

			// Wait for the ServerID to set
			await new Promise(p => setTimeout(p, 50));

			if (this.errored) {
				return;
			}

			if (typeof matchID === "number") {
				matchID = String(matchID);
			}

			if (typeof matchID === "string" && (matchID.toUpperCase() === "AUTO" || matchID.length <= 0 || !/^\d+$/.test(matchID))) {
				matchID = "0";
			}

			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientCommendPlayer,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientCommendPlayer,
				{
					account_id: accountID,
					match_id: matchID,
					commendation: {
						cmd_friendly: cmd_friendly ? 1 : 0,
						cmd_teaching: cmd_teaching ? 1 : 0,
						cmd_leader: cmd_leader ? 1 : 0
					}
				},
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse,
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientReportResponse,
				timeout
			).then(resolve).catch(reject);
		});
	}

	/**
	 * Report a player
	 * @param {String} serverID ServerID of our target
	 * @param {Number} accountID AccountID of our target
	 * @param {String} matchID Optional MatchID
	 * @param {Boolean|Number} rpt_aimbot Do we want to report as aimbotting?
	 * @param {Boolean|Number} rpt_wallhack Do we want to report as wallhacking?
	 * @param {Boolean|Number} rpt_speedhack Do we want to report as other hacking?
	 * @param {Boolean|Number} rpt_teamharm Do we want to report as griefing?
	 * @param {Boolean|Number} rpt_textabuse Do we want to report as text abusing?
	 * @param {Number} timeout Maximum amount of time to wait before rejecting in milliseconds
	 * @returns {Promise.<Object>}
	 */
	reportPlayer(serverID, accountID, matchID, rpt_aimbot, rpt_wallhack, rpt_speedhack, rpt_teamharm, rpt_textabuse, timeout) {
		return new Promise(async (resolve, reject) => {
			this.setGamesPlayed(serverID);

			// Wait for the ServerID to set
			await new Promise(p => setTimeout(p, 50));

			if (this.errored) {
				return;
			}

			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportPlayer,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientReportPlayer,
				{
					account_id: accountID,
					match_id: matchID,
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
				timeout
			).then(resolve).catch(reject);
		});
	}

	/**
	 * Get the server our target is on
	 * @param {Number} accountid Target account ID
	 * @return {Promise.<Object>}
	 */
	getTargetServer(accountid) {
		return new Promise((resolve, reject) => {
			if (this.errored) {
				return;
			}

			this.csgoUser.sendMessage(
				undefined,
				7502,
				{
					routing_appid: 730
				},
				this.csgoUser.Protos.steam.CMsgClientRichPresenceRequest,
				{
					steamid_request: [
						SteamID.fromIndividualAccountID(accountid).getSteamID64()
					]
				},
				7503,
				this.csgoUser.Protos.steam.CMsgClientRichPresenceInfo,
				5000
			).then((info) => {
				if (info.rich_presence.length <= 0) {
					reject(new Error("Got no Steam rich presence data"));
					return;
				}

				if (!info.rich_presence[0].rich_presence_kv) {
					reject(new Error("Got no Steam rich presence data"));
					return;
				}

				let decoded = undefined;
				try {
					decoded = VDF.decode(info.rich_presence[0].rich_presence_kv);
				} catch { }

				if (!decoded || !decoded.RP) {
					reject(new Error("Failed to decode Steam rich presence keyvalues"));
					return;
				}

				if (!decoded.RP.connect) {
					reject(new Error("Target is likely not in a server or in a full server // Failed to find connect bytes"));
					return;
				}

				// Parse tokens
				let conBuf = Buffer.from(decoded.RP.connect.replace(/^\+gcconnect/, "").replace(/^G/, ""), "hex");
				if (conBuf.length !== 12) {
					reject(new Error("Target is likely in a lobby and not on a server // Requiring connect string of 12 bytes but received " + conBuf.length));
					return;
				}

				let joinToken = conBuf.readInt32BE(0);
				let accountID = conBuf.readInt32BE(4);
				let joinIpp = conBuf.readInt32BE(8);

				this.csgoUser.sendMessage(
					730,
					this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientRequestJoinFriendData,
					{},
					this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientRequestJoinFriendData,
					{
						version: 0,
						account_id: accountID,
						join_token: joinToken,
						join_ipp: joinIpp
					},
					this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientRequestJoinFriendData,
					this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientRequestJoinFriendData,
					5000
				).then((data) => {
					if (data.errormsg) {
						reject(new Error("Received join error for community server: " + data.errormsg));
						return;
					}

					if (!data.res || !data.res.serverid) {
						reject(new Error("Failed to get community server join data"));
						return;
					}

					resolve({
						serverID: data.res.serverid,
						isValve: data.res.reservation && data.res.reservation.game_type,
						serverIP: data.res.server_address
					});
				}).catch(reject);
			}).catch(reject);
		});
	}

	getTargetServerValve(accountid) {
		return new Promise((resolve, reject) => {
			if (this.errored) {
				return;
			}

			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientRequestWatchInfoFriends2,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientRequestWatchInfoFriends,
				{
					account_ids: [
						accountid
					]
				},
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_GCToClientSteamdatagramTicket,
				this.csgoUser.Protos.csgo.CMsgGCToClientSteamDatagramTicket,
				5000
			).then((info) => {
				if (!info.serialized_ticket) {
					reject(new Error("Got no CSGO response data for Valve Server"));
					return;
				}

				let serverID = info.serialized_ticket.readBigUInt64LE(72);
				let matchID = info.serialized_ticket.readBigUInt64LE(93);

				resolve({
					// This used to be the real servers IP and ID but it no longer seems to be
					serverID: serverID.toString(),
					isValve: true,
					matchID: matchID.toString()
				});
			}).catch((err) => {
				reject(new Error("Failed to receive Valve CSGO Server information"));
			});
		});
	}

	getCurrentCommendCount(accountID) {
		return new Promise((resolve, reject) => {
			if (this.errored) {
				return;
			}

			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientRequestPlayersProfile,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientRequestPlayersProfile,
				{
					account_id: accountID,
					request_level: 32
				},
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayersProfile,
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayersProfile,
				20000
			).then((data) => {
				let commends = undefined;
				if (data.account_profiles && data.account_profiles[0] && data.account_profiles[0].commendation) {
					commends = data.account_profiles[0].commendation;
				} else {
					commends = {
						cmd_friendly: 0,
						cmd_teaching: 0,
						cmd_leader: 0
					};
				}

				resolve({
					friendly: commends.cmd_friendly,
					teaching: commends.cmd_teaching,
					leader: commends.cmd_leader
				});
			}).catch(reject);
		});
	}

	getTargetQueuedMatch(accountid) {
		return new Promise(async (resolve, reject) => {
			if (this.errored) {
				return;
			}

			if (!this.version) {
				this.version = await this.helper.GetCurrentVersion(730).catch(reject);
				if (!this.version) {
					// Steam broke
					return;
				}
			}

			this.csgoUser.sendMessage(
				730,
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingStart,
				{},
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingStart,
				{
					account_ids: [
						accountid
					],
					client_version: this.version
				},
				this.csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientUpdate,
				this.csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientUpdate,
				1000
			).then((info) => {
				// This should always respond even when we send invalid data
				resolve(info.ongoingmatch_account_id_sessions && Array.isArray(info.ongoingmatch_account_id_sessions) && info.ongoingmatch_account_id_sessions.includes(accountid));
			}).catch(reject);
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
