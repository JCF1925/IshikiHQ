---
name: Feedback sheet recovery
description: Safety boundaries for recovering selected rows between development feedback sheets.
---

Recover selected feedback rows by comparing the live candidate and authoritative sheets again immediately before copying. Preserve the candidate sheet, skip and report rows already present, and never combine recovery with consolidation or deletion.

**Why:** An owner’s earlier comparison can become stale, and a recovery action must not apply old assumptions or turn a reversible copy into a destructive cleanup.

**How to apply:** Any future feedback-sheet recovery or cleanup flow should name both source and destination at confirmation time. Treat copy, consolidation, and deletion as distinct owner-confirmed operations.

The Google Sheets connector is fixed to the Sheets API and cannot delete Drive files. A safe deletion outcome must therefore clear only the candidate Improvements rows after proving every row is present in the authoritative sheet; archiving can rename the spreadsheet while retaining its rows.

**Why:** The connector's drive.readonly/drive.file scopes do not make `/drive/v3` reachable through its Sheets proxy, so pretending to delete the spreadsheet would fail after the owner confirmed it.

**How to apply:** Keep file-level Drive deletion out of the Sheets-only flow. If true spreadsheet-file deletion becomes necessary, add and use a separate Google Drive connection with its own explicit confirmation and evidence checks.