"""A minimal, dependency-free per-IP rate limiter (Phase 9 hardening).

Scoped to the two routes with a real abuse/cost vector: document analysis
(CPU/memory per upload) and Copilot asks (an AI-provider call when
AI-assisted mode is configured). No blanket limiting on read-only
analytics routes -- there is no identified abuse vector for those, and
rate-limiting them would only make the product worse with no real
security benefit ("do not add theatrical security controls").

This is an in-process token bucket: correct and sufficient for a single
backend instance (this phase's Render deployment target), but it does
NOT coordinate across multiple instances. If the deployment is later
scaled horizontally, this should move to a shared store (e.g. Redis) --
recorded as a disclosed limitation, not silently assumed away.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from fastapi import HTTPException, Request


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


@dataclass
class TokenBucketRateLimiter:
    capacity: int
    refill_per_second: float
    _buckets: dict[str, _Bucket] = field(default_factory=dict)

    def _client_key(self, request: Request) -> str:
        # Render (and most PaaS reverse proxies) set X-Forwarded-For; fall
        # back to the direct client host for local/dev use.
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def check(self, request: Request) -> None:
        key = self._client_key(request)
        now = time.monotonic()
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=float(self.capacity), last_refill=now)
            self._buckets[key] = bucket
        elapsed = now - bucket.last_refill
        bucket.tokens = min(self.capacity, bucket.tokens + elapsed * self.refill_per_second)
        bucket.last_refill = now
        if bucket.tokens < 1:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment before trying again.",
            )
        bucket.tokens -= 1


# 10 requests, refilling at 1 every 6 seconds (~10/minute steady state) --
# generous for a real user preparing a meeting packet, restrictive enough
# to blunt a naive scripted-upload or scripted-ask loop.
document_analyze_limiter = TokenBucketRateLimiter(capacity=10, refill_per_second=1 / 6)
copilot_ask_limiter = TokenBucketRateLimiter(capacity=10, refill_per_second=1 / 6)
