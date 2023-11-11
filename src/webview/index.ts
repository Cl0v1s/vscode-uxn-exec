declare var window: Window;
declare var document: Document;
declare var acquireVsCodeApi: () => any;
// @ts-ignore
import { assemble } from '../vendor/uxn11/uxnasm.js';
// @ts-ignore
import { Emu } from '../vendor/uxn5/src/emu';

function buffer(data: string) { return new Uint8Array((data.match(/../g) as RegExpMatchArray).map((h: string) =>parseInt(h,16))) };

const vscode = acquireVsCodeApi();

async function init() {
    const debug = document.getElementById("debug") as HTMLInputElement;
    const emulator = new Emu(
        debug.checked,
        document.getElementById("wst") as HTMLElement, document.getElementById("rst") as HTMLElement,
        document.getElementById("console_std") as HTMLElement, document.getElementById("console_err")  as HTMLElement, 
        document.getElementById("bgcanvas")  as HTMLCanvasElement, document.getElementById("fgcanvas")  as HTMLCanvasElement
    );
    await emulator.init();

    const console_input = document.getElementById("console_input") as HTMLInputElement;
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

async function run(uxntal: string, wasmBinaryFile: string) {
    const emulator = await init();
    // start
    try {
        const rom = await assemble(uxntal, wasmBinaryFile);
        console.log(rom);
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
            run(message.code, message.wasmBinaryFile);
            break;
        }
        case 'run':
            console.log(message);
            run(message.code, message.wasmBinaryFile);
            break;
    }
});