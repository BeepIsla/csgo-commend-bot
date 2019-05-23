const request = require("request");
const SteamID = require("steamid");

module.exports = class Helper {
	static GetLatestVersion() {
		return new Promise(async (resolve, reject) => {
			let json = await this.GetJSON("https://raw.githubusercontent.com/BeepFelix/csgo-commend-bot/master/package.json");

			if (typeof json.version !== "string") {
				reject(json);
				return;
			}

			resolve(json.version);
		});
	}

	static GetCurrentVersion(appid) {
		return new Promise(async (resolve, reject) => {
			let json = await this.GetJSON("https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?format=json&appid=" + appid + "&version=0");
			if (typeof json.response !== "object") {
				reject(json);
				return;
			}

			resolve(json.response.required_version);
		});
	}

	static ParseSteamID(input, apiKey) {
		return new Promise(async (resolve, reject) => {
			let sid = undefined;
			try {
				sid = new SteamID(input);
			} catch (e) { };

			if (sid === undefined) {
				let json = await this.GetJSON({
					uri: "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/",
					qs: {
						key: apiKey,
						vanityurl: input
					}
				});

				if (typeof json.response !== "object") {
					reject(json);
					return;
				}

				resolve(new SteamID(json.response.steamid));
				return;
			}

			resolve(sid);
		});
	}

	static GetServerList(apiKey) {
		return new Promise(async (resolve, reject) => {
			let json = await this.GetJSON({
				uri: "https://api.steampowered.com/IGameServersService/GetServerList/v1/",
				qs: {
					key: apiKey,
					limit: 20000,
					filter: "\\appid\\730"
				}
			});

			if (typeof json.response !== "object" || Array.isArray(json.response.servers) === false) {
				reject(json);
				return;
			}

			resolve(json.response.servers);
		});
	}

	static ParseServerID(input, apiKey) {
		return new Promise(async (resolve, reject) => {
			let sid = undefined;
			try {
				sid = new SteamID(input);
			} catch (e) { };

			if (sid === undefined) {
				let json = await this.GetJSON({
					uri: "https://api.steampowered.com/IGameServersService/GetServerList/v1/",
					qs: {
						key: apiKey,
						limit: 1,
						filter: "\\gameaddr\\" + input
					}
				});

				if (Array.isArray(json.response) === false) {
					reject(json);
					return;
				}

				if (json.response.length <= 0) {
					reject(new Error("Input is not an active ServerIP"));
					return;
				}

				resolve(json.response.shift().steamid);
				return;
			}

			if (sid.instance === 0 && sid.type === 3 && sid.universe === 1) {
				resolve(sid.getSteamID64());
				return;
			}

			reject(new Error("Input is not a ServerID"));
		});
	}

	static GetJSON(options) {
		return new Promise((resolve, reject) => {
			request(options, (err, res, body) => {
				if (err) {
					reject(err);
					return;
				}

				if (res.statusCode !== 200) {
					reject(new Error("Invalid Status Code: " + res.statusCode + " - Visit https://httpstatuses.com/" + res.statusCode));
					return;
				}

				let json = undefined;
				try {
					json = JSON.parse(body);
				} catch (e) { };

				if (json === undefined) {
					reject(body);
					return;
				}

				resolve(json);
			});
		});
	}

	static chunkArray(ary, chunkSize) {
		let tempArray = [];

		for (let index = 0; index < ary.length; index += chunkSize) {
			let myChunk = ary.slice(index, index + chunkSize);
			tempArray.push(myChunk);
		}

		return tempArray;
	}
}
