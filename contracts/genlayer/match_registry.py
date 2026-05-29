# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Omnira — MatchRegistry v4.

Per-color move batches:
- White-only batches: odd plies (1, 3, 5, …), signed by white_address.
- Black-only batches: even plies (2, 4, 6, …), signed by black_address.

This makes every move's tx sender the moving player's wallet — the
chain record of who-did-what now matches reality move by move.
"""

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone


@allow_storage
@dataclass
class MatchRecord:
    white_address: Address
    black_address: Address
    initial_ms: u256
    increment_ms: u256
    started_at: u256
    ended_at: u256
    status: str
    result_reason: str
    final_fen: str
    pgn: str
    white_move_count: u256
    black_move_count: u256


@allow_storage
@dataclass
class MoveRecord:
    ply: u256
    san: str
    uci: str
    fen_after: str
    clock_ms_white: u256
    clock_ms_black: u256
    think_ms: u256
    submitted_at: u256


class MatchRegistry(gl.Contract):
    matches: TreeMap[str, MatchRecord]
    moves:   TreeMap[str, MoveRecord]   # key = f"{match_id}|{ply}"

    def __init__(self):
        pass

    def _now(self) -> u256:
        return u256(int(datetime.now(timezone.utc).timestamp()))

    def _move_key(self, match_id: str, ply: int) -> str:
        return f"{match_id}|{ply}"

    def _require_player(self, match_id: str) -> MatchRecord:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        rec = self.matches[match_id]
        sender = gl.message.sender_address
        if sender != rec.white_address and sender != rec.black_address:
            raise Exception("only match players may modify this match")
        return rec

    @gl.public.write
    def register_match(
        self,
        match_id: str,
        white_address: Address,
        black_address: Address,
        initial_ms: u256,
        increment_ms: u256,
    ) -> None:
        if match_id in self.matches:
            raise Exception(f"match already registered: {match_id}")
        if gl.message.sender_address != white_address:
            raise Exception("register_match must be signed by the white player")
        self.matches[match_id] = MatchRecord(
            white_address=white_address,
            black_address=black_address,
            initial_ms=initial_ms,
            increment_ms=increment_ms,
            started_at=self._now(),
            ended_at=u256(0),
            status="ACTIVE",
            result_reason="",
            final_fen="",
            pgn="",
            white_move_count=u256(0),
            black_move_count=u256(0),
        )

    @gl.public.write
    def submit_moves_batch(
        self,
        match_id: str,
        plies:           DynArray[u256],
        sans:            DynArray[str],
        ucis:            DynArray[str],
        fens_after:      DynArray[str],
        clocks_ms_white: DynArray[u256],
        clocks_ms_black: DynArray[u256],
        think_mss:       DynArray[u256],
    ) -> None:
        rec = self._require_player(match_id)
        if rec.status != "ACTIVE":
            raise Exception(f"match not active: {rec.status}")

        n = len(plies)
        if n == 0:
            raise Exception("empty batch")
        if not (n == len(sans) == len(ucis) == len(fens_after)
                == len(clocks_ms_white) == len(clocks_ms_black) == len(think_mss)):
            raise Exception("batch arrays must be the same length")

        sender = gl.message.sender_address
        is_white = sender == rec.white_address
        # Required ply parity: white=odd, black=even
        # Expected sequence: white -> 2*white_count+1, 2*white_count+3, ...
        #                    black -> 2*black_count+2, 2*black_count+4, ...
        if is_white:
            expected = int(rec.white_move_count) * 2 + 1
        else:
            expected = int(rec.black_move_count) * 2 + 2

        now = self._now()
        i = 0
        while i < n:
            p = int(plies[i])
            if is_white and (p % 2) != 1:
                raise Exception(f"white may only submit odd plies, got {p}")
            if (not is_white) and (p % 2) != 0:
                raise Exception(f"black may only submit even plies, got {p}")
            if p != expected:
                raise Exception(f"out-of-order ply for color: expected {expected}, got {p}")

            self.moves[self._move_key(match_id, p)] = MoveRecord(
                ply=plies[i],
                san=sans[i],
                uci=ucis[i],
                fen_after=fens_after[i],
                clock_ms_white=clocks_ms_white[i],
                clock_ms_black=clocks_ms_black[i],
                think_ms=think_mss[i],
                submitted_at=now,
            )
            expected += 2  # next same-color ply
            i += 1

        if is_white:
            rec.white_move_count = u256(int(rec.white_move_count) + n)
        else:
            rec.black_move_count = u256(int(rec.black_move_count) + n)
        self.matches[match_id] = rec

    @gl.public.write
    def finalize_match(
        self,
        match_id: str,
        status: str,
        result_reason: str,
        final_fen: str,
        pgn: str,
    ) -> None:
        rec = self._require_player(match_id)
        if rec.status != "ACTIVE":
            raise Exception(f"already finalized: {rec.status}")
        if status not in ("WHITE_WON", "BLACK_WON", "DRAW", "ABORTED"):
            raise Exception(f"invalid status: {status}")
        rec.status = status
        rec.result_reason = result_reason
        rec.final_fen = final_fen
        rec.pgn = pgn
        rec.ended_at = self._now()
        self.matches[match_id] = rec

    # ── views ─────────────────────────────────────────────────────────

    @gl.public.view
    def match_exists(self, match_id: str) -> bool:
        return match_id in self.matches

    @gl.public.view
    def get_match(self, match_id: str) -> MatchRecord:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id]

    @gl.public.view
    def get_white_move_count(self, match_id: str) -> u256:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id].white_move_count

    @gl.public.view
    def get_black_move_count(self, match_id: str) -> u256:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        return self.matches[match_id].black_move_count

    @gl.public.view
    def get_total_move_count(self, match_id: str) -> u256:
        if match_id not in self.matches:
            raise Exception(f"unknown match: {match_id}")
        rec = self.matches[match_id]
        return u256(int(rec.white_move_count) + int(rec.black_move_count))

    @gl.public.view
    def get_move(self, match_id: str, ply: u256) -> MoveRecord:
        key = self._move_key(match_id, int(ply))
        if key not in self.moves:
            raise Exception(f"no move at ply {int(ply)}")
        return self.moves[key]
