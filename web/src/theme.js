// The look of each side: team names and a display name for each ship type.
// Wording only; the rules keep using the plain names from FLEET.

export const SIDES = Object.freeze({
  human: {
    team: "Cognition",
    ships: {
      Carrier: "Devin",
      Battleship: "Windsurf",
      Cruiser: "DeepWiki",
      Submarine: "Devin Review",
      Destroyer: "Devin Search",
    },
  },
  computer: {
    team: "DIY",
    ships: {
      Carrier: "Monolith",
      Battleship: "Spreadsheet of Doom",
      Cruiser: "Weekend Hackathon",
      Submarine: "Cron Job",
      Destroyer: "Bash Script",
    },
  },
});

// shipLabel("computer", "Destroyer") -> "Bash Script (Destroyer)"
export function shipLabel(side, type) {
  const name = SIDES[side].ships[type];
  return name ? `${name} (${type})` : type;
}
