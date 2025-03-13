import blessed from "blessed";
import { debugToFile } from "../helpers.js";

let nethermindStageGauge;

/**
 * Creates a box in the grid that displays Nethermind’s sync progress.
 *
 * @param {object} grid - A blessed-contrib grid instance.
 * @returns {object} The created gauge box.
 */
export function createNethermindStageGauge(grid) {
  nethermindStageGauge = grid.set(2, 7, 5, 1, blessed.box, {
    label: "Sync Progress (Nethermind)",
    content: "INITIALIZING...",
    stroke: "cyan",
    fill: "white",
    border: {
      type: "line",
      fg: "cyan",
    },
    wrap: false,
  });
  return nethermindStageGauge;
}

/**
 * Populates the Nethermind stage gauge with stage-based progress bars.
 *
 * @param {number[]} stagePercentages - Array of floats (0.0 → 1.0), e.g. [0.2, 0.7, 0.55]
 */
export function populateNethermindStageGauge(stagePercentages) {
  try {
    // Define stage names for Nethermind.
    const stageNames = ["HEADERS", "CHAIN", "STATE"];

    // Calculate available width for the progress bar.
    const boxWidth = nethermindStageGauge.width - 9; // account for padding/border
    if (boxWidth > 0) {
      let content = "";
      stagePercentages.forEach((percentComplete, index) => {
        const filledBars = Math.floor(boxWidth * percentComplete);
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);
        const percentString = `${Math.floor(percentComplete * 100)}%`;
        content += `${stageNames[index]}\n[${bar}] ${percentString}\n`;
      });
      nethermindStageGauge.setContent(content.trim());
      nethermindStageGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateNethermindStageGauge(): ${error}`);
  }
}
