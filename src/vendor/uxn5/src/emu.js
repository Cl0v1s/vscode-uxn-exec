'use strict'

import { UxnWASM } from './uxn-wasm';
import { Uxn } from './uxn';
import { Console } from './devices/console';
import { Controller } from './devices/controller';
import { Screen } from './devices/screen';
import { DateTime } from './devices/datetime';
import { Mouse } from './devices/mouse';

import { peek16 } from './utils';

export function Emu ()
{
	if (typeof UxnWASM !== 'undefined') {
		console.log("Using WebAssembly core");
		this.uxn = new (UxnWASM.Uxn)(this)
	} else {
		console.log("Using Vanilla JS core");
		this.uxn = new Uxn(this)
	}
	this.console = new Console(this)
	this.controller = new Controller(this)
	this.screen = new Screen(this)
	this.datetime = new DateTime(this)
	this.mouse= new Mouse(this)

	this.dei = (port) => {
		const d = port & 0xf0
		switch (d) {
		case 0xc0: return this.datetime.dei(port)
		case 0x20: return this.screen.dei(port)
		}
		return this.uxn.dev[port]
	}

	this.onStep = (...args) => {};

	this.deo = (port, val) => {
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
		case 0x22, 0x23: 
			this.screen.set_width(peek16(this.uxn.dev, 0x22));
			break;
		case 0x24, 0x25: 
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

	this.pointer_moved = (event) => {
		const bounds = this.bgCanvas.getBoundingClientRect();
		const x = this.bgCanvas.width * (event.clientX - bounds.left) / bounds.width;
		const y = this.bgCanvas.height * (event.clientY - bounds.top) / bounds.height;
		this.mouse.move(x,y)
		event.preventDefault();
	}

	this.pointer_down = (event) => {
		this.mouse.down(event.buttons)
		event.preventDefault();
	}

	this.pointer_up = (event) => {
		this.mouse.up(event.buttons)
		event.preventDefault();
	}

	this.screen_callback = () => {
		this.uxn.eval(peek16(this.uxn.dev, 0x20))
	}

	this.init = () => {
		return this.uxn.init(this);
	}
}

