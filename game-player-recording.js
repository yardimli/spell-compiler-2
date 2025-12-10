import * as BABYLON from 'babylonjs';

export const initGamePlayerRecording = (scene, playerRoot, playerVisual, playerAgg, cameraManager, config) => {
	const {speed, jumpForce, rotationSpeed, playerHeight, MAX_RECORDING_TIME, FIRE_COST} = config;
	
	// State
	let inputMap = {};
	let waypoints = [];
	let recordedTime = 0;
	let isMoving = false;
	let isInputEnabled = true;
	// Track rotation state for snapping logic
	let isRotating = false;
	
	// Observable for UI updates
	const onWaypointsChanged = new BABYLON.Observable();
	
	// --- Input Listeners ---
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
		}
	});
	
	// --- Waypoint Management ---
	const addWaypoint = (type, data = {}) => {
		// Apply cost for actions
		if (type === 'FIRE') {
			recordedTime += FIRE_COST;
			if (recordedTime > MAX_RECORDING_TIME) recordedTime = MAX_RECORDING_TIME;
		}
		
		// Calculate duration of the previous segment
		if (waypoints.length > 0) {
			const lastWp = waypoints[waypoints.length - 1];
			lastWp.duration = recordedTime - lastWp.timestamp;
		}
		
		const wp = {
			type: type,
			position: playerRoot.absolutePosition.clone(),
			rotation: playerVisual.rotation.y, // Records current rotation
			timestamp: recordedTime,
			duration: 0,
			...data
		};
		
		waypoints.push(wp);
		onWaypointsChanged.notifyObservers(waypoints);
	};
	
	const removeWaypoint = (index) => {
		if (index <= 0 || index !== waypoints.length - 1) return;
		
		waypoints.splice(index, 1);
		const newLastWp = waypoints[waypoints.length - 1];
		
		// Reset State to Previous Block
		recordedTime = newLastWp.timestamp;
		
		// Teleport Dynamic Body Correctly
		playerAgg.body.disablePreStep = false;
		playerRoot.position.copyFrom(newLastWp.position);
		playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
		playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
		playerVisual.rotation.y = newLastWp.rotation;
		
		scene.onAfterPhysicsObservable.addOnce(() => {
			if (playerAgg.body) {
				playerAgg.body.disablePreStep = true;
			}
		});
		
		newLastWp.duration = 0;
		isInputEnabled = true;
		onWaypointsChanged.notifyObservers(waypoints);
	};
	
	// --- Update Loop (Input Handling) ---
	const update = () => {
		if (!isInputEnabled || !playerAgg.body) {
			if (playerAgg.body) playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			return;
		}
		
		// Check time limit
		if (recordedTime >= MAX_RECORDING_TIME) {
			if (isMoving) {
				isMoving = false;
				addWaypoint('MOVE');
			}
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			return;
		}
		
		const camera = cameraManager.getActiveCamera();
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		// Hide/Show Cap based on camera
		const cap = playerVisual.getChildren().find(m => m.name === 'playerCap');
		if (cap) cap.setEnabled(!isFirstPerson);
		
		let moveDir = new BABYLON.Vector3(0, 0, 0);
		let hasInput = false;
		
		// --- Rotation & Movement Logic ---
		if (isFirstPerson) {
			// First Person: A/D Rotate, W/S Move Forward/Back, Q/E Strafe
			if (inputMap['a']) playerVisual.rotation.y -= rotationSpeed;
			if (inputMap['d']) playerVisual.rotation.y += rotationSpeed;
			
			const forward = playerVisual.getDirection(BABYLON.Vector3.Forward());
			forward.y = 0;
			forward.normalize();
			const right = playerVisual.getDirection(BABYLON.Vector3.Right());
			right.y = 0;
			right.normalize();
			
			let z = (inputMap['w']) ? 1 : 0;
			z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['e']) ? 1 : 0;
			x -= (inputMap['q']) ? 1 : 0;
			
			// Check rotation input for recording
			if (inputMap['a'] || inputMap['d']) hasInput = true;
			
			moveDir = forward.scale(z).add(right.scale(x));
			if (z !== 0 || x !== 0) hasInput = true;
		} else {
			// Third Person: Tank Controls
			// A/D Rotates the player
			// W/S Moves player Forward/Backward relative to facing
			
			// 1. Handle Rotation
			let rotInput = 0;
			if (inputMap['d']) rotInput += 1;
			if (inputMap['a']) rotInput -= 1;
			
			// Check for Shift key (Free Rotation Mode)
			const isFreeRotation = inputMap['shift'];
			
			if (rotInput !== 0) {
				playerVisual.rotation.y += rotInput * rotationSpeed;
				hasInput = true;
				isRotating = true;
			} else if (isRotating) {
				// Rotation key released this frame
				isRotating = false;
				if (!isFreeRotation) {
					// Align with track: Snap to nearest 90 degrees (PI/2)
					const snapInterval = Math.PI / 2;
					playerVisual.rotation.y = Math.round(playerVisual.rotation.y / snapInterval) * snapInterval;
				}
			}
			
			// 2. Handle Movement (Relative to Player Facing)
			let z = (inputMap['w']) ? 1 : 0;
			z -= (inputMap['s']) ? 1 : 0;
			
			if (z !== 0) {
				hasInput = true;
				const forward = playerVisual.getDirection(BABYLON.Vector3.Forward());
				forward.y = 0;
				forward.normalize();
				moveDir = forward.scale(z);
			}
		}
		
		const isJumping = inputMap[' '];
		if (isJumping) hasInput = true;
		
		// Time Accumulation
		if (hasInput) {
			const dt = scene.getEngine().getDeltaTime() / 1000;
			recordedTime += dt;
			if (recordedTime > MAX_RECORDING_TIME) recordedTime = MAX_RECORDING_TIME;
		}
		
		// Physics Application
		if (moveDir.length() > 0) moveDir.normalize();
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		const targetVelocity = moveDir.scale(speed);
		
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		let yVel = currentVel.y;
		if (isJumping && hit.hit) yVel = jumpForce;
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
		
		// Waypoint Logic
		if (hasInput) {
			isMoving = true;
		} else {
			if (isMoving) {
				// Stop recording block when input stops
				// This captures the final rotation and position after the move/turn
				if (currentVel.length() < 0.5) {
					isMoving = false;
					addWaypoint('MOVE');
				}
			}
		}
	};
	
	return {
		update,
		addWaypoint,
		removeWaypoint,
		onWaypointsChanged,
		getRecordedTime: () => recordedTime,
		getWaypoints: () => waypoints,
		reset: () => {
			isInputEnabled = true;
			isMoving = false;
			waypoints = [];
			recordedTime = 0;
			isRotating = false;
			addWaypoint('MOVE', {timestamp: 0});
		},
		disableInput: () => {
			isInputEnabled = false;
		},
		finalizeWaypoints: () => {
			// Close last waypoint duration
			const lastWp = waypoints[waypoints.length - 1];
			if (lastWp) {
				lastWp.duration = recordedTime - lastWp.timestamp;
			}
			
			// Add Wait Block if time remains
			const remaining = MAX_RECORDING_TIME - recordedTime;
			if (remaining > 0.01) {
				const waitStart = {
					type: 'WAIT',
					position: lastWp ? lastWp.position.clone() : playerRoot.absolutePosition.clone(),
					rotation: lastWp ? lastWp.rotation : playerVisual.rotation.y,
					timestamp: recordedTime,
					duration: remaining
				};
				const waitEnd = {
					type: 'WAIT',
					position: waitStart.position.clone(),
					rotation: waitStart.rotation,
					timestamp: MAX_RECORDING_TIME,
					duration: 0
				};
				if (lastWp) lastWp.duration = 0;
				waypoints.push(waitStart);
				waypoints.push(waitEnd);
				recordedTime = MAX_RECORDING_TIME;
			}
			onWaypointsChanged.notifyObservers(waypoints);
			return waypoints;
		}
	};
};
