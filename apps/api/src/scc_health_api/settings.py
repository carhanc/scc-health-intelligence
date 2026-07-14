"""Server-side application settings.

Secrets and configuration are read only here, server-side, and never
forwarded to the browser bundle (docs/09_SECURITY_PRIVACY_GOVERNANCE.md).
All fields are optional except paths with sane local defaults, so the app
starts with zero configured credentials.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_version: str = "0.1.0"

    # "local" (default) trusts the Next.js dev server only. "production"
    # is opt-in via the SCC_HEALTH_ENVIRONMENT env var, and additionally
    # requires the live warehouse to exist at startup (Phase 9 hardening)
    # -- a production deployment must never silently serve with no data.
    environment: Literal["local", "production"] = Field(
        default="local", alias="SCC_HEALTH_ENVIRONMENT"
    )

    scc_health_data_dir: Path = REPO_ROOT / "data"
    scc_health_warehouse_path: Path = REPO_ROOT / "warehouse" / "scc_health.duckdb"
    scc_health_demo_warehouse_path: Path = REPO_ROOT / "warehouse" / "scc_health_demo.duckdb"
    scc_health_api_port: int = 8000
    data_manifest_path: Path = REPO_ROOT / "DATA_MANIFEST.production.json"

    # Comma-separated in the environment (e.g. "https://app.example.com,
    # https://staging.example.com"); parsed to a list here. Defaults to the
    # local Next.js dev server only -- a hosted deployment must set this
    # explicitly, never inherit a wildcard or a stale localhost default.
    cors_allowed_origins_raw: str = Field(
        default="http://localhost:3000", alias="CORS_ALLOWED_ORIGINS"
    )
    # Comma-separated allowed Host header values for TrustedHostMiddleware.
    # "*" (the default) is fine for local dev; a hosted deployment must set
    # this to its real domain(s).
    trusted_hosts_raw: str = Field(default="*", alias="TRUSTED_HOSTS")

    # Optional credentials. All are None by default; core functionality
    # never requires any of them (docs/02_DATA_SOURCE_REGISTRY.md, README_FIRST.md).
    census_api_key: str | None = Field(default=None)
    hud_user_token: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)
    mapbox_token: str | None = Field(default=None)
    openrouteservice_api_key: str | None = Field(default=None)
    sentry_dsn: str | None = Field(default=None)
    sentry_environment: str | None = Field(default=None)

    @field_validator("environment", mode="before")
    @classmethod
    def _lowercase_environment(cls, v: object) -> object:
        return v.lower() if isinstance(v, str) else v

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins_raw.split(",") if o.strip()]

    @property
    def trusted_hosts(self) -> list[str]:
        return [h.strip() for h in self.trusted_hosts_raw.split(",") if h.strip()]


def get_settings() -> Settings:
    return Settings()
