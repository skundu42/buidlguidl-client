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
// On macOS (assumed installed via Homebrew), use "nethermind" from PATH.
// On Linux and Windows, use the locally installed binary.
const platform = os.platform();
let nethermindCommand;
if (platform === "darwin") {
  try {
    // Check if "nethermind" is available in the PATH.
    execSync("command -v nethermind", { stdio: "ignore" });
    nethermindCommand = "nethermind";
  } catch (err) {
    // Fallback to the locally installed binary.
    nethermindCommand = path.join(
      installDir,
      "ethereum_clients",
      "nethermind",
      "Nethermind.Runner"
    );
  }
} else if (platform === "linux") {
  nethermindCommand = path.join(
    installDir,
    "ethereum_clients",
    "nethermind",
    "Nethermind.Runner"
  );
} else if (platform === "win32") {
  nethermindCommand = path.join(
    installDir,
    "ethereum_clients",
    "nethermind",
    "Nethermind.Runner.exe"
  );
}

// Create a log file for Nethermind output.
// The log directory is expected under the local Nethermind install directory.
const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "nethermind",
  "logs",
  `nethermind_${getFormattedDateTime()}.log`
);
const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Determine the configuration to use.
// For an archive node, use "mainnet_archive". Otherwise, default to "mainnet".
const config = executionType === "archive" ? "mainnet_archive" : "mainnet";

// Build the argument list for running Nethermind.
// (Additional options can be adjusted as needed.)
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

// Pipe the output (stdout/stderr) to the log file and optionally to a parent process.
execution.on("data", (data) => {
  const cleanData = stripAnsiCodes(data);
  logStream.write(cleanData);
  if (process.send) {
    process.send({ log: cleanData });
  }
});

// When the Nethermind process exits, close the log stream.
execution.on("exit", (code) => {
  logStream.end();
  debugToFile(`Nethermind exited with code: ${code}`);
});

// Handle errors from the process.
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
