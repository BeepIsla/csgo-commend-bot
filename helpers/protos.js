var Protobuf = require("protobufjs");

Protobuf.convertFieldsToCamelCase = false;

var builder = Protobuf.newBuilder();
Protobuf.loadProtoFile(__dirname + "/../protobufs/gcsystemmsgs.proto", builder);
Protobuf.loadProtoFile(__dirname + "/../protobufs/gcsdk_gcmessages.proto", builder);
Protobuf.loadProtoFile(__dirname + "/../protobufs/cstrike15_gcmessages.proto", builder);

module.exports = builder.build();
