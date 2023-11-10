'use strict'
// @ts-ignore
import { UxnWASM } from './uxn-wasm';
// @ts-ignore
import { Uxn } from './uxn';
// @ts-ignore
import { Console } from './devices/console';
// @ts-ignore
import { Controller } from './devices/controller';
// @ts-ignore
import { Screen } from './devices/screen';
// @ts-ignore
import { DateTime } from './devices/datetime';
// @ts-ignore
import { Mouse } from './devices/mouse';
// @ts-ignore
import { peek16 } from './utils';
import { File } from './devices/file';

import { IEmu } from './types';

export class Emu implements IEmu {
	public uxn: Uxn | UxnWASM.Uxn;
	public console:  Console;
	public controller: Controller;
	public screen: Screen;
	public datetime: DateTime;
	public mouse: Mouse;
	public fgCanvas: HTMLCanvasElement;
	public bgCanvas: HTMLCanvasElement;
	public wst: HTMLElement;
	public rst: HTMLElement;
	private debug: boolean;
	private file1: File;
	private file2: File;

	constructor(debug: boolean, wst: HTMLElement, rst: HTMLElement, console_std: HTMLElement, console_err: HTMLElement, bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement, onFileWrite1: undefined | ((str: string) => void) = undefined, onFileWrite2: undefined | ((str: string) => void) = undefined) {
		if (!debug && typeof UxnWASM !== 'undefined') {
			console.log("Using WebAssembly core");
			this.uxn = new (UxnWASM.Uxn)(this)
		} else {
			console.log("Using Vanilla JS core, debug mode");
			this.uxn = new Uxn(this)
		}

		this.debug = debug;
		this.wst = wst;
		this.rst = rst;

		this.bgCanvas = bgCanvas;
		this.fgCanvas = fgCanvas;

		this.file1 = new File(this, "", onFileWrite1);
		this.file2 = new File(this, "", onFileWrite2);

		this.console = new Console(this)
		this.console.write_el = console_std;
		this.console.error_el = console_err;

		this.controller = new Controller(this)
		window.addEventListener("keydown", this.controller.keyevent);
		window.addEventListener("keyup", this.controller.keyevent);

		this.screen = new Screen(this)
		this.screen.bgctx = this.bgCanvas.getContext("2d");
		this.screen.fgctx = this.fgCanvas.getContext("2d");
		this.fgCanvas.addEventListener("pointermove", this.pointer_moved);
		this.fgCanvas.addEventListener("pointerdown", this.pointer_down);
		this.fgCanvas.addEventListener("pointerup", this.pointer_up);

		this.datetime = new DateTime(this)
		this.mouse= new Mouse(this);
	}

	public init = async () => {
		const boot = await this.uxn.init(this);
		if(this.debug) {
			this.updateStack(this.wst, 0x10000);
			this.updateStack(this.rst, 0x11000);
		}
		return boot;
	}

	private updateStack(el: HTMLElement, addr: number) {
		const stackptr = (this.uxn.ram[addr + 0xff] as number).toString(16).padStart(2, '0');
		const values = [];
		for(let i = 0; i < this.uxn.ram[addr + 0xff]; i++) {
			values.push(`0x${(this.uxn.ram[addr + i] as number).toString(16).padStart(2, '0')}`);
		}
		el.innerHTML = `
			<strong>stack ptr: 0x${stackptr}</strong>
			<div>
				[${values.join(" ")}]
			</div>
		`;
	}

	public onStep = () => null;

	public afterStep = () => {
		if(this.debug) {
			this.updateStack(this.wst, 0x10000);
			this.updateStack(this.rst, 0x11000);
		}
	}

	public dei = (port: number) => {
		const d = port & 0xf0
		switch (d) {
			case 0xc0: return this.datetime.dei(port)
			case 0x20: return this.screen.dei(port)
			// File
			case 0xa0: return this.file1.dei(port)
			case 0xb0: return this.file2.dei(port)
		}
		return this.uxn.dev[port]
	}

