#!/usr/bin/env node
// Sysmex HL7 bridge — runs on a PC on the same network as the analyzer,
// NOT on Vercel (Vercel has no route to a local hospital network).
//
// What it does: connects to the analyzer over TCP, speaks the standard
// HL7-over-MLLP framing, parses OBX (result) segments out of every
// message, acknowledges receipt back to the analyzer, and forwards what
// it parsed to the website's /api/receive-lis-result endpoint. Nothing
// gets written to real QC records automatically — every message lands in
// a review table (lis_incoming_results) first.
//
// SETUP — edit the CONFIG block below, then run:  node sysmex-bridge.js
// Requires Node.js 18 or newer (for built-in fetch). Leave it running —
// use a tool like pm2, or your OS's "run at startup" feature, so it
// survives PC restarts. Ctrl+C stops it.
//
// You don't yet know exactly which field the analyzer uses to mark a
// sample as QC vs a patient sample — that's fine. Every message this
// script sees gets printed to the console AND saved to
// lis-bridge/messages.log, so you can look at real messages and figure
// out the pattern before we teach the site to auto-file QC results.

const net = require("net");
const fs = require("fs");
const path = require("path");

const CONFIG = {
  DEVICE_NAME: "Sysmex CBC",
  ANALYZER_HOST: "192.168.1.50", // <-- put the analyzer's IP here
  ANALYZER_PORT: 6661,           // <-- put the analyzer's HL7 port here
  SITE_URL: "https://rabia-lab.com",
  LIS_BRIDGE_SECRET: "PUT-THE-SAME-VALUE-YOU-SET-IN-VERCEL-HERE",
};

const VT = "\x0b"; // MLLP start block
const FS = "\x1c"; // MLLP end block
const CR = "\x0d"; // MLLP trailer / HL7 segment terminator

const LOG_FILE = path.join(__dirname, "messages.log");
function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  fs.appendFileSync(LOG_FILE, stamped + "\n");
}

// Splits one HL7 message into segments/fields. Field separator is
// whatever character sits right after "MSH" (almost always "|"); component
// separator (for e.g. "GLU^Glucose^L") is whatever follows that.
function parseHL7(message) {
  const fieldSep = message[3] || "|";
  const compSep = message[4] || "^";
  const segments = message.split(/\r\n|\r|\n/).filter(Boolean).map((seg) => seg.split(fieldSep));

  const msh = segments.find((s) => s[0] === "MSH");
  const pid = segments.find((s) => s[0] === "PID");
  const obr = segments.find((s) => s[0] === "OBR");
  const messageControlId = msh?.[9] || "";

  const results = segments
    .filter((s) => s[0] === "OBX")
    .map((obx) => {
      const idParts = (obx[3] || "").split(compSep);
      return {
        code: idParts[0] || "",
        name: idParts[1] || idParts[0] || "",
        value: obx[5] || "",
        unit: obx[6] || "",
      };
    });

  return {
    messageControlId,
    // Both are common places a specimen/sample ID shows up — print both
    // so you can tell me which one is the QC marker on your analyzer.
    patientIdField: pid?.[3] || "",
    specimenIdField: obr?.[3] || obr?.[2] || "",
    results,
  };
}

function buildAck(originalMsh, messageControlId) {
  const fieldSep = originalMsh?.[0]?.[3] || "|";
  const now = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const msh = ["MSH", "^~\\&", "RABIALAB", "RABIALAB", "", "", now, "", "ACK", messageControlId, "P", "2.3.1"].join(fieldSep);
  const msa = ["MSA", "AA", messageControlId].join(fieldSep);
  return VT + msh + CR + msa + CR + FS + CR;
}

async function forward(sampleId, rawMessage, parsedResults) {
  try {
    const res = await fetch(`${CONFIG.SITE_URL}/api/receive-lis-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.LIS_BRIDGE_SECRET}` },
      body: JSON.stringify({ deviceName: CONFIG.DEVICE_NAME, sampleId, rawMessage, parsed: parsedResults }),
    });
    if (!res.ok) log(`⚠ Site rejected the result: ${res.status} ${await res.text()}`);
    else log("✓ Forwarded to site");
  } catch (err) {
    log(`⚠ Couldn't reach the site: ${err.message}`);
  }
}

function connect() {
  log(`Connecting to ${CONFIG.ANALYZER_HOST}:${CONFIG.ANALYZER_PORT}…`);
  const socket = net.createConnection(CONFIG.ANALYZER_PORT, CONFIG.ANALYZER_HOST);
  let buffer = "";

  socket.on("connect", () => log("✓ Connected to analyzer"));

  socket.on("data", async (chunk) => {
    buffer += chunk.toString("latin1");
    let endIdx;
    while ((endIdx = buffer.indexOf(FS)) !== -1) {
      const framed = buffer.slice(0, endIdx + 1);
      buffer = buffer.slice(endIdx + 1);
      const message = framed.replace(new RegExp(VT, "g"), "").replace(new RegExp(FS, "g"), "").replace(/^\r|\r$/g, "");
      if (!message.trim()) continue;

      log(`--- Message received ---\n${message.replace(/\r/g, "\n")}`);
      const parsedMsg = parseHL7(message);
      log(`Parsed: patientIdField="${parsedMsg.patientIdField}" specimenIdField="${parsedMsg.specimenIdField}" results=${JSON.stringify(parsedMsg.results)}`);

      socket.write(buildAck(null, parsedMsg.messageControlId), "latin1");

      const sampleId = parsedMsg.specimenIdField || parsedMsg.patientIdField || "";
      await forward(sampleId, message, parsedMsg.results);
    }
  });

  socket.on("error", (err) => log(`⚠ Connection error: ${err.message}`));
  socket.on("close", () => {
    log("Connection closed — retrying in 10s…");
    setTimeout(connect, 10000);
  });
}

log(`Sysmex bridge starting — device="${CONFIG.DEVICE_NAME}" target=${CONFIG.ANALYZER_HOST}:${CONFIG.ANALYZER_PORT}`);
connect();
