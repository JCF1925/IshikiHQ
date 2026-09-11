---
name: GitHub workflow write scope
description: How GitHub workflow-file writes differ from ordinary repository writes through OAuth connections.
---

GitHub repository write access does not necessarily permit creating or updating files under `.github/workflows/`. A connection with only the broad repository scope can accept blobs and ordinary commits yet reject a tree that introduces a workflow path with a misleading `404 Not Found`.

**Why:** Live repository initialization succeeded for ordinary files, while the identical Git object flow failed only when the workflow path was present. Reauthorizing could not help because the connector's declared scope set did not include GitHub's separate workflow-write permission.

**How to apply:** When an otherwise authorized GitHub connection rejects only workflow-path writes, inspect its available scopes before retrying uploads. Use a connection with workflow permission, or stage the exact content at an ordinary path and have the repository owner rename it in GitHub.