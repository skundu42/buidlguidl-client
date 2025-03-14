import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";
import { installDir } from "../commandLineOptions.js";

// Keep your version constants up to date as desired
export const latestGethVer = "1.14.12";
export const latestRethVer = "1.0.0";
export const latestLighthouseVer = "6.0.0";
export const latestNethermindVer = "1.31.3";

/**
 * Download/install a client if it is not present, for macOS or Linux.
 *
 * @param {string} clientName - one of "geth", "reth", "lighthouse", "prysm", "nethermind"
 * @param {string} platform   - "darwin" or "linux"
 */
export function installMacLinuxClient(clientName, platform) {
  const arch = os.arch(); // "x64" or "arm64"

  // For Nethermind, only install via Homebrew (macOS) or APT (Linux)
  if (clientName === "nethermind") {
    if (platform === "darwin") {
      try {
        // Check if Nethermind is already installed (available on PATH)
        execSync("command -v nethermind", { stdio: "ignore" });
        console.log("Nethermind is already installed (detected via PATH).");
      } catch (err) {
        console.log("\nInstalling Nethermind via Homebrew on macOS.");
        try {
          console.log("Tapping Nethermind repository...");
          execSync("brew tap nethermindeth/nethermind", { stdio: "inherit" });
          console.log("Installing Nethermind...");
          execSync("brew install nethermind", { stdio: "inherit" });
          console.log("Nethermind installation via Homebrew complete.");
        } catch (err) {
          console.error("Error installing Nethermind via Homebrew:", err.message);
        }
      }
      // Create a local directory to store logs and database if needed
      const nethermindDir = path.join(installDir, "ethereum_clients", "nethermind");
      if (!fs.existsSync(nethermindDir)) fs.mkdirSync(nethermindDir, { recursive: true });
      if (!fs.existsSync(path.join(nethermindDir, "logs"))) fs.mkdirSync(path.join(nethermindDir, "logs"), { recursive: true });
      if (!fs.existsSync(path.join(nethermindDir, "database"))) fs.mkdirSync(path.join(nethermindDir, "database"), { recursive: true });
    } else if (platform === "linux") {
      // Check if Nethermind is already installed via PATH
      try {
        execSync("command -v nethermind", { stdio: "ignore" });
        console.log("Nethermind is already installed (detected via PATH).");
      } catch (err) {
        try {
          execSync("command -v apt-get", { stdio: "ignore" });
          console.log("\nInstalling Nethermind via package manager on Linux.");
          console.log("Adding Nethermind repository...");
          execSync("sudo add-apt-repository -y ppa:nethermindeth/nethermind", { stdio: "inherit" });
          console.log("Updating package lists...");
          execSync("sudo apt-get update", { stdio: "inherit" });
          console.log("Installing Nethermind via APT...");
          execSync("sudo apt-get install -y nethermind", { stdio: "inherit" });
          console.log("Nethermind installation via package manager complete.");
        } catch (pmErr) {
          console.error("Error installing Nethermind via package manager:", pmErr.message);
          return;
        }
      }
    }
    return;
  }

  // For clients that use download installation
  const gethHash = {
    "1.14.3": "ab48ba42",
    "1.14.12": "293a300d",
  };

  const configs = {
    darwin: {
      x64: {
        geth: `geth-darwin-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
        prysm: "prysm.sh",
      },
      arm64: {
        geth: `geth-darwin-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
        prysm: "prysm.sh",
      },
    },
    linux: {
      x64: {
        geth: `geth-linux-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-unknown-linux-gnu`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-unknown-linux-gnu`,
        prysm: "prysm.sh",
      },
      arm64: {
        geth: `geth-linux-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-unknown-linux-gnu`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-aarch64-unknown-linux-gnu`,
        prysm: "prysm.sh",
      },
    },
  };

  const fileName = configs[platform]?.[arch]?.[clientName];
  const clientDir = path.join(installDir, "ethereum_clients", clientName);
  const clientScript =
    clientName === "prysm"
      ? path.join(clientDir, "prysm.sh")
      : path.join(clientDir, clientName);

  if (!fs.existsSync(clientScript)) {
    console.log(`\nInstalling ${clientName}.`);
    if (!fs.existsSync(clientDir)) {
      console.log(`Creating '${clientDir}'`);
      fs.mkdirSync(path.join(clientDir, "database"), { recursive: true });
      fs.mkdirSync(path.join(clientDir, "logs"), { recursive: true });
    }

    const downloadUrls = {
      geth: `https://gethstore.blob.core.windows.net/builds/${fileName}.tar.gz`,
      reth: `https://github.com/paradigmxyz/reth/releases/download/v${latestRethVer}/${fileName}.tar.gz`,
      lighthouse: `https://github.com/sigp/lighthouse/releases/download/v${latestLighthouseVer}/${fileName}.tar.gz`,
      prysm: "https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh",
    };

    if (clientName === "prysm") {
      console.log("Downloading Prysm.");
      execSync(
        `cd "${clientDir}" && curl -L -O -# ${downloadUrls.prysm} && chmod +x prysm.sh`,
        { stdio: "inherit" }
      );
    } else {
      console.log(`Downloading ${clientName}.`);
      execSync(`cd "${clientDir}" && curl -L -O -# ${downloadUrls[clientName]}`, {
        stdio: "inherit"
      });
      console.log(`Uncompressing ${clientName}.`);
      execSync(`cd "${clientDir}" && tar -xzvf "${fileName}.tar.gz"`, {
        stdio: "inherit"
      });

      // Special handling for geth: move the binary up from the extracted folder.
      if (clientName === "geth") {
        execSync(`cd "${clientDir}/${fileName}" && mv geth ..`, { stdio: "inherit" });
        execSync(`cd "${clientDir}" && rm -r "${fileName}"`, { stdio: "inherit" });
      }

      console.log(`Cleaning up ${clientName} directory.`);
      execSync(`cd "${clientDir}" && rm "${fileName}.tar.gz"`, { stdio: "inherit" });
    }
  } else {
    console.log(`${clientName} is already installed.`);
  }
}

