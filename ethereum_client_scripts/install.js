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

export function installMacLinuxClient(clientName, platform) {
  const arch = os.arch();

  const gethHash = {
    "1.14.3": "ab48ba42",
    "1.14.12": "293a300d",
  };

  // This lookup object defines the filenames used for each client 
  // across different platforms/architectures
  const configs = {
    darwin: {
      x64: {
        geth: `geth-darwin-amd64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-x86_64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
        prysm: "prysm.sh",
        nethermind: `nethermind-${latestNethermindVer}-7bd28c73-macos-x64`,
      },
      arm64: {
        geth: `geth-darwin-arm64-${latestGethVer}-${gethHash[latestGethVer]}`,
        reth: `reth-v${latestRethVer}-aarch64-apple-darwin`,
        lighthouse: `lighthouse-v${latestLighthouseVer}-x86_64-apple-darwin`,
        prysm: "prysm.sh",
        nethermind: `nethermind-${latestNethermindVer}-7bd28c73-macos-arm64`,
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

  const fileName = configs[platform][arch][clientName];
  const clientDir = path.join(installDir, "ethereum_clients", clientName);
  // For prysm we expect prysm.sh; for others we expect a binary named 
  // exactly `clientName` – but remember we will fix nethermind in getVersionNumber.
  const clientScript = path.join(
    clientDir,
    clientName === "prysm" ? "prysm.sh" : clientName
  );

  // If we don’t see the expected script/binary, we attempt to download & install
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
      prysm:
        "https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh",
      nethermind: `https://github.com/NethermindEth/nethermind/releases/download/${latestNethermindVer}/${fileName}.zip`,
    };

    if (clientName === "prysm") {
      console.log("Downloading Prysm.");
      execSync(
        `cd "${clientDir}" && curl -L -O -# ${downloadUrls.prysm} && chmod +x prysm.sh`,
        { stdio: "inherit" }
      );
    } else if (clientName === "nethermind") {
      console.log(`Downloading ${clientName}.`);
      execSync(
        `cd "${clientDir}" && curl -L -O -# ${downloadUrls[clientName]}`,
        { stdio: "inherit" }
      );
      console.log(`Uncompressing ${clientName}.`);
      const zipFile = fs
        .readdirSync(clientDir)
        .find((file) => file.endsWith(".zip"));
      if (zipFile) {
        try {
          execSync(`cd "${clientDir}" && unzip "${zipFile}"`, {
            stdio: "inherit",
          });
        } catch (error) {
          console.error(`Error unzipping ${clientName}:`, error.message);
          console.error(`Attempting to use 7z to extract ${zipFile}`);
          execSync(`cd "${clientDir}" && 7z x "${zipFile}"`, {
            stdio: "inherit",
          });
        }
        console.log(`Cleaning up ${clientName} directory.`);
        execSync(`cd "${clientDir}" && rm "${zipFile}"`, {
          stdio: "inherit",
        });
      } else {
        console.error(`Unable to find downloaded ZIP file for ${clientName}`);
      }
    } else {
      // Geth, Reth, Lighthouse, etc. come as tar.gz
      console.log(`Downloading ${clientName}.`);
      execSync(
        `cd "${clientDir}" && curl -L -O -# ${downloadUrls[clientName]}`,
        { stdio: "inherit" }
      );
      console.log(`Uncompressing ${clientName}.`);
      execSync(`cd "${clientDir}" && tar -xzvf "${fileName}.tar.gz"`, {
        stdio: "inherit",
      });

      // If we downloaded geth, we need to move the geth binary into the main folder
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
  } else {
    console.log(`${clientName} is already installed.`);
  }
}

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
    // We'll try --version first, then fallback to 'version'
    argument = "--version";
  }

  /**
   * If we just do path.join(..., client), that won’t work for nethermind 
   * because the actual binary is "Nethermind.Runner" on Mac/Linux 
   * and "Nethermind.Runner.exe" on Windows.
   */
  if (["darwin", "linux"].includes(platform)) {
    if (client === "nethermind") {
      clientCommand = path.join(
        installDir,
        "ethereum_clients",
        "nethermind",
        "Nethermind.Runner"
      );
    } else if (client === "prysm") {
      clientCommand = path.join(
        installDir,
        "ethereum_clients",
        client,
        "prysm.sh"
      );
    } else {
      // e.g. geth, reth, lighthouse
      clientCommand = path.join(
        installDir,
        "ethereum_clients",
        client,
        client
      );
    }
  } else if (platform === "win32") {
    // Windows logic (simplified)
    if (client === "nethermind") {
      clientCommand = path.join(
        installDir,
        "ethereum_clients",
        "nethermind",
        "Nethermind.Runner.exe"
      );
    } else if (client === "prysm") {
      // Not currently supported in this snippet, but you could do prysm.bat, etc.
      console.log("getVersionNumber() for Windows prysm is not implemented");
      process.exit(1);
    } else {
      // geth, reth, etc. might be .exe as well
      console.log("getVersionNumber() for Windows not fully implemented");
      process.exit(1);
    }
  }

  try {
    // We run the first attempt for nethermind or the usual for other clients
    const versionCommand = execSync(`${clientCommand} ${argument} 2>/dev/null`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    versionOutput = versionCommand.trim();
  } catch (error) {
    // If nethermind with --version fails, try "version" subcommand
    if (client === "nethermind") {
      try {
        const fallbackCommand = execSync(`${clientCommand} version 2>/dev/null`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
        });
        versionOutput = fallbackCommand.trim();
      } catch (fallbackError) {
        console.error(
          `Unable to retrieve Nethermind version with either "--version" or "version".`
        );
        return null;
      }
    } else {
      console.error(`Error getting version for ${client}:`, error.message);
      return null;
    }
  }

  // Use a regex per client type:
  if (client === "reth") {
    versionMatch = versionOutput.match(/reth Version: (\d+\.\d+\.\d+)/);
  } else if (client === "lighthouse") {
    versionMatch = versionOutput.match(/Lighthouse v(\d+\.\d+\.\d+)/);
  } else if (client === "geth") {
    versionMatch = versionOutput.match(/geth version (\d+\.\d+\.\d+)/);
  } else if (client === "prysm") {
    versionMatch = versionOutput.match(/beacon-chain-v(\d+\.\d+\.\d+)-/);
  } else if (client === "nethermind") {
    // Typically looks like "Nethermind/v1.30.0-..."
    versionMatch = versionOutput.match(/Nethermind\/v(\d+\.\d+\.\d+)/);
  }

  const parsedVersion = versionMatch ? versionMatch[1] : null;

  if (parsedVersion) {
    return parsedVersion;
  } else {
    console.error(`Unable to parse version number for ${client}`);
    return null;
  }
}

export function compareClientVersions(client, installedVersion) {
  let isLatest = true;
  let latestVersion;

  // If we have no installedVersion, skip comparison to avoid crashing
  if (!installedVersion) {
    console.log(
      `Could not determine installed version for ${client}. Skipping version comparison.`
    );
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

export function removeClient(client) {
  // If you want to remove the entire client folder, you could do:
  // const clientRoot = path.join(installDir, "ethereum_clients", client);
  // fs.rmSync(clientRoot, { recursive: true });
  // but that would also delete logs/databases unless you move them first!
  // For now, removing just the main binary/script if it exists:
  const clientDir = path.join(installDir, "ethereum_clients", client, client);
  if (fs.existsSync(clientDir)) {
    fs.rmSync(clientDir, { recursive: true });
  }
}

function compareVersions(v1, v2) {
  // If either is null, bail gracefully
  if (!v1 || !v2) return 0;
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
}
