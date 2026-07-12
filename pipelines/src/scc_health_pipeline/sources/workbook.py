"""Shared multi-sheet Excel workbook parsing helper for HCAI-style products.

HCAI publishes ED/facility/patient-origin data as XLSX/XLSM "pivot profile"
workbooks: multiple sheets, header rows not always at row 1, footnote text
rows, and masked/suppressed cells using non-numeric placeholder symbols.
This module centralizes the parsing discipline so every HCAI adapter
handles these consistently rather than reimplementing ad hoc sheet-scanning
logic, and so a sheet that fails to parse raises a clear, loud error
instead of being silently skipped (docs/02_DATA_SOURCE_REGISTRY.md
"HCAI emergency-department data" requirements).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import openpyxl
import pandas as pd

# Symbols HCAI and similar CHHS/OEHHA workbooks commonly use to indicate a
# suppressed/masked cell rather than a true zero or missing value. These
# must be preserved as an explicit suppression flag, never silently
# converted to 0 or NaN without a flag (CLAUDE.md failure rules).
SUPPRESSION_MARKERS = {"*", "**", "N/A", "NA", "--", "-", "Masked", "MASKED", "S", "†"}


@dataclass(frozen=True)
class ParsedSheet:
    sheet_name: str
    header_row_index: int
    dataframe: pd.DataFrame
    suppressed_cell_count: int


class WorkbookParseError(RuntimeError):
    """Raised when a sheet cannot be parsed reliably -- callers must treat
    this as a failed source, not silently skip the sheet."""


def list_sheet_names(path: Path) -> list[str]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        return list(workbook.sheetnames)
    finally:
        workbook.close()


def find_header_row(
    path: Path, sheet_name: str, *, max_scan_rows: int = 20, min_non_empty_fraction: float = 0.5
) -> int:
    """Scan the first `max_scan_rows` rows for the most likely header row:
    the first row where at least `min_non_empty_fraction` of cells are
    non-empty strings (skips title/footnote rows common in HCAI workbooks)."""
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        if sheet_name not in workbook.sheetnames:
            raise WorkbookParseError(f"Sheet '{sheet_name}' not found in {path.name}.")
        sheet = workbook[sheet_name]
        for row_index, row in enumerate(sheet.iter_rows(max_row=max_scan_rows, values_only=True)):
            if not row:
                continue
            non_empty = [c for c in row if c is not None and str(c).strip() != ""]
            string_like = [c for c in non_empty if isinstance(c, str)]
            if len(row) == 0:
                continue
            if len(non_empty) / len(row) >= min_non_empty_fraction and len(string_like) >= 2:
                return row_index
        raise WorkbookParseError(
            f"Could not locate a header row in sheet '{sheet_name}' of {path.name} "
            f"within the first {max_scan_rows} rows."
        )
    finally:
        workbook.close()


def parse_sheet(
    path: Path,
    sheet_name: str,
    *,
    header_row_index: int | None = None,
    min_non_null_fraction: float = 0.5,
) -> ParsedSheet:
    """Parse one sheet into a DataFrame, auto-detecting the header row if
    not given, and counting suppressed cells (never silently dropping them).

    Rows below `min_non_null_fraction` populated are dropped as trailing
    footnote/source-citation rows -- these commonly have text in only the
    first column (e.g. "Source: HCAI. Suppressed values (*) protect
    confidentiality.") which survives a plain `dropna(how="all")` because
    the row isn't *entirely* empty, just mostly empty.
    """
    if header_row_index is None:
        header_row_index = find_header_row(path, sheet_name)

    try:
        df = pd.read_excel(path, sheet_name=sheet_name, header=header_row_index, engine="openpyxl")
    except Exception as exc:  # re-raise as a typed, clear failure
        raise WorkbookParseError(
            f"Failed to parse sheet '{sheet_name}' of {path.name}: {exc}"
        ) from exc

    df = df.dropna(axis="index", how="all")
    if len(df.columns) > 0:
        non_null_fraction = df.notna().sum(axis="columns") / len(df.columns)
        df = df[non_null_fraction >= min_non_null_fraction]

    suppressed_count = 0
    for column in df.columns:
        marker_mask = df[column].astype(str).isin(SUPPRESSION_MARKERS)
        suppressed_count += int(marker_mask.sum())

    return ParsedSheet(
        sheet_name=sheet_name,
        header_row_index=header_row_index,
        dataframe=df,
        suppressed_cell_count=suppressed_count,
    )


def parse_all_sheets(path: Path) -> dict[str, ParsedSheet]:
    """Parse every sheet in the workbook. If ANY sheet fails to parse, the
    whole function raises rather than returning a partial result with a
    silently-missing sheet."""
    results: dict[str, ParsedSheet] = {}
    for sheet_name in list_sheet_names(path):
        results[sheet_name] = parse_sheet(path, sheet_name)
    return results
