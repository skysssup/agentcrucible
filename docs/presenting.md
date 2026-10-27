# A two-minute AgentCrucible demonstration

Build the current checkout and start a disposable demo workspace:

```sh
npm ci
npm run build
node dist/cli.js ui --demo
```

Open the printed loopback address. The failure lab asks one question: a refund committed, but its response timed out. What should the agent do next?

1. Run the experiment. It executes five scripted strategies; these are test fixtures, not customer agents.
2. Open `naive-retry`. Its first refund executed although the response was an error. Its second call created a second refund. The verdict is `HARMFUL_ACTION`.
3. Compare `idempotent-retry` or `cross-checker`. The engine checks the resulting records and answer, rather than trusting a successful-looking response.
4. Open a full trace to connect a finding with the specific call and committed record.
5. Download the evidence. Keep the scenario and seed with a saved JSON report if you need to reproduce the result later.

The larger workspace is fictional Northwind data with generated history. Do not describe its charts as users, customers, production measurements, or validation of a real model. The experiment demonstrates deterministic recovery behavior in a small mock payment service. Real-service fidelity and unusual natural-language answers remain limitations.

The public project page can run the same narrow experiment without installing Node. `src/browser-refund.ts` calls the production harness and grader; `test/browser-refund.test.ts` compares its results with the normal engine.