	public deo = (port: number, val: number) => {
		this.uxn.dev[port] = val
		switch(port) {
		// System
		case 0x08:
		case 0x09:
		case 0x0a:
		case 0x0b:
		case 0x0c: 
		case 0x0d: this.screen.update_palette(); break;
		case 0x0f: console.warn("Program ended."); break;
		// Console
		case 0x18: this.console.write(val); break;
		case 0x19: this.console.error(val); break;
		// Screen
		case 0x22:
		case 0x23: 
			this.screen.set_width(peek16(this.uxn.dev, 0x22));
			break;
		case 0x24:
		case 0x25: 
			this.screen.set_height(peek16(this.uxn.dev, 0x24));
			break;
		case 0x2e: {
			const x = peek16(this.uxn.dev, 0x28)
			const y = peek16(this.uxn.dev, 0x2a)
			const move = this.uxn.dev[0x26]
			const ctrl = this.uxn.dev[0x2e]
			this.screen.draw_pixel(ctrl, x, y, move);
			break; }
		case 0x2f: {
			const x = peek16(this.uxn.dev, 0x28)
			const y = peek16(this.uxn.dev, 0x2a)
			const move = this.uxn.dev[0x26]
			const ctrl = this.uxn.dev[0x2f]
			const ptr = peek16(this.uxn.dev, 0x2c)
			this.screen.draw_sprite(ctrl, x, y, move, ptr);
			break; }
		// File 
		// vector
		case 0xa0:
		case 0xa1: break;
		// success
		case 0xa2:
		case 0xa3: break;
		// stat
		case 0xa4:
		case 0xa5: break;
		// delete 
		case 0xa6: break;
		// append
		case 0xa7: this.file1.setAppend(val);
		// name
		case 0xa8: break;
		case 0xa9: this.file1.setName(); break;
		// length
		case 0xaa: break;
		case 0xab: this.file1.setLength(peek16(this.uxn.dev, 0xaa)); break;
		// read 
		case 0xac: break;
		case 0xad: this.file1.setRead(peek16(this.uxn.dev, 0xac)); break;
		// write 
		case 0xae: break;
		case 0xaf: this.file1.setWrite(peek16(this.uxn.dev, 0xae)); break;
		// File 
		// vector
		case 0xb0:
		case 0xb1: break;
		// success
		case 0xb2:
		case 0xb3: break;
		// stat
		case 0xb4:
		case 0xb5: break;
		// delete 
		case 0xb6: break;
		// append
		case 0xb7: this.file2.setAppend(val);
		// name
		case 0xb8: break;
		case 0xb9: this.file2.setName(); break;
		// length
		case 0xba: break;
		case 0xbb: this.file2.setLength(peek16(this.uxn.dev, 0xba)); break;
		// read 
		case 0xbc: break;
		case 0xbd: this.file2.setRead(peek16(this.uxn.dev, 0xbc)); break;
		// write 
		case 0xbe: break;
		case 0xbf: this.file2.setWrite(peek16(this.uxn.dev, 0xbe)); break;
		}
	}

	public pointer_moved = (event: MouseEvent) => {
		const bounds = this.bgCanvas.getBoundingClientRect();
		const x = this.bgCanvas.width * (event.clientX - bounds.left) / bounds.width;
		const y = this.bgCanvas.height * (event.clientY - bounds.top) / bounds.height;
		this.mouse.move(x,y)
		event.preventDefault();
	}

	public pointer_down = (event: MouseEvent) => {
		this.mouse.down(event.buttons)
		event.preventDefault();
	}

	public pointer_up = (event: MouseEvent) => {
		this.mouse.up(event.buttons)
		event.preventDefault();
	}

	public screen_callback = () => {
		this.uxn.eval(peek16(this.uxn.dev, 0x20))
	}
}
