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
		results.forEach(({ byId }) => {
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
				const allChildrenFilled = basin.childIds.every(
					(childId) => byId.get(childId)?.isFilled === true,
				);
				if (!allChildrenFilled) {
					expect(basin.overflowExcess).toBe(0);
				}
				if (basin.overflowExcess > 0) {
					expect(basin.allocatedVolume).toBeCloseTo(basin.spillCapacity, 6);
				}
				expect(basin.overflowExcess).toBeGreaterThanOrEqual(0);
				expect(basin.fillRatio).toBeLessThanOrEqual(1 + 1e-9);
			});
		});

		const hasParentBlockedByUnfilledChild = results.some(({ byId }) => {
			const parent = byId.get("b_A");
			if (!parent) {
				return false;
			}
			const children = parent.childIds
				.map((childId) => byId.get(childId))
				.filter((child) => child != null);
			if (children.length === 0) {
				return false;
			}
			const hasUnfilledChild = children.some((child) => !child.isFilled);
			return (
				hasUnfilledChild && parent.totalInflow > 0 && parent.fillRatio === 0
			);
		});
		expect(hasParentBlockedByUnfilledChild).toBe(true);
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
			"k=1: b_A:fill=1.0000;filled=1;overflow=33.6818 | b_A1:fill=1.0000;filled=1;overflow=10.5100 | b_A2:fill=1.0000;filled=1;overflow=8.6500 | b_B:fill=1.0000;filled=1;overflow=4.6000 | b_root:fill=1.0000;filled=1;overflow=31.3234
			k=0.5: b_A:fill=1.0000;filled=1;overflow=15.1818 | b_A1:fill=1.0000;filled=1;overflow=5.0100 | b_A2:fill=1.0000;filled=1;overflow=4.1500 | b_B:fill=1.0000;filled=1;overflow=2.1000 | b_root:fill=1.0000;filled=1;overflow=10.3234
			k=0.1: b_A:fill=1.0000;filled=1;overflow=0.3818 | b_A1:fill=1.0000;filled=1;overflow=0.6100 | b_A2:fill=1.0000;filled=1;overflow=0.5500 | b_B:fill=1.0000;filled=1;overflow=0.1000 | b_root:fill=0.0627;filled=0;overflow=0.0000
			k=0.01: b_A:fill=0.0000;filled=0;overflow=0.0000 | b_A1:fill=0.2245;filled=0;overflow=0.0000 | b_A2:fill=0.2571;filled=0;overflow=0.0000 | b_B:fill=0.1250;filled=0;overflow=0.0000 | b_root:fill=0.0000;filled=0;overflow=0.0000
			k=0.001: b_A:fill=0.0000;filled=0;overflow=0.0000 | b_A1:fill=0.0224;filled=0;overflow=0.0000 | b_A2:fill=0.0257;filled=0;overflow=0.0000 | b_B:fill=0.0125;filled=0;overflow=0.0000 | b_root:fill=0.0000;filled=0;overflow=0.0000
			k=0.0001: b_A:fill=0.0000;filled=0;overflow=0.0000 | b_A1:fill=0.0022;filled=0;overflow=0.0000 | b_A2:fill=0.0026;filled=0;overflow=0.0000 | b_B:fill=0.0012;filled=0;overflow=0.0000 | b_root:fill=0.0000;filled=0;overflow=0.0000"
		`);
	});
});
