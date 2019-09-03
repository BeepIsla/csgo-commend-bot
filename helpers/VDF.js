const ByteBuffer = require("bytebuffer");

const Type = {
	None: 0,
	String: 1,
	Int32: 2,
	Float32: 3,
	Pointer: 4,
	WideString: 5,
	Color: 6,
	UInt64: 7,
	End: 8,
};

module.exports = class VDF {
	static decode(buffer, customDecodeFields = {}) {
		if (buffer.toString("hex").startsWith("0000") === true) {
			buffer = Buffer.from(buffer.toString("hex").substring(4), "hex");
		}

		let object = {};
		if (typeof buffer.readUint8 !== "function") {
			buffer = ByteBuffer.wrap(buffer);
		}

		if (buffer.offset !== buffer.limit) {
			while (true) {
				let type = buffer.readUint8();

				if (type === Type.End) {
					break;
				}

				let name = buffer.readCString();

				if (typeof customDecodeFields[name] === "function") {
					object[name] = customDecodeFields[name](buffer);
					continue;
				}

				switch (type) {
					case Type.None: {
						object[name] = this.decode(buffer);
						break;
					}
					case Type.String: {
						object[name] = buffer.readCString();
						break;
					}
					case Type.Int32:
					case Type.Color:
					case Type.Pointer: {
						object[name] = buffer.readInt32();
						break;
					}
					case Type.UInt64: {
						object[name] = buffer.readUint64();
						break;
					}
					case Type.Float32: {
						object[name] = buffer.readFloat();
						break;
					}
				}
			}
		}

		return object;
	}

	static encode(_object, prefix = [0x00, 0x00], suffix = [], customEncodeFields = {}) {
		// Create a copy of the input object so we do not modify it
		let object = { ..._object };

		let buffer = new ByteBuffer();

		for (let pre of prefix) {
			buffer.writeByte(pre);
		}

		for (let item in object) {
			if (object.hasOwnProperty(item) === false) {
				continue;
			}

			if (typeof customEncodeFields[item] === "function") {
				object[item] = customEncodeFields[item](object[item]);
			}

			_encode(object[item], buffer, item);
		}

		for (let suf of suffix) {
			buffer.writeByte(suf);
		}

		buffer.writeByte(Type.End);
		buffer.flip();

		return buffer;
	}
}

function _encode(object, buffer, name) {
	if (object instanceof Buffer) {
		buffer.writeByte(Type.String);
		buffer.writeCString(name);
		let parts = object.toString("hex").toUpperCase().match(/.{1,2}/g);
		for (let part of parts) {
			buffer.writeByte(parseInt("0x" + part));
		}
		//buffer.writeByte(0x00);
	} else {
		switch (typeof object) {
			case "object": {
				buffer.writeByte(Type.None);
				buffer.writeCString(name);

				for (let index in object) {
					_encode(object[index], buffer, index);
				}

				buffer.writeByte(Type.End);
				break;
			}
			case "string": {
				buffer.writeByte(Type.String);
				buffer.writeCString(name);
				buffer.writeCString(object ? object : "");
				break;
			}
			case "number": {
				buffer.writeByte(Type.String);
				buffer.writeCString(name);
				buffer.writeCString(object.toString());
				break;
			}
		}
	}
}