/**
 * Attempts to retrieve the installed version string for a client.
 *
 * @param {string} client - e.g. "geth", "reth", "nethermind", "lighthouse", "prysm"
 * @returns {string|null} parsed version or null if it fails
 */
export function getVersionNumber(client) {
  const platform = os.platform();
  let clientCommand;
  let argument;
  let versionOutput;
  let versionMatch;

  if (client === "reth" || client === "lighthouse" || client === "geth") {
    argument = "--version";
  } else if (client === "prysm") {
    argument = "beacon-chain --version";
  } else if (client === "nethermind") {
    argument = "--version";
  }

  if (["darwin", "linux"].includes(platform)) {
    if (client === "nethermind") {
      if (platform === "darwin") {
        clientCommand = "nethermind";
      } else if (platform === "linux") {
        try {
          // If Nethermind is installed via APT, the command will be in the PATH.
          execSync("command -v nethermind", { stdio: "ignore" });
          console.log("Nethermind found in PATH, using system command.");
          clientCommand = "nethermind";
        } catch (err) {
          console.log("Nethermind not found in PATH, falling back to local installation path.");
          clientCommand = path.join(installDir, "ethereum_clients", "nethermind", "Nethermind.Runner");
        }
      }
    } else if (client === "prysm") {
      clientCommand = path.join(installDir, "ethereum_clients", client, "prysm.sh");
    } else {
      clientCommand = path.join(installDir, "ethereum_clients", client, client);
    }
  } else if (platform === "win32") {
    if (client === "nethermind") {
      clientCommand = path.join(installDir, "ethereum_clients", "nethermind", "Nethermind.Runner.exe");
    } else if (client === "prysm") {
      console.log("getVersionNumber() for Windows prysm is not implemented");
      process.exit(1);
    } else {
      console.log("getVersionNumber() for Windows not fully implemented");
      process.exit(1);
    }
  }
  try {
    const versionCommand = execSync(`${clientCommand} ${argument}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    versionOutput = versionCommand.trim();
  } catch (error) {
    console.error(`Error executing command: ${clientCommand} ${argument}`, error.message);
    if (client === "nethermind") {
      try {
        console.log(`Retrying with command: ${clientCommand} version`);
        const fallbackCommand = execSync(`${clientCommand} version`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"]
        });
        versionOutput = fallbackCommand.trim();
      } catch (fallbackError) {
        console.error('Unable to retrieve Nethermind version with either "--version" or "version".');
        return null;
      }
    } else {
      console.error(`Error getting version for ${client}:`, error.message);
      return null;
    }
  }

  if (client === "reth") {
    versionMatch = versionOutput.match(/reth Version: (\d+\.\d+\.\d+)/);
  } else if (client === "lighthouse") {
    versionMatch = versionOutput.match(/Lighthouse v(\d+\.\d+\.\d+)/);
  } else if (client === "geth") {
    versionMatch = versionOutput.match(/geth version (\d+\.\d+\.\d+)/);
  } else if (client === "prysm") {
    versionMatch = versionOutput.match(/beacon-chain-v(\d+\.\d+\.\d+)-/);
  } else if (client === "nethermind") {
    versionMatch = versionOutput.match(/Nethermind[\/\s:]*v?(\d+\.\d+\.\d+)/);
    if (!versionMatch) {
      versionMatch = versionOutput.match(/v?(\d+\.\d+\.\d+)/);
    }
  }

  const parsedVersion = versionMatch ? versionMatch[1] : null;
  if (parsedVersion) {
    return parsedVersion;
  } else {
    console.error(`Unable to parse version number for ${client}`);
    return null;
  }
}

/**
 * Compares installedVersion to the known latest version for the client.
 *
 * @param {string} client - e.g. "geth", "reth", "nethermind", "lighthouse"
 * @param {string|null} installedVersion
 * @returns {[boolean, string|null]} - [isLatest, latestVersion]
 */
export function compareClientVersions(client, installedVersion) {
  let isLatest = true;
  let latestVersion;

  if (!installedVersion) {
    console.log(`Could not determine installed version for ${client}. Skipping version comparison.`);
    return [true, null];
  }

  if (client === "reth") {
    latestVersion = latestRethVer;
  } else if (client === "geth") {
    latestVersion = latestGethVer;
  } else if (client === "lighthouse") {
    latestVersion = latestLighthouseVer;
  } else if (client === "nethermind") {
    latestVersion = latestNethermindVer;
  }

  if (compareVersions(installedVersion, latestVersion) < 0) {
    isLatest = false;
  }
  return [isLatest, latestVersion];
}

/**
 * Removes the client’s main binary/script if desired.
 */
export function removeClient(client) {
  const clientFile = path.join(installDir, "ethereum_clients", client, client);
  if (fs.existsSync(clientFile)) {
    fs.rmSync(clientFile, { recursive: true });
  }
}

/**
 * Simple version compare function for "x.y.z".
 */
function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
}
