const SteamID = require("steamid");
const request = require("request");

module.exports = (text, apiKey) => {
	return new Promise((resolve, reject) => {
		if (typeof text === "number") {
			try {
				var sid = SteamID.fromIndividualAccountID(text);
				resolve(sid);

				return;
			} catch(e) {};
		} else {
			text = String(text);
		}

		text = text.replace(/[^A-Za-z0-9_-]+$/g, "");
		text = text.split("/")[text.split("/").length - 1];

		try {
			var sid = new SteamID(text);
		} catch(e) {};

		if (sid && sid.isValid() && sid.type === SteamID.Type.INDIVIDUAL) {
			request("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2?key=" + apiKey + "&steamids=" + sid.getSteamID64(), (err, res, body) => {
				if (err) {
					reject(err);
					return;
				}

				var json = undefined;
				try {
					json = JSON.parse(body);
				} catch(e) {};

				if (!json || !json.response || !Array.isArray(json.response.players)) {
					console.log(json || body);
					reject("Malformed Steam API Response");
					return;
				}

				if (json.response.players.length < 1) {
					reject("Entered SteamID is not a valid user");
					return;
				}

				resolve(new SteamID(json.response.players[0].steamid));
			});
			return;
		}

		if (sid && sid.isValid() && sid.type !== SteamID.Type.INDIVIDUAL) {
			reject("Entered SteamID is not a valid user");
			return;
		}

		var matches = text.match(/[A-Za-z0-9_-]+($|.$)/);
		if (!matches || matches.length < 1) {
			reject("Entered SteamID is not a valid user");
			return;
		}

		request("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1?key=" + apiKey + "&vanityurl=" + matches[0] + "&url_type=1", (err, res, body) => {
			if (err) {
				reject(err);
				return;
			}

			var json = undefined;
			try {
				json = JSON.parse(body);
			} catch(e) {};

			if (!json) {
				console.log(body);
				reject("Malformed Steam API Response");
				return;
			}

			if (!json.response) {
				console.log(json);
				reject("Malformed Steam API Response");
				return;
			}

			if (!json.response.steamid) {
				reject("Entered SteamID is not a valid user");
				return;
			}

			resolve(new SteamID(json.response.steamid));
		});
	});
};
