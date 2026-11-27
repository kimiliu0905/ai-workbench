const { net } = require("electron");

// Keep the existing desktop broker's message protocol when the server runs
// in an Electron utility process instead of the Node-only executable.
process.send = message => process.parentPort.postMessage(message);
process.parentPort.on("message", ({ data }) => process.emit("message", data));

globalThis[Symbol.for("yezijian.openai.fetch")] = (input, init) => net.fetch(input, init);
require(process.argv[2]);
