import { isBitSet, Reader } from "./reader";

export type Codepoint = number;
export type GlyphIndex = number;
type Offset = number;
export type FUnits = number;

export interface GlyphPoint {
	isReturnPoint: any;
	x: number,
	y: number,
	isEndOfContour: boolean,
	isOnCurve: boolean,
	isImplicit: boolean,
}

export type GlyphContour = GlyphPoint[];

export interface GlyphData {
	contours: GlyphContour[],
	minX: number,
	maxX: number,
	minY: number,
	maxY: number,
}

interface FontTables {
	cmap: Offset, //Character-to-glyph mapping
	glyf: Offset, //Glyph data
	head: Offset, //Font header
	hhea: Offset, //Horizontal Header
	hmtx: Offset, //Horizontal Metrics
	loca: Offset, //Glyph Index-to-offset mapping
	maxp: Offset, //Maximum Profile (metrics about memory allocation and such)
	name: Offset, //Naming
	post: Offset, //PostScript

	'cvt '?: Offset,
	fpgm?:   Offset,
	hdmx?:   Offset,
	kern?:   Offset,
	'OS/2'?: Offset,
	prep?:   Offset,
}

export class Font {
	reader: Reader;

	tables: FontTables = <FontTables>{};
	cmap: Map<Codepoint, GlyphIndex> = new Map();
	location: Map<GlyphIndex, Offset> = new Map();
	spacing: Map<GlyphIndex, FUnits> = new Map();

	glyphDataMemo: Map<Offset, GlyphData> = new Map();

	unitsPerEm: FUnits; //Conversion factor from FUnits to Ems.

	constructor(TTFData: ArrayBuffer) {
		let reader = new Reader(TTFData);
		this.reader = reader;

		//! 1. Populate tables list
		reader.skipUInt32(); //'Scaler Type'
		let numTables = reader.getUInt16();

		//* These fields are used when searching through tables. This pattern also occurs in the cmap table.
		reader.skipUInt16(); //'Search Range'
		reader.skipUInt16(); //'Entry Selector'
		reader.skipUInt16(); //'Range Shift'

		for(let i = 0; i < numTables; i++) {
			let tag = reader.getTag();
			reader.skipUInt32(); //'Checksum'
			let offset = reader.getUInt32();
			reader.skipUInt32(); //'Length'

			this.tables[tag] = offset;
		}
		// console.table(this.tables);

		//! 2. Get metadata from the head table
		reader.seek(this.tables.head);

		reader.skipFixed(); //'Version'
		reader.skipFixed(); //'Font Revision'
		reader.skipUInt32(); //'Checksum Adjustment'
		reader.skipUInt32(); //?'Magic Number'
		reader.skipUInt16(); //'Flags'
		this.unitsPerEm = reader.getUInt16();
		reader.skip(30);
		let locationTableFormat = reader.getInt16() == 0 ? "16bit" : "32bit";

		//? 2.2 Get number of glyphs from the maxp table
		reader.seek(this.tables.maxp);
		reader.skipFixed(); //'Version'
		let numGlyphs = reader.getUInt16();

		//! 3. Populate location mapping
		reader.seek(this.tables.loca);
		for(let i = 0; i < numGlyphs; i++) {
			let value: Offset;
			if(locationTableFormat == "16bit") value = reader.getUInt16();
			else value = reader.getUInt32();

			this.location.set(i, this.tables.glyf + value);
		}

		//! 4. Populate horizontal spacing data
		//? 4.1 Get number of width metrics from hhea table
		reader.seek(this.tables.hhea);
		reader.skip(34);
		let numWidthMetrics = reader.getUInt16();
		//? 4.2 Populate dynamic-width characters
		reader.seek(this.tables.hmtx);
		let monospacedValue = 0;
		for(let i = 0; i < numWidthMetrics; i++) {
			this.spacing.set(i, monospacedValue = reader.getFUnit());
			reader.skipFUnit(); //'Left Side Bearing'
		}
		//? 4.3 Any other characters are monospaced.
		for(let i = numWidthMetrics; i < numGlyphs; i++) {
			this.spacing.set(i, monospacedValue);
		}

		//! 5. Populate cmap.
		//TODO: Implement format 12
		reader.seek(this.tables.cmap);
		reader.skipUInt16(); //'Version'

		let numCmapSubtables = reader.getUInt16();
		for(let i = 0; i < numCmapSubtables; i++) {
			let platformID = reader.getUInt16();
			let platformSpecificID = reader.getUInt16();
			let maptableOffset = reader.getUInt32();
			if(platformID == 0 && platformSpecificID != 14) { //Unicode tables only, please
				reader.seekPush(this.tables.cmap + maptableOffset);
				this.readCmapSubtable();
				reader.pop();
			}
		}
	}

