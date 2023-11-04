export function peek16(mem, addr) {
	return (mem[addr] << 8) + mem[addr + 1]
}

export function poke16(mem, addr, val) {
	mem[addr] = val >> 8;
	mem[addr + 1] = val;
}

