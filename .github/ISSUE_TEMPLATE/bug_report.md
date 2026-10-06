---
name: Bug report
about: Something behaves differently from what the docs say
labels: bug
---

**What happened**

**What you expected**

**How to reproduce**

The scenario file (or `agentcrucible list --json` entry), the command, and the output. For a grading question, attach the `*.report.json` file: `agentcrucible inspect <report>` and `agentcrucible replay <report>` reproduce it exactly.

```bash
agentcrucible run --scenario ... --agent ...
```

**Versions**

`agentcrucible --version`, `node --version`, OS.
