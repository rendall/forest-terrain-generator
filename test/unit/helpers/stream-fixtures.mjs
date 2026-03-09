import { createGridShape } from "../../../src/domain/topography.js";

export const createStreamFixture = ({ width, height, hValues, faValues }) => {
	const shape = createGridShape(width, height);
	return {
		shape,
		h: new Float32Array(hValues),
		fa: new Uint32Array(faValues),
	};
};
