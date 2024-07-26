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

	let shouldApplyContours = false;

	function render() {
		// console.clear();
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		let posX = 0;
		let scale = canvas.width * camScale;
		let baseline = font.getGlyphData("M").maxY;
		for(let i = 0; i < text.length; i++) {
			if(text[i].match(/\s/)) {
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
	function updateContourSelector() {
		if(text.length == 1) {
			let contourCount = font.getGlyphData(text[0]).contours.length;
			let origValue = $("#contours").val();
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
			if(origValue) {
				$("#contours").val(origValue);
			}
			$("#contoursSetting").show();
		} else {
			shouldApplyContours = false;
			$("#contours").val("all");
			$("#contoursSetting").hide();
		}
	}
	updateContourSelector();

	$("#text").on("keyup", ()=>{
		text = <string>$("#text").val();
		updateContourSelector();
		render();
	});
	$("#color").on("change", ()=>{
		color = <string>$("#color").val();
		render();
	});
	$("#fill").on("click", ()=>{
		if((<HTMLInputElement>$("#fill")[0]).checked) {
			$("#lineThicknessSetting").hide();
		} else {
			$("#lineThicknessSetting").show();
		}
		render();
	});
	if((<HTMLInputElement>$("#fill")[0]).checked) { //Gotta remember: the document may or may not have preset values from past usage of the page
		$("#lineThicknessSetting").hide();
	} else {
		$("#lineThicknessSetting").show();
	}
	$("#debug").on("click", ()=>{
		if((<HTMLInputElement>$("#debug")[0]).checked) {
			$("#debugUI").show();
		} else {
			$("#debugUI").hide();
		}
		render();
	});
	if((<HTMLInputElement>$("#debug")[0]).checked) {
		$("#debugUI").show();
	} else {
		$("#debugUI").hide();
	}
	$("#debugScale").on("input", ()=>{
		render();
	});
	$("#lineThickness").on("input", ()=>{
		render();
	});
	$("#font").on("change", async ()=>{
		font = await Font.load(<string>$("#font").val());
		window["font"] = font;
		render();
	});
	$("#features").on("change", ()=>{
		render();
	});
	$("#contours").on("change", ()=>{
		render();
	});

	canvas.addEventListener("mousemove", ev=>{
		if(ev.buttons > 0) {
			camX += ev.movementX;
			camY += ev.movementY;
			render();
		}
	});

	canvas.addEventListener("wheel", ev=>{
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
	canvas.addEventListener("touchmove", ev=>{ //TODO This is mostly untested.
		ev.preventDefault();
		let x;
		let y;
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
				camScale -= distance / 10000;
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