const fs = require("node:fs");

let buffer = Buffer.alloc(0);

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function recordInitialize(params) {
  const file = process.env.SHUCK_FAKE_SERVER_LOG;
  if (file) {
    fs.writeFileSync(file, JSON.stringify(params.initializationOptions), "utf8");
  }
}

function handle(message) {
  if (message.method === "initialize") {
    recordInitialize(message.params);
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: { textDocumentSync: 1 },
        serverInfo: { name: "fake-shuck", version: "0.0.43" },
      },
    });
  } else if (message.method === "shutdown") {
    send({ jsonrpc: "2.0", id: message.id, result: null });
  } else if (message.method === "exit") {
    process.exit(0);
  }
}

function consume() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
    if (!lengthMatch) process.exit(2);
    const length = Number(lengthMatch[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) return;
    const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
    buffer = buffer.subarray(bodyStart + length);
    handle(JSON.parse(body));
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  consume();
});
