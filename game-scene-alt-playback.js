import * as BABYLON from 'babylonjs';

export const initGameSceneAltPlayback = () => {
	return {
		unfreezeBalls: (ballAggregates) => {
			// Cleanup invalid aggregates
			for (let i = ballAggregates.length - 1; i >= 0; i--) {
				const agg = ballAggregates[i];
				if (!agg || !agg.body || !agg.transformNode || agg.transformNode.isDisposed()) {
					ballAggregates.splice(i, 1);
				}
			}
			
			// Apply Dynamic State
			ballAggregates.forEach(agg => {
				if (agg && agg.body) {
					agg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
					
					// Force wake up
					if (agg.body.setActivationState) {
						agg.body.setActivationState(BABYLON.PhysicsActivationState.ACTIVE);
					} else {
						agg.body.applyImpulse(new BABYLON.Vector3(0, -0.001, 0), agg.transformNode.absolutePosition);
					}
				}
			});
		}
	};
};
