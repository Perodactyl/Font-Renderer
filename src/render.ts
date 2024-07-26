import { GlyphData } from "./font";

export interface RenderSettings {
	context: CanvasRenderingContext2D,

	x: number,
	y: number,
	/** Scale is effectively a measure of 'pixels per em' */
	scale: number,

	fill: boolean,
	color: string,
}

export function renderGlyph(data: GlyphData, {context: ctx, x, y, scale, fill, color}: RenderSettings) {
	//! 1. Transform the glyph from Em space to render space
	let transformerX = (pt: number) => pt * scale + x;
	let transformerY = (pt: number) => (data.maxY - pt) * scale + y; //Em space is flipped vertically (the math way instead of the code way)
	let glyph = <GlyphData>{
		contours: data.contours.map(c=>c.map(pt=>({
			x: transformerX(pt.x),
			y: transformerY(pt.y),
			isOnCurve: pt.isOnCurve,
			isImplicit: pt.isImplicit,
			isEndOfContour: pt.isEndOfContour,
		}))),
		minX: transformerX(data.minX),
		maxX: transformerX(data.maxX),
		minY: transformerY(data.minY),
		maxY: transformerY(data.maxY),
	}
	// console.table(glyph.contours[0])
	//! 2. Draw the glyph data
	ctx.beginPath();
	for(let contour of glyph.contours) {
		//? 1.1 Find the first point that isn't a control point
		let start = 0;
		while(!contour[start].isOnCurve) {
			start++;
			if(start == contour.length) {
				throw "Contour has no points which are on the curve!"
			}
		}

		ctx.moveTo(contour[start].x, contour[start].y);

		//? 1.2 Loop through the other points and draw with them.
		for(let i = 0; i < contour.length; i++) {
			let currentPoint = contour[(start+i) % contour.length];
			let lastPoint = contour[(start+i) == 0 ? contour.length-1 : start+i-1];

			if(currentPoint.isOnCurve) {
				if(lastPoint.isOnCurve) {
					ctx.lineTo(currentPoint.x, currentPoint.y);
				} else {
					ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, currentPoint.x, currentPoint.y);
				}
			}
			// ctx.lineTo(currentPoint.x, currentPoint.y);
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
}