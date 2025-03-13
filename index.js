import { execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { initializeMonitoring } from "./monitor.js";
import {
  installMacLinuxClient,
  getVersionNumber,
  compareClientVersions,
  removeClient,
} from "./ethereum_client_scripts/install.js";
import { initializeWebSocketConnection } from "./web_socket_connection/webSocketConnection.js";
import {
  executionClient,
  executionType,
  consensusClient,
  executionPeerPort,
  consensusPeerPorts,
  consensusCheckpoint,
  installDir,
  owner,
  saveOptionsToFile,
  deleteOptionsFile,
} from "./commandLineOptions.js";
import {
  fetchBGExecutionPeers,
  configureBGExecutionPeers,
  fetchBGConsensusPeers,
  configureBGConsensusPeers,
} from "./ethereum_client_scripts/configureBGPeers.js";
import { debugToFile } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const lockFilePath = path.join(installDir, "ethereum_clients", "script.lock");

// Track child processes and their exit states
let executionChild;
let consensusChild;
let executionExited = false;
let consensusExited = false;

// Flag to prevent multiple exit sequences
let isExiting = false;

/**
 * Gracefully handle process exit:
 * - Checks the lockfile to ensure this is the primary instance of the script
 * - Terminates child processes
 * - Removes lockfile
 * - Exits process
 */
function handleExit(exitType) {
  if (isExiting) return; // Prevent multiple calls

  // Check if the current process PID matches the one in the lockfile
  try {
    const lockFilePid = fs.readFileSync(lockFilePath, "utf8");
    if (parseInt(lockFilePid) !== process.pid) {
      console.log(
        `This client process (${process.pid}) is not the first instance launched. Closing dashboard view without killing clients.`
      );
      process.exit(0);
    }
  } catch (error) {
    console.error("Error reading lockfile:", error);
    process.exit(1);
  }

  isExiting = true;

  console.log(`\n\n🛰️  Received exit signal: ${exitType}\n`);

  // Remove the command line options file
  deleteOptionsFile();
  debugToFile(`handleExit(): deleteOptionsFile() has been called`);

  try {
    // Check if both child processes have exited
    const checkExit = () => {
      if (executionExited && consensusExited) {
        console.log("\n👍 Both clients exited!");
        removeLockFile();
        process.exit(0);
      }
    };

    // Handle execution client exit
    const handleExecutionExit = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`🫡 Execution client exited with code ${code}`);
        checkExit();
      }
    };

    // Handle consensus client exit
    const handleConsensusExit = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`🫡 Consensus client exited with code ${code}`);
        checkExit();
      }
    };

    // Handle execution client close
    const handleExecutionClose = (code) => {
      if (!executionExited) {
        executionExited = true;
        console.log(`🫡 Execution client closed with code ${code}`);
        checkExit();
      }
    };

    // Handle consensus client close
    const handleConsensusClose = (code) => {
      if (!consensusExited) {
        consensusExited = true;
        console.log(`🫡 Consensus client closed with code ${code}`);
        checkExit();
      }
    };

    // Ensure event listeners are set before killing the processes
    if (executionChild && !executionExited) {
      executionChild.on("exit", handleExecutionExit);
      executionChild.on("close", handleExecutionClose);
    } else {
      executionExited = true;
    }

    if (consensusChild && !consensusExited) {
      consensusChild.on("exit", handleConsensusExit);
      consensusChild.on("close", handleConsensusClose);
    } else {
      consensusExited = true;
    }

    // Send the kill signals after setting the event listeners
    if (executionChild && !executionExited) {
      console.log("⌛️ Exiting execution client...");
      setTimeout(() => {
        executionChild.kill("SIGINT");
      }, 750);
    }

    if (consensusChild && !consensusExited) {
      console.log("⌛️ Exiting consensus client...");
      setTimeout(() => {
        consensusChild.kill("SIGINT");
      }, 750);
    }

    // Initial check in case both children have already stopped
    checkExit();

    // Periodically check if both child processes have exited
    const intervalId = setInterval(() => {
      checkExit();
      // Clear interval if both clients have exited
      if (executionExited && consensusExited) {
        clearInterval(intervalId);
      }
    }, 1000);
  } catch (error) {
    console.log("Error from handleExit()", error);
  }
}

// Signal and error handlers
process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));
process.on("SIGHUP", () => handleExit("SIGHUP"));
process.on("SIGUSR2", () => handleExit("SIGUSR2"));

