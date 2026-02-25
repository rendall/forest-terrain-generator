# Landform Slope Context Raw Data

Source dataset:
- `docs/example/forest.json`

Sampling script assumptions:
- Aspect direction interpreted per spec angle frame: `0=E, 90=S, 180=W, 270=N`.
- Aspect is downhill direction.
- For each tile, sampled the neighbor in the quantized aspect direction and measured `abs(neighbor.h - tile.h)`.
- Buckets by `tile.topography.slopeMag`:
  - `gt01` (`> 0.1`)
  - `mid_005_01` (`>= 0.05 && <= 0.1`)
  - `lt005` (`< 0.05`)
  - `lt003_flatSpec` (`< 0.03`)

Raw output: `slopeMag_stats`

```json
{
  "slopeMag_stats": {
    "gt01": {
      "count": 46,
      "min": 0.003922000527381897,
      "p25": 0.08235299587249756,
      "p50": 0.1137249767780304,
      "p75": 0.1294119954109192,
      "p90": 0.1607840359210968,
      "p95": 0.1607850044965744,
      "max": 0.21960800141096115,
      "mean": 0.10375112991618074
    },
    "mid_005_01": {
      "count": 345,
      "min": 0,
      "p25": 0.04705798625946045,
      "p50": 0.07450902462005615,
      "p75": 0.09803999215364456,
      "p90": 0.1294119954109192,
      "p95": 0.1411769986152649,
      "max": 0.21568600833415985,
      "mean": 0.07491903197074282
    },
    "lt005": {
      "count": 608,
      "min": 0,
      "p25": 0.015686988830566406,
      "p50": 0.03137299418449402,
      "p75": 0.05490097403526306,
      "p90": 0.07843098044395447,
      "p95": 0.09019598364830017,
      "max": 0.1607850044965744,
      "mean": 0.038428791725125755
    },
    "lt003_flatSpec": {
      "count": 304,
      "min": 0,
      "p25": 0.011765003204345703,
      "p50": 0.023530006408691406,
      "p75": 0.04705798625946045,
      "p90": 0.05882298946380615,
      "p95": 0.07058802247047424,
      "max": 0.1294119954109192,
      "mean": 0.030121261450020892
    }
  }
}
```

Raw output: `aspectNeighborCheck`

```json
{
  "aspectNeighborCheck": {
    "total": 999,
    "downhillOK": 869,
    "uphill": 108,
    "zero": 22,
    "downhillShare": 0.8698698698698699
  }
}
```
