import random
import unittest

from battleship.board import Board, Direction, Outcome, PlacementError, ShotError
from battleship.ships import FLEET

H, V = Direction.HORIZONTAL, Direction.VERTICAL


class PlacementValidationTests(unittest.TestCase):
    def setUp(self):
        self.board = Board()

    def test_valid_horizontal_and_vertical_placement(self):
        carrier = self.board.place_ship("Carrier", 5, (0, 0), H)
        self.assertEqual(carrier.cells, [(0, 0), (0, 1), (0, 2), (0, 3), (0, 4)])
        destroyer = self.board.place_ship("Destroyer", 2, (8, 9), V)
        self.assertEqual(destroyer.cells, [(8, 9), (9, 9)])

    def test_ship_touching_far_edge_fits(self):
        self.board.place_ship("Carrier", 5, (9, 5), H)  # J6-J10

    def test_rejects_ship_past_right_edge(self):
        with self.assertRaisesRegex(PlacementError, "outside"):
            self.board.place_ship("Carrier", 5, (0, 6), H)

    def test_rejects_ship_past_bottom_edge(self):
        with self.assertRaisesRegex(PlacementError, "outside"):
            self.board.place_ship("Battleship", 4, (7, 0), V)

    def test_rejects_negative_start(self):
        with self.assertRaises(PlacementError):
            self.board.place_ship("Destroyer", 2, (-1, 0), V)

    def test_rejects_overlap(self):
        self.board.place_ship("Carrier", 5, (2, 2), H)
        with self.assertRaisesRegex(PlacementError, "overlap"):
            self.board.place_ship("Submarine", 3, (0, 4), V)

    def test_rejected_placement_leaves_board_unchanged(self):
        with self.assertRaises(PlacementError):
            self.board.place_ship("Carrier", 5, (0, 8), H)
        self.assertEqual(self.board.ships, [])

    def test_rejects_placing_same_ship_twice(self):
        self.board.place_ship("Cruiser", 3, (0, 0), H)
        with self.assertRaisesRegex(PlacementError, "already"):
            self.board.place_ship("Cruiser", 3, (5, 5), H)

    def test_random_placement_places_full_fleet_validly(self):
        for seed in range(50):
            board = Board()
            board.place_fleet_randomly(rng=random.Random(seed))
            self.assertEqual(
                sorted((s.name, s.size) for s in board.ships), sorted(FLEET)
            )
            cells = [cell for ship in board.ships for cell in ship.cells]
            self.assertEqual(len(cells), 17)
            self.assertEqual(len(set(cells)), 17, "ships overlap")
            for r, c in cells:
                self.assertTrue(0 <= r < 10 and 0 <= c < 10)
            for ship in board.ships:
                rows = {r for r, _ in ship.cells}
                cols = {c for _, c in ship.cells}
                self.assertTrue(len(rows) == 1 or len(cols) == 1, "ship not straight")

    def test_rejects_zero_or_negative_size(self):
        for size in (0, -2):
            with self.assertRaisesRegex(PlacementError, "at least 1"):
                self.board.place_ship("Ghost", size, (0, 0), H)
        self.assertEqual(self.board.ships, [])

    def test_random_placement_retries_when_boxed_in(self):
        # On a 3x3 board three 3-long ships only fit as three parallel lines,
        # so a single greedy pass often fails.
        fleet = [("A", 3), ("B", 3), ("C", 3)]
        for seed in range(30):
            board = Board(size=3)
            board.place_fleet_randomly(fleet, rng=random.Random(seed))
            self.assertEqual(len(board.ships), 3)

    def test_random_placement_failure_leaves_board_unchanged(self):
        board = Board(size=3)
        with self.assertRaises(PlacementError):
            board.place_fleet_randomly([("A", 3), ("B", 3), ("C", 3), ("D", 1)], attempts=5)
        self.assertEqual(board.ships, [])


class ShotTests(unittest.TestCase):
    def setUp(self):
        self.board = Board()
        self.destroyer = self.board.place_ship("Destroyer", 2, (0, 0), H)
        self.cruiser = self.board.place_ship("Cruiser", 3, (5, 5), V)

    def test_miss(self):
        result = self.board.receive_shot((9, 9))
        self.assertEqual(result.outcome, Outcome.MISS)
        self.assertIsNone(result.ship)
        self.assertFalse(result.is_hit)

    def test_hit(self):
        result = self.board.receive_shot((6, 5))
        self.assertEqual(result.outcome, Outcome.HIT)
        self.assertIs(result.ship, self.cruiser)
        self.assertFalse(self.cruiser.is_sunk)

    def test_repeat_shot_rejected(self):
        self.board.receive_shot((3, 3))
        with self.assertRaises(ShotError):
            self.board.receive_shot((3, 3))

    def test_off_grid_shot_rejected(self):
        with self.assertRaises(ShotError):
            self.board.receive_shot((10, 0))

    def test_sinking_reported_only_on_last_cell(self):
        self.assertEqual(self.board.receive_shot((5, 5)).outcome, Outcome.HIT)
        self.assertEqual(self.board.receive_shot((6, 5)).outcome, Outcome.HIT)
        result = self.board.receive_shot((7, 5))
        self.assertEqual(result.outcome, Outcome.SUNK)
        self.assertEqual(result.ship.name, "Cruiser")
        self.assertTrue(self.cruiser.is_sunk)
        self.assertFalse(self.destroyer.is_sunk)

    def test_all_sunk(self):
        self.assertFalse(self.board.all_sunk())
        for cell in self.destroyer.cells + self.cruiser.cells[:-1]:
            self.board.receive_shot(cell)
        self.assertFalse(self.board.all_sunk())
        self.board.receive_shot(self.cruiser.cells[-1])
        self.assertTrue(self.board.all_sunk())

    def test_empty_board_is_not_all_sunk(self):
        self.assertFalse(Board().all_sunk())


if __name__ == "__main__":
    unittest.main()
