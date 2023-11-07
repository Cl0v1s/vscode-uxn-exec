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

export class Emu {
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

	constructor(debug: boolean, wst: HTMLElement, rst: HTMLElement, console_std: HTMLElement, console_err: HTMLElement, bgCanvas: HTMLCanvasElement, fgCanvas: HTMLCanvasElement) {
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
