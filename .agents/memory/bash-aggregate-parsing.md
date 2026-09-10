---
name: Bash aggregate parsing
description: Shell release gates that parse aggregate command output into multiple variables.
---

When a shell release gate feeds parsed metrics into `read`, the producer must
emit a trailing newline. Otherwise Bash can assign the values correctly but
return status 1 at EOF, causing a fail-closed exit trap to record a false
failure.

**Why:** A medication acceptance gate reported all tests passing but entered its
failure trap because a newline-free Node metric stream made `read` return 1.

**How to apply:** Make metric-producing helpers write a newline, and test both
the success status and the evidence record when changing release scripts.