	readCmapSubtable() {
		let reader = this.reader;
		let format = reader.getUInt16();

		if(format == 4) { //This format has several 'segments', each one mapping a contigous range of codepoints.
			let length = reader.getUInt16();
			reader.skipUInt16(); //'Language'
			let segCountX2 = reader.getUInt16();
			
			let segCount = segCountX2 / 2;
			reader.skipUInt16() //'Search Range'
			reader.skipUInt16() //'Entry Selector'
			reader.skipUInt16() //'Range Shift'
			
			let endCodes: Codepoint[] = [];
			for(let i = 0; i < segCount; i++) {
				endCodes.push(reader.getUInt16());
			}
			reader.skipUInt16(); //reserved padding space.
			let startCodes: Codepoint[] = [];
			for(let i = 0; i < segCount; i++) {
				startCodes.push(reader.getUInt16());
			}
			
			//Maps characters by the difference between their glyph index and their codepoint. Each segment has its own single idDelta.
			let idDelta: number[] = [];
			for(let i = 0; i < segCount; i++) {
				idDelta.push(reader.getUInt16());
			}

			let idRangeOffsets: Offset[] = []; //List of offsets into maps, one per segment. Each map has arbitrarily placed values.
			for(let i = 0; i < segCount; i++) {
				idRangeOffsets.push(reader.getInt16());
			}

			//Finally search each range.
			for(let i = 0; i < segCount; i++) {
				for(let codepoint = startCodes[i]; codepoint < endCodes[i]; codepoint++) {
					if(codepoint == 0xFFFF) continue;

					let glyphIndex;
					if(idRangeOffsets[i] == 0) { //Don't search an ID range.
						glyphIndex = (codepoint + idDelta[i]) % 65536;
					} else {
						let arrayOffset = idRangeOffsets[i] / 2 + (codepoint - startCodes[i]); //Index into whichever array we are checking
						reader.seekPush(this.tables.cmap + arrayOffset * 2);
						let glyphId = reader.getUInt32Frozen();
						reader.pop();
						glyphIndex = glyphId ? (glyphId + idDelta[i]) % 65536 : 0;
					}

					// console.log(`Mapped codepoint ${codepoint} ("${String.fromCodePoint(codepoint)}") to glyph no. ${glyphIndex}`);
					this.cmap.set(codepoint, glyphIndex);
				}
			}
		} else if(format == 12) {

		} else {
			throw `Unicode subtable has format ${format}, which is unimplemented.`;
		}
	}

	findGlyph(codePoint: Codepoint): Offset {
		if(this.cmap.has(codePoint)) {
			// if(LOG_LEVEL > 0)console.log(`CMAP entry for codepoint ${codePoint} ("${String.fromCodePoint(codePoint)}"): ${cmap.get(codePoint)}`);
			return this.location.get(this.cmap.get(codePoint) as number) as number;
		}
		// if(LOG_LEVEL > 0)console.log(`No cmap entry for codepoint ${codePoint} ("${String.fromCodePoint(codePoint)}")`);
		return this.tables.glyf; //'UNKNOWN GLYPH' is always the first glyph stored.
	}

