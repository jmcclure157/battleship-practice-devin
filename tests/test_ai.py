import random
import unittest

from battleship.ai import HuntTargetAI
from battleship.board import Board, Direction


class HuntTargetAITests(unittest.TestCase):
    def test_hunt_uses_checkerboard_parity(self):
        ai = HuntTargetAI(rng=random.Random(1))
        for _ in range(20):
            r, c = ai.choose_shot()
            self.assertEqual((r + c) % 2, 0)
            ai.tried.add((r, c))

    def test_targets_neighbours_after_hit(self):
        board = Board()
        board.place_ship("Cruiser", 3, (5, 5), Direction.HORIZONTAL)
        ai = HuntTargetAI(rng=random.Random(0))
        ai.record_result(board.receive_shot((5, 6)))
        self.assertIn(ai.choose_shot(), {(4, 6), (6, 6), (5, 5), (5, 7)})

    def test_follows_line_after_two_hits(self):
        board = Board()
        board.place_ship("Carrier", 5, (2, 2), Direction.VERTICAL)
        ai = HuntTargetAI(rng=random.Random(0))
        ai.record_result(board.receive_shot((3, 2)))
        ai.record_result(board.receive_shot((4, 2)))
        self.assertIn(ai.choose_shot(), {(2, 2), (5, 2)})

    def test_returns_to_hunting_after_sinking(self):
        board = Board()
        board.place_ship("Destroyer", 2, (0, 0), Direction.HORIZONTAL)
        ai = HuntTargetAI(rng=random.Random(0))
        ai.record_result(board.receive_shot((0, 0)))
        ai.record_result(board.receive_shot((0, 1)))
        self.assertEqual(ai.open_hits, [])

    def test_ai_sinks_full_fleet_without_repeating_shots(self):
        for seed in range(20):
            rng = random.Random(seed)
            board = Board()
            board.place_fleet_randomly(rng=rng)
            ai = HuntTargetAI(rng=rng)
            shots = 0
            while not board.all_sunk():
                ai.record_result(board.receive_shot(ai.choose_shot()))  # raises on repeat
                shots += 1
            self.assertLessEqual(shots, 100)

    def test_beats_pure_random_on_average(self):
        def shots_to_win(seed, smart):
            rng = random.Random(seed)
            board = Board()
            board.place_fleet_randomly(rng=rng)
            order = board.all_coords()
            rng.shuffle(order)
            ai, n = HuntTargetAI(rng=rng), 0
            while not board.all_sunk():
                coord = ai.choose_shot() if smart else order[n]
                result = board.receive_shot(coord)
                ai.record_result(result)
                n += 1
            return n

        smart = sum(shots_to_win(s, True) for s in range(30)) / 30
        dumb = sum(shots_to_win(s, False) for s in range(30)) / 30
        self.assertLess(smart, dumb - 20)


if __name__ == "__main__":
    unittest.main()
