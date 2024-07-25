import { Font } from "./font";

// let font = await (await fetch("CascadiaCode.ttf")).arrayBuffer();
// let font = await (await fetch("LastResort-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("UbuntuMono-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("Arial.ttf")).arrayBuffer();
// let font = await (await fetch("OpenSans-Regular.ttf")).arrayBuffer();
// let font = await (await fetch("CourierPrime-Regular.ttf")).arrayBuffer();

let font;
Font.load("fonts/CourierPrime-Regular.ttf").then(v=>font = v);