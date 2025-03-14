import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile, stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";
import { execSync } from "child_process";

// Default install directory (can be overridden by --directory)
let installDir = os.homedir();
const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport || "30303";
const executionType = argv.executiontype; // e.g. "archive" for an archive node
debugToFile(`From nethermind.js: executionType: ${executionType}`);

// Use a custom install directory if provided.
if (argv.directory) {
  installDir = argv.directory;
}

// Determine the data directory.
// It is highly recommended to use a directory outside of the Nethermind installation folder.
let dataDir = argv["data-dir"] || path.join(os.homedir(), "nethermind_data");

// JWT file path (used for JSON-RPC authentication)
const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

// Determine the Nethermind command.
const platform = os.platform();
let nethermindCommand;
try {
  // Check if 'nethermind' is available in PATH.
  execSync("command -v nethermind", { stdio: "ignore" });
  nethermindCommand = "nethermind";
  debugToFile("Detected 'nethermind' in PATH.");
} catch (err) {
  // Fallback to the locally installed binary.
  nethermindCommand = path.join(
    installDir,
    "ethereum_clients",
    "nethermind",
    "Nethermind.Runner"
  );
  if (!fs.existsSync(nethermindCommand)) {
    console.error("Nethermind client not found. Please ensure it is installed.");
    process.exit(1);
  }
}

const logsDir = path.join(installDir, "ethereum_clients", "nethermind", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(
  logsDir,
  `nethermind_${getFormattedDateTime()}.log`
);
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Determine the configuration to use.
const config = executionType === "archive" ? "mainnet_archive" : "mainnet";

// Build the argument list for running Nethermind.
const args = [
  "-c", config,
  "--data-dir", dataDir,
  "--jsonrpc-jwtsecretfile", jwtPath,
  "--Network.P2PPort", executionPeerPort,
  "--JsonRpc.Enabled", "true",
  "--JsonRpc.Host", "0.0.0.0",
  "--JsonRpc.Port", "8545",
  "--JsonRpc.EnabledModules", "Eth,Net,Web3,Admin",
  "--Metrics.Enabled", "true",
  "--Metrics.ExposePort", "6060"
];

debugToFile(`Running Nethermind with command: ${nethermindCommand} ${args.join(" ")}`);

// Spawn the Nethermind process using a pseudo-terminal.
const execution = pty.spawn(nethermindCommand, args, {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: { ...process.env, INSTALL_DIR: installDir },
});

execution.on("data", (data) => {
  const cleanData = stripAnsiCodes(data);
  logStream.write(cleanData);
  if (process.send) {
    process.send({ log: cleanData });
  }
});

execution.on("exit", (code) => {
  logStream.end();
  debugToFile(`Nethermind exited with code: ${code}`);
});

execution.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage });
  }
  debugToFile(`From nethermind.js: ${errorMessage}`);
});

// Gracefully handle SIGINT by terminating the Nethermind process.
process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
