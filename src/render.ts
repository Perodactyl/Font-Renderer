import { GlyphData } from "./font";

type FeatureFilter = "no-bezier" | "mask-implicit" | "mask-off-curve";

export interface RenderSettings {
	context: CanvasRenderingContext2D,

	x: number,
	y: number,
	/** Scale is effectively a measure of 'pixels per em' */
	scale: number,

	fill: boolean,
	debug: boolean,
	debugScale: number,
	color: string,
	extra: FeatureFilter[],
	contours?: string,
}

export function renderGlyph(data: GlyphData, {context: ctx, x, y, scale, fill, debug, debugScale, color, extra, contours: contoursShown}: RenderSettings) {
	//! 1. Transform the glyph from Em space to render space
	let transformerX = (pt: number) => pt * scale + x;
	let transformerY = (pt: number) => (data.maxY - pt) * scale + y; //Em space is flipped vertically (the math way instead of the code way)
	let glyph = <GlyphData>{
		contours: data.contours.map(c=>c.map(pt=>({
			...pt,
			x: transformerX(pt.x),
			y: transformerY(pt.y),
		}))),
		minX: transformerX(data.minX),
		maxX: transformerX(data.maxX),
		minY: transformerY(data.minY),
		maxY: transformerY(data.maxY),
	}
	if(contoursShown && contoursShown != "all") {
		let index = Number(contoursShown);
		glyph.contours = [glyph.contours[index]];
	}
	// console.table(glyph.contours[0])
	if(extra.includes("mask-implicit")) glyph.contours = glyph.contours.map(contour=>contour.filter(pt=>!pt.isImplicit));
	if(extra.includes("mask-off-curve")) glyph.contours = glyph.contours.map(contour=>contour.filter(pt=>pt.isOnCurve));
	//! 2. Draw the glyph data
	ctx.beginPath();
	for(let contour of glyph.contours) {
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
		for(let i = 0; i < contour.length; i++) {
			let currentPoint = contour[(start+i) % contour.length];
			let lastPoint = contour[(start+i) == 0 ? contour.length-1 : start+i-1];

			if(extra.includes("no-bezier")) {
				ctx.lineTo(currentPoint.x, currentPoint.y);
			} else if(currentPoint.isOnCurve) {
				if(lastPoint.isOnCurve) {
					ctx.lineTo(currentPoint.x, currentPoint.y);
				} else {
					ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, currentPoint.x, currentPoint.y);
				}
			}
		}
	}
	if(fill) {
		ctx.fillStyle = color;
		ctx.fill();
	} else {
		ctx.strokeStyle = color;
		ctx.stroke();
	}
	//! 3. Draw debug information
	if(debug) {
		function line(x1, y1, x2, y2) {
			let oldWidth = ctx.lineWidth;
			ctx.lineWidth = debugScale / 2;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.lineWidth = oldWidth;
		}
		for(let contour of glyph.contours) {
			for(let i = 0; i < contour.length; i++) {
				let current = contour[i];
				let next = contour[(i+1) % contour.length];
				let prev = contour[i == 0 ? contour.length-1 : i-1];

				if(current.isImplicit) {
					ctx.strokeStyle = "#F00";
					line(current.x, current.y, next.x, next.y);
					line(current.x, current.y, prev.x, prev.y);
				} else if(current.isOnCurve) {
				} else {
					ctx.strokeStyle = "#CCCC";
					if(!next.isImplicit)
						line(current.x, current.y, next.x, next.y);
					if(!prev.isImplicit)
						line(current.x, current.y, prev.x, prev.y);
				}
			}
		}
		for(let contour of glyph.contours) {
			for(let i = 0; i < contour.length; i++) {
				let current = contour[i];
				let next = contour[(i+1) % contour.length];
				let prev = contour[i == 0 ? contour.length-1 : i-1];

				if(current.isImplicit) {
					ctx.fillStyle = "#F00";
					ctx.strokeStyle = "#F00";
					ctx.fillRect(current.x - debugScale, current.y - debugScale, debugScale * 2, debugScale * 2);
				} else if(current.isOnCurve) {
					ctx.fillStyle = current.isEndOfContour ? "#6FA" : "#0F0";
					ctx.fillRect(current.x - debugScale, current.y - debugScale, debugScale * 2, debugScale * 2);
				} else {
					ctx.fillStyle = "#00F";
					ctx.fillRect(current.x - debugScale, current.y - debugScale, debugScale * 2, debugScale * 2);
					ctx.strokeStyle = "#CCCC";
				}
			}
		}
		for(let contour of glyph.contours) {
			for(let i = 0; i < contour.length; i++) {
				let current = contour[i];
				let next = contour[(i+1) % contour.length];
				let prev = contour[i == 0 ? contour.length-1 : i-1];

				if(!current.isReturnPoint) { //Well, this is ironic...
					let text = (i+1).toString();
					if(i == 0) {
						text = `${i+1}, ${contour.length}`;
					}
					ctx.textAlign = "left";
					ctx.textBaseline = "bottom";
					ctx.font = `${debugScale * 4}px Arial`;
		
					ctx.fillStyle = "#333";
					let bounds = ctx.measureText(text);
					ctx.fillRect(
						current.x + 8,
						current.y - 8 - bounds.fontBoundingBoxAscent,
						bounds.actualBoundingBoxRight + 2,
						bounds.fontBoundingBoxAscent
					);
		
					ctx.fillStyle = "#6FF";
					ctx.fillText(text, current.x + 8, current.y - 8);
				}
			}
		}
	}
}