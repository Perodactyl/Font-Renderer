import { Font } from "./font";
import { renderGlyph, RenderSettings } from "./render";

// let font = await (await fetch("CascadiaCode.ttf")).arrayBuffer();
// let font = await (await fetch("LastResort-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("UbuntuMono-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("Arial.ttf")).arrayBuffer();
// let font = await (await fetch("OpenSans-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("CourierPrime-Regular.ttf")).arrayBuffer();

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

	let camX = 0;
	let camY = 0;
	let camScale = 1;

	function render() {
		// console.clear();
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		let posX = 0;
		let scale = canvas.width / font.stringWidth(text) * camScale;
		for(let i = 0; i < text.length; i++) {
			let data = font.getGlyphData(text[i]);
			// console.table(data.contours[0]);
			renderGlyph(data, {
				context: ctx,
				x: camX + posX,
				y: camY,
				scale,
				fill: (<HTMLInputElement>$("#fill")[0]).checked,
				color: "red",
			});
			posX += font.stringWidth(text[i]) * scale;
		}
	}

	$("#text").on("keyup", ()=>{
		text = <string>$("#text").val();
		render();
	});
	$("#fill").on("click", ()=>{
		render();
	});
	$("#font").on("change", async ev=>{
		font = await Font.load(<string>$("#font").val());
		window["font"] = font;
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
		render();
	});

	render();
}

main();