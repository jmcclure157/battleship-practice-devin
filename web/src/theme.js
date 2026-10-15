// The look of each side: navy names and a period ship name for each ship type.
// Wording only; the rules keep using the plain names from FLEET.

export const SIDES = Object.freeze({
  human: {
    navy: "US Navy",
    ships: {
      Carrier: "USS Enterprise",
      Battleship: "USS Missouri",
      Cruiser: "USS Ticonderoga",
      Submarine: "USS Nautilus",
      Destroyer: "USS Spruance",
    },
  },
  computer: {
    navy: "Soviet Navy",
    ships: {
      Carrier: "Admiral Kuznetsov",
      Battleship: "Kirov",
      Cruiser: "Slava",
      Submarine: "Typhoon",
      Destroyer: "Sovremenny",
    },
  },
});

// shipLabel("computer", "Battleship") -> "Kirov (Battleship)"
export function shipLabel(side, type) {
  const name = SIDES[side].ships[type];
  return name ? `${name} (${type})` : type;
}