	readGlyph(offset: number): GlyphData {
		if(this.glyphDataMemo.has(offset)) {
			return this.glyphDataMemo.get(offset);
		}
		let reader = this.reader;
		reader.seek(offset);
		let contourCount = reader.getInt16();
		let xMin = reader.getFUnit();
		let yMin = reader.getFUnit();
		let xMax = reader.getFUnit();
		let yMax = reader.getFUnit();
	
		if(contourCount < 0) { //TODO Compound glyph not supported, return MISSING CHARACTER
			return this.readGlyph(this.findGlyph(0));
		}
		//Now in the data section.
		//EndPtsOfContours[n]
		let endPointIndices: number[] = [];
		for(let i = 0; i < contourCount; i++) {
			endPointIndices.push(reader.getUInt16());
		}
	
		let numPts = endPointIndices[endPointIndices.length-1] + 1; //The last specified endpoint must be the last point overall.
		// console.log(`${numPts} points`);
		//Instructions are used for hinting; we ain't doin' that today. TODO?
		let instructionLength = reader.getUInt16();
		reader.skip(instructionLength);
		
		//flags

		interface PointFlags {
			onCurve: boolean,
			xShort: boolean,
			yShort: boolean,
			xPositive: boolean,
			yPositive: boolean,
			xSame: boolean,
			ySame: boolean,
		}
	
		let flags: PointFlags[] = [];
		for(let i = 0; i < numPts; void 0) { //'repeat' flag forces incrementation to occur dynamically.
			let flag = reader.getUInt8();
	
			let onCurve = isBitSet(flag, 0);
			let xShort = isBitSet(flag, 1);
			let yShort = isBitSet(flag, 2);
			let repeat = isBitSet(flag, 3);
			let infoX = isBitSet(flag, 4);
			let infoY = isBitSet(flag, 5);
	
			let data: PointFlags = {
				onCurve,
				xShort,
				yShort,
				xPositive: infoX,
				yPositive: infoY,
				xSame: !xShort && infoX,
				ySame: !yShort && infoY,
			}
			let count = 1
			if(repeat) {
				count = reader.getUInt8();
			}
			for(let j = 0; j < count; j++) {
				flags.push(data);
				i++;
			}
		}
		// console.log(`${flags.length} flags entries`)
	
		//Point location data
		//Coordinates are relative to previous location. Starts at (0, 0)
		
		let xCoords: FUnits[] = [];
		let yCoords: FUnits[] = [];
	
		// let lastDeltaX = 0;
		// let lastDeltaY = 0;
		let curX = 0;
		let curY = 0;

		// console.table(flags);
	
		for(let i = 0; i < numPts; i++) {
			if(!flags[i].xSame) {
				if(flags[i].xShort) {
					let value = reader.getUInt8();
					// console.log(`Point ${i} X is short; it is ${flags[i].xPositive ? "positive" : "negative"}. (= ${value}). Now at ${curX}`);
					if(flags[i].xPositive) {
						curX += value;
						// lastDeltaX = value;
					} else {
						// lastDeltaX = -value;
						curX -= value;
					}
				} else {
					let coord = reader.getInt16();
					// console.log(`Point ${i} X is long (= ${coord})`);
					curX += coord;
				}
			} else {
				// console.log(`Point ${i} X is same`);
				// curX += lastDeltaX;
			}
			xCoords.push(curX);
		}
	
		for(let i = 0; i < numPts; i++) {
			if(!flags[i].ySame) {
				if(flags[i].yShort) {
					let value = reader.getUInt8();
					// console.log(`Point ${i} Y is short; it is ${flags[i].yPositive ? "positive" : "negative"}. (= ${value}). Now at ${curY}`);
					if(flags[i].yPositive) {
						curY += value;
						// lastDeltaY = value;
					} else {
						curY -= value;
						// lastDeltaY = -value;
					}
				} else {
					let coord = reader.getInt16();
					// console.log(`Point ${i} Y is long (= ${coord})`);
					curY += coord;
				}
			} else {
				// console.log(`Point ${i} Y is same`);
				// curY += lastDeltaY;
			}
			yCoords.push(curY);
		}
	
		//"Zip" all the data up.
	
		let points: GlyphPoint[] = [];
		for(let i = 0; i < numPts; i++) {
			points.push({
				x: xCoords[i] / this.unitsPerEm,
				y: yCoords[i] / this.unitsPerEm,
				isEndOfContour: endPointIndices.includes(i),
				isOnCurve: flags[i].onCurve,
				isImplicit: false,
				isReturnPoint: false,
			});
		}

		//Convert points to contours.
		let contours: GlyphContour[] = [];
		{
			let currentContour: GlyphContour = [];
			for(let point of points) {
				currentContour.push(point);
				if(point.isEndOfContour) {
					//Add the starting point back in, at the end, to make a loop.
					currentContour.push({
						...currentContour[0],
						isReturnPoint: true,
					});
					contours.push(currentContour);
					currentContour = [];
				}
				//NOTE: The last point in each glyph must be the end of a contour, therefore we don't have to handle `currentContour.length > 0` afterward.
			}
		}

		//Add implied points on the curve.
		for(let contour of contours) {
			for(let i = 0; i < contour.length; i++) {
				let current = contour[i];
				let next = contour[(i+1) % contour.length];
				if(!current.isOnCurve && !next.isOnCurve) {
					let midX = (current.x + next.x) / 2;
					let midY = (current.y + next.y) / 2;
					contour.splice(i+1, 0, {
						x: midX,
						y: midY,
						isEndOfContour: false,
						isOnCurve: true,
						isImplicit: true,
						isReturnPoint: false,
					});
				}
			}
		}
		
		let out = {
			contours,
			minX: xMin / this.unitsPerEm,
			maxX: xMax / this.unitsPerEm,
			minY: yMin / this.unitsPerEm,
			maxY: yMax / this.unitsPerEm,
		};

		this.glyphDataMemo.set(offset, out);
	
		return out;
	}

	//Shorthand for readGlyph with some other lookups inbetween.
	getGlyphData(character: string | Codepoint) {
		let codepoint = typeof character == "string" ? character.codePointAt(0) : character;
		let glyphNumber = this.cmap.get(codepoint) ?? 0;
		let glyphOffset = this.location.get(glyphNumber);
		return this.readGlyph(glyphOffset);
	}

	stringWidth(text: string) { //Calculates width in Ems.
		let sum = 0;
		for(let i = 0; i < text.length; i++) {
			let codepoint = text.codePointAt(i) as Codepoint;
			if(codepoint == 32) {
				sum += 0.5;
			} else if(this.cmap.has(codepoint)) {
				let glyphId = this.cmap.get(codepoint);
				if(this.spacing.has(codepoint))
					sum += this.spacing.get(this.cmap.get(codepoint) as GlyphIndex) / this.unitsPerEm;
				else sum += this.spacing.get(0) / this.unitsPerEm;
			} else sum += this.spacing.get(0) / this.unitsPerEm;
		}
	
		return sum;
	}
	
	static async load(path: string) {
		let response = await fetch(path);
		let arrayBuffer = await response.arrayBuffer();
		return new Font(arrayBuffer);
	}
}