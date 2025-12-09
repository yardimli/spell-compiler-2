import * as BABYLON from 'babylonjs';

export const initGameSceneAltRecording = () => {
	return {
		freezeEnemies: (enemies) => {
			// Cleanup invalid aggregates
			for (let i = enemies.length - 1; i >= 0; i--) {
				const enemy = enemies[i];
				if (!enemy || !enemy.agg || !enemy.agg.body || !enemy.mesh || enemy.mesh.isDisposed()) {
					enemies.splice(i, 1);
				}
			}
			
			// Apply Static State
			enemies.forEach(enemy => {
				if (enemy && enemy.agg && enemy.agg.body) {
					enemy.isFrozen = true;
					// Stop movement immediately
					enemy.agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
					enemy.agg.body.setAngularVelocity(BABYLON.Vector3.Zero());
					
					// Set to STATIC so they are immovable by the player (like walls)
					enemy.agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
				}
			});
		}
	};
};
