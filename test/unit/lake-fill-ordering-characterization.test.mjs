import { describe, expect, it } from "vitest";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import {
	assertFixtureMembershipInvariants,
	assertFixtureTopologyInvariants,
	buildNestedSiblingBasinFixture,
} from "./helpers/lake-fixtures.mjs";

const KS = [1, 0.5, 0.1, 0.01, 0.001, 0.0001];

const runByK = () => {
	const fixture = buildNestedSiblingBasinFixture();
	assertFixtureTopologyInvariants(fixture.basinFeatures);
	assertFixtureMembershipInvariants(
		fixture.shape,
		fixture.basinFeatures,
		fixture.tileFeatureIds,
	);
	return KS.map((k) => {
		const out = deriveHydrology(
			fixture.shape,
			fixture.h,
			{
				basinFeatures: fixture.basinFeatures,
				tileFeatureIds: fixture.tileFeatureIds,
			},
			{
				hydrology: {
					sinkMode: "strict_local",
					lakeFill: { wetnessScale: k },
				},
			},
		);
		return {
			k,
			byId: out.lakeAccounting.byId,
		};
	});
};

describe("lake fill ordering characterization", () => {
	it("captures current accounting contract and partial multi-level behavior", () => {
		const results = runByK();
		results.forEach(({ k, byId }) => {
			const basins = Array.from(byId.values());
			basins.forEach((basin) => {
				const childOverflow = basin.childIds.reduce(
					(sum, childId) => sum + (byId.get(childId)?.overflowExcess ?? 0),
					0,
				);
				expect(basin.totalInflow).toBeCloseTo(
					basin.externalInflow + childOverflow,
					6,
				);
				expect(basin.overflowExcess).toBeCloseTo(
					Math.max(0, k * basin.totalInflow - basin.spillCapacity),
					6,
				);
			});
		});

		const hasAnyParentWithUnfilledChild = results.some(({ byId }) => {
			const parent = byId.get("b_A");
			if (!parent) {
				return false;
			}
			const childFilledState = parent.childIds.map(
				(childId) => byId.get(childId)?.isFilled ?? false,
			);
			return childFilledState.some((isFilled) => !isFilled);
		});
		expect(hasAnyParentWithUnfilledChild).toBe(true);
	});

	it("emits deterministic per-k summary table", () => {
		const table = runByK()
			.map(({ k, byId }) => {
				const ordered = Array.from(byId.values())
					.sort((a, b) => a.id.localeCompare(b.id))
					.map(
						(b) =>
							`${b.id}:fill=${b.fillRatio.toFixed(4)};filled=${b.isFilled ? 1 : 0};overflow=${b.overflowExcess.toFixed(4)}`,
					)
					.join(" | ");
				return `k=${k}: ${ordered}`;
			})
			.join("\n");
		expect(table).toMatchInlineSnapshot(`
		  "k=1: b_A:fill=17.0849;filled=1;overflow=34.1000 | b_A1:fill=25.5814;filled=1;overflow=10.5700 | b_A2:fill=25.7143;filled=1;overflow=8.6500 | b_B:fill=12.5000;filled=1;overflow=4.6000 | b_root:fill=3.9369;filled=1;overflow=28.8700
		  k=0.5: b_A:fill=6.1840;filled=1;overflow=10.9900 | b_A1:fill=12.7907;filled=1;overflow=5.0700 | b_A2:fill=12.8571;filled=1;overflow=4.1500 | b_B:fill=6.2500;filled=1;overflow=2.1000 | b_root:fill=0.6658;filled=0;overflow=0.0000
		  k=0.1: b_A:fill=0.8594;filled=0;overflow=0.0000 | b_A1:fill=2.5581;filled=1;overflow=0.6700 | b_A2:fill=2.5714;filled=1;overflow=0.5500 | b_B:fill=1.2500;filled=1;overflow=0.1000 | b_root:fill=0.0000;filled=0;overflow=0.0000
		  k=0.01: b_A:fill=0.0000;filled=0;overflow=0.0000 | b_A1:fill=0.2558;filled=0;overflow=0.0000 | b_A2:fill=0.2571;filled=0;overflow=0.0000 | b_B:fill=0.1250;filled=0;overflow=0.0000 | b_root:fill=0.0000;filled=0;overflow=0.0000
		  k=0.001: b_A:fill=0.0000;filled=0;overflow=0.0000 | b_A1:fill=0.0256;filled=0;overflow=0.0000 | b_A2:fill=0.0257;filled=0;overflow=0.0000 | b_B:fill=0.0125;filled=0;overflow=0.0000 | b_root:fill=0.0000;filled=0;overflow=0.0000
		  k=0.0001: b_A:fill=0.0000;filled=0;overflow=0.0000 | b_A1:fill=0.0026;filled=0;overflow=0.0000 | b_A2:fill=0.0026;filled=0;overflow=0.0000 | b_B:fill=0.0012;filled=0;overflow=0.0000 | b_root:fill=0.0000;filled=0;overflow=0.0000"
		`);
	});
});
