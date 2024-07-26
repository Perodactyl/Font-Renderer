export class Reader {
	view: DataView;
	offset:number = 0;
	offsetStack:number[] = [];
	constructor(data: ArrayBuffer) {
		this.view = new DataView(data);
	}

	seek(offset: number) {
		this.offset = offset;
	}
	skip(length: number) {
		this.offset += length;
	}

	push() {
		this.offsetStack.push(this.offset);
	}
	pop() {
		if(this.offsetStack.length > 0) {
			this.offset = this.offsetStack.pop() as number;
		}
	}

	seekPush(offset: number) {
		this.push();
		this.seek(offset);
	}

	getUInt8() {
		let data = this.view.getUint8(this.offset);
		this.offset += 1;
		return data;
	}
	skipUInt8() {
		this.offset += 1;
	}
	getUInt8Frozen() {
		return this.view.getUint8(this.offset);
	}

	getInt8() {
		let data = this.view.getInt8(this.offset);
		this.offset += 1;
		return data;
	}
	skipInt8() {
		this.offset += 1;
	}
	getInt8Frozen() {
		return this.view.getInt8(this.offset);
	}

	getUInt16() {
		let data = this.view.getUint16(this.offset);
		this.offset += 2;
		return data;
	}
	skipUInt16() {
		this.offset += 2;
	}
	getUInt16Frozen() {
		return this.view.getUint16(this.offset);
	}

	getFUnit() {
		let data = this.view.getUint16(this.offset);
		this.offset += 2;
		return data;
	}
	skipFUnit() {
		this.offset += 2;
	}
	getFUnitFrozen() {
		return this.view.getUint16(this.offset);
	}

	getInt16() {
		let data = this.view.getInt16(this.offset);
		this.offset += 2;
		return data;
	}
	skipInt16() {
		this.offset += 2;
	}
	getInt16Frozen() {
		return this.view.getInt16(this.offset);
	}

	getUInt32() {
		let data = this.view.getUint32(this.offset);
		this.offset += 4;
		return data;
	}
	skipUInt32() {
		this.offset += 4;
	}
	getUInt32Frozen() {
		return this.view.getUint32(this.offset);
	}

	getInt32() {
		let data = this.view.getInt32(this.offset);
		this.offset += 4;
		return data;
	}
	skipInt32() {
		this.offset += 4;
	}
	getInt32Frozen() {
		return this.view.getInt32(this.offset);
	}

	getTag() {
		return String.fromCodePoint(this.getUInt8(), this.getUInt8(), this.getUInt8(), this.getUInt8());
	}
	skipTag() {
		this.offset += 4;
	}
	getTagFrozen() {
		return String.fromCodePoint(
			this.view.getUint8(this.offset+0),
			this.view.getUint8(this.offset+1),
			this.view.getUint8(this.offset+2),
			this.view.getUint8(this.offset+3)
		);
	}

	//TODO implement Fixed type
	skipFixed() {
		this.offset += 4;
	}
}

export function isBitSet(value, bitNumber) {
	return ((value >> bitNumber) & 1) == 1
}