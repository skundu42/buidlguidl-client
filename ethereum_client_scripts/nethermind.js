import pty from "node-pty";
import fs from "fs";
import os from "os";
import path from "path";
import { debugToFile } from "../helpers.js";
import { stripAnsiCodes, getFormattedDateTime } from "../helpers.js";
import minimist from "minimist";

let installDir = os.homedir();

const argv = minimist(process.argv.slice(2));

const executionPeerPort = argv.executionpeerport;

const executionType = argv.executiontype;
debugToFile(`From nethermind.js: executionType: ${executionType}`);

// Check if a different install directory was provided via the `--directory` option
if (argv.directory) {
  installDir = argv.directory;
}

const jwtPath = path.join(installDir, "ethereum_clients", "jwt", "jwt.hex");

let nethermindCommand;
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  // Use the actual binary name "Nethermind.Runner"
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

const logFilePath = path.join(
  installDir,
  "ethereum_clients",
  "nethermind",
  "logs",
  `nethermind_${getFormattedDateTime()}.log`
);

const logStream = fs.createWriteStream(logFilePath, { flags: "a" });

const execution = pty.spawn(
  nethermindCommand,
  [
    "--config",
    "mainnet",
    "--Init.SyncMode",
    executionType === "full" ? "Fast" : "Archive",
    "--Network.P2PPort",
    executionPeerPort,
    "--JsonRpc.Enabled",
    "true",
    "--JsonRpc.Host",
    "0.0.0.0",
    "--JsonRpc.Port",
    "8545",
    "--JsonRpc.EnabledModules",
    "Eth,Net,Web3,Admin",
    "--DataDir",
    path.join(installDir, "ethereum_clients", "nethermind", "database"),
    "--AuthRpc.JwtSecretFile",
    jwtPath,
    "--Metrics.Enabled",
    "true",
    "--Metrics.ExposePort",
    "6060",
  ],
  {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  }
);

// Pipe stdout and stderr to the log file and to the parent process
execution.on("data", (data) => {
  logStream.write(stripAnsiCodes(data));
  if (process.send) {
    process.send({ log: data });
  }
});

execution.on("exit", (code) => {
  logStream.end();
});

execution.on("error", (err) => {
  const errorMessage = `Error: ${err.message}`;
  logStream.write(errorMessage);
  if (process.send) {
    process.send({ log: errorMessage });
  }
  debugToFile(`From nethermind.js: ${errorMessage}`);
});

process.on("SIGINT", () => {
  execution.kill("SIGINT");
});
