import * as BABYLON from 'babylonjs';

export const initGameSceneAltPlayback = () => {
	return {
		unfreezeEnemies: (enemies) => {
			// Cleanup invalid aggregates
			for (let i = enemies.length - 1; i >= 0; i--) {
				const enemy = enemies[i];
				if (!enemy || !enemy.agg || !enemy.agg.body || !enemy.mesh || enemy.mesh.isDisposed()) {
					enemies.splice(i, 1);
				}
			}
			
			// Apply Dynamic State
			enemies.forEach(enemy => {
				if (enemy && enemy.agg && enemy.agg.body) {
					enemy.isFrozen = false;
					enemy.agg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
					
					// Force wake up
					if (enemy.agg.body.setActivationState) {
						enemy.agg.body.setActivationState(BABYLON.PhysicsActivationState.ACTIVE);
					} else {
						// Small impulse to wake up
						enemy.agg.body.applyImpulse(new BABYLON.Vector3(0, -0.001, 0), enemy.mesh.absolutePosition);
					}
				}
			});
		}
	};
};
