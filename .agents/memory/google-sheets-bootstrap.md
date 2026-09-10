---
name: Google Sheets bootstrap
description: Reliable initialization of connector-backed development feedback spreadsheets.
---

Create the development feedback spreadsheet, its named worksheet, and the header row in one Sheets API create request.

**Why:** A successful spreadsheet creation followed immediately by a separate header write returned `404 NOT_FOUND`, leaving no saved spreadsheet ID even though the authenticated connector had write access.

**How to apply:** When provisioning a new connector-backed feedback sheet, include initial grid data in the create payload. Reserve later values requests for appending to an already configured and verified spreadsheet.