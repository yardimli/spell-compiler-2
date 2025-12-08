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
	// Structure: { type: 'MOVE'|'FIRE', position: Vector3, rotation: float, power?: number, target?: Mesh }
	let waypoints = [];
	const onWaypointsChanged = new BABYLON.Observable();
	
	let isInputEnabled = true;
	let isMoving = false; // Track if we are currently processing movement input
	
	// --- Replay State ---
	let animationState = 'NONE'; // 'NONE', 'REWIND', 'REPLAY'
	
	// Rewind: Simple lerp back to start
	let rewindState = {
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		endPos: new BABYLON.Vector3(),
		endRot: 0,
		startTime: 0,
		duration: 2.0,
		onComplete: null
	};
	
	// Replay: Complex waypoint traversal
	let replayState = {
		currentIndex: 0,
		startTime: 0,
		startPos: new BABYLON.Vector3(), // Position at start of current segment
		startRot: 0, // Rotation at start of current segment
		segmentDuration: 0,
		isFiring: false, // Flag if we are in the "wait for fire" pause
		fireCallback: null,
		onComplete: null,
		onProgress: null // Update UI
	};
	
	const MOVEMENT_SPEED_REPLAY = 10.0; // Units per second
	
	// --- Helper: Add Waypoint ---
	const addWaypoint = (type, data = {}) => {
		const wp = {
			type: type,
			position: playerRoot.absolutePosition.clone(),
			rotation: playerVisual.rotation.y,
			...data
		};
		waypoints.push(wp);
		onWaypointsChanged.notifyObservers(waypoints);
	};
	
	// --- Helper: Remove Waypoint ---
	const removeWaypoint = (index) => {
		if (index <= 0 || index >= waypoints.length) return; // Cannot remove start point
		waypoints.splice(index, 1);
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
				// --- FIX START: Reset Opacity ---
				// Player has returned to start. Reset alpha to 1.0 so they look solid during replay.
				playerMat.alpha = 1.0;
				// --- FIX END ---
				
				if (rewindState.onComplete) rewindState.onComplete();
				
				// Init Replay
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
		
		handleInputAndRecording();
	});
	
	// --- Input Handler ---
	const handleInputAndRecording = () => {
		const camera = cameraManager.getActiveCamera();
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		// Visibility of cap
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
			// Follow/Free Cam
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
		
		if (moveDir.length() > 0) moveDir.normalize();
		
		// Physics Movement
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		const targetVelocity = moveDir.scale(speed);
		
		// Jump
		const isJumping = inputMap[' '];
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		let yVel = currentVel.y;
		if (isJumping && hit.hit) yVel = jumpForce;
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
		
		// Rotation (Third Person)
		if (!isFirstPerson && moveDir.lengthSquared() > 0.01) {
			const targetRotation = Math.atan2(moveDir.x, moveDir.z);
			playerVisual.rotation.y = BABYLON.Scalar.LerpAngle(playerVisual.rotation.y, targetRotation, 0.2);
		}
		
		// --- Recording Logic ---
		// Detect state change: Moving -> Stopped
		if (hasInput) {
			isMoving = true;
		} else {
			if (isMoving) {
				// Just stopped moving. Record a waypoint.
				// We check velocity to ensure they actually stopped or just released keys
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
			// End of replay
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
		
		// Notify UI
		if (replayState.onProgress) replayState.onProgress(index);
		
		// Logic based on Next Waypoint Type
		if (nextWp.type === 'MOVE') {
			const dist = BABYLON.Vector3.Distance(currentWp.position, nextWp.position);
			// Calculate duration based on speed
			replayState.segmentDuration = Math.max(dist / MOVEMENT_SPEED_REPLAY, 0.5); // Min 0.5s
			replayState.isFiring = false;
		} else if (nextWp.type === 'FIRE') {
			// It's a fire action. We stay at current pos, rotate to fire angle, fire, then wait.
			replayState.segmentDuration = 1.0; // Time to aim
			replayState.isFiring = true;
		}
	};
	
	const processReplayLoop = () => {
		const now = performance.now();
		const elapsed = (now - replayState.startTime) / 1000;
		const t = Math.min(elapsed / replayState.segmentDuration, 1.0);
		
		const currentWp = waypoints[replayState.currentIndex];
		const nextWp = waypoints[replayState.currentIndex + 1];
		
		if (nextWp.type === 'MOVE') {
			// Interpolate Position
			const smoothT = t * t * (3 - 2 * t);
			const curPos = BABYLON.Vector3.Lerp(replayState.startPos, nextWp.position, smoothT);
			
			// Interpolate Rotation (Start Angle -> End Angle)
			const curRot = BABYLON.Scalar.LerpAngle(replayState.startRot, nextWp.rotation, smoothT);
			
			playerAgg.body.setTargetTransform(curPos, playerRoot.rotationQuaternion);
			playerVisual.rotation.y = curRot;
			
			if (t >= 1.0) {
				setupReplaySegment(replayState.currentIndex + 1);
			}
		} else if (nextWp.type === 'FIRE') {
			// Rotate towards the shot direction
			const smoothT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
			
			// We stay at startPos (which is currentWp.position)
			playerAgg.body.setTargetTransform(replayState.startPos, playerRoot.rotationQuaternion);
			
			// Rotate from movement angle to shot angle
			const curRot = BABYLON.Scalar.LerpAngle(replayState.startRot, nextWp.rotation, smoothT);
			playerVisual.rotation.y = curRot;
			
			if (t >= 1.0) {
				// Fire!
				if (replayState.fireCallback) {
					replayState.fireCallback(nextWp);
				}
				
				// Small pause after firing before next move?
				// For now, immediate transition
				setupReplaySegment(replayState.currentIndex + 1);
			}
		}
	};
	
	return {
		playerRoot,
		playerVisual,
		onWaypointsChanged,
		
		startTurn: () => {
			isInputEnabled = true;
			isMoving = false;
			waypoints = [];
			// Add initial waypoint
			addWaypoint('MOVE');
		},
		
		disableInput: () => {
			isInputEnabled = false;
			// Ensure we record the final resting spot if not already
			if (waypoints.length > 0) {
				const last = waypoints[waypoints.length - 1];
				const dist = BABYLON.Vector3.Distance(last.position, playerRoot.absolutePosition);
				if (dist > 0.1) {
					addWaypoint('MOVE');
				}
			}
		},
		
		addWaypoint, // Exposed for Fire Manager
		removeWaypoint, // Exposed for UI
		
		resolveTurnWithWaypoints: (fireCallback, onReplayStart, onComplete, onProgress) => {
			// 1. Physics Reset
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
			
			// 2. Setup Rewind (Current -> Start)
			animationState = 'REWIND';
			playerMat.alpha = 0.5; // Ghost mode
			
			rewindState.startPos.copyFrom(playerRoot.absolutePosition);
			rewindState.startRot = playerVisual.rotation.y;
			
			// Target is the first waypoint
			if (waypoints.length > 0) {
				rewindState.endPos.copyFrom(waypoints[0].position);
				rewindState.endRot = waypoints[0].rotation;
			} else {
				// Fallback
				rewindState.endPos.copyFrom(rewindState.startPos);
			}
			
			rewindState.startTime = performance.now();
			rewindState.onComplete = onReplayStart;
			
			// 3. Setup Replay Callbacks
			replayState.fireCallback = fireCallback;
			replayState.onComplete = () => {
				playerMat.alpha = 1.0;
				onComplete();
			};
			replayState.onProgress = onProgress;
		}
	};
};
