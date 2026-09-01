"""
The standing part of a standing agent.

When it is on, a cycle runs on its own schedule rather than because someone pressed a button. It is
off until asked, because an agent that starts spending the moment the process boots is exactly the
thing this project argues against. Nothing here decides anything: it calls the same run_all the
manual path calls, so every guardrail, every escalation and every audit write happen identically.
"""

import asyncio
import time
from dataclasses import dataclass, field

from .agent import NoActiveMandate, run_all


@dataclass
class CycleRecord:
    at: float
    category: str
    outcome: str
    reason: str | None = None
    items: int = 0


@dataclass
class AutopilotState:
    enabled: bool = False
    interval_seconds: int = 120
    user_id: int | None = None
    last_run_at: float | None = None
    next_run_at: float | None = None
    runs: int = 0
    history: list[CycleRecord] = field(default_factory=list)
    last_error: str | None = None

    def snapshot(self) -> dict:
        return {
            "enabled": self.enabled,
            "interval_seconds": self.interval_seconds,
            "user_id": self.user_id,
            "last_run_at": self.last_run_at,
            "next_run_at": self.next_run_at,
            "runs": self.runs,
            "last_error": self.last_error,
            "history": [
                {
                    "at": record.at,
                    "category": record.category,
                    "outcome": record.outcome,
                    "reason": record.reason,
                    "items": record.items,
                }
                for record in reversed(self.history[-12:])
            ],
        }


class Autopilot:
    def __init__(self, checkout, decider, instruction: str) -> None:
        self._checkout = checkout
        self._decider = decider
        self._instruction = instruction
        self._task: asyncio.Task | None = None
        self.state = AutopilotState()

    def status(self) -> dict:
        return self.state.snapshot()

    def configure(self, enabled: bool, user_id: int, interval_seconds: int | None = None) -> dict:
        self.state.enabled = enabled
        self.state.user_id = user_id
        if interval_seconds:
            self.state.interval_seconds = max(30, min(3600, interval_seconds))

        if enabled:
            self.state.next_run_at = time.time() + self.state.interval_seconds
            self.state.last_error = None
            if self._task is None or self._task.done():
                self._task = asyncio.create_task(self._loop())
        else:
            self.state.next_run_at = None
            if self._task is not None:
                self._task.cancel()
                self._task = None

        return self.status()

    async def _loop(self) -> None:
        try:
            while self.state.enabled and self.state.user_id is not None:
                await asyncio.sleep(self.state.interval_seconds)
                if not self.state.enabled:
                    return
                await self._tick()
        except asyncio.CancelledError:
            return

    async def _tick(self) -> None:
        self.state.last_run_at = time.time()
        self.state.next_run_at = self.state.last_run_at + self.state.interval_seconds
        try:
            report = await run_all(
                self._checkout, self._decider, self.state.user_id, self._instruction
            )
        except NoActiveMandate as exc:
            self.state.last_error = str(exc)
            return
        except Exception as exc:
            self.state.last_error = str(exc)
            return

        self.state.last_error = None
        self.state.runs += 1
        for run in report.runs:
            self.state.history.append(CycleRecord(
                at=self.state.last_run_at,
                category=run.category,
                outcome=run.outcome,
                reason=run.reason,
                items=len(run.proposed_cart),
            ))
        for category, why in report.skipped.items():
            self.state.history.append(CycleRecord(
                at=self.state.last_run_at,
                category=category,
                outcome="skipped",
                reason=why,
            ))

    async def stop(self) -> None:
        self.state.enabled = False
        if self._task is not None:
            self._task.cancel()
            self._task = None
