import * as BABYLON from 'babylonjs';

export const initGameSceneAltPlayback = () => {
	return {
		unfreezeGhosts: (ghosts) => {
			// Cleanup invalid aggregates
			for (let i = ghosts.length - 1; i >= 0; i--) {
				const ghost = ghosts[i];
				if (!ghost || !ghost.agg || !ghost.agg.body || !ghost.mesh || ghost.mesh.isDisposed()) {
					ghosts.splice(i, 1);
				}
			}
			
			// Apply Dynamic State
			ghosts.forEach(ghost => {
				if (ghost && ghost.agg && ghost.agg.body) {
					ghost.isFrozen = false;
					ghost.agg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
					
					// Force wake up
					if (ghost.agg.body.setActivationState) {
						ghost.agg.body.setActivationState(BABYLON.PhysicsActivationState.ACTIVE);
					} else {
						// Small impulse to wake up
						ghost.agg.body.applyImpulse(new BABYLON.Vector3(0, -0.001, 0), ghost.mesh.absolutePosition);
					}
				}
			});
		}
	};
};
