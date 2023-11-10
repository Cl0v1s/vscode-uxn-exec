export interface IUXN {
    ram: Uint8Array,
    dev: Uint8Array,
}

export interface IEmu {
    uxn: IUXN,
    deo: (port: number, val: number) => void,
    dei: (port: number) => number,
}