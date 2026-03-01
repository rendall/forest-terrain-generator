import type { JsonObject } from "../domain/types.js";

export const APPENDIX_A_DEFAULTS: JsonObject = {
	heightNoise: {
		octaves: 5,
		baseFrequency: 0.035,
		lacunarity: 2.0,
		persistence: 0.5,
	},
	roughnessNoise: {
		octaves: 3,
		baseFrequency: 0.06,
		lacunarity: 2.0,
		persistence: 0.55,
	},
	vegVarianceNoise: {
		octaves: 4,
		baseFrequency: 0.045,
		lacunarity: 2.0,
		persistence: 0.5,
		strength: 0.12,
	},
	topography: {
		structure: {
			enabled: true,
			connectivity: "dir8",
			hEps: 0.000001,
			persistenceMin: 0.01,
			unresolvedPolicy: "nan",
		},
	},
};
