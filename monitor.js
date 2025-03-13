import path from "path";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { debugToFile } from "./helpers.js";
import { createSystemStatsGauge } from "./monitor_components/systemStatsGauge.js";
import { createPeerCountGauge } from "./monitor_components/peerCountGauge.js";
import { createCpuLine } from "./monitor_components/cpuLine.js";
import { createNetworkLine } from "./monitor_components/networkLine.js";
import { createDiskLine } from "./monitor_components/diskLine.js";
import { createRethStageGauge } from "./monitor_components/rethStageGauge.js";
import { createGethStageGauge } from "./monitor_components/gethStageGauge.js";
import { createChainInfoBox } from "./monitor_components/chainInfoBox.js";
import { createRpcInfoBox } from "./monitor_components/rpcInfoBox.js";
import { createExecutionLog } from "./monitor_components/executionLog.js";
import { createStatusBox } from "./monitor_components/statusBox.js";
import { installDir } from "./commandLineOptions.js";
import { createConsensusLog } from "./monitor_components/consensusLog.js";
import { createHeader } from "./monitor_components/header.js";
import { createNethermindStageGauge } from "./monitor_components/nethermindStageGauge.js";

import {
  loadProgress,
  getLatestLogFile,
} from "./monitor_components/helperFunctions.js";

import {
  createBandwidthBox,
  setBandwidthBox,
  startBandwidthMonitoring,
} from "./monitor_components/bandwidthGauge.js";

import {
  setupLogStreaming,
  showHideRethWidgets,
  showHideGethWidgets,
} from "./monitor_components/updateLogic.js";


let executionClientGlobal;
let consensusClientGlobal;

export let statusBox = null;
export let chainInfoBox = null;
export let rpcInfoBox = null;
export let screen = null;

export async function initializeMonitoring(
  messageForHeader,
  executionClient,
  consensusClient,
  executionClientVer,
  consensusClientVer,
  runsClient
) {
  try {
    executionClientGlobal = executionClient;
    consensusClientGlobal = consensusClient;

    // If you want to persist progress for geth, you can load it here
    let progress;
    if (executionClient === "geth") {
      progress = loadProgress();
    }

    const { screen, components } = setupUI(
      progress,
      messageForHeader,
      executionClientVer,
      consensusClientVer,
      runsClient
    );

    const executionLogsPath = path.join(
      installDir,
      "ethereum_clients",
      executionClient,
      "logs"
    );

    const consensusLogsPath = path.join(
      installDir,
      "ethereum_clients",
      consensusClient,
      "logs"
    );

    const logFilePathExecution = path.join(
      executionLogsPath,
      await getLatestLogFile(executionLogsPath, executionClient)
    );

    // Let the consensus logs start streaming a few seconds after
    setTimeout(() => {
      const logFilePathConsensus = path.join(
        consensusLogsPath,
        getLatestLogFile(consensusLogsPath, consensusClient)
      );

      setupLogStreaming(
        consensusClientGlobal,
        logFilePathConsensus,
        components.consensusLog,
        screen,
        components.gethStageGauge // or null if needed
      );
    }, 3000);

    // For Reth, we sometimes hide certain widgets if the node is not fully running
    setInterval(() => {
      showHideRethWidgets(
        screen,
        components.rethStageGauge,
        components.chainInfoBox,
        components.rpcInfoBox
      );
    }, 5000);

    // Stream execution client logs (Geth, Reth, or Nethermind)
    setupLogStreaming(
      executionClientGlobal,
      logFilePathExecution,
      components.executionLog,
      screen,
      components.gethStageGauge
    );

    // Periodically show/hide Geth or Reth widgets
    if (executionClient === "reth") {
      setInterval(() => {
        showHideRethWidgets(
          screen,
          components.rethStageGauge,
          components.chainInfoBox,
          components.rpcInfoBox
        );
      }, 5000);
    } else if (executionClient === "geth") {
      setInterval(() => {
        showHideGethWidgets(
          screen,
          components.gethStageGauge,
          components.chainInfoBox,
          components.rpcInfoBox
        );
      }, 5000);
    }

    // For Nethermind, if you want to show/hide logic or something similar,
    // you can create a showHideNethermindWidgets(...) function in updateLogic,
    // then call it here. For now, we just show the gauge all the time.

  } catch (error) {
    debugToFile(`Error initializing monitoring: ${error}`);
  }
}

