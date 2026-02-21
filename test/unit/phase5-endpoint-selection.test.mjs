import { describe, expect, it } from "vitest";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 endpoint selection and route request ordering", () => {
  it("selects nearest stream endpoint by geometric 8-way distance with (y,x) tie-break", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);
    const index = (x, y) => y * shape.width + x;

    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const faN = new Float32Array(shape.size).fill(0);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const slopeMag = new Float32Array(shape.size).fill(0.2);

    // Two equidistant stream candidates from seed (2,2): (1,1) and (3,1)
    waterClass[index(1, 1)] = WATER_CLASS_CODE.stream;
    waterClass[index(3, 1)] = WATER_CLASS_CODE.stream;
    faN[index(1, 1)] = 0.8;
    faN[index(3, 1)] = 0.8;

    const requests = navigation.buildTrailRouteRequests(
      shape,
      [index(2, 2)],
      {
        waterClass,
        faN,
        landform,
        slopeMag
      },
      {
        streamEndpointAccumThreshold: 0.7,
        ridgeEndpointMaxSlope: 0.12
      }
    );

    expect(requests).toEqual([
      {
        kind: "seed_to_water",
        seedIndex: index(2, 2),
        endpointIndex: index(1, 1)
      }
    ]);
  });

  it("emits route requests in deterministic per-seed order: water then ridge", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);
    const index = (x, y) => y * shape.width + x;

    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const faN = new Float32Array(shape.size).fill(0);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const slopeMag = new Float32Array(shape.size).fill(0.2);

    waterClass[index(1, 1)] = WATER_CLASS_CODE.stream;
    faN[index(1, 1)] = 0.8;

    landform[index(3, 3)] = LANDFORM_CODE.ridge;
    slopeMag[index(3, 3)] = 0.05;

    const seeds = [index(2, 2), index(2, 3)];

    const requests = navigation.buildTrailRouteRequests(
      shape,
      seeds,
      {
        waterClass,
        faN,
        landform,
        slopeMag
      },
      {
        streamEndpointAccumThreshold: 0.7,
        ridgeEndpointMaxSlope: 0.12
      }
    );

    expect(requests).toEqual([
      { kind: "seed_to_water", seedIndex: seeds[0], endpointIndex: index(1, 1) },
      { kind: "seed_to_ridge", seedIndex: seeds[0], endpointIndex: index(3, 3) },
      { kind: "seed_to_water", seedIndex: seeds[1], endpointIndex: index(1, 1) },
      { kind: "seed_to_ridge", seedIndex: seeds[1], endpointIndex: index(3, 3) }
    ]);
  });

  it("skips missing endpoint kinds while preserving request order", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);
    const index = (x, y) => y * shape.width + x;

    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const faN = new Float32Array(shape.size).fill(0);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const slopeMag = new Float32Array(shape.size).fill(0.2);

    // Water candidate exists.
    waterClass[index(1, 1)] = WATER_CLASS_CODE.stream;
    faN[index(1, 1)] = 0.8;

    // Ridge candidate does not pass max-slope constraint.
    landform[index(3, 3)] = LANDFORM_CODE.ridge;
    slopeMag[index(3, 3)] = 0.2;

    const requests = navigation.buildTrailRouteRequests(
      shape,
      [index(2, 2)],
      {
        waterClass,
        faN,
        landform,
        slopeMag
      },
      {
        streamEndpointAccumThreshold: 0.7,
        ridgeEndpointMaxSlope: 0.12
      }
    );

    expect(requests).toEqual([
      {
        kind: "seed_to_water",
        seedIndex: index(2, 2),
        endpointIndex: index(1, 1)
      }
    ]);
  });
});
