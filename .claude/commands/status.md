---
description: Show project status and health
---

Display the current status of the project by:

- Showing the output of `git status` (including modified files and uncommitted changes).
- Listing the 5 most recent commits.

```bash
git status && echo "" && echo "Recent commits:" && git log --oneline -5
```
