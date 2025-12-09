import * as BABYLON from 'babylonjs';
export const initGamePlayer = (scene, shadowGenerator, cameraManager) => {
	const playerHeight = 4;
	const playerRadius = 1;
	
	// 1. Player Root (Physics Body) - Invisible
	const playerRoot = BABYLON.MeshBuilder.CreateCapsule('playerRoot', { height: playerHeight, radius: playerRadius }, scene);
	playerRoot.position.set(0, 5, 0);
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
	cap.position.set(0, 1.5, 0.6);
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

// --- Controls ---
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
		}
	});
	
	const speed = 8.0;
	const jumpForce = 6.0;
	const rotationSpeed = 0.05;

// --- Waypoint System ---
	let waypoints = [];
	const onWaypointsChanged = new BABYLON.Observable();
	
	let isInputEnabled = true;
	let isMoving = false;

// --- Time Recording ---
	let recordedTime = 0;
	const MAX_RECORDING_TIME = 5.0;
	const FIRE_COST = 0.5; // Time cost for firing

// --- Replay State ---
	let animationState = 'NONE'; // 'NONE', 'REWIND', 'REPLAY'
	
	let rewindState = {
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		endPos: new BABYLON.Vector3(),
		endRot: 0,
		startTime: 0,
		duration: 2.0,
		onComplete: null
	};
	
	let replayState = {
		currentIndex: 0,
		startTime: 0,
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		segmentDuration: 0,
		isFiring: false,
		fireCallback: null,
		onComplete: null,
		onProgress: null
	};

// --- Helper: Add Waypoint ---
	const addWaypoint = (type, data = {}) => {
		// --- CHANGED: Apply cost for actions ---
		if (type === 'FIRE') {
			recordedTime += FIRE_COST;
			if (recordedTime > MAX_RECORDING_TIME) recordedTime = MAX_RECORDING_TIME;
		}
		
		// Calculate duration of the *previous* segment
		if (waypoints.length > 0) {
			const lastWp = waypoints[waypoints.length - 1];
			// Duration is the difference between current recorded time and previous timestamp
			// Note: If we just stood still, recordedTime didn't change, so duration is 0 (correct)
			lastWp.duration = recordedTime - lastWp.timestamp;
		}
		
		const wp = {
			type: type,
			position: playerRoot.absolutePosition.clone(),
			rotation: playerVisual.rotation.y,
			timestamp: recordedTime,
			duration: 0, // Will be filled by next waypoint
			...data
		};
		
		waypoints.push(wp);
		onWaypointsChanged.notifyObservers(waypoints);
	};

// --- Helper: Remove Waypoint (Undo) ---
	const removeWaypoint = (index) => {
		if (index <= 0 || index !== waypoints.length - 1) return;
		
		waypoints.splice(index, 1);
		const newLastWp = waypoints[waypoints.length - 1];
		
		// Reset State to Previous Block
		recordedTime = newLastWp.timestamp;
		
		// --- CHANGED: Teleport Dynamic Body Correctly ---
		// 1. Temporarily allow the Mesh to drive the Physics Body
		// This prevents the physics engine from overwriting our manual position change
		playerAgg.body.disablePreStep = false;
		
		// 2. Move the Mesh to the target position
		playerRoot.position.copyFrom(newLastWp.position);
		
		// 3. Reset velocities to stop any previous momentum
		playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
		playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
		
		// 4. Restore visual rotation
		playerVisual.rotation.y = newLastWp.rotation;
		
		// 5. Re-enable Physics driving the Mesh
		// We must wait for one physics step to occur so the body picks up the new position
		// from the mesh before we hand control back to the physics engine.
		scene.onAfterPhysicsObservable.addOnce(() => {
			if (playerAgg.body) {
				playerAgg.body.disablePreStep = true;
			}
		});
		
		newLastWp.duration = 0;
		isInputEnabled = true;
		
		onWaypointsChanged.notifyObservers(waypoints);
	};

