import * as BABYLON from 'babylonjs';

export const initGameSceneAltRecording = () => {
	return {
		freezeGhosts: (ghosts) => {
			// Cleanup invalid aggregates
			for (let i = ghosts.length - 1; i >= 0; i--) {
				const ghost = ghosts[i];
				if (!ghost || !ghost.agg || !ghost.agg.body || !ghost.mesh || ghost.mesh.isDisposed()) {
					ghosts.splice(i, 1);
				}
			}
			
			// Apply Static State
			ghosts.forEach(ghost => {
				if (ghost && ghost.agg && ghost.agg.body) {
					ghost.isFrozen = true;
					// Stop movement immediately
					ghost.agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
					ghost.agg.body.setAngularVelocity(BABYLON.Vector3.Zero());
					
					// Set to STATIC so they are immovable by the player (like walls)
					ghost.agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
				}
			});
		}
	};
};
