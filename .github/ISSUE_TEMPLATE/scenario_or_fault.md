---
name: Scenario or fault kind
about: Propose a failure mode the bundled scenarios should cover
labels: scenarios
---

**The failure in production**

What goes wrong between the agent and the service, and what the agent sees.

**What a correct agent does**

**What a careless agent does**

**Sketch**

```yaml
id: world/name
world: payments
faults:
  - target: create_refund
    kind: timeout_after_commit
    on_call: 1
```