// --- Main Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		// 1. REWIND LOGIC
		if (animationState === 'REWIND') {
			const now = performance.now();
			const t = Math.min((now - rewindState.startTime) / (rewindState.duration * 1000), 1.0);
			const smoothT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
			
			const curPos = BABYLON.Vector3.Lerp(rewindState.startPos, rewindState.endPos, smoothT);
			const curRot = BABYLON.Scalar.LerpAngle(rewindState.startRot, rewindState.endRot, smoothT);
			
			playerAgg.body.setTargetTransform(curPos, playerRoot.rotationQuaternion);
			playerVisual.rotation.y = curRot;
			
			if (t >= 1.0) {
				animationState = 'REPLAY';
				playerMat.alpha = 1.0;
				if (rewindState.onComplete) rewindState.onComplete();
				replayState.currentIndex = 0;
				setupReplaySegment(0);
			}
			return;
		}
		
		// 2. REPLAY LOGIC
		if (animationState === 'REPLAY') {
			processReplayLoop();
			return;
		}
		
		// 3. INPUT / RECORDING LOGIC
		if (!isInputEnabled) {
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			return;
		}
		
		// Check if we hit the limit
		if (recordedTime >= MAX_RECORDING_TIME) {
			// If we were moving and hit the limit, record the final spot
			if (isMoving) {
				isMoving = false;
				addWaypoint('MOVE');
			}
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			return; // Stop processing input
		}
		
		handleInputAndRecording();
	});

// --- Input Handler ---
	const handleInputAndRecording = () => {
		const camera = cameraManager.getActiveCamera();
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		cap.setEnabled(!isFirstPerson);
		
		let moveDir = new BABYLON.Vector3(0, 0, 0);
		let hasInput = false;
		
		// Calculate Move Direction
		if (isFirstPerson) {
			if (inputMap['a']) playerVisual.rotation.y -= rotationSpeed;
			if (inputMap['d']) playerVisual.rotation.y += rotationSpeed;
			
			const forward = playerVisual.getDirection(BABYLON.Vector3.Forward());
			forward.y = 0; forward.normalize();
			const right = playerVisual.getDirection(BABYLON.Vector3.Right());
			right.y = 0; right.normalize();
			
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['e']) ? 1 : 0; x -= (inputMap['q']) ? 1 : 0;
			moveDir = forward.scale(z).add(right.scale(x));
			if (z !== 0 || x !== 0) hasInput = true;
		} else {
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			
			if (z !== 0 || x !== 0) {
				hasInput = true;
				const camForward = camera.getDirection(BABYLON.Vector3.Forward());
				camForward.y = 0; camForward.normalize();
				const camRight = camera.getDirection(BABYLON.Vector3.Right());
				camRight.y = 0; camRight.normalize();
				moveDir = camForward.scale(z).add(camRight.scale(x));
			}
		}
		
		// Jump Input
		const isJumping = inputMap[' '];
		if (isJumping) hasInput = true;
		
		// --- CHANGED: Only increment time if input is active ---
		if (hasInput) {
			const dt = scene.getEngine().getDeltaTime() / 1000;
			recordedTime += dt;
			if (recordedTime > MAX_RECORDING_TIME) recordedTime = MAX_RECORDING_TIME;
		}
		
		if (moveDir.length() > 0) moveDir.normalize();
		
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		const targetVelocity = moveDir.scale(speed);
		
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		let yVel = currentVel.y;
		if (isJumping && hit.hit) yVel = jumpForce;
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
		
		if (!isFirstPerson && moveDir.lengthSquared() > 0.01) {
			const targetRotation = Math.atan2(moveDir.x, moveDir.z);
			playerVisual.rotation.y = BABYLON.Scalar.LerpAngle(playerVisual.rotation.y, targetRotation, 0.2);
		}
		
		// --- Recording Logic ---
		if (hasInput) {
			isMoving = true;
		} else {
			if (isMoving) {
				// Player just stopped
				// Check if we actually moved (velocity check) or just released keys
				if (currentVel.length() < 0.5) {
					isMoving = false;
					addWaypoint('MOVE');
				}
			}
		}
	};

