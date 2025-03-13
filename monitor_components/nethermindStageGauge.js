import blessed from "blessed";
import { debugToFile } from "../helpers.js";

let nethermindStageGauge;

/**
 * Creates a box in the grid that displays Nethermind’s sync progress
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
 * Populates the Nethermind stage gauge with stage-based progress bars
 *
 * @param {number[]} stagePercentages - Array of floats (0.0 → 1.0), 
 *                                      e.g. [0.2, 0.7, 0.55]
 */
export function populateNethermindStageGauge(stagePercentages) {
  try {
    // Define any custom stage names, e.g. for Nethermind
    const stageNames = ["HEADERS", "CHAIN", "STATE"];

    // Determine how wide the gauge text area can be
    const boxWidth = nethermindStageGauge.width - 9; // padding/border offset
    if (boxWidth > 0) {
      let content = "";

      stagePercentages.forEach((percentComplete, index) => {
        // Number of bars to "fill"
        const filledBars = Math.floor(boxWidth * percentComplete);
        const bar = "█".repeat(filledBars) + " ".repeat(boxWidth - filledBars);

        const percentString = `${Math.floor(percentComplete * 100)}%`;
        content += `${stageNames[index]}\n[${bar}] ${percentString}\n`;
      });

      // Apply the new content and re-render
      nethermindStageGauge.setContent(content.trim());
      nethermindStageGauge.screen.render();
    }
  } catch (error) {
    debugToFile(`populateNethermindStageGauge(): ${error}`);
  }
}
