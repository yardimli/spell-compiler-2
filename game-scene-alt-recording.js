import * as BABYLON from 'babylonjs';

export const initGameSceneAltRecording = () => {
	return {
		freezeBalls: (ballAggregates) => {
			// Cleanup invalid aggregates
			for (let i = ballAggregates.length - 1; i >= 0; i--) {
				const agg = ballAggregates[i];
				if (!agg || !agg.body || !agg.transformNode || agg.transformNode.isDisposed()) {
					ballAggregates.splice(i, 1);
				}
			}
			
			// Apply Static State
			ballAggregates.forEach(agg => {
				if (agg && agg.body) {
					agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
				}
			});
		}
	};
};
