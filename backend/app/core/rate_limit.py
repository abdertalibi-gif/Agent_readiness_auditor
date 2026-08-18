"""Simple in-process sliding-window rate limiter.

Sufficient for a single backend instance. For multi-worker deployments swap the
backend for a Redis-based limiter (see note in docs/security.md).
"""

import asyncio
import time
from collections import defaultdict, deque

from app.config import settings


class SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> tuple[bool, float]:
        """Return (allowed, retry_after_seconds)."""
        now = time.monotonic()
        async with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= now - self.window_seconds:
                bucket.popleft()
            if len(bucket) >= self.max_requests:
                retry_after = bucket[0] + self.window_seconds - now
                return False, max(retry_after, 1.0)
            bucket.append(now)
            return True, 0.0


_limiter = SlidingWindowLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__("Rate limit exceeded")


async def check_rate_limit(key: str) -> None:
    allowed, retry_after = await _limiter.check(key)
    if not allowed:
        raise RateLimitExceeded(retry_after)
