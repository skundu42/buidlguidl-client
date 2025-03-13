import blessed from "blessed";
import { exec } from "child_process";
import { debugToFile } from "../helpers.js";
import { localClient } from "./viemClients.js";
import { executionClient, consensusClient } from "../commandLineOptions.js";
import { bgExecutionPeers, bgConsensusPeers } from "../index.js";

let peerCountGauge;

export function createPeerCountGauge(grid) {
  peerCountGauge = grid.set(2, 8, 2, 1, blessed.box, {
    label: "Peer Count",
    content: `INITIALIZING...`,
    stroke: "green",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
    tags: true,
  });

  populatePeerCountGauge(executionClient, consensusClient);
  setInterval(
    () => populatePeerCountGauge(executionClient, consensusClient),
    5000
  );

  return peerCountGauge;
}

export async function getExecutionPeers() {
  try {
    const peerCountHex = await localClient.request({
      method: "net_peerCount",
    });
    // Convert the result from hexadecimal to a decimal number
    const peerCount = parseInt(peerCountHex, 16);
    return peerCount;
  } catch (error) {
    debugToFile(`getExecutionPeers(): ${error}`);
  }
}

export async function getConsensusPeers(consensusClient) {
  let searchString;
  let metricsUrl = 'http://localhost:5054/metrics';

  if (consensusClient === "prysm") {
    searchString = 'p2p_peer_count{state="Connected"}';
  } else if (consensusClient === "lighthouse") {
    searchString = "libp2p_peers";
  } else if (consensusClient === "nethermind") {
    // For Nethermind, assume the metrics endpoint is on port 6060 and exposes "net_peerCount"
    searchString = "net_peerCount";
    metricsUrl = "http://localhost:6060/metrics";
  } else {
    return null;
  }

  return new Promise((resolve) => {
    exec(
      `curl -s ${metricsUrl} | grep -E '^${searchString} '`,
      (error, stdout, stderr) => {
        if (error || stderr) {
          return resolve(null);
        }

        const parts = stdout.trim().split(" ");
        if (parts.length === 2 && parts[0] === searchString) {
          const peerCount = parseInt(parts[1], 10);
          resolve(peerCount);
        } else {
          resolve(null);
        }
      }
    );
  });
}

export async function getBGExecutionPeers() {
  try {
    // If the execution client is Nethermind, fallback to using net_peerCount
    if (executionClient === "nethermind") {
      return await getExecutionPeers();
    }

    const curlCommand = `curl -s -X POST --data '{"jsonrpc":"2.0","method":"admin_peers","params":[],"id":1}' -H "Content-Type: application/json" http://localhost:8545`;

    const response = await new Promise((resolve, reject) => {
      exec(curlCommand, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const parsedResponse = JSON.parse(response);
    const peerIds = parsedResponse.result.map((peer) =>
      peer.id.replace(/^0x/, "")
    );

    const bgPeerIds = bgExecutionPeers
      .map((peer) => {
        const match = peer.match(/^enode:\/\/([^@]+)@/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const matchingPeers = peerIds.filter((id) => bgPeerIds.includes(id));
    return matchingPeers.length;
  } catch (error) {
    debugToFile(`getBGExecutionPeers(): ${error}`);
    return 0;
  }
}

export async function getBGConsensusPeers() {
  try {
    // For Nethermind, assume no separate BG peers endpoint is available
    if (consensusClient === "nethermind") {
      return 0;
    }

    const curlCommand = `curl -s http://localhost:5052/eth/v1/node/peers`;

    const response = await new Promise((resolve, reject) => {
      exec(curlCommand, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const parsedResponse = JSON.parse(response);
    const connectedPeers = parsedResponse.data
      .filter((peer) => peer.state === "connected")
      .map((peer) => peer.peer_id);

    const uniqueConnectedPeers = [...new Set(connectedPeers)];
    const matchingPeers = uniqueConnectedPeers.filter((peerId) =>
      bgConsensusPeers.includes(peerId)
    );

    return matchingPeers.length;
  } catch (error) {
    return 0;
  }
}

let peerCounts = [0, 0, 0, 0];

async function populatePeerCountGauge(executionClient, consensusClient) {
  try {
    const gaugeNames = [
      `${executionClient.toUpperCase()} All`,
      `${executionClient.toUpperCase()} BG`,
      `${consensusClient.toUpperCase()} All`,
      `${consensusClient.toUpperCase()} BG`,
    ];
    const gaugeColors = ["{cyan-fg}", "{cyan-fg}", "{green-fg}", "{green-fg}"];
    const maxPeers = [130, 130, 130, 130];

    // Get the execution peers count
    peerCounts[0] = await getExecutionPeers();

    try {
      peerCounts[1] = await getBGExecutionPeers();
    } catch {
      peerCounts[1] = null;
    }

    try {
      peerCounts[2] = await getConsensusPeers(consensusClient);
    } catch {
      peerCounts[2] = 0;
    }

    try {
      peerCounts[3] = await getBGConsensusPeers();
    } catch {
      peerCounts[3] = 0;
    }

    const boxWidth = peerCountGauge.width - 8; // Account for padding/border
    if (boxWidth > 0) {
      let content = "";

      peerCounts.forEach((peerCount, index) => {
        const peerCountString = `${peerCount !== null ? peerCount : "0"}`;

        if (peerCount > maxPeers[index]) {
          peerCount = maxPeers[index];
        }

        const filledBars = Math.floor(boxWidth * (peerCount / maxPeers[index]));
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

        content += `${gaugeColors[index]}${gaugeNames[index]}\n[${bar}] ${peerCountString}{/}\n`;
      });

      peerCountGauge.setContent(content.trim());
      peerCountGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populatePeerCountGauge(): ${error}`);
  }
}
