// Turning game events into the sentences shown in the battle log.

import { Outcome } from "./board.js";

export const ROW_LABELS = "ABCDEFGHIJ";

// [0, 0] -> "A1", [9, 9] -> "J10". Rows are letters, columns numbers.
export function formatCoord([row, col]) {
  return `${ROW_LABELS[row]}${col + 1}`;
}

function possessive(name) {
  return name === "You" ? "your" : `${name}'s`;
}

export function describeShot(result, shooter, defender) {
  const where = formatCoord(result.coord);
  if (result.outcome === Outcome.MISS) return `${shooter} fired at ${where}: miss.`;
  if (result.outcome === Outcome.SUNK) {
    const sunk =
      defender === "Computer"
        ? `Computer: "You sunk my ${result.ship.name}!"`
        : `${shooter} sunk ${possessive(defender)} ${result.ship.name}!`;
    return `${shooter} fired at ${where}: hit! ${sunk}`;
  }
  return `${shooter} fired at ${where}: hit!`;
}

export function describeWin(winner, loser) {
  const whose = loser === "You" ? "your" : `the ${loser}'s`;
  const verb = winner === "You" ? "win" : "wins";
  return `All of ${whose} ships are sunk. ${winner} ${verb}!`;
}