// Handle normal exit
process.on("exit", (code) => {
  if (!isExiting) {
    handleExit("exit");
  }
});

// Uncaught exception handler
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  handleExit("uncaughtException");
});

// Unhandled promise rejection handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  handleExit("unhandledRejection");
});

/**
 * Check if an instance is already running (by checking the lockfile).
 * If lockfile exists, kill(0) is used to check if that PID is still active.
 */
function isAlreadyRunning() {
  try {
    if (fs.existsSync(lockFilePath)) {
      const pid = fs.readFileSync(lockFilePath, "utf8");
      try {
        process.kill(pid, 0); // throws if process not found
        return true;
      } catch (e) {
        if (e.code === "ESRCH") {
          fs.unlinkSync(lockFilePath); // stale lock
          return false;
        }
        throw e;
      }
    }
    return false;
  } catch (err) {
    console.error("Error checking for existing process:", err);
    return false;
  }
}

/** Create the lock file with the current PID. */
function createLockFile() {
  fs.writeFileSync(lockFilePath, process.pid.toString(), "utf8");
}

/** Remove the lock file. */
function removeLockFile() {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);
  }
}

/**
 * Create the JWT secret file if needed (for clients that require JWT auth).
 */
function createJwtSecret(jwtDir) {
  if (!fs.existsSync(jwtDir)) {
    console.log(`\nCreating '${jwtDir}'`);
    fs.mkdirSync(jwtDir, { recursive: true });
  }
  if (!fs.existsSync(`${jwtDir}/jwt.hex`)) {
    console.log("Generating JWT.hex file.");
    execSync(`cd "${jwtDir}" && openssl rand -hex 32 > jwt.hex`, {
      stdio: "inherit",
    });
  }
}

/**
 * Start an Ethereum client (execution or consensus) via child_process.spawn.
 * @param {string} clientName - Name of the client (e.g., "geth", "lighthouse").
 * @param {string} executionType - Node type (e.g., "pruned", "archive").
 * @param {string} installDir - Base installation directory.
 */
async function startClient(clientName, executionType, installDir) {
  let clientCommand, clientArgs = [];

  if (clientName === "geth") {
    clientArgs.push("--executionpeerport", executionPeerPort);
    clientArgs.push("--executiontype", executionType);
    clientCommand = path.join(__dirname, "ethereum_client_scripts/geth.js");
  } else if (clientName === "reth") {
    clientArgs.push("--executionpeerport", executionPeerPort);
    clientArgs.push("--executiontype", executionType);
    clientCommand = path.join(__dirname, "ethereum_client_scripts/reth.js");
  } else if (clientName === "nethermind") {
    clientCommand = path.join(__dirname, "ethereum_client_scripts/nethermind.js");
    clientArgs.push("--executionpeerport", executionPeerPort);
    clientArgs.push("--executiontype", executionType);
  } else if (clientName === "prysm") {
    // fetch & configure bootnode addresses for consensus
    const bgConsensusPeers = await fetchBGConsensusPeers();
    const bgConsensusAddrs = await configureBGConsensusPeers(consensusClient);

    if (bgConsensusPeers.length > 0) {
      clientArgs.push("--bgconsensuspeers", bgConsensusPeers);
    }
    if (bgConsensusAddrs != null) {
      clientArgs.push("--bgconsensusaddrs", bgConsensusAddrs);
    }
    if (consensusCheckpoint != null) {
      clientArgs.push("--consensuscheckpoint", consensusCheckpoint);
    }
    clientArgs.push("--consensuspeerports", consensusPeerPorts);

    clientCommand = path.join(__dirname, "ethereum_client_scripts/prysm.js");
  } else if (clientName === "lighthouse") {
    // fetch & configure bootnode addresses for consensus
    const bgConsensusPeers = await fetchBGConsensusPeers();
    const bgConsensusAddrs = await configureBGConsensusPeers(consensusClient);

    if (bgConsensusPeers.length > 0) {
      clientArgs.push("--bgconsensuspeers", bgConsensusPeers);
    }
    if (bgConsensusAddrs != null) {
      clientArgs.push("--bgconsensusaddrs", bgConsensusAddrs);
    }
    if (consensusCheckpoint != null) {
      clientArgs.push("--consensuscheckpoint", consensusCheckpoint);
    }
    clientArgs.push("--consensuspeerports", consensusPeerPorts);

    clientCommand = path.join(__dirname, "ethereum_client_scripts/lighthouse.js");
  } else {
    // fallback: direct path to the client
    clientCommand = path.join(
      installDir,
      "ethereum_clients",
      clientName,
      clientName
    );
  }

  // Common argument for the installation directory
  clientArgs.push("--directory", installDir);

  // Spawn the process
  const child = spawn("node", [clientCommand, ...clientArgs], {
    stdio: ["inherit", "pipe", "inherit"],
    cwd: process.env.HOME,
    env: { ...process.env, INSTALL_DIR: installDir },
  });

  if (["geth", "reth", "nethermind"].includes(clientName)) {
    executionChild = child;
  } else {
    consensusChild = child;
  }

  child.on("exit", (code) => {
    console.log(`🫡 ${clientName} process exited with code ${code}`);
    if (["geth", "reth", "nethermind"].includes(clientName)) {
      executionExited = true;
    } else {
      consensusExited = true;
    }
  });

  child.on("error", (err) => {
    console.log(`Error from ${clientName} process: ${err.message}`);
  });

  console.log(`${clientName} started`);

  child.stdout.on("error", (err) => {
    console.error(`Error on stdout of ${clientName}: ${err.message}`);
  });
}

