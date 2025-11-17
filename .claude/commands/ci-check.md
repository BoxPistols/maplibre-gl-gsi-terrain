---
description: Run all CI checks (lint, type-check, format, test)
---

Run all continuous integration checks:

```bash
pnpm ci:check
```

This will run:
1. ESLint checks
2. TypeScript type checking
3. Prettier format checking
4. Unit tests with coverage

If any checks fail, analyze the failures and suggest fixes.