// --- Replay Logic Implementation ---
	const setupReplaySegment = (index) => {
		if (index >= waypoints.length - 1) {
			animationState = 'NONE';
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
			if (replayState.onComplete) replayState.onComplete();
			return;
		}
		
		const currentWp = waypoints[index];
		const nextWp = waypoints[index + 1];
		
		replayState.currentIndex = index;
		replayState.startTime = performance.now();
		replayState.startPos.copyFrom(currentWp.position);
		replayState.startRot = currentWp.rotation;
		replayState.segmentDuration = Math.max(currentWp.duration, 0.01);
		
		if (replayState.onProgress) replayState.onProgress(index);
		
		replayState.isFiring = (nextWp.type === 'FIRE');
	};
	
	const processReplayLoop = () => {
		const now = performance.now();
		const elapsed = (now - replayState.startTime) / 1000;
		const t = Math.min(elapsed / replayState.segmentDuration, 1.0);
		
		const currentWp = waypoints[replayState.currentIndex];
		const nextWp = waypoints[replayState.currentIndex + 1];
		
		const smoothT = t * t * (3 - 2 * t);
		const curPos = BABYLON.Vector3.Lerp(replayState.startPos, nextWp.position, smoothT);
		const curRot = BABYLON.Scalar.LerpAngle(replayState.startRot, nextWp.rotation, smoothT);
		
		playerAgg.body.setTargetTransform(curPos, playerRoot.rotationQuaternion);
		playerVisual.rotation.y = curRot;
		
		if (t >= 1.0) {
			if (nextWp.type === 'FIRE') {
				if (replayState.fireCallback) {
					replayState.fireCallback(nextWp);
				}
			}
			setupReplaySegment(replayState.currentIndex + 1);
		}
	};
	
	return {
		playerRoot,
		playerVisual,
		onWaypointsChanged,
		getRecordedTime: () => recordedTime,
		MAX_RECORDING_TIME,
		FIRE_COST,
		
		startTurn: () => {
			isInputEnabled = true;
			isMoving = false;
			waypoints = [];
			recordedTime = 0;
			addWaypoint('MOVE', { timestamp: 0 });
		},
		
		disableInput: () => {
			isInputEnabled = false;
		},
		
		addWaypoint,
		removeWaypoint,
		
		resolveTurnWithWaypoints: (fireCallback, onReplayStart, onComplete, onProgress) => {
			// 1. Finalize Recording
			const lastWp = waypoints[waypoints.length - 1];
			if (lastWp) {
				lastWp.duration = recordedTime - lastWp.timestamp;
			}
			
			// --- NEW: Add Idle/Wait Block if time remains ---
			const remaining = MAX_RECORDING_TIME - recordedTime;
			// Use a small epsilon to avoid creating blocks for micro-fractions
			if (remaining > 0.01) {
				// Create a start point for the wait segment
				// It shares the position/rotation of the last waypoint
				const waitStart = {
					type: 'WAIT',
					position: lastWp ? lastWp.position.clone() : playerRoot.absolutePosition.clone(),
					rotation: lastWp ? lastWp.rotation : playerVisual.rotation.y,
					timestamp: recordedTime,
					duration: remaining
				};
				
				// Create the end point
				const waitEnd = {
					type: 'WAIT',
					position: waitStart.position.clone(),
					rotation: waitStart.rotation,
					timestamp: MAX_RECORDING_TIME,
					duration: 0
				};
				
				// If there was a previous waypoint, its duration to the waitStart is 0
				// (Since waitStart is at the same time as recordedTime)
				if (lastWp) {
					lastWp.duration = 0;
				}
				
				waypoints.push(waitStart);
				waypoints.push(waitEnd);
				
				// Update recorded time to full
				recordedTime = MAX_RECORDING_TIME;
			}
			// ------------------------------------------------
			
			onWaypointsChanged.notifyObservers(waypoints);
			
			// 2. Physics Reset
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
			
			// 3. Setup Rewind
			animationState = 'REWIND';
			playerMat.alpha = 0.5;
			
			rewindState.startPos.copyFrom(playerRoot.absolutePosition);
			rewindState.startRot = playerVisual.rotation.y;
			
			if (waypoints.length > 0) {
				rewindState.endPos.copyFrom(waypoints[0].position);
				rewindState.endRot = waypoints[0].rotation;
			} else {
				rewindState.endPos.copyFrom(rewindState.startPos);
			}
			
			rewindState.startTime = performance.now();
			rewindState.onComplete = onReplayStart;
			
			// 4. Setup Replay Callbacks
			replayState.fireCallback = fireCallback;
			replayState.onComplete = () => {
				playerMat.alpha = 1.0;
				onComplete();
			};
			replayState.onProgress = onProgress;
		}
	};
};
