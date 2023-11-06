declare var window: any;
declare var document: any;
declare var acquireVsCodeApi: () => any;
// @ts-ignore
import assemble from './../vendor/uxnasm-js/assembler.js';
// @ts-ignore
import { Emu } from './../vendor/uxn5/src/emu.js';
// @ts-ignore
import { Screen } from './../vendor/uxn5/src/devices/screen.js';

function buffer(data: string) { return new Uint8Array((data.match(/../g) as RegExpMatchArray).map((h: string) =>parseInt(h,16))) };

const vscode = acquireVsCodeApi();

async function init() {
    const emulator = new Emu();
    await emulator.init();
    emulator.console.write_el = document.getElementById("console_std");
    emulator.console.error_el = document.getElementById("console_err");
    emulator.bgCanvas = document.getElementById("bgcanvas");
    emulator.fgCanvas = document.getElementById("fgcanvas");
    emulator.screen.bgctx = emulator.bgCanvas.getContext("2d")
    emulator.screen.fgctx = emulator.fgCanvas.getContext("2d")
    emulator.fgCanvas.addEventListener("pointermove", emulator.pointer_moved);
    emulator.fgCanvas.addEventListener("pointerdown", emulator.pointer_down);
    emulator.fgCanvas.addEventListener("pointerup", emulator.pointer_up);
    window.addEventListener("keydown", emulator.controller.keyevent);
    window.addEventListener("keyup", emulator.controller.keyevent);

    // Input box

    const console_input = document.getElementById("console_input")
    console_input.addEventListener("keyup", function(event: any) {
        if (event.key === "Enter") {
            let query = console_input.value
            for (let i = 0; i < query.length; i++)
                emulator.console.input(query.charAt(i).charCodeAt(0), 1)
            emulator.console.input(0x0a, 1)
            console_input.value = ""
        }
    });

    // Animation callback

    function step() {
        emulator.screen_callback();
        window.requestAnimationFrame(step)
    }

    emulator.screen.set_size(512, 320)
    window.requestAnimationFrame(step);

    return emulator;
}

async function run(uxntal: string) {
    const emulator = await init();
    // start
    try {
        const rom = buffer(assemble(uxntal));
        emulator.console.write_el.innerHTML = `<span style="opacity: 0.7">${new Date().toLocaleTimeString(undefined, { hour: "2-digit", "minute": "2-digit", "second": "2-digit"})} -- reload --</span>\n`;
        emulator.console.error_el.innerHTML = `<span style="opacity: 0.7">${new Date().toLocaleTimeString(undefined, { hour: "2-digit", "minute": "2-digit", "second": "2-digit"})} -- reload --</span>\n`;
        emulator.uxn.load(rom).eval(0x0100);
    } catch (e: any) {
        console.error(e);
        emulator.console.error_el.innerHTML += `Error: ${e.message}\n`;
    }
}

window.addEventListener('message', async (event: any) => {
    const message = event.data; // The JSON data our extension sent
    switch (message.command) {
        case 'init': {
            vscode.setState({ documentUri: message.documentUri });
            run(message.code);
        }
        case 'run':
            run(message.code);
            break;
    }
});