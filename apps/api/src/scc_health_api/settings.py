"""Server-side application settings.

Secrets and configuration are read only here, server-side, and never
forwarded to the browser bundle (docs/09_SECURITY_PRIVACY_GOVERNANCE.md).
All fields are optional except paths with sane local defaults, so the app
starts with zero configured credentials.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_version: str = "0.1.0"

    scc_health_data_dir: Path = REPO_ROOT / "data"
    scc_health_warehouse_path: Path = REPO_ROOT / "warehouse" / "scc_health.duckdb"
    scc_health_demo_warehouse_path: Path = REPO_ROOT / "warehouse" / "scc_health_demo.duckdb"
    scc_health_api_port: int = 8000

    # Optional credentials. All are None by default; core functionality
    # never requires any of them (docs/02_DATA_SOURCE_REGISTRY.md, README_FIRST.md).
    census_api_key: str | None = Field(default=None)
    hud_user_token: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)
    mapbox_token: str | None = Field(default=None)
    openrouteservice_api_key: str | None = Field(default=None)
    sentry_dsn: str | None = Field(default=None)


def get_settings() -> Settings:
    return Settings()
