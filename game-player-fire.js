import * as BABYLON from 'babylonjs';
import {initGamePlayerFireRecording} from './game-player-fire-recording';
import {initGamePlayerFirePlayback} from './game-player-fire-playback';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager, playerManager) => {
	const bullets = [];
	
	// Initialize Sub-Modules
	const recordingModule = initGamePlayerFireRecording(scene, playerVisual, cameraManager, playerManager);
	const playbackModule = initGamePlayerFirePlayback(scene, shadowGenerator);
	
	// --- Bridge: Ghost Bullet ---
	// Recording module triggers this, which calls Playback module's spawn logic with isReal=false
	recordingModule.setOnFireGhost((power) => {
		recordingModule.fireGhostBullet(power, (isReal, p, pos, rot, target) => {
			playbackModule.spawnBullet(isReal, p, pos, rot, target, bullets);
		});
	});
	
	// --- Bridge: Real Bullet ---
	// Called by Main Loop during Replay
	const fireRealBullet = (waypointData) => {
		const spawnPos = playerVisual.absolutePosition.clone();
		playbackModule.spawnBullet(true, waypointData.power, spawnPos, waypointData.rotation, waypointData.target, bullets);
	};
	
	// --- Update Loop (Bullet Cleanup & UI) ---
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		// Cleanup bullets
		for (let i = bullets.length - 1; i >= 0; i--) {
			const b = bullets[i];
			b.age += dt;
			if (b.isDead || b.age > 5.0) {
				b.agg.dispose();
				b.mesh.dispose();
				bullets.splice(i, 1);
			}
		}
		
		// Update Recording UI
		recordingModule.update();
	});
	
	return {
		setTurnActive: recordingModule.setTurnActive,
		fireFromWaypoint: fireRealBullet
	};
};
