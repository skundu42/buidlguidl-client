import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";
import { installDir } from "../commandLineOptions.js";

// Keep your version constants up to date as desired
export const latestGethVer = "1.14.12";
export const latestRethVer = "1.0.0";
export const latestLighthouseVer = "6.0.0";
export const latestNethermindVer = "1.30.0";

/**
 * Download/install a client if it is not present, for macOS or Linux.
 *
 * @param {string} clientName - one of "geth", "reth", "lighthouse", "prysm", "nethermind"
 * @param {string} platform   - "darwin" or "linux"
 */
export function installMacLinuxClient(clientName, platform) {
  const arch = os.arch(); // "x64" or "arm64"

  // Geth build-hash references
  const gethHash = {
    "1.14.3": "ab48ba42",
    "1.14.12": "293a300d",
  };

  // Mappings from client/platform/arch to the specific release file.
  // For macOS Nethermind we use Homebrew so no fileName is needed.
  const configs = {
    darwin: {
      x64: {
        geth: `geth-darwin-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
        prysm: "prysm.sh",
        nethermind: null,
      },
      arm64: {
        geth: `geth-darwin-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-apple-darwin`,
        // Lighthouse doesn't offer a separate arm64 build for macOS in official releases
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
        prysm: "prysm.sh",
        nethermind: null,
      },
    },
    linux: {
      x64: {
        geth: `geth-linux-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-unknown-linux-gnu`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-unknown-linux-gnu`,
        prysm: "prysm.sh",
        nethermind: `nethermind-${latestNethermindVer}-7bd28c73-linux-x64`,
      },
      arm64: {
        geth: `geth-linux-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-unknown-linux-gnu`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-aarch64-unknown-linux-gnu`,
        prysm: "prysm.sh",
        nethermind: `nethermind-${latestNethermindVer}-7bd28c73-linux-arm64`,
      },
    },
  };

  // For clients (other than Nethermind), we expect a downloaded file.
  const fileName =
    clientName !== "nethermind" ? configs[platform]?.[arch]?.[clientName] : null;
  const clientDir = path.join(installDir, "ethereum_clients", clientName);

  // For prysm we expect "prysm.sh", otherwise the client binary.
  // For Nethermind on macOS (installed via Homebrew) we assume it's in PATH.
  const clientScript =
    clientName === "prysm"
      ? path.join(clientDir, "prysm.sh")
      : clientName !== "nethermind"
      ? path.join(clientDir, clientName)
      : null;

  if (clientName !== "nethermind" && !fs.existsSync(clientScript)) {
    // Installation logic for Geth, Reth, Lighthouse, Prysm
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
      prysm:
        "https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh",
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
        stdio: "inherit",
      });
      console.log(`Uncompressing ${clientName}.`);
      execSync(`cd "${clientDir}" && tar -xzvf "${fileName}.tar.gz"`, {
        stdio: "inherit",
      });

      // Special handling for geth: move the binary up from the extracted folder.
      if (clientName === "geth") {
        execSync(`cd "${clientDir}/${fileName}" && mv geth ..`, {
          stdio: "inherit",
        });
        execSync(`cd "${clientDir}" && rm -r "${fileName}"`, {
          stdio: "inherit",
        });
      }

      console.log(`Cleaning up ${clientName} directory.`);
      execSync(`cd "${clientDir}" && rm "${fileName}.tar.gz"`, {
        stdio: "inherit",
      });
    }
  } else if (clientName === "nethermind") {
    if (platform === "darwin") {
      // Use Homebrew for Nethermind installation on macOS.
      try {
        // Check if Nethermind is already installed (available on PATH).
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
      // Create a local client directory to store logs and database (if not already present)
      const nethermindDir = path.join(installDir, "ethereum_clients", "nethermind");
      if (!fs.existsSync(nethermindDir)) {
        fs.mkdirSync(nethermindDir, { recursive: true });
      }
      if (!fs.existsSync(path.join(nethermindDir, "logs"))) {
        fs.mkdirSync(path.join(nethermindDir, "logs"), { recursive: true });
      }
      if (!fs.existsSync(path.join(nethermindDir, "database"))) {
        fs.mkdirSync(path.join(nethermindDir, "database"), { recursive: true });
      }
    } else {
      // Linux: use existing ZIP download/release build logic.
      const nethermindRunnerPath = path.join(clientDir, "Nethermind.Runner");
      if (!fs.existsSync(nethermindRunnerPath)) {
        console.log("\nInstalling Nethermind (release build) on Linux.");
        if (!fs.existsSync(clientDir)) {
          console.log(`Creating '${clientDir}'`);
          fs.mkdirSync(path.join(clientDir, "database"), { recursive: true });
          fs.mkdirSync(path.join(clientDir, "logs"), { recursive: true });
        }

        const fileNameLinux = configs[platform]?.[arch]?.["nethermind"];
        const downloadUrl = `https://github.com/NethermindEth/nethermind/releases/download/${latestNethermindVer}/${fileNameLinux}.zip`;
        console.log(`Downloading Nethermind from ${downloadUrl}.`);

        try {
          execSync(`cd "${clientDir}" && curl -L -O -# ${downloadUrl}`, {
            stdio: "inherit",
          });
        } catch (error) {
          console.error("Error downloading Nethermind:", error.message);
        }

        console.log("Uncompressing Nethermind zip...");
        const zipFile = fs
          .readdirSync(clientDir)
          .find((f) => f.endsWith(".zip"));
        if (!zipFile) {
          console.error("Unable to find downloaded ZIP file for Nethermind");
        } else {
          try {
            execSync(`cd "${clientDir}" && unzip -o "${zipFile}"`, {
              stdio: "inherit",
            });
          } catch (errUnzip) {
            console.error("Error unzipping Nethermind:", errUnzip.message);
            console.error(`Attempting to use 7z to extract ${zipFile}`);
            execSync(`cd "${clientDir}" && 7z x "${zipFile}"`, {
              stdio: "inherit",
            });
          }

          console.log(`Cleaning up Nethermind directory (removing ${zipFile}).`);
          execSync(`cd "${clientDir}" && rm "${zipFile}"`, {
            stdio: "inherit",
          });

          // Move the Nethermind.Runner binary up from its subfolder, if needed.
          if (!fs.existsSync(nethermindRunnerPath)) {
            const subdir = fs
              .readdirSync(clientDir, { withFileTypes: true })
              .find((d) => d.isDirectory() && d.name.startsWith("nethermind-"));
            if (subdir) {
              const subDirPath = path.join(clientDir, subdir.name);
              const runnerInSubdir = path.join(subDirPath, "Nethermind.Runner");
              if (fs.existsSync(runnerInSubdir)) {
                console.log(`Moving Nethermind.Runner up from subfolder: ${subdir.name}`);
                fs.renameSync(runnerInSubdir, nethermindRunnerPath);
              }
            }
          }

          if (fs.existsSync(nethermindRunnerPath)) {
            try {
              execSync(`chmod +x "${nethermindRunnerPath}"`, {
                stdio: "inherit",
              });
            } catch (chmodErr) {
              console.error("Failed to chmod +x Nethermind.Runner:", chmodErr);
            }
          }
        }
      } else {
        console.log("Nethermind is already installed.");
      }
    }
  } else {
    // If we reach here and the file exists, do nothing.
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

  // Determine which argument to pass for version.
  if (client === "reth" || client === "lighthouse" || client === "geth") {
    argument = "--version";
  } else if (client === "prysm") {
    argument = "beacon-chain --version";
  } else if (client === "nethermind") {
    argument = "--version";
  }

  // Build the path to the binary.
  if (["darwin", "linux"].includes(platform)) {
    if (client === "nethermind") {
      // For macOS, assume the nethermind binary is available via PATH.
      clientCommand = platform === "darwin" ? "nethermind" : path.join(installDir, "ethereum_clients", "nethermind", "Nethermind.Runner");
    } else if (client === "prysm") {
      clientCommand = path.join(installDir, "ethereum_clients", client, "prysm.sh");
    } else {
      // For geth, reth, lighthouse.
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
      stdio: ["pipe", "pipe", "pipe"],
    });
    versionOutput = versionCommand.trim();
  } catch (error) {
    console.error(`Error executing command: ${clientCommand} ${argument}`, error.message);
    if (client === "nethermind") {
      // Retry with "version" if "--version" fails.
      try {
        console.log(`Retrying with command: ${clientCommand} version`);
        const fallbackCommand = execSync(`${clientCommand} version`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
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

  // Parse the version output.
  if (client === "reth") {
    versionMatch = versionOutput.match(/reth Version: (\d+\.\d+\.\d+)/);
  } else if (client === "lighthouse") {
    versionMatch = versionOutput.match(/Lighthouse v(\d+\.\d+\.\d+)/);
  } else if (client === "geth") {
    versionMatch = versionOutput.match(/geth version (\d+\.\d+\.\d+)/);
  } else if (client === "prysm") {
    versionMatch = versionOutput.match(/beacon-chain-v(\d+\.\d+\.\d+)-/);
  } else if (client === "nethermind") {
    // Updated regex: allow spaces, colons, or slashes after 'Nethermind'
    versionMatch = versionOutput.match(/Nethermind[\/\s:]*v?(\d+\.\d+\.\d+)/);
    if (!versionMatch) {
      // Fallback regex.
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
