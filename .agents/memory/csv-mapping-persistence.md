---
name: CSV mapping persistence
description: Preserve explicit CSV column choices while users correct row values during an import review.
---

Run automatic column detection only when the normalized header signature changes. Once a user chooses a mapping, edits to data cells must not retrigger detection or clear unmatched-but-explicit choices.

**Why:** Import review depends on users correcting row errors and previewing again. Treating every CSV text edit as a new mapping event can silently reset a manually selected column even when the headers are unchanged.

**How to apply:** Separate header identity from CSV content. Reinitialize mapping for a new file or changed header set, but preserve it across corrections to row values.