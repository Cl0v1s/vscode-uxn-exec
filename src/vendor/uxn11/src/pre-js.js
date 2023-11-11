var Module = {
    'arguments': [
        '/tmp/uxn.tal',
        '/tmp/uxn.rom',
    ],
    'preRun': () => {
        FS.createDataFile("/tmp", "uxn.tal", sourceCode, true, true);
    },
    'postRun': () => {
        console.log(FS.readFile('/tmp/uxn.rom'));
    }
}

