import { Font } from "./font";
import { renderGlyph, RenderSettings } from "./render";

async function main() {
	let fontList = (await (await fetch("fonts/index")).text()).split("\n");
	for(let fontName of fontList) {
		console.log(fontName)
		$("#font").append($(`<option value="${"fonts/"+fontName}">${fontName}</option>"`));
	}

	let font = await Font.load("fonts/Arial.ttf");
	window["font"] = font;

	let canvas = <HTMLCanvasElement>$("#render-target")[0];
	let ctx = canvas.getContext("2d");

	let text = <string>$("#text").val();
	let color = <string>$("#color").val();

	let camX = 0;
	let camY = 0;
	let camScale = 1;

	let zoomMin = 0.1;
	let zoomMax = 5.0;

	let shouldApplyContours = false;

	let debugDraw = [];

	function render() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		let posX = 0;
		let scale = canvas.width * camScale * Number($("#extraZoomOut").val());
		let baseline = font.getGlyphData("M").maxY;
		for(let i = 0; i < text.length; i++) {
			if(text[i].match(/\s/)) {
				posX += 0.5 * scale;
				continue;
			}
			let data = font.getGlyphData(text[i]);
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
				color,
			});
			posX += font.stringWidth(text[i]) * scale;
		}
	}
	function updateDebugUI() {
		if(text.length == 1) {
			let data = font.getGlyphData(text[0]);
			let contourCount = data.contours.length;
			let contourLengths = data.contours.map(c=>c.length)
			let pointSummary = contourCount == 1 ? data.contours[0].length.toString() : contourLengths.join("+")+"="+contourLengths.reduce((a,b)=>a+b,0);
			let codepoint = text.codePointAt(0);
			let glyphId = font.cmap.get(codepoint);
			let glyphOffset = font.location.get(glyphId);

			$("#contourCount").text(contourCount);
			$("#pointCount").text(pointSummary);
			$("#glyphCodepoint").text(`U+${codepoint.toString(16).padStart(4, "0")} (dec ${codepoint})`);
			$("#glyphID").text(glyphId);
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
			for(let i = 1; i < contourCount; i++) {
				$("#contours").append(`<option value="${i}">Contour #${i}</option>`);
			}
			if(pastContourSetting) {
				$("#contours").val(pastContourSetting);
			}
			$("#contoursSetting").show();
		} else {
			shouldApplyContours = false;
			$("#glyphInfo").hide();
			$("#contours").val("all");
			$("#contoursSetting").hide();
		}
		if((<HTMLInputElement>$("#debug")[0]).checked) {
			$("#debugUI").show();
		} else {
			$("#debugUI").hide();
		}
	}
	updateDebugUI();

	$("#text").on("keyup", ()=>{
		text = <string>$("#text").val();
		updateDebugUI();
		render();
	});
	$("#color").on("change", ()=>{
		color = <string>$("#color").val();
		render();
	});

	function updateFillInput(){
		if((<HTMLInputElement>$("#fill")[0]).checked) {
			$("#lineThicknessSetting").hide();
		} else {
			$("#lineThicknessSetting").show();
		}
		render();
	}
	$("#fill").on("click", updateFillInput);
	updateFillInput();
	$("#debug").on("click", ()=>{
		updateDebugUI();
		render();
	});
	$("#font").on("change", async ()=>{
		font = await Font.load(<string>$("#font").val());
		window["font"] = font;
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

	render();
}

main();