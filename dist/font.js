class Reader {
    view;
    offset = 0;
    offsetStack = [];
    constructor(data) {
        this.view = new DataView(data);
    }
    seek(offset) {
        this.offset = offset;
    }
    skip(length) {
        this.offset += length;
    }
    push() {
        this.offsetStack.push(this.offset);
    }
    pop() {
        if (this.offsetStack.length > 0) {
            this.offset = this.offsetStack.pop();
        }
    }
    seekPush(offset) {
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
        return String.fromCodePoint(this.view.getUint8(this.offset + 0), this.view.getUint8(this.offset + 1), this.view.getUint8(this.offset + 2), this.view.getUint8(this.offset + 3));
    }
    //TODO implement Fixed type
    skipFixed() {
        this.offset += 4;
    }
}
function isBitSet(value, bitNumber) {
    return ((value >> bitNumber) & 1) == 1;
}

class Font {
    reader;
    tables = {};
    cmap = new Map();
    location = new Map();
    spacing = new Map();
    unitsPerEm; //Conversion factor from FUnits to Ems.
    constructor(TTFData) {
        let reader = new Reader(TTFData);
        this.reader = reader;
        //! 1. Populate tables list
        reader.skipUInt32(); //'Scaler Type'
        let numTables = reader.getUInt16();
        //* These fields are used when searching through tables. This pattern also occurs in the cmap table.
        reader.skipUInt16(); //'Search Range'
        reader.skipUInt16(); //'Entry Selector'
        reader.skipUInt16(); //'Range Shift'
        for (let i = 0; i < numTables; i++) {
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
        for (let i = 0; i < numGlyphs; i++) {
            let value;
            if (locationTableFormat == "16bit")
                value = reader.getUInt16();
            else
                value = reader.getUInt32();
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
        for (let i = 0; i < numWidthMetrics; i++) {
            this.spacing.set(i, monospacedValue = reader.getFUnit());
            reader.skipFUnit(); //'Left Side Bearing'
        }
        //? 4.3 Any other characters are monospaced.
        for (let i = numWidthMetrics; i < numGlyphs; i++) {
            this.spacing.set(i, monospacedValue);
        }
        //! 5. Populate cmap.
        //TODO: Implement format 12
        reader.seek(this.tables.cmap);
        reader.skipUInt16(); //'Version'
        let numCmapSubtables = reader.getUInt16();
        for (let i = 0; i < numCmapSubtables; i++) {
            let platformID = reader.getUInt16();
            let platformSpecificID = reader.getUInt16();
            let maptableOffset = reader.getUInt32();
            if (platformID == 0 && platformSpecificID != 14) { //Unicode tables only, please
                reader.seekPush(this.tables.cmap + maptableOffset);
                this.readCmapSubtable();
                reader.pop();
            }
        }
    }
    readCmapSubtable() {
        let reader = this.reader;
        let format = reader.getUInt16();
        if (format == 4) { //This format has several 'segments', each one mapping a contigous range of codepoints.
            reader.getUInt16();
            reader.skipUInt16(); //'Language'
            let segCountX2 = reader.getUInt16();
            let segCount = segCountX2 / 2;
            reader.skipUInt16(); //'Search Range'
            reader.skipUInt16(); //'Entry Selector'
            reader.skipUInt16(); //'Range Shift'
            let endCodes = [];
            for (let i = 0; i < segCount; i++) {
                endCodes.push(reader.getUInt16());
            }
            reader.skipUInt16(); //reserved padding space.
            let startCodes = [];
            for (let i = 0; i < segCount; i++) {
                startCodes.push(reader.getUInt16());
            }
            //Maps characters by the difference between their glyph index and their codepoint. Each segment has its own single idDelta.
            let idDelta = [];
            for (let i = 0; i < segCount; i++) {
                idDelta.push(reader.getUInt16());
            }
            let idRangeOffsets = []; //List of offsets into maps, one per segment. Each map has arbitrarily placed values.
            for (let i = 0; i < segCount; i++) {
                idRangeOffsets.push(reader.getInt16());
            }
            //Finally search each range.
            for (let i = 0; i < segCount; i++) {
                for (let codepoint = startCodes[i]; codepoint < endCodes[i]; codepoint++) {
                    if (codepoint == 0xFFFF)
                        continue;
                    let glyphIndex;
                    if (idRangeOffsets[i] == 0) { //Don't search an ID range.
                        glyphIndex = (codepoint + idDelta[i]) % 65536;
                    }
                    else {
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
        }
        else if (format == 12) ;
        else {
            throw `Unicode subtable has format ${format}, which is unimplemented.`;
        }
    }
    findGlyph(codePoint) {
        if (this.cmap.has(codePoint)) {
            // if(LOG_LEVEL > 0)console.log(`CMAP entry for codepoint ${codePoint} ("${String.fromCodePoint(codePoint)}"): ${cmap.get(codePoint)}`);
            return this.location.get(this.cmap.get(codePoint));
        }
        // if(LOG_LEVEL > 0)console.log(`No cmap entry for codepoint ${codePoint} ("${String.fromCodePoint(codePoint)}")`);
        return this.tables.glyf; //'UNKNOWN GLYPH' is always the first glyph stored.
    }
    readGlyph(offset) {
        let reader = this.reader;
        reader.seek(offset);
        let contourCount = reader.getInt16();
        let xMin = reader.getFUnit();
        let yMin = reader.getFUnit();
        let xMax = reader.getFUnit();
        let yMax = reader.getFUnit();
        if (contourCount < 0) { //TODO Compound glyph not supported, return MISSING CHARACTER
            return this.readGlyph(this.findGlyph(0));
        }
        //Now in the data section.
        //EndPtsOfContours[n]
        let endPointIndices = [];
        for (let i = 0; i < contourCount; i++) {
            endPointIndices.push(reader.getUInt16());
        }
        let numPts = endPointIndices[endPointIndices.length - 1] + 1; //The last specified endpoint must be the last point overall.
        // console.log(`${numPts} points`);
        //Instructions are used for hinting; we ain't doin' that today. TODO?
        let instructionLength = reader.getUInt16();
        reader.skip(instructionLength);
        let flags = [];
        for (let i = 0; i < numPts; void 0) { //'repeat' flag forces incrementation to occur dynamically.
            let flag = reader.getUInt8();
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
            };
            let count = 1;
            if (repeat) {
                count = reader.getUInt8();
            }
            for (let j = 0; j < count; j++) {
                flags.push(data);
                i++;
            }
        }
        // console.log(`${flags.length} flags entries`)
        //Point location data
        //Coordinates are relative to previous location. Starts at (0, 0)
        let xCoords = [];
        let yCoords = [];
        let curX = 0;
        let curY = 0;
        for (let i = 0; i < numPts; i++) {
            if (!flags[i].xSame) {
                if (flags[i].xShort) {
                    let value = reader.getUInt8();
                    if (flags[i].xNeg) {
                        value = -value;
                    }
                    // console.log(`Point X is short; it ${flags[i].xNeg ? "is" : "is not"} negative. (= ${value})`);
                    curX += value;
                }
                else {
                    let coord = reader.getInt16();
                    // console.log(`Point X is long (= ${coord})`);
                    if (coord > 10000 || coord < -5000) ;
                    else {
                        curX += coord;
                    }
                }
            }
            xCoords.push(curX);
        }
        for (let i = 0; i < numPts; i++) {
            if (!flags[i].ySame) {
                if (flags[i].yShort) {
                    let value = reader.getUInt8();
                    if (flags[i].yNeg) {
                        value = -value;
                    }
                    // console.log(`Point Y is short; it ${flags[i].xNeg ? "is" : "is not"} negative. (= ${value})`);
                    curY += value;
                }
                else {
                    let coord = reader.getInt16();
                    // console.log(`Point Y is long (= ${coord})`);
                    if (coord > 10000 || coord < -5000) ;
                    else {
                        curY += coord;
                    }
                }
            }
            yCoords.push(curY);
        }
        //"Zip" all the data up.
        let points = [];
        for (let i = 0; i < numPts; i++) {
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
        let contours = [];
        {
            let currentContour = [];
            for (let point of points) {
                currentContour.push(point);
                if (point.isEndOfContour) {
                    //* Bonus: Add the starting point back in, at the end. This makes a loop which is more likely to work.
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
        for (let contour of contours) {
            for (let i = 0; i < contour.length; i++) {
                let current = contour[i];
                let next = contour[(i + 1) % contour.length];
                if (!current.isOnCurve && !next.isOnCurve) {
                    let midX = (current.x + next.x) / 2;
                    let midY = (current.y + next.y) / 2;
                    contour.splice(i + 1, 0, {
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
        return out;
    }
    //Shorthand for readGlyph with some other lookups inbetween.
    getGlyphData(character) {
        let codepoint = typeof character == "string" ? character.codePointAt(0) : character;
        let glyphNumber = this.cmap.get(codepoint) ?? 0;
        let glyphOffset = this.location.get(glyphNumber);
        return this.readGlyph(glyphOffset);
    }
    stringWidth(text) {
        let sum = 0;
        for (let i = 0; i < text.length; i++) {
            let codepoint = text.codePointAt(i);
            if (codepoint == 32) {
                sum += 0.5;
            }
            else if (this.cmap.has(codepoint)) {
                this.cmap.get(codepoint);
                if (this.spacing.has(codepoint))
                    sum += this.spacing.get(this.cmap.get(codepoint)) / this.unitsPerEm;
                else
                    sum += this.spacing.get(0) / this.unitsPerEm;
            }
            else
                sum += this.spacing.get(0) / this.unitsPerEm;
        }
        return sum;
    }
    static async load(path) {
        let response = await fetch(path);
        let arrayBuffer = await response.arrayBuffer();
        return new Font(arrayBuffer);
    }
}

function renderGlyph(data, { context: ctx, x, y, scale, fill, debug, debugScale, color, extra, contours: contoursShown }) {
    //! 1. Transform the glyph from Em space to render space
    let transformerX = (pt) => pt * scale + x;
    let transformerY = (pt) => (data.maxY - pt) * scale + y; //Em space is flipped vertically (the math way instead of the code way)
    let glyph = {
        contours: data.contours.map(c => c.map(pt => ({
            ...pt,
            x: transformerX(pt.x),
            y: transformerY(pt.y),
        }))),
        minX: transformerX(data.minX),
        maxX: transformerX(data.maxX),
        minY: transformerY(data.minY),
        maxY: transformerY(data.maxY),
    };
    if (contoursShown && contoursShown != "all") {
        let index = Number(contoursShown);
        glyph.contours = [glyph.contours[index]];
    }
    // console.table(glyph.contours[0])
    if (extra.includes("mask-implicit"))
        glyph.contours = glyph.contours.map(contour => contour.filter(pt => !pt.isImplicit));
    if (extra.includes("mask-off-curve"))
        glyph.contours = glyph.contours.map(contour => contour.filter(pt => pt.isOnCurve));
    //! 2. Draw the glyph data
    ctx.beginPath();
    for (let contour of glyph.contours) {
        //? 2.1 Find the first point that isn't a control point
        let start = 0;
        // while(!contour[start].isOnCurve) {
        // 	start++;
        // 	if(start == contour.length) {
        // 		throw "Contour has no points which are on the curve!"
        // 	}
        // }
        ctx.moveTo(contour[start].x, contour[start].y);
        //? 2.2 Loop through the other points and draw with them.
        for (let i = 0; i < contour.length; i++) {
            let currentPoint = contour[(start + i) % contour.length];
            let lastPoint = contour[(start + i) == 0 ? contour.length - 1 : start + i - 1];
            if (extra.includes("no-bezier")) {
                ctx.lineTo(currentPoint.x, currentPoint.y);
            }
            else if (currentPoint.isOnCurve) {
                if (lastPoint.isOnCurve) {
                    ctx.lineTo(currentPoint.x, currentPoint.y);
                }
                else {
                    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, currentPoint.x, currentPoint.y);
                }
            }
        }
    }
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    }
    else {
        ctx.strokeStyle = color;
        ctx.stroke();
    }
    //! 3. Draw debug information
    if (debug) {
        function line(x1, y1, x2, y2) {
            let oldWidth = ctx.lineWidth;
            ctx.lineWidth = debugScale / 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.lineWidth = oldWidth;
        }
        for (let contour of glyph.contours) {
            for (let i = 0; i < contour.length; i++) {
                let current = contour[i];
                let next = contour[(i + 1) % contour.length];
                let prev = contour[i == 0 ? contour.length - 1 : i - 1];
                if (current.isImplicit) {
                    ctx.strokeStyle = "#F00";
                    line(current.x, current.y, next.x, next.y);
                    line(current.x, current.y, prev.x, prev.y);
                }
                else if (current.isOnCurve) ;
                else {
                    ctx.strokeStyle = "#CCCC";
                    if (!next.isImplicit)
                        line(current.x, current.y, next.x, next.y);
                    if (!prev.isImplicit)
                        line(current.x, current.y, prev.x, prev.y);
                }
            }
        }
        for (let contour of glyph.contours) {
            for (let i = 0; i < contour.length; i++) {
                let current = contour[i];
                contour[(i + 1) % contour.length];
                contour[i == 0 ? contour.length - 1 : i - 1];
                if (current.isImplicit) {
                    ctx.fillStyle = "#F00";
                    ctx.strokeStyle = "#F00";
                    ctx.fillRect(current.x - debugScale, current.y - debugScale, debugScale * 2, debugScale * 2);
                }
                else if (current.isOnCurve) {
                    ctx.fillStyle = current.isEndOfContour ? "#6FA" : "#0F0";
                    ctx.fillRect(current.x - debugScale, current.y - debugScale, debugScale * 2, debugScale * 2);
                }
                else {
                    ctx.fillStyle = "#00F";
                    ctx.fillRect(current.x - debugScale, current.y - debugScale, debugScale * 2, debugScale * 2);
                    ctx.strokeStyle = "#CCCC";
                }
            }
        }
        for (let contour of glyph.contours) {
            for (let i = 0; i < contour.length; i++) {
                let current = contour[i];
                contour[(i + 1) % contour.length];
                contour[i == 0 ? contour.length - 1 : i - 1];
                if (!current.isReturnPoint) { //Well, this is ironic...
                    let text = (i + 1).toString();
                    if (i == 0) {
                        text = `${i + 1}, ${contour.length}`;
                    }
                    ctx.textAlign = "left";
                    ctx.textBaseline = "bottom";
                    ctx.font = `${debugScale * 4}px Arial`;
                    ctx.fillStyle = "#333";
                    let bounds = ctx.measureText(text);
                    ctx.fillRect(current.x + 8, current.y - 8 - bounds.fontBoundingBoxAscent, bounds.actualBoundingBoxRight + 2, bounds.fontBoundingBoxAscent);
                    ctx.fillStyle = "#6FF";
                    ctx.fillText(text, current.x + 8, current.y - 8);
                }
            }
        }
    }
}

async function main() {
    let fontList = (await (await fetch("fonts/index")).text()).split("\n");
    for (let fontName of fontList) {
        console.log(fontName);
        $("#font").append($(`<option value="${"fonts/" + fontName}">${fontName}</option>"`));
    }
    let font = await Font.load("fonts/Arial.ttf");
    window["font"] = font;
    let canvas = $("#render-target")[0];
    let ctx = canvas.getContext("2d");
    let text = $("#text").val();
    let color = $("#color").val();
    let camX = 0;
    let camY = 0;
    let camScale = 1;
    let shouldApplyContours = false;
    function render() {
        // console.clear();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let posX = 0;
        let scale = canvas.width * camScale;
        let baseline = font.getGlyphData("M").maxY;
        for (let i = 0; i < text.length; i++) {
            if (text[i].match(/\s/)) {
                posX += 0.5 * scale;
                continue;
            }
            let data = font.getGlyphData(text[i]);
            // console.table(data.contours[0]);
            ctx.lineWidth = Number($("#lineThickness").val());
            ctx.lineJoin = "bevel";
            ctx.lineCap = "round";
            renderGlyph(data, {
                context: ctx,
                x: camX + posX,
                y: camY + (baseline - data.maxY) * scale,
                scale,
                fill: $("#fill")[0].checked,
                debug: $("#debug")[0].checked,
                debugScale: Number($("#debugScale").val()),
                extra: $("#features").val().split(","),
                contours: shouldApplyContours ? $("#contours").val() : null,
                color,
            });
            posX += font.stringWidth(text[i]) * scale;
        }
    }
    function updateContourSelector() {
        if (text.length == 1) {
            let contourCount = font.getGlyphData(text[0]).contours.length;
            let origValue = $("#contours").val();
            $("#contours").children().remove();
            $("#contours").append('<option value="all">All</option>');
            $("#contours").append('<option value="0">Primary</option>');
            if (contourCount == 1) {
                $("#contours").val("all");
                $("#contoursSetting").hide();
                shouldApplyContours = false;
                return;
            }
            shouldApplyContours = true;
            for (let i = 1; i < contourCount; i++) {
                $("#contours").append(`<option value="${i}">Contour #${i}</option>`);
            }
            if (origValue) {
                $("#contours").val(origValue);
            }
            $("#contoursSetting").show();
        }
        else {
            shouldApplyContours = false;
            $("#contours").val("all");
            $("#contoursSetting").hide();
        }
    }
    updateContourSelector();
    $("#text").on("keyup", () => {
        text = $("#text").val();
        updateContourSelector();
        render();
    });
    $("#color").on("change", () => {
        color = $("#color").val();
        render();
    });
    $("#fill").on("click", () => {
        if ($("#fill")[0].checked) {
            $("#lineThicknessSetting").hide();
        }
        else {
            $("#lineThicknessSetting").show();
        }
        render();
    });
    if ($("#fill")[0].checked) { //Gotta remember: the document may or may not have preset values from past usage of the page
        $("#lineThicknessSetting").hide();
    }
    else {
        $("#lineThicknessSetting").show();
    }
    $("#debug").on("click", () => {
        if ($("#debug")[0].checked) {
            $("#debugUI").show();
        }
        else {
            $("#debugUI").hide();
        }
        render();
    });
    if ($("#debug")[0].checked) {
        $("#debugUI").show();
    }
    else {
        $("#debugUI").hide();
    }
    $("#debugScale").on("input", () => {
        render();
    });
    $("#lineThickness").on("input", () => {
        render();
    });
    $("#font").on("change", async () => {
        font = await Font.load($("#font").val());
        window["font"] = font;
        render();
    });
    $("#features").on("change", () => {
        render();
    });
    $("#contours").on("change", () => {
        render();
    });
    canvas.addEventListener("mousemove", ev => {
        if (ev.buttons > 0) {
            camX += ev.movementX;
            camY += ev.movementY;
            render();
        }
    });
    canvas.addEventListener("wheel", ev => {
        camScale -= ev.deltaY / 1000;
        camScale = Math.min(Math.max(camScale, 0.1), 5.0);
        //TODO move the camera toward or away from the mouse
        // let rect = canvas.getBoundingClientRect();
        // let relX = ev.clientX - (rect.left + rect.width / 2);
        // let relY = ev.clientY - (rect.top + rect.height / 2);
        // camX += relX / 2;
        // camY += relY / 2;
        render();
    });
    let lastTouchX = null;
    let lastTouchY = null;
    let lastTouchDistance = null;
    //* Phone gestures
    canvas.addEventListener("touchmove", ev => {
        ev.preventDefault();
        let x;
        let y;
        if (ev.targetTouches.length == 1) { //Motion
            x = ev.targetTouches.item(0).clientX;
            y = ev.targetTouches.item(0).clientY;
        }
        else if (ev.targetTouches.length == 2) { //Zoom
            let touch1 = ev.targetTouches.item(0);
            let touch2 = ev.targetTouches.item(1);
            let x1 = touch1.clientX;
            let y1 = touch1.clientY;
            let x2 = touch2.clientX;
            let y2 = touch2.clientY;
            x = (x1 + x2) / 2;
            y = (y1 + y2) / 2;
            let pointingX = x2 - x1;
            let pointingY = y2 - y1;
            let distance = Math.sqrt(pointingX ** 2 + pointingY ** 2);
            if (lastTouchDistance != null) {
                camScale -= distance / 100;
            }
            lastTouchDistance = distance;
        }
        if (x != null && y != null) {
            if (lastTouchX != null && lastTouchY != null) {
                camX += x - lastTouchX;
                camY += y - lastTouchY;
                render();
            }
            lastTouchX = x;
            lastTouchY = y;
        }
    });
    canvas.addEventListener("touchstart", ev => {
        ev.preventDefault();
        if (ev.targetTouches.length == 1) ;
    });
    canvas.addEventListener("touchend", ev => {
        ev.preventDefault();
        if (ev.targetTouches.length == 0) {
            lastTouchX = null;
            lastTouchY = null;
        }
        if (ev.targetTouches.length < 2) {
            lastTouchDistance = null;
        }
    });
    render();
}
main();
//# sourceMappingURL=font.js.map
