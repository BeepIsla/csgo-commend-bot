const Protobuf = require("protobufjs");
const fs = require("fs");
const path = require("path");

module.exports = Protos;

/**
 * @typedef protosObject
 * @type {Object}
 * @property {String} name Name ot use in the output
 * @property {Array.<String>|String} protos Array of protobuf file paths to load OR directory path to load all
 */

/**
 * Parse an array of protobuf files
 * @param {Array.<protosObject>} protos Array of objets to parse
 * @param {Boolean} ignoreErrors Should we ignore errors or not
 * @returns {Object}
 */
function Protos(protos, ignoreErrors = true) {
	const protobufs = {};

	for (let proto of protos) {
		let root = new Protobuf.Root();
		let files = Array.isArray(proto.protos) ? proto.protos : fs.readdirSync(proto.protos).map(file => path.join(proto.protos, file));

		for (let file of files) {
			if (!file.endsWith(".proto") || !fs.existsSync(file)) {
				continue;
			}

			try {
				root = root.loadSync(file, {
					keepCase: true					
				});
			} catch (err) {
				if (!ignoreErrors) {
					throw err;
				}
			};
		}

		protobufs[proto.name] = root;
	}

	return protobufs;
}
