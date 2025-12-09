import * as BABYLON from 'babylonjs';
import { initGamePlayerRecording } from './game-player-recording';
import { initGamePlayerPlayback } from './game-player-playback';
export const initGamePlayer = (scene, shadowGenerator, cameraManager, startPosVector) => {
	const playerHeight = 8;
	const playerRadius = 2.2;
	
	// 1. Player Root (Physics Body) - Invisible
	const playerRoot = BABYLON.MeshBuilder.CreateCapsule('playerRoot', { height: playerHeight, radius: playerRadius }, scene);

// Use provided start position or default
	const startPosition = startPosVector ? startPosVector.clone() : new BABYLON.Vector3(0, 1.5, -12);
// Ensure height is correct
	startPosition.y = 1.5;
	
	playerRoot.position.copyFrom(startPosition);
	playerRoot.visibility = 0;

// 2. Player Visual (Visible Mesh) - Child of Root
	const playerVisual = BABYLON.MeshBuilder.CreateCapsule('playerVisual', { height: playerHeight, radius: playerRadius }, scene);
	playerVisual.parent = playerRoot;
	
	const playerMat = new BABYLON.StandardMaterial('playerMat', scene);
	playerMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0);
	playerVisual.material = playerMat;
	shadowGenerator.addShadowCaster(playerVisual);

// Direction Indicator
	const cap = BABYLON.MeshBuilder.CreateBox('playerCap', { width: 0.8, height: 0.2, depth: 0.5 }, scene);
	cap.parent = playerVisual;
	cap.position.set(0, 1.5, playerRadius - 0.2);
	const capMat = new BABYLON.StandardMaterial('capMat', scene);
	capMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.3);
	cap.material = capMat;
	shadowGenerator.addShadowCaster(cap);

// 3. Physics
	const playerAgg = new BABYLON.PhysicsAggregate(
		playerRoot,
		BABYLON.PhysicsShapeType.CAPSULE,
		{ mass: 1, friction: 0, restitution: 0 },
		scene
	);
	playerAgg.body.setMassProperties({ inertia: new BABYLON.Vector3(0, 0, 0) });

// --- Configuration ---
	const config = {
		speed: 8.0,
		jumpForce: 6.0,
		rotationSpeed: 0.05,
		playerHeight,
		MAX_RECORDING_TIME: 5.0,
		FIRE_COST: 0.5
	};

// --- Initialize Sub-Modules ---
	const recordingModule = initGamePlayerRecording(scene, playerRoot, playerVisual, playerAgg, cameraManager, config);
	const playbackModule = initGamePlayerPlayback(scene, playerRoot, playerVisual, playerAgg, playerMat);

// --- Win Condition Callback ---
	let onWinCallback = null;

// --- Main Loop ---
	scene.onBeforeRenderObservable.add(() => {
		const state = playbackModule.getState();
		
		if (state === 'NONE') {
			// Recording / Input Phase
			recordingModule.update();
		} else {
			// Playback Phase
			playbackModule.update();
		}
		
		// Check if inside Ghost Pen (Win Condition)
		// Pen area approx: x[-3, 3], z[-2, 2]
		if (onWinCallback) {
			const pos = playerRoot.absolutePosition;
			if (pos.x > -2 && pos.x < 2 && pos.z > -1 && pos.z < 1) {
				onWinCallback();
			}
		}
	});

// --- Public API ---
	return {
		playerRoot,
		playerVisual,
		
		// Expose Recording API
		onWaypointsChanged: recordingModule.onWaypointsChanged,
		getRecordedTime: recordingModule.getRecordedTime,
		addWaypoint: recordingModule.addWaypoint,
		removeWaypoint: recordingModule.removeWaypoint,
		startTurn: recordingModule.reset,
		disableInput: recordingModule.disableInput,
		
		// Constants
		MAX_RECORDING_TIME: config.MAX_RECORDING_TIME,
		FIRE_COST: config.FIRE_COST,
		
		// Orchestration
		resolveTurnWithWaypoints: (fireCallback, onReplayStart, onComplete, onProgress) => {
			const finalWaypoints = recordingModule.finalizeWaypoints();
			playbackModule.startSequence(finalWaypoints, fireCallback, onReplayStart, onComplete, onProgress);
		},
		
		// Respawn Logic
		respawn: () => {
			// Reset position
			playerAgg.body.disablePreStep = false;
			playerRoot.position.copyFrom(startPosition);
			playerRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
			playerVisual.rotation.y = 0;
			
			// Reset Physics
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
			
			// Reset Recording State
			recordingModule.reset();
			
			// Ensure physics sync
			scene.onAfterPhysicsObservable.addOnce(() => {
				if (playerAgg.body) {
					playerAgg.body.disablePreStep = true;
				}
			});
		},
		
		setOnWin: (cb) => { onWinCallback = cb; },
		
		// --- NEW: Expose Playback State ---
		getPlaybackState: () => playbackModule.getState()
	};
};
