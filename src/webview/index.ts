declare var window: Window;
declare var document: Document;
declare var acquireVsCodeApi: () => any;
// @ts-ignore
import { assemble } from '../vendor/uxn11/uxnasm.js';
// @ts-ignore
import { Emu } from '../vendor/uxn5/src/emu';

const vscode = acquireVsCodeApi();

let instanceCounter = 0;

async function init() {
    instanceCounter += 1;
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
    const currentInstanceCounter = instanceCounter;
    function step() {
        // if we loaded another instance, we stop updating the screen with that last one 
        if(instanceCounter !== currentInstanceCounter) return;
        emulator.screen_callback();
        window.requestAnimationFrame(step)
    }

    emulator.screen.set_size(512, 320)
    window.requestAnimationFrame(step);

    return emulator;
}

async function run(uxntal: string, wasmBinaryFile: string) {
    const emulator = await init();
    emulator.console.write_el.innerHTML = `<span style="opacity: 0.7">${new Date().toLocaleTimeString(undefined, { hour: "2-digit", "minute": "2-digit", "second": "2-digit"})} -- reload --</span>\n`;
    emulator.console.error_el.innerHTML = `<span style="opacity: 0.7">${new Date().toLocaleTimeString(undefined, { hour: "2-digit", "minute": "2-digit", "second": "2-digit"})} -- reload --</span>\n`;
    // start
    const backup = console.error;
    const msgs: string[] = [];
    try {
        // since uxnasm.wasm in directly writing to console.error we need to hack a bit
        console.error = (str: string) => msgs.push(str);
        const rom = await assemble(uxntal, wasmBinaryFile);
        // if no error occured during assembly, we print pending msgs as logs
        msgs.forEach((m) => emulator.console.write_el.innerHTML += `${m}\n`)
        emulator.uxn.load(rom).eval(0x0100);
    } catch (e: any) {
        // if an error occured during assembly, we print pending msgs as errors
        msgs.forEach((m) => emulator.console.error_el.innerHTML += `${m}\n`)
        console.error = backup;
        console.error(e);
    }
    console.error = backup;
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