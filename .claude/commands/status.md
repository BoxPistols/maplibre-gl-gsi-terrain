---
description: Show project status and health
---

Display the current status of the project:

1. Check git status
2. Show recently modified files
3. Display any uncommitted changes
4. Show recent commits

```bash
git status && echo "" && echo "Recent commits:" && git log --oneline -5
```
