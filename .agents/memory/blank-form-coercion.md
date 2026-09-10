---
name: Blank form coercion
description: How Ishiki should validate empty optional values submitted by HTML forms.
---

Normalize empty strings from optional form fields to `null` or `undefined` before applying numeric, date, or identifier coercion.

**Why:** HTML forms commonly submit optional fields as `""`. Numeric coercion turns that into zero, while identifier and date validation reject it, causing unintended values or broken default-form submissions.

**How to apply:** At shared request-schema boundaries, preprocess blank optional values according to their persistence semantics, and keep focused contract tests for default form payloads.