// ----- Main script flow -----

// Prepare the JWT directory for certain clients (Lighthouse, Nethermind, etc.)
const jwtDir = path.join(installDir, "ethereum_clients", "jwt");
createJwtSecret(jwtDir);

// Attempt to install or update the clients on Mac or Linux
const platform = os.platform();
if (["darwin", "linux"].includes(platform)) {
  installMacLinuxClient(executionClient, platform);
  installMacLinuxClient(consensusClient, platform);
  // Always ensure Nethermind is available
  installMacLinuxClient("nethermind", platform);
}

// Retrieve version info
const executionClientVer = getVersionNumber(executionClient);
const consensusClientVer = getVersionNumber(consensusClient);
const nethermindClientVer = getVersionNumber("nethermind");

// Check if Nethermind is up to date
const [isNethermindLatest, latestNethermindVer] = compareClientVersions(
  "nethermind",
  nethermindClientVer
);
if (!isNethermindLatest) {
  console.log(
    `Nethermind version ${nethermindClientVer} is not the latest (${latestNethermindVer}). Consider updating.`
  );
}

// Config for websockets, used if there's a dashboard or interactive interface
const wsConfig = {
  executionClient: executionClient,
  consensusClient: consensusClient,
  executionClientVer: executionClientVer,
  consensusClientVer: consensusClientVer,
  nethermindClientVer: nethermindClientVer,
};

// We might show a different header message if the client is already running
let messageForHeader = "";
// Track whether we actually started new clients or are just in "dashboard view"
let runsClient = false;

if (!isAlreadyRunning()) {
  // If no instance is running, set up the lock
  deleteOptionsFile(); // remove any stale options
  createLockFile();

  // Start the requested execution client
  await startClient(executionClient, executionType, installDir);
  // Start the requested consensus client
  await startClient(consensusClient, executionType, installDir);

  // If there's an "owner" (like a user or front-end session), initialize WS
  if (owner !== null) {
    initializeWebSocketConnection(wsConfig);
  }

  runsClient = true;
  // Save the current command line options to a file for reference
  saveOptionsToFile();
} else {
  // Another instance is already running, so let's just show "dashboard" mode
  messageForHeader = "Dashboard View (client already running)";
  runsClient = false;

  // Still initialize the web socket connection if there's an owner
  if (owner !== null) {
    initializeWebSocketConnection(wsConfig);
  }
}

// Initialize a monitoring/dash system
initializeMonitoring(
  messageForHeader,
  executionClient,
  consensusClient,
  executionClientVer,
  consensusClientVer,
  runsClient
);

// Periodically configure additional bootnodes or peer addresses
let bgExecutionPeers = [];
let bgConsensusPeers = [];

/**
 * Re-fetch and configure custom bootnode addresses in the background
 * after some delay (gives time for the nodes to start up).
 */
setTimeout(async () => {
  // Execution side
  bgExecutionPeers = await fetchBGExecutionPeers();
  await configureBGExecutionPeers(bgExecutionPeers);

  // Consensus side
  bgConsensusPeers = await fetchBGConsensusPeers();
  await configureBGConsensusPeers(consensusClient);
}, 10000);

// Export these arrays if needed elsewhere
export { bgExecutionPeers, bgConsensusPeers };
