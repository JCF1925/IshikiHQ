---
name: Calendar evidence timestamp contract
description: Calendar wrapper evidence can contain either second-precision guard timestamps or millisecond-precision child-process timestamps.
---

Calendar evidence validation should require canonical UTC timestamps while accepting both `YYYY-MM-DDTHH:mm:ssZ` and millisecond precision.

**Why:** The shell wrapper records its guard start time with `date`, while a successful or failed child process reports JavaScript ISO timestamps; fixing tests to one precision caused a false regression.

**How to apply:** When extending credential-free Calendar evidence checks, validate timestamp shape and UTC validity rather than requiring milliseconds in every path.