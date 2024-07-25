// let font = await (await fetch("CascadiaCode.ttf")).arrayBuffer();
// let font = await (await fetch("LastResort-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("UbuntuMono-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("Arial.ttf")).arrayBuffer();
// let font = await (await fetch("OpenSans-Regular.ttf")).arrayBuffer();
let font = await (await fetch("CourierPrime-Regular.ttf")).arrayBuffer();

let view = new DataView(font);

var o = 0;

function seek(offset) {
	o = offset;
}
function skip(length) {
	o += length;
}

let LOG_LEVEL = 3

/**
 * 
 * @param {number} length Length of this datatype
 * @param {(offset: number)=>number} fn Function that gets a value given the offset. Shopuld be bound.
 * @returns {()=>number}
 */
function getGeneric(length, fn) {
	return function() {
		let value = fn(o);
		o += length;
		return value;
	}
}

let getByte = getGeneric(1, view.getUint8.bind(view));
let getUint8 = getGeneric(1, view.getUint8.bind(view));
let getUint16 = getGeneric(2, view.getUint16.bind(view));
let getUint32 = getGeneric(4, view.getUint32.bind(view));
let getInt16 = getGeneric(2, view.getInt16.bind(view));
let getFWord = getInt16;

function getTag() { //Reads 4 bytes as ASCII characters.
	return String.fromCharCode(
		getByte(), getByte(), getByte(), getByte()
	);
}

skip(4); //Skip 'scaler type'

let numTables = getUint16();
console.log(`numTables: ${numTables}`);
skip(6); //Other parts of the font directory.

//NOW ENTERING: Table directory - lists each table.
let tables = {}
for(let i = 0; i < numTables; i++) {
	let tag = getTag();
	skip(4); //'checkSum'
	let offset = getUint32();
	let length = getUint32();
	tables[tag] = {offset, length};
}
console.table(tables);

function isBitSet(value, bitNumber) {
	return ((value >> bitNumber) & 1) == 1
}

//NOW ENTERING: maxp table - contains info about memory constraints.
seek(tables.maxp.offset);
skip(4); //'version'
let glyphCount = getUint16();
console.log(`Font has ${glyphCount} glyphs.`);

//NOW ENTERING: head table - headers that contain metadata like version and author.
seek(tables.head.offset);
skip(18); //many values
let fontUnitScale = getUint16(); //'unitsPerEm'
skip(30); //many values
let isIndex16Bits = getInt16() == 0;

console.log(`Font index is ${isIndex16Bits ? "16" : "32"}-bits. Font uses ${fontUnitScale} units per EM`);


//NOW ENTERING: glyf table - contains data for individual glyphs.
//AND: loca table - points at where each glyph starts and ends.  could be 32-bit or 16-bit.

let glyphLocations = [];

for(let i = 0; i < glyphCount; i++) {
	seek(tables.loca.offset + i * (isIndex16Bits ? 2 : 4));
	let offset = isIndex16Bits ? getUint16() * 2 : getUint32();
	glyphLocations[i] = offset;
}

let space = new Map();
{
	//NOW ENTERING: hhea table - horizontal metrics.
	seek(tables.hhea.offset);
	skip(34);
	let numWidthMetrics = getInt16();
	//NOW ENTERING: hmtx table - horizontal advance width table.
	seek(tables.hmtx.offset);
	let mostRecent = 0;
	for(let i = 0; i < numWidthMetrics; i++) {
		space.set(i, mostRecent = getUint16());
		skip(2);
	}
	//The final value in the list specifies what width any monospace characters have.
	let numMonospaced = glyphCount - numWidthMetrics;
	let monospacedWidth = mostRecent;
	for(let i = 0; i < numMonospaced; i++) {
		space.set(numWidthMetrics + i, monospacedWidth);
	}
	console.log(`Read ${space.size} width metrics (${numWidthMetrics} defined, ${numMonospaced} monospace)`);
}

let cmap = new Map();

//NOW ENTERING: cmap table - maps unicode codepoints to glyph indices.

function readCmapSubtable(offset) {
	seek(offset);
	let format = getUint16();
	console.log(`Reading a subtable from the CMAP; format ${format} and offset ${offset}`);

	if(format == 4) {
		let length = getUint16();
		//This format has several 'segments', each one mapping a contigous range of codepoints.
		let language = getUint16();
		let segCountX2 = getUint16();
		
		let segCount = segCountX2 / 2;
		skip(6); //'searchRange', 'entrySelector', 'rangeShift'
		
		let endCodes = [];
		for(let i = 0; i < segCount; i++) {
			endCodes.push(getUint16());
		}
		skip(2); //reserved padding space.
		let startCodes = [];
		for(let i = 0; i < segCount; i++) {
			startCodes.push(getUint16());
		}

		let idDelta = []; //Maps characters by the difference between their glyph index and their codepoint. Each segment has its own single idDelta.
		for(let i = 0; i < segCount; i++) {
			idDelta.push(getUint16());
		}

		let idRangeOffsets = []; //List of offsets into maps, one per segment. Each map has arbitrarily placed values.
		for(let i = 0; i < segCount; i++) {
			idRangeOffsets.push(getInt16());
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
					let glyphId = view.getUint32(tables.cmap.offset + arrayOffset * 2);
					glyphIndex = glyphId ? (glyphId + idDelta[i]) % 65536 : 0;
				}

				// console.log(`Mapped codepoint ${codepoint} ("${String.fromCodePoint(codepoint)}") to glyph no. ${glyphIndex}`);
				cmap.set(codepoint, glyphIndex);
			}
		}
	} else if(format == 12) {

	} else {
		throw `Unicode subtable has format ${format}, which is unimplemented.`;
	}
}

seek(tables.cmap.offset);
skip(2); //'version'
let cmapSubtableCount = getUint16();
for(let i = 0; i < cmapSubtableCount; i++) {
	let platformID = getUint16();
	let platformSpecificID = getUint16();
	let maptableOffset = getUint32();
	if(platformID == 0 && platformSpecificID != 14) { //Unicode
		readCmapSubtable(tables.cmap.offset+maptableOffset);
	}
}

function findGlyph(codePoint) {
	if(cmap.has(codePoint)) {
		if(LOG_LEVEL > 0)console.log(`CMAP entry for codepoint ${codePoint} ("${String.fromCodePoint(codePoint)}"): ${cmap.get(codePoint)}`);
		return glyphLocations[cmap.get(codePoint)] + tables.glyf.offset;
	}
	if(LOG_LEVEL > 0)console.log(`No cmap entry for codepoint ${codePoint} ("${String.fromCodePoint(codePoint)}")`);
	return tables.glyf.offset; //'UNKNOWN GLYPH' is always the first glyph stored.
}

/**
 * @typedef {Object} GlyphPoint
 * @property {number} x
 * @property {number} y
 * @property {boolean} isEndOfContour
 * @property {boolean} isOnCurve
 * 
 * @typedef {Object} GlyphData
 * @property {GlyphPoint[]} points
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minY
 * @property {number} maxY
 */

let memoGlyphData = new Map();

/**
 * 
 * @param {number} offset 
 * @returns {GlyphData}
 */
function readGlyph(offset) {
	if(memoGlyphData.has(offset)) {
		return memoGlyphData.get(offset);
	}
	seek(offset);
	let contourCount = getInt16();
	let xMin = getFWord();
	let yMin = getFWord();
	let xMax = getFWord();
	let yMax = getFWord();

	if(contourCount < 0) {
		return readGlyph(findGlyph(21));
	}
	//Now in the data section.

	//EndPtsOfContours[n]
	let endPointIndices = [];
	for(let i = 0; i < contourCount; i++) {
		endPointIndices.push(getUint16());
	}

	let numPts = endPointIndices[endPointIndices.length-1] + 1; //The last specified endpoint must be the last point overall.
	
	//instructions
	let instructionLength = getUint16();
	skip(instructionLength);

	
	//flags

	let flags = [];
	for(let i = 0; i < numPts; void 0) { //'repeat' flag forces incrementation to occur dynamically.
		let flag = getUint8();

		let onCurve = isBitSet(flag, 0);
		let xShort = isBitSet(flag, 1);
		let yShort = isBitSet(flag, 2);
		let repeat = isBitSet(flag, 3);
		let infoX = isBitSet(flag, 4);
		let infoY = isBitSet(flag, 5);

		let data = {
			onCurve,
			xShort,
			yShort,
			xNeg: xShort && !infoX,
			yNeg: yShort && !infoY,
			xSame: !xShort && infoX,
			ySame: !yShort && infoY,
		}
		let count = 1
		if(repeat) {
			count = getUint8();
		}
		for(let j = 0; j < count; j++) {
			flags.push(data);
			i++;
		}
	}

	//Point location data
	//Coordinates are relative to previous location. Starts at (0, 0)
	
	let xCoords = [];
	let yCoords = [];

	let curX = 0;
	let curY = 0;

	for(let i = 0; i < numPts; i++) {
		if(!flags[i].xSame) {
			if(flags[i].xShort) {
				let value = getUint8();
				if(flags[i].xNeg) {
					value = -value;
				}
				// console.log(`Point X is short; it ${flags[i].xNeg ? "is" : "is not"} negative. (= ${value})`);
				curX += value;
			} else {
				let coord = getInt16();
				// console.log(`Point X is long (= ${coord})`);
				if(coord > 10000 || coord < -5000) {
					// console.log("Error detected, replacing.");
					// return readGlyph(tables.glyf.offset);
				} else {
					curX += coord;
				}
			}
		}
		xCoords.push(curX);
	}

	for(let i = 0; i < numPts; i++) {
		if(!flags[i].ySame) {
			if(flags[i].yShort) {
				let value = getUint8();
				if(flags[i].yNeg) {
					value = -value;
				}
				// console.log(`Point Y is short; it ${flags[i].xNeg ? "is" : "is not"} negative. (= ${value})`);
				curY += value;
			} else {
				let coord = getInt16();
				// console.log(`Point Y is long (= ${coord})`);
				if(coord > 10000 || coord < -5000) {
					// console.log("Error detected, replacing.");
					// return readGlyph(tables.glyf.offset);
				} else {
					curY += coord;
				}
			}
		}
		yCoords.push(curY);
	}

	//"Zip" all the data up.

	let points = [];
	for(let i = 0; i < numPts; i++) {
		points.push({
			x: xCoords[i],
			y: yCoords[i],
			isEndOfContour: endPointIndices.includes(i),
			isOnCurve: flags[i].onCurve,
		});
	}
	
	let out = {
		points,
		minX: xMin,
		maxX: xMax,
		minY: yMin,
		maxY: yMax,
	};

	memoGlyphData.set(offset, out);
	return out;
}

/** @type {HTMLCanvasElement} */
let canvas = document.getElementById("render-target");
let ctx = canvas.getContext("2d");

function scaleContourPoint(point, minX, maxX, minY, maxY, scale, translateX, translateY) {
	return {
		...point,
		x: ((point.x) * scale / fontUnitScale) + translateX,
		y: ((maxY - point.y) * scale / fontUnitScale) + translateY,
	}
}

const DEBUG_CURVES = true;

/**
 * 
 * @param {GlyphData} data 
 */
function drawGlyph(data, x, y, scaleFactor) {
	if(LOG_LEVEL > 0)console.group(`Glyph`);
	let { minX, minY, maxX, maxY, points } = data;
	if(LOG_LEVEL > 0)console.log(`Character is in bounds [${minX}, ${minY}, ${maxX}, ${maxY}]`);

	// let aspectRatio = (maxY - minY) / (maxX - minX);

	let contours = [];
	let currentContour = [];

	for(let point of points) {
		let info = {
			x: point.x,
			y: point.y,
			isOnCurve: point.isOnCurve,
		};

		currentContour.push(info);

		if(point.isEndOfContour) {
			contours.push(currentContour);
			currentContour = [];
		}
	}
	// contours = [contours[contours.length-1]];

	//BONUS: isEndOfContour is always true on the last point, so no adding the extra data!

	if(LOG_LEVEL > 0)console.log("Generated contour listing:");
	ctx.beginPath();
	if(LOG_LEVEL > 0) for(let contour of contours) {
		console.table(contour);
	}

	//! Cubic beziers are NOT the same as two quadratic beziers!

	//Transform contours so each has separately defined (quadratic only) beziers and lines. Also converts points to render space.
	for(let i in contours) {
		let contour = contours[i];
		let newContour = [];
		for(let i = 0; i < contour.length; i++) {
			let current = scaleContourPoint(contour[i], minX, maxX, minY, maxY, scaleFactor, x, y);
			let next = scaleContourPoint(contour[(i+1) % contour.length], minX, maxX, minY, maxY, scaleFactor, x, y);

			newContour.push(current);

			if(!current.isOnCurve && !next.isOnCurve) {
				//Places a point on the curve which splits all cubic curves into two quadratic ones.
				let midX = (0.5 * current.x) + (0.5 * next.x);
				let midY = (0.5 * current.y) + (0.5 * next.y);
				if(DEBUG_CURVES) {
					ctx.fillStyle = "red";
					ctx.fillRect(midX-5, midY-5, 10, 10);

					let width = ctx.lineWidth;
					ctx.lineWidth = 2;
					ctx.strokeStyle = "red";
					ctx.beginPath();
					ctx.moveTo(current.x, current.y);
					ctx.lineTo(midX, midY);
					ctx.lineTo(next.x, next.y);
					ctx.stroke();
					ctx.lineWidth = width;
				}

				newContour.push({
					x: midX,
					y: midY,
					isOnCurve: true,
					isImplicit: true,
				});
			}
		}

		//Rotate the indices of the contour until index 0 is on the curve.
		let safety = 0;
		while(
			safety < newContour.length * 2 &&
			safety < newContour.length
				? !newContour[0].isOnCurve || !newContour[newContour.length-1].isOnCurve
				: !newContour[0].isOnCurve
		) {
			newContour.push(newContour.shift());
			safety++;
			// if(safety > newContour.length + 3) break; //Stop endless loops; it can't be optimal.
		}

		newContour.push({
			x: newContour[0].x,
			y: newContour[0].y,
			isOnCurve: true,
		}); //Get back to the start with whatever lines necessary.

		contours[i] = newContour;
	}

	if(LOG_LEVEL > 0)console.log("Screen-space drawing commands:");
	if(LOG_LEVEL > 0)for(let contour of contours) console.table(contour);

	//Draw the glyph.
	ctx.strokeStyle = "white";
	ctx.beginPath();
	for(let contour of contours) {
		if(DEBUG_CURVES) {
			ctx.fillStyle = "cyan";
			ctx.fillRect(contour[0].x - 6, contour[0].y - 6, 12, 12);
		}
		ctx.moveTo(contour[0].x, contour[0].y);

		for(let i in contour) {
			let prev = contour[i == 0 ? contour.length-1 : i-1];
			let current = contour[i];

			if(DEBUG_CURVES) {
				ctx.fillStyle = "cyan";
				ctx.fillText(i.toString(), current.x+8, current.y-8);
			}

			if(current.isOnCurve) {
				
				if(DEBUG_CURVES && !current.isImplicit) {
					ctx.fillStyle = "green";
					ctx.fillRect(current.x-5, current.y-5, 10, 10);
				}
				if(!prev.isOnCurve) {
					ctx.quadraticCurveTo(prev.x, prev.y, current.x, current.y);
				} else {
					ctx.lineTo(current.x, current.y);
				}
			}

			if(DEBUG_CURVES && !current.isOnCurve) {
				ctx.fillStyle = "blue";
				ctx.fillRect(current.x-5, current.y-5, 10, 10);
			}
		}
	}

	if(LOG_LEVEL > 0)console.groupEnd();
}

