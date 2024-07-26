import { Font } from "./font";
import { renderGlyph, RenderSettings } from "./render";

async function main() {
	let loadedFonts = new Map();
	let font: Font;
	async function updateFont() {
		let value = <string>$("#font").val();
		if(loadedFonts.has(value)) {
			font = loadedFonts.get(value);
		} else {
			font = await Font.load(value);
			loadedFonts.set(value, font);
		}
		window["font"] = font;
	}
	await updateFont();
	$("#font").on("change", ()=>{
		updateFont();
		render(true);
	});


	let canvas = <HTMLCanvasElement>$("#render-target")[0];
	let ctx = canvas.getContext("2d");

	let codepoints:number[] = [];
	let glyphIDs:number[] = [];
	let glyphOffsets:number[] = [];
	function updateGlyphOffsets() {
		let text = <string>$("#text").val();
		let inputMode = <string>$("#inputMode").val();
		codepoints = [];
		glyphIDs = [];
		glyphOffsets = [];
		if(inputMode == "codepoints") {
			codepoints = text.split(",").map(num=>Number(num));
		} else if(inputMode == "glyphIDs") {
			glyphIDs = text.split(",").map(num=>Number(num));
		} else if(inputMode == "glyphOffsets") {
			glyphOffsets = text.split(",").map(num=>Number(num));
		} else {
			codepoints = text.split("").map(char=>char.codePointAt(0));
		}
		for(let i = 0; i < codepoints.length; i++) {
			glyphIDs.push(font.cmap.get(codepoints[i]) ?? 0);
		}
		for(let i = 0; i < glyphIDs.length; i++) {
			glyphOffsets.push(font.location.get(glyphIDs[i]));
		}
		if(glyphOffsets.length == 1) {
			//Reverse lookup, if possible
			if(glyphIDs.length == 0) {
				for(let [glyphID, offset] of Object.entries(font.cmap)) {
					if(offset == glyphOffsets[0]) {
						glyphIDs.push(Number(glyphID));
						break;
					}
				}
			}
			if(codepoints.length == 0) {
				for(let [codepoint, glyphID] of Object.entries(font.cmap)) {
					if(glyphID == glyphIDs[0]) {
						codepoints.push(Number(codepoint));
						break;
					}
				}
			}
		}
	}
	updateGlyphOffsets();

	let camX = 0;
	let camY = 0;
	let camScale = 1;

	let zoomMin = 0.1;
	let zoomMax = 5.0;

	let shouldApplyContours = false;

	let lastRender = 0;
	let isAwaitingRender = false;
	function render(force?: boolean) {
		if(!force && Date.now() - lastRender < 10) { //Debouncing
			if(!isAwaitingRender) {
				setTimeout(render, 15);
			}
			isAwaitingRender = true;
			return;
		}
		lastRender = Date.now();
		isAwaitingRender = false;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		let posX = 0;
		let scale = canvas.width * camScale * Number($("#extraZoomOut").val());
		let baseline = font.getGlyphData("M").maxY;

		for(let i = 0; i < glyphOffsets.length; i++) {
			if(codepoints.length > i && String.fromCodePoint(codepoints[i]).match(/\s/)) {
				posX += 0.5 * scale;
				continue;
			}
			let data = font.readGlyph(glyphOffsets[i]);
			// console.table(data.contours[0]);
			ctx.lineWidth = Number($("#lineThickness").val()) * camScale;
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			renderGlyph(data, {
				context: ctx,
				x: camX + posX,
				y: camY + (baseline - data.maxY) * scale,
				scale,
				fill: (<HTMLInputElement>$("#fill")[0]).checked,
				debug: (<HTMLInputElement>$("#debug")[0]).checked,
				debugScale: Number($("#debugScale").val()),
				extra: (<any>$("#features").val()).split(","),
				contours: shouldApplyContours ? <string>$("#contours").val() : null,
				color: <string>$("#color").val(),
			});
			if(codepoints.length > i) {
				posX += font.stringWidth(String.fromCodePoint(codepoints[i])) * scale;
			} else {
				posX += font.stringWidth("M") * scale;
			}
		}
	}
	function updateDebugUI() {
		if(glyphOffsets.length == 1) {
			let data = font.getGlyphData(glyphOffsets[0]);
			let contourCount = data.contours.length;
			let contourLengths = data.contours.map(c=>c.length)
			let pointSummary = contourCount == 1 ? data.contours[0].length.toString() : contourLengths.join("+")+"="+contourLengths.reduce((a,b)=>a+b,0);
			
			let codepoint = codepoints.length > 0 ? codepoints[0] : "N/A";
			let glyphId = glyphIDs.length > 0 ? glyphIDs[0] : "N/A";
			let glyphOffset = glyphOffsets[0];

			$("#contourCount").text(contourCount);
			$("#pointCount").text(pointSummary);
			$("#glyphCodepoint").text(typeof codepoint == "number" ? `U+${codepoint.toString(16).padStart(4, "0")} (dec ${codepoint})` : codepoint);
			$("#glyphID").text(glyphId ?? "Missing glyph (0)");
			$("#glyphOffset").text(`${glyphOffset.toString(16).padStart(8, "0").replace(/(....)(....)/, "$1 $2")} (dec ${glyphOffset})`);
			$("#glyphInfo").show();

			let pastContourSetting = $("#contours").val();
			$("#contours").children().remove();
			$("#contours").append('<option value="all">All</option>');
			$("#contours").append('<option value="0">Primary</option>');
			if(contourCount == 1) {
				$("#contours").val("all");
				$("#contoursSetting").hide();
				shouldApplyContours = false;
				return;
			}
			shouldApplyContours = true;
			for(let i = 1; i <= contourCount; i++) {
				$("#contours").append(`<option value="${i}">Contour #${i}</option>`);
			}
			if(pastContourSetting) {
				$("#contours").val(pastContourSetting);
			}
			$("#contoursSetting").css("visibility", "visible");
		} else {
			shouldApplyContours = false;
			$("#glyphInfo").hide();
			$("#contours").val("all");
			$("#contoursSetting").css("visibility", "hidden");
		}
		if((<HTMLInputElement>$("#debug")[0]).checked) {
			$("#debugUI").show();
		} else {
			$("#debugUI").hide();
		}
	}
	updateDebugUI();

	$("#text").on("keyup", ()=>{
		updateGlyphOffsets();
		updateDebugUI();
		render();
	});
	$("#color").on("change", ()=>{
		render();
	});

	function updateFillInput(){
		if((<HTMLInputElement>$("#fill")[0]).checked) {
			$("#lineThicknessSetting").css("visibility", "hidden");
		} else {
			$("#lineThicknessSetting").css("visibility", "visible");
		}
		render();
	}
	$("#fill").on("click", updateFillInput);
	updateFillInput();
	$("#debug").on("click", ()=>{
		updateDebugUI();
		render();
	});
	$("#inputMode").on("change", ()=>{
		updateGlyphOffsets();
		updateDebugUI();
		render();
	});
	
	let uiInputs = $(".ui").children("section").children("input, select");
	uiInputs.filter('input[type=range]').on("input", ()=>render());
	uiInputs.filter('select').on("change", ()=>render());

	canvas.addEventListener("mousemove", ev=>{
		if(ev.buttons > 0) {
			let rect = canvas.getBoundingClientRect();
			let moveX = ev.movementX * (canvas.width / rect.width);
			let moveY = ev.movementY * (canvas.height / rect.height);

			camX += moveX;
			camY += moveY;
			render();
		}
	});

	canvas.addEventListener("wheel", ev=>{ //This took me way longer than it should have.
		let zoom = -ev.deltaY / 1500;
		let newScale = camScale + zoom;
		if(newScale >= zoomMin && newScale <= zoomMax) {
			let rect = canvas.getBoundingClientRect();
	
			let mouseX = (ev.clientX - rect.left) * (canvas.width / rect.width);
			let mouseY = (ev.clientY - rect.top) * (canvas.height / rect.height);
			
			let worldXPre = (mouseX * camScale + camX);
			let worldYPre = (mouseY * camScale + camY);
			
			camScale = newScale;
			
			let worldXPost = (mouseX * camScale + camX);
			let worldYPost = (mouseY * camScale + camY);
	
			camX += (worldXPre - worldXPost);
			camY += (worldYPre - worldYPost);
	
			render();
		}
	});

	function resizeCanvas() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		render();
	}
	window.addEventListener("resize", resizeCanvas);
	resizeCanvas();

	let lastTouchX = null;
	let lastTouchY = null;
	let lastTouchDistance = null;
	//* Phone gestures
	canvas.addEventListener("touchmove", ev=>{ //TODO This is mostly untested.
		ev.preventDefault();
		let x: number;
		let y: number;
		if(ev.targetTouches.length == 1) { //Motion
			x = ev.targetTouches.item(0).clientX;
			y = ev.targetTouches.item(0).clientY;
		} else if (ev.targetTouches.length == 2) { //Zoom
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

			let distance = Math.sqrt(pointingX**2 + pointingY**2);
			if(lastTouchDistance != null) {
				console.log("Pinch!");
				camScale -= distance / 10000;
				camScale = Math.min(Math.max(camScale, zoomMin), zoomMax);
			}
			lastTouchDistance = distance;
		}
		if(x != null && y != null) {
			if(lastTouchX != null && lastTouchY != null) {
				camX += x - lastTouchX;
				camY += y - lastTouchY;
				render();
			}
			lastTouchX = x;
			lastTouchY = y;
		}
	});
	canvas.addEventListener("touchstart", ev=>{
		ev.preventDefault();
		if(ev.targetTouches.length == 1) { //Motion
			
		}
	});
	canvas.addEventListener("touchend", ev=>{
		ev.preventDefault();
		if(ev.targetTouches.length == 0) {
			lastTouchX = null;
			lastTouchY = null;
		}
		if(ev.targetTouches.length < 2) {
			lastTouchDistance = null;
		}
	});

	render(true);
}

main();