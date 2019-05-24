const Protobuf = require("protobufjs");
Protobuf.convertFieldsToCamelCase = false;

module.exports = (protos) => {
	const protobufs = {};

	for (let proto of protos) {
		let builder = Protobuf.newBuilder();

		for (let file of proto.protos) {
			Protobuf.loadProtoFile(file, builder);
		}

		protobufs[proto.name] = builder.build();
	}

	return protobufs;
}