/**
 * 
 * @param {string} text 
 * @returns 
 */
function stringWidth(text) { //Calculates width in FUnits.
	let sum = 0;
	for(let i = 0; i < text.length; i++) {
		let codepoint = msg.codePointAt(i);
		if(codepoint == 10) {
			return Math.max(stringWidth(text.slice(0,i)), stringWidth(text.slice(i+1,-1)));
		} else if(codepoint == 32) {
			sum += fontUnitScale / 2;
		} else if(cmap.has(codepoint)) {
			let glyphId = cmap.get(codepoint);
			if(space.has(codepoint))
				sum += space.get(cmap.get(codepoint));
			else sum += space.get(0);
		} else sum += space.get(0);
	}

	return sum;
}

var posX = 0;
var posY = 0;

function render() {

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	let msg = "The quick brown fox jumps over the lazy dog";
	
	// ctx.save();
	// let scale = canvas.width / (stringWidth(msg) / fontUnitScale);
	// ctx.scale(scale, scale);
	// ctx.save();
	// for(let i = 0; i < msg.length; i++) {
	// 	let codepoint = msg.codePointAt(i);
	// 	if(codepoint == 32) {
	// 		ctx.translate(0.5, 0);
	// 		continue;
	// 	} else if(codepoint == 10) {
	// 		ctx.restore();
	// 		ctx.translate(0, 1);
	// 		ctx.save();
	// 		continue;
	// 	}
	// 	let data = readGlyph(findGlyph(codepoint));
	// 	ctx.save();
	// 	ctx.translate(0, (fontUnitScale/1.5 - data.maxY) / fontUnitScale);
	// 	drawGlyph(data, 1);
	// 	ctx.fillStyle = "white";
	// 	ctx.fill();
	// 	ctx.restore();
	// 	ctx.translate(space.get(cmap.get(codepoint)) / fontUnitScale, 0);
	// }
	// ctx.restore();
	// ctx.restore();
	
	let codepoint = "A".codePointAt(0);
	let data = readGlyph(findGlyph(codepoint));
	// ctx.scale()
	ctx.translate(0, 0);
	drawGlyph(data, posX, posY, Math.min(canvas.width, canvas.height));
	
	ctx.strokeStyle = "white";
	// ctx.lineWidth = 6;
	ctx.stroke();
	// ctx.fillStyle = "white";
	// ctx.fill();
}

/**
 * 
 * @param {DOMHighResTimeStamp} time 
 */
function frame(time) {
	render();
	requestAnimationFrame(frame);
}

canvas.addEventListener("mousemove", (ev)=>{
	if(ev.buttons > 0) {
		posX += ev.movementX;
		posY += ev.movementY;
		render();
	}
});

frame(Date.now());
LOG_LEVEL = 0;