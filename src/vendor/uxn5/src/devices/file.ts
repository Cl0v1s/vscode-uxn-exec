import { IEmu } from "../types";

function buffer(data: string) { return new Uint8Array((data.match(/./g) as RegExpMatchArray).map((h: string) =>h.charCodeAt(0))) };

export class File {
    private emu: IEmu;
    // "file" data
    private buffer: Uint8Array;

    // number of bytes to read 
    private length: number = 0;
    // where to read the data to write
    private write: number = 0;
    // <= length depending if the last read was about to overflow the file
    private success: number = 0;

    // if true, append to the buffer instead of erasing
    private append: boolean = false;

    // where we are in the current file
    private index: number = 0;

    // callback to call with text content after a write operation, will return entire "file" content
    private onWrite: (str: string) => void;

    constructor(emu: IEmu, data: string, onWrite = console.log) {
        this.emu = emu;
        this.buffer = buffer(data);
        this.onWrite = onWrite;
    }

    public dei(port: number) {
        switch(port) {
            case 0xb2:
            case 0xa2: return this.success >> 8;
            case 0xb3:
			case 0xa3:  return this.success & 0x0f;
			default: return this.emu.uxn.dev[port];
        }
    }

    public setContent(data: string) {
        this.buffer = buffer(data);
    }

    public setName() {
        this.index = 0;
        this.append = false;
    }

    public setLength(ln: number) {
        this.length = ln;
    }

    public setRead(addr: number) {
        let ln = this.length;
        try {
            if(this.index + ln > this.buffer.length) {
                ln = this.buffer.length - this.index;
            }
            const slice = this.buffer.slice(this.index, this.index + ln);
            slice.forEach((byte, index) => {
                this.emu.uxn.ram[addr + index] = byte;
            });
            this.index = this.index + ln;
            this.success = ln;
        } catch (e) {
            console.error(e);
            this.success = 0;
        }
    }

    public setAppend(val: number) {
        if(val === 0x01) this.append = true;
        if(val === 0x00) this.append = false;
    }

    public setWrite(addr: number) {
        let index = 0;
        let buffer: Array<number> = [];
        if(this.append) {
            buffer = Array.from(this.buffer);
            index = buffer.length;
        }
        try {

            for(let i = 0; i < this.length; i++) {
                if(index + i > buffer.length) {
                    buffer.push(this.emu.uxn.ram[addr + i])
                } else {
                    buffer[index + i] = this.emu.uxn.ram[addr + i];
                }
            }
            this.success = this.length;
            this.onWrite(String.fromCharCode(...buffer))
        } catch (e) {
            console.error(e);
            this.success = 0;
        }
        this.buffer = new Uint8Array(buffer);
        // next calls will append
        this.append = true;
    }
}