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
		camScale = Math.min(Math.max(camScale, 0.3), 5.0);
		
		//TODO move the camera toward or away from the mouse
		// let rect = canvas.getBoundingClientRect();
		// let relX = ev.clientX - (rect.left + rect.width / 2);
		// let relY = ev.clientY - (rect.top + rect.height / 2);

		// camX += relX / 2;
		// camY += relY / 2;

		render();
	});

	render();
}

main();