function setupUI(
  progress,
  messageForHeader,
  executionClientVer,
  consensusClientVer,
  runsClient
) {
  screen = blessed.screen();
  suppressMouseOutput(screen);

  // Layout: 9 rows, 9 columns
  const grid = new contrib.grid({ rows: 9, cols: 9, screen: screen });

  // Build labels for the heading or logs
  let executionClientLabel;
  if (executionClientGlobal === "geth") {
    executionClientLabel = `Geth v${executionClientVer}`;
  } else if (executionClientGlobal === "reth") {
    executionClientLabel = `Reth v${executionClientVer}`;
  } else if (executionClientGlobal === "nethermind") {
    executionClientLabel = `Nethermind v${executionClientVer}`;
  } else {
    executionClientLabel = `Execution Client v${executionClientVer}`;
  }

  let consensusClientLabel;
  if (consensusClientGlobal === "prysm") {
    consensusClientLabel = `Prysm v${consensusClientVer}`;
  } else if (consensusClientGlobal === "lighthouse") {
    consensusClientLabel = `Lighthouse v${consensusClientVer}`;
  } else {
    consensusClientLabel = `Consensus Client v${consensusClientVer}`;
  }

  // Create main widgets
  const executionLog = createExecutionLog(grid, executionClientLabel, screen);
  const consensusLog = createConsensusLog(grid, consensusClientLabel, screen);
  const systemStatsGauge = createSystemStatsGauge(grid, installDir);
  const peerCountGauge = createPeerCountGauge(grid);
  const cpuLine = createCpuLine(grid, screen);
  const networkLine = createNetworkLine(grid, screen);
  const diskLine = createDiskLine(grid, screen, installDir);
  statusBox = createStatusBox(grid);
  const bandwidthBox = createBandwidthBox(grid);
  chainInfoBox = createChainInfoBox(grid);
  rpcInfoBox = createRpcInfoBox(grid);

  // Gauges for each client
  let gethStageGauge, rethStageGauge, nethermindStageGauge;

  if (executionClientGlobal === "geth") {
    gethStageGauge = createGethStageGauge(grid);
  } else if (executionClientGlobal === "reth") {
    rethStageGauge = createRethStageGauge(grid);
  } else if (executionClientGlobal === "nethermind") {
    nethermindStageGauge = createNethermindStageGauge(grid);
  }

  // Header
  const { pic, bigText, ipAddressBox } = createHeader(
    grid,
    screen,
    messageForHeader
  );

  // Add everything to the screen
  screen.append(executionLog);
  screen.append(consensusLog);
  screen.append(cpuLine);
  screen.append(networkLine);
  screen.append(diskLine);
  screen.append(systemStatsGauge);
  screen.append(peerCountGauge);
  screen.append(statusBox);
  screen.append(bandwidthBox);

  if (executionClientGlobal === "geth") {
    screen.append(gethStageGauge);
  } else if (executionClientGlobal === "reth") {
    screen.append(rethStageGauge);
  } else if (executionClientGlobal === "nethermind") {
    screen.append(nethermindStageGauge);
  }

  setBandwidthBox(bandwidthBox);
  startBandwidthMonitoring(screen);

  /**
   * The next two functions handle dynamic resizing.
   * They fix margin/gap issues whenever the terminal is resized.
   */
  function fixBottomMargins(screen) {
    try {
      let executionLogBottom = executionLog.top + executionLog.height - 1;
      let executionLogGap = consensusLog.top - executionLogBottom - 1;
      if (executionLogGap !== 0) {
        executionLog.height += executionLogGap;
      }

      let statusBoxBottom = statusBox.top + statusBox.height - 1;
      let statusBoxGap = peerCountGauge.top - statusBoxBottom - 1;
      if (statusBoxGap !== 0) {
        statusBox.height += statusBoxGap;
      }

      let peerCountGaugeBottom = peerCountGauge.top + peerCountGauge.height - 1;
      let peerCountGaugeGap = bandwidthBox.top - peerCountGaugeBottom - 1;
      if (peerCountGaugeGap !== 0) {
        peerCountGauge.height += peerCountGaugeGap;
      }

      let bandwidthBoxBottom = bandwidthBox.top + bandwidthBox.height - 1;
      let bandwidthBoxGap = systemStatsGauge.top - bandwidthBoxBottom - 1;
      if (bandwidthBoxGap !== 0) {
        bandwidthBox.height += bandwidthBoxGap;
      }

      let consensusLogBottom = consensusLog.top + consensusLog.height - 1;
      let consensusLogGap = cpuLine.top - consensusLogBottom - 1;
      if (consensusLogGap !== 0) {
        consensusLog.height += consensusLogGap;
      }

      if (screen.children.includes(rethStageGauge)) {
        let rethStageGaugeBottom =
          rethStageGauge.top + rethStageGauge.height - 1;
        let rethStageGaugeGap = cpuLine.top - rethStageGaugeBottom - 1;
        if (rethStageGaugeGap !== 0) {
          rethStageGauge.height += rethStageGaugeGap;
        }
      }

      if (screen.children.includes(gethStageGauge)) {
        let gethStageGaugeBottom =
          gethStageGauge.top + gethStageGauge.height - 1;
        let gethStageGaugeGap = cpuLine.top - gethStageGaugeBottom - 1;
        if (gethStageGaugeGap !== 0) {
          gethStageGauge.height += gethStageGaugeGap;
        }
      }

      if (screen.children.includes(nethermindStageGauge)) {
        let nmStageGaugeBottom =
          nethermindStageGauge.top + nethermindStageGauge.height - 1;
        let nmStageGaugeGap = cpuLine.top - nmStageGaugeBottom - 1;
        if (nmStageGaugeGap !== 0) {
          nethermindStageGauge.height += nmStageGaugeGap;
        }
      }

      let chainInfoBoxGap;
      if (screen.children.includes(chainInfoBox)) {
        let chainInfoBoxBottom = chainInfoBox.top + chainInfoBox.height - 1;
        if (screen.children.includes(rpcInfoBox)) {
          chainInfoBoxGap = rpcInfoBox.top - chainInfoBoxBottom - 1;
        } else {
          chainInfoBoxGap = diskLine.top - chainInfoBoxBottom - 1;
        }
        if (chainInfoBoxGap !== 0) {
          chainInfoBox.height += chainInfoBoxGap;
        }
      }

      if (screen.children.includes(rpcInfoBox)) {
        let rpcInfoBoxBottom = rpcInfoBox.top + rpcInfoBox.height - 1;
        let rpcInfoBoxGap = diskLine.top - rpcInfoBoxBottom - 1;
        if (rpcInfoBoxGap !== 0) {
          rpcInfoBox.height += rpcInfoBoxGap;
        }
      }

      let systemStatsGaugeBottom =
        systemStatsGauge.top + systemStatsGauge.height - 1;
      let systemStatsGaugeGap = cpuLine.top - systemStatsGaugeBottom - 1;
      if (systemStatsGaugeGap !== 0) {
        systemStatsGauge.height += systemStatsGaugeGap;
      }

      let cpuLineBottom = cpuLine.top + cpuLine.height - 1;
      let cpuLineGap = screen.height - cpuLineBottom - 1;
      if (cpuLineGap !== 0) {
        cpuLine.height += cpuLineGap;
      }

      let networkLineBottom = networkLine.top + networkLine.height - 1;
      let networkLineGap = screen.height - networkLineBottom - 1;
      if (networkLineGap !== 0) {
        networkLine.height += networkLineGap;
      }

      let diskLineBottom = diskLine.top + diskLine.height - 1;
      let diskLineGap = screen.height - diskLineBottom - 1;
      if (diskLineGap !== 0) {
        diskLine.height += diskLineGap;
      }
    } catch (error) {
      debugToFile(`fixBottomMargins(): ${error}`);
    }
  }

  function fixRightMargins(screen) {
    try {
      // Example
      let peerCountGaugeRight = peerCountGauge.left + peerCountGauge.width - 1;
      let peerCountGaugeGap = screen.width - peerCountGaugeRight - 1;
      if (peerCountGaugeGap !== 0) {
        peerCountGauge.width += peerCountGaugeGap;
      }

      // ...similar expansions for other boxes as needed...
      // Just adapt as your layout changes.
    } catch (error) {
      debugToFile(`fixRightMargins(): ${error}`);
    }
  }

  // Initial render
  screen.render();

  // After a small delay, recalc margins
  setTimeout(() => {
    fixBottomMargins(screen);
    fixRightMargins(screen);

    cpuLine.emit("attach");
    networkLine.emit("attach");
    diskLine.emit("attach");

    screen.render();
  }, 250);

  // On resize, we fix margins again
  screen.on("resize", () => {
    fixBottomMargins(screen);
    fixRightMargins(screen);

    cpuLine.emit("attach");
    networkLine.emit("attach");
    diskLine.emit("attach");
    executionLog.emit("attach");
    consensusLog.emit("attach");

    screen.render();
  });

  // Quit on escape, q, or ctrl-c
  screen.key(["escape", "q", "C-c"], function (ch, key) {
    if (runsClient) {
      // Signal our main script to gracefully exit
      process.kill(process.pid, "SIGUSR2");
      console.log("Clients exited from monitor");
    } else {
      // If we’re in “dashboard-only” mode, just kill
      process.exit(0);
    }
    screen.destroy();
  });

  // Return the screen and the references to main widgets
  return {
    screen,
    components: {
      executionLog,
      consensusLog,
      gethStageGauge,
      rethStageGauge,
      nethermindStageGauge,
      chainInfoBox,
      rpcInfoBox,
    },
  };
}

function suppressMouseOutput(screen) {
  // Don’t spam logs on mouse clicks or up/down arrow usage
  screen.on("element mouse", (el, data) => {
    if (data.button === "mouseup" || data.button === "mousedown") {
      return false;
    }
  });

  screen.on("keypress", (ch, key) => {
    if (
      key.name === "up" ||
      key.name === "down" ||
      key.name === "left" ||
      key.name === "right" ||
      (key.name === "r" && (key.meta || key.ctrl))
    ) {
      if (!key.ctrl && !key.meta && !key.shift) {
        return false;
      }
    }
  });
}
