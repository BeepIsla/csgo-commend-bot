const Events = require("events");
const fs = require("fs");
const path = require("path");
const ByteBuffer = require("bytebuffer");
const Protos = require("./Protos.js");
let compiledProtos = null;

module.exports = class GameCoordinator extends Events {
	constructor(steamUser, debug = false) {
		super();

		if (debug) {
			this.debugPath = path.join(__dirname, "..", "debug");
			if (!fs.existsSync(this.debugPath)) {
				fs.mkdirSync(this.debugPath);
			}

			this.debugPath = path.join(this.debugPath, Date.now().toString());
			if (!fs.existsSync(this.debugPath)) {
				fs.mkdirSync(this.debugPath);
			}
		}

		this.steamUser = steamUser;
		this.debug = debug;
		this.Protos = compiledProtos ? compiledProtos : Protos([
			{
				name: "csgo",
				protos: [
					__dirname + "/../protobufs/csgo/gcsystemmsgs.proto",
					__dirname + "/../protobufs/csgo/gcsdk_gcmessages.proto",
					__dirname + "/../protobufs/csgo/cstrike15_gcmessages.proto"
				]
			},
			{
				name: "steam",
				protos: [
					__dirname + "/../protobufs/steam/steammessages_base.proto",
					__dirname + "/../protobufs/steam/steammessages_clientserver_2.proto"
				]
			}
		]);
		this._GCHelloInterval = null;
		this.startPromise = null;
		this.startTimeout = null;

		compiledProtos = this.Protos;

		steamUser.on("receivedFromGC", (appid, msgType, payload) => {
			if (appid === 730) {
				if (msgType === this.Protos.csgo.EGCBaseClientMsg.k_EMsgGCClientWelcome) {
					if (this._GCHelloInterval) {
						clearInterval(this._GCHelloInterval);
						this._GCHelloInterval = null;
					}

					if (this.startPromise) {
						let msg = this.Protos.csgo.CMsgClientWelcome.decode(payload);
						msg = this.Protos.csgo.CMsgClientWelcome.toObject(msg, { defaults: true });
						this.startPromise(msg);
						this.startPromise = null;
					}

					if (this.startTimeout) {
						clearTimeout(this.startTimeout);
						this.startTimeout = null;
					}
				}

				this.emit("message", msgType, payload);
			}

			this.emit("allMsg", appid, msgType, payload);
		});
	}

	start(timeout = 20000) {
		return new Promise((resolve, reject) => {
			this.startTimeout = setTimeout(() => {
				if (this._GCHelloInterval) {
					clearInterval(this._GCHelloInterval);
					this._GCHelloInterval = null;
				}

				if (this.startPromise) {
					this.startPromise = null;
				}

				reject(new Error("GC connection timeout - GCHello"));
			}, timeout);

			this._GCHelloInterval = setInterval(() => {
				let message = this.Protos.csgo.CMsgClientHello.create({});
				let encoded = this.Protos.csgo.CMsgClientHello.encode(message);

				this.steamUser.sendToGC(730, this.Protos.csgo.EGCBaseClientMsg.k_EMsgGCClientHello, {} , encoded.finish());
			}, 5000);

			this.startPromise = resolve;
		});
	}

	/**
	 * Send a message and get the response from it if needed
	 * @param {Number|undefined} appid AppID where to send the GC message to - Pass "undefined" for customized proto
	 * @param {Number} header The identifier of the message we are sending
	 * @param {Object} proto Header proto
	 * @param {Constructor|undefined} protobuf Constructor to create the buffer with settings. If "undefined" then "settings" HAS to be a buffer
	 * @param {Object} settings Settings to combine with the protobuf to construct the buffer
	 * @param {Number|undefined} responseHeader The response header to our request
	 * @param {Object|undefined} responseProtobuf Will automatically append ".decode()": Function which will be used to decode the protobuf. If "undefined" will not decode response and resolve with the raw buffer of the response
	 * @param {Number} timeout Max number of milliseconds before we give up on waiting for our response
	 * @returns {Promise} Promise which resolves in the object of our response, or undefined if "responseHeader" is undefined or rejects in a timeout error
	 */
	sendMessage(appid, header, proto, protobuf, settings, responseHeader, responseProtobuf, timeout = 30000) {
		return new Promise((resolve, reject) => {
			if (!appid) {
				let encoded = settings;
				if (protobuf) {
					let message = protobuf.create(settings);
					encoded = protobuf.encode(message);
				}

				if (this.debug) {
					fs.writeFileSync(path.join(this.debugPath, Date.now() + "_out_" + header), protobuf ? encoded.finish() : encoded);
				}

				this.steamUser._send({
					msg: header,
					proto: proto
				}, protobuf ? encoded.finish() : encoded);

				if (!responseHeader) {
					resolve();
					return;
				}

				this.steamUser._handlerManager.add(responseHeader, (body) => {
					if (this.steamUser._handlerManager.hasHandler(responseHeader)) {
						if (this.steamUser._handlerManager._handlers[responseHeader] && this.steamUser._handlerManager._handlers[responseHeader].length > 0) {
							this.steamUser._handlerManager._handlers[responseHeader].pop(); // We added our message last (I assume) so remove the last one

							if (this.steamUser._handlerManager._handlers[responseHeader].length <= 0) {
								delete this.steamUser._handlerManager._handlers[responseHeader];
							}
						}
					}

					if (this.debug) {
						fs.writeFileSync(path.join(this.debugPath, Date.now() + "_in_" + responseHeader), body.toBuffer ? body.toBuffer() : body);
					}

					if (!responseProtobuf) {
						if (body instanceof Buffer || body instanceof ByteBuffer) {
							resolve(body.toBuffer ? body.toBuffer() : body);
							return;
						}

						resolve(body.toBuffer ? body.toBuffer() : body);
						return;
					}

					if (body instanceof Buffer || body instanceof ByteBuffer) {
						body = responseProtobuf.decode(body.toBuffer ? body.toBuffer() : body);
						body = responseProtobuf.toObject(body, { defaults: true });
					}

					resolve(body);
				});
				return;
			}

			let encoded = settings;
			if (protobuf) {
				let message = protobuf.create(settings);
				encoded = protobuf.encode(message);
			}
			this.steamUser.sendToGC(appid, header, proto, protobuf ? encoded.finish() : encoded);

			if (this.debug) {
				fs.writeFileSync(path.join(this.debugPath, Date.now() + "_in_5452_" + header), protobuf ? encoded.finish() : encoded);
			}

			if (!responseHeader) {
				resolve();
				return;
			}

			let sendTimeout = setTimeout(() => {
				this.removeListener("allMsg", sendMessageResponse);
				reject(new Error("Failed to send message: Timeout"));
			}, timeout);

			this.on("allMsg", sendMessageResponse);
			function sendMessageResponse(appid, msgType, payload) {
				if (msgType === responseHeader) {
					clearTimeout(sendTimeout);
					this.removeListener("allMsg", sendMessageResponse);

					if (this.debug) {
						fs.writeFileSync(path.join(this.debugPath, Date.now() + "_in_5453_" + responseHeader), payload);
					}

					if (!responseProtobuf) {
						resolve(payload);
						return;
					}

					let msg = responseProtobuf.decode(payload);
					msg = responseProtobuf.toObject(msg, { defaults: true });
					resolve(msg);
				}
			}
		});
	}
}
