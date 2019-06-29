const request = require("request");
const SteamID = require("steamid");
const SteamUser = require("steam-user");
const unzipper = require("unzipper");
const path = require("path");
const fs = require("fs");
const GameCoordinator = require("./GameCoordinator.js");

module.exports = class Helper {
	constructor(apiKey) {
		this.apiKey = apiKey;
	}

	downloadProtobufs(dir) {
		return new Promise(async (resolve, reject) => {
			let newProDir = path.join(dir, "Protobufs-master");
			if (fs.existsSync(newProDir) === true) {
				await this.deleteRecursive(newProDir);
			}

			// Yes I know the ones I download here are technically not the same as the ones in the submodule
			// but that doesn't really matter, I doubt Valve will do any major changes with the protobufs I use here anyways
			let r = request("https://github.com/SteamDatabase/Protobufs/archive/master.zip");
			let pipe = r.pipe(unzipper.Extract({ path: dir }));
			pipe.on("close", async () => {
				let proDir = path.join(dir, "protobufs");
				if (fs.existsSync(proDir) === true) {
					await this.deleteRecursive(proDir);
				}

				fs.rename(newProDir, proDir, (err) => {
					if (err) {
						reject(err);
						return;
					}

					resolve();
				});
			});
			pipe.on("error", reject);
		});
	}

	verifyProtobufs() {
		return new Promise((resolve, reject) => {
			let user = new SteamUser();
			let gc = new GameCoordinator(user);

			try {
				// If we find this one then we also find all the other ones
				gc.Protos.csgo.EGCBaseClientMsg.k_EMsgGCClientHello;
				resolve(true);
			} catch (e) {
				resolve(false);
			}
		});
	}

	deleteRecursive(dir) {
		return new Promise((resolve, reject) => {
			fs.readdir(dir, async (err, files) => {
				if (err) {
					reject(err);
					return;
				}

				for (let file of files) {
					let filePath = path.join(dir, file);
					let stat = fs.statSync(filePath);

					if (stat.isDirectory() === true) {
						await this.deleteRecursive(filePath);
					} else {
						await new Promise((res, rej) => {
							fs.unlink(filePath, (err) => {
								if (err) {
									rej(err);
									return;
								}

								res();
							});
						});
					}
				}

				fs.rmdir(dir, (err) => {
					if (err) {
						reject(err);
						return;
					}

					resolve();
				});
			});
		});
	}

	GetLatestVersion() {
		return new Promise(async (resolve, reject) => {
			let json = await this.GetJSON("https://raw.githubusercontent.com/BeepFelix/csgo-commend-bot/master/package.json");

			if (typeof json.version !== "string") {
				reject(json);
				return;
			}

			resolve(json.version);
		});
	}

	GetCurrentVersion(appid) {
		return new Promise(async (resolve, reject) => {
			let json = await this.GetJSON("https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?format=json&appid=" + appid + "&version=0");
			if (typeof json.response !== "object") {
				reject(json);
				return;
			}

			resolve(json.response.required_version);
		});
	}

	parseSteamID(input) {
		return new Promise((resolve, reject) => {
			let parsed = input.match(/^(((http(s){0,1}:\/\/){0,1}(www\.){0,1})steamcommunity\.com\/(id|profiles)\/){0,1}(?<parsed>[A-Z0-9-_]+)(\/{0,1}.{0,})$/i);
			if (parsed === null) {
				reject(new Error("Failed to parse SteamID"));
				return;
			}

			let sid = undefined;
			try {
				sid = new SteamID(parsed.groups.parsed);
				if (sid.isValid() === true && sid.instance === 1 && sid.type === 1 && sid.universe === 1) {
					resolve(sid);
				}
			} catch (e) { }

			// If all of this is true the above one resolved
			if (sid !== undefined && sid.isValid() === true && sid.instance === 1 && sid.type === 1 && sid.universe === 1) {
				return;
			}

			this.vanityURL(parsed.groups.parsed).then((res) => {
				if (typeof res.steamid !== "string") {
					reject(new Error("Invalid Vanity URL"));
					return;
				}

				resolve(new SteamID(res.steamid));
			}).catch((err) => {
				reject(err);
			});
		});
	}

	GetActiveServer() {
		return doRequest.call(this, "IGameServersService/GetServerList", "v1", {
			limit: 1,
			filter: "\\appid\\730"
		}, [
				"response",
				"servers"
			], Array.isArray);
	}

	vanityURL(url) {
		return doRequest.call(this, "ISteamUser/ResolveVanityURL", "v1", {
			vanityurl: url
		}, [
				"response"
			], null);
	}

	parseServerID(id) {
		return new Promise((resolve, reject) => {
			let sid = undefined;
			try {
				sid = new SteamID(id);
			} catch (e) { }

			if (typeof sid !== "undefined" && sid.isValid() === true && [3, 4].includes(sid.type) === true && sid.universe === 1) {
				resolve(sid.getSteamID64());
				return;
			}

			doRequest.call(this, "IGameServersService/GetServerList", "v1", {
				limit: 1,
				filter: "\\gameaddr\\" + id
			}, [
					"response",
					"servers"
				], Array.isArray).then((res) => {
					if (typeof res[0].steamid !== "string") {
						reject(new Error("Invalid Server IP"));
						return;
					}

					resolve(res[0].steamid);
				}).catch((err) => {
					reject(err);
				});
		});
	}

	GetJSON(options) {
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

	chunkArray(ary, chunkSize) {
		let tempArray = [];

		for (let index = 0; index < ary.length; index += chunkSize) {
			let myChunk = ary.slice(index, index + chunkSize);
			tempArray.push(myChunk);
		}

		return tempArray;
	}
}

function doRequest(method, version, qsParams = {}, responsePath = [], validator) {
	return new Promise(async (resolve, reject) => {
		qs = qsParams;

		if (typeof qs.key !== "string") {
			qs.key = this.apiKey;
		}

		request({
			uri: "https://api.steampowered.com/" + method + "/" + version + "/",
			qs: qs
		}, (err, res, body) => {
			if (err) {
				reject(err);
				return;
			}

			if (res.statusCode !== 200) {
				if (res.statusCode == 403) {
					reject({
						type: "FORBIDDEN",
						key: qs.key
					});
					return;
				}

				reject(new Error("Invalid Status Code: " + res.statusCode));
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

			// Validate the response
			if (responsePath.length > 0) {
				let valid = check(json, responsePath, 0, validator);
				if (valid === false) {
					reject(json);
					return;
				}

				resolve(valid);
				return;
			}

			resolve(json);
		});
	});
}

function check(json, verifyPath, i, validator) {
	if (i >= verifyPath.length) {
		if (typeof validator === "function" && validator(json) === false) {
			return false;
		}

		return json;
	}

	if (typeof json[verifyPath[i]] !== "object") {
		return false;
	}

	return check(json[verifyPath[i]], verifyPath, i + 1, validator);
}
