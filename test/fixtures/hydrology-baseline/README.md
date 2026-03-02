# Hydrology Baseline Fixture

This fixture is a frozen deterministic debug artifact set used by
`test/integration/hydrology-baseline-regression.test.mjs`.

Generation command:

```bash
node --import tsx src/cli/main.ts debug \
  --seed 1187 \
  --width 32 \
  --height 32 \
  --output-dir test/fixtures/hydrology-baseline/debug \
  --debug-output-file test/fixtures/hydrology-baseline/debug-envelope.json \
  --force
```

Notes:
- Keep this fixture immutable for regression stability.
- Write test stats output to a temp file, not into this directory.
