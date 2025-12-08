import * as BABYLON from 'babylonjs';

export const initGamePlayer = (scene, shadowGenerator, cameraManager) => {
	const playerHeight = 4;
	const playerRadius = 1;
	
	// 1. Player Root (Physics Body) - Invisible
	const playerRoot = BABYLON.MeshBuilder.CreateCapsule('playerRoot', { height: playerHeight, radius: playerRadius }, scene);
	playerRoot.position.set(0, 5, 0);
	playerRoot.visibility = 0; // Hide the physics body
	
	// 2. Player Visual (Visible Mesh) - Child of Root
	const playerVisual = BABYLON.MeshBuilder.CreateCapsule('playerVisual', { height: playerHeight, radius: playerRadius }, scene);
	playerVisual.parent = playerRoot;
	
	const playerMat = new BABYLON.StandardMaterial('playerMat', scene);
	playerMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0);
	playerVisual.material = playerMat;
	shadowGenerator.addShadowCaster(playerVisual);
	
	// --- Added: Player Cap (Direction Indicator) ---
	const cap = BABYLON.MeshBuilder.CreateBox('playerCap', { width: 0.8, height: 0.2, depth: 0.5 }, scene);
	cap.parent = playerVisual;
	cap.position.set(0, 1.5, 0.6);
	const capMat = new BABYLON.StandardMaterial('capMat', scene);
	capMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.3); // Dark Blue
	cap.material = capMat;
	shadowGenerator.addShadowCaster(cap);
	
	// 3. Physics Aggregate on Root
	const playerAgg = new BABYLON.PhysicsAggregate(
		playerRoot,
		BABYLON.PhysicsShapeType.CAPSULE,
		{ mass: 1, friction: 0, restitution: 0 },
		scene
	);
	
	playerAgg.body.setMassProperties({
		inertia: new BABYLON.Vector3(0, 0, 0)
	});
	
	// --- Player Controls ---
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
	
	// --- NEW: Turn System Variables ---
	let isInputEnabled = true;
	let turnStartPosition = new BABYLON.Vector3(0, 5, 0);
	let turnStartRotation = 0; // Store initial Y rotation
	const maxTurnRadius = 15.0; // Fixed radius limit
	
	// --- Cinematic / Replay Variables ---
	let animationState = 'NONE'; // 'NONE', 'REWIND', 'REPLAY'
	
	// Rewind State (End -> Start)
	let rewindState = {
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		endPos: new BABYLON.Vector3(), // Target (Turn Start)
		endRot: 0,
		startTime: 0,
		duration: 3.0,
		onRewindComplete: null
	};
	
	// Replay State (Start -> End)
	let replayState = {
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		midPos: null, // Fire position
		midRot: 0,    // Fire rotation
		endPos: new BABYLON.Vector3(),
		endRot: 0,
		hasFired: false,
		durationA: 0, // Start -> Mid
		durationB: 0, // Mid -> End
		startTime: 0,
		onFireCallback: null,
		onCompleteCallback: null
	};
	
	const totalResolveDuration = 5.0; // Total time for the forward replay
	
	// --- Movement Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		// =================================================================
		// 1. REWIND PHASE (End of Turn -> Start Position)
		// =================================================================
		if (animationState === 'REWIND') {
			const now = performance.now();
			const elapsed = (now - rewindState.startTime) / 1000;
			const t = Math.min(elapsed / rewindState.duration, 1.0);
			
			// Smooth EaseInOut
			const smoothT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
			
			const currentPos = BABYLON.Vector3.Lerp(rewindState.startPos, rewindState.endPos, smoothT);
			// We don't necessarily need to interpolate rotation for rewind, but let's keep it smooth
			// We might want to keep looking at the "end" direction or lerp back. Let's lerp back.
			const currentRot = BABYLON.Scalar.LerpAngle(rewindState.startRot, rewindState.endRot, smoothT);
			
			// Apply Transform (Kinematic)
			playerAgg.body.setTargetTransform(currentPos, playerRoot.rotationQuaternion);
			playerVisual.rotation.y = currentRot;
			
			if (t >= 1.0) {
				// Rewind Complete
				animationState = 'REPLAY';
				
				// Reset Visuals
				playerMat.alpha = 1.0; // Restore Opacity
				
				// Trigger Callback (Unfreeze balls now)
				if (rewindState.onRewindComplete) rewindState.onRewindComplete();
				
				// Initialize Replay Timer
				replayState.startTime = performance.now();
			}
			return;
		}
		
		// =================================================================
		// 2. REPLAY PHASE (Start Position -> End of Turn)
		// =================================================================
		if (animationState === 'REPLAY') {
			const now = performance.now();
			const elapsedTotal = (now - replayState.startTime) / 1000;
			
			let currentTargetPos = new BABYLON.Vector3();
			let currentTargetRot = 0;
			
			if (replayState.midPos) {
				// --- Two-Stage Replay (Start -> Fire -> End) ---
				if (elapsedTotal < replayState.durationA) {
					// Phase 1: Moving to Fire Position
					const t = Math.min(elapsedTotal / replayState.durationA, 1.0);
					const smoothT = t * t * (3 - 2 * t); // EaseInOut
					
					currentTargetPos = BABYLON.Vector3.Lerp(replayState.startPos, replayState.midPos, smoothT);
					currentTargetRot = BABYLON.Scalar.LerpAngle(replayState.startRot, replayState.midRot, smoothT);
					
				} else {
					// Check if we need to fire (once)
					if (!replayState.hasFired) {
						replayState.hasFired = true;
						if (replayState.onFireCallback) replayState.onFireCallback();
					}
					
					// Phase 2: Moving to End Position
					const elapsedPhase2 = elapsedTotal - replayState.durationA;
					const t = Math.min(elapsedPhase2 / replayState.durationB, 1.0);
					
					if (replayState.durationB <= 0.001) {
						currentTargetPos.copyFrom(replayState.endPos);
						currentTargetRot = replayState.endRot;
					} else {
						const smoothT = t * t * (3 - 2 * t);
						currentTargetPos = BABYLON.Vector3.Lerp(replayState.midPos, replayState.endPos, smoothT);
						currentTargetRot = BABYLON.Scalar.LerpAngle(replayState.midRot, replayState.endRot, smoothT);
					}
				}
			} else {
				// --- Single-Stage Replay (Start -> End) ---
				const t = Math.min(elapsedTotal / totalResolveDuration, 1.0);
				const smoothT = t * t * (3 - 2 * t);
				
				currentTargetPos = BABYLON.Vector3.Lerp(replayState.startPos, replayState.endPos, smoothT);
				currentTargetRot = BABYLON.Scalar.LerpAngle(replayState.startRot, replayState.endRot, smoothT);
			}
			
			// Apply Transform
			playerAgg.body.setTargetTransform(currentTargetPos, playerRoot.rotationQuaternion);
			playerVisual.rotation.y = currentTargetRot;
			
			// Check Completion
			if (elapsedTotal >= totalResolveDuration) {
				animationState = 'NONE';
				playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
				if (replayState.onCompleteCallback) replayState.onCompleteCallback();
			}
			return;
		}
		
		// =================================================================
		// 3. STANDARD INPUT LOOP
		// =================================================================
		
		// Skip input if disabled
		if (!isInputEnabled) {
			// Dampen velocity to stop sliding
			playerAgg.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
			return;
		}
		
		// Get active camera
		const camera = cameraManager.getActiveCamera();
		const isFreeCam = (camera.name === 'freeCam');
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		// --- Visibility Logic ---
		if (isFirstPerson) {
			if (cap.isEnabled()) cap.setEnabled(false);
		} else {
			if (!cap.isEnabled()) cap.setEnabled(true);
		}
		
		let moveDir = new BABYLON.Vector3(0, 0, 0);
		
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
		} else if (isFreeCam) {
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			moveDir = new BABYLON.Vector3(x, 0, z);
		} else {
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			
			const camForward = camera.getDirection(BABYLON.Vector3.Forward());
			camForward.y = 0; camForward.normalize();
			const camRight = camera.getDirection(BABYLON.Vector3.Right());
			camRight.y = 0; camRight.normalize();
			
			moveDir = camForward.scale(z).add(camRight.scale(x));
		}
		
		if (moveDir.length() > 0) {
			moveDir.normalize();
		}
		
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		
		const targetVelocity = moveDir.scale(speed);
		
		// --- Radius Constraint Logic ---
		const nextPos = playerRoot.absolutePosition.add(targetVelocity.scale(scene.getEngine().getDeltaTime() / 1000));
		const distFromStart = BABYLON.Vector3.Distance(
			new BABYLON.Vector3(nextPos.x, 0, nextPos.z),
			new BABYLON.Vector3(turnStartPosition.x, 0, turnStartPosition.z)
		);
		
		if (distFromStart > maxTurnRadius) {
			const toPlayer = nextPos.subtract(turnStartPosition);
			if (BABYLON.Vector3.Dot(targetVelocity, toPlayer) > 0) {
				targetVelocity.x = 0;
				targetVelocity.z = 0;
			}
		}
		
		// Jump Logic
		const isJumping = inputMap[' '];
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		const isGrounded = hit.hit;
		
		let yVel = currentVel.y;
		if (isJumping && isGrounded) {
			yVel = jumpForce;
		}
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
		
		if (!isFirstPerson && moveDir.lengthSquared() > 0.01) {
			const targetRotation = Math.atan2(moveDir.x, moveDir.z);
			const currentRotation = playerVisual.rotation.y;
			const rotation = BABYLON.Scalar.LerpAngle(currentRotation, targetRotation, 0.2);
			playerVisual.rotation.y = rotation;
		}
	});
	
	// --- Exposed Methods ---
	return {
		playerRoot,
		playerVisual,
		startTurn: () => {
			isInputEnabled = true;
			turnStartPosition.copyFrom(playerRoot.absolutePosition);
			turnStartRotation = playerVisual.rotation.y;
		},
		disableInput: () => {
			isInputEnabled = false;
		},
		// --- NEW: Rewind and Replay Logic ---
		resolveTurnWithRewind: (targetPos, targetRot, shotData, onReplayStart, onFire, onComplete) => {
			// 1. Immediate Physics Reset
			// Switch to ANIMATED (Kinematic) immediately to stop collision interactions
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
			
			// 2. Setup Rewind State
			animationState = 'REWIND';
			
			// Visual Ghost Effect
			playerMat.alpha = 0.3;
			
			rewindState.startPos.copyFrom(playerRoot.absolutePosition);
			rewindState.startRot = playerVisual.rotation.y;
			rewindState.endPos.copyFrom(turnStartPosition);
			rewindState.endRot = turnStartRotation;
			rewindState.startTime = performance.now();
			rewindState.onRewindComplete = onReplayStart; // Callback to unfreeze balls
			
			// 3. Setup Replay State (Pre-calculation)
			replayState.startPos.copyFrom(turnStartPosition);
			replayState.startRot = turnStartRotation;
			replayState.endPos.copyFrom(targetPos);
			replayState.endRot = targetRot;
			replayState.onFireCallback = onFire;
			replayState.onCompleteCallback = onComplete;
			replayState.hasFired = false;
			
			if (shotData) {
				replayState.midPos = shotData.position.clone();
				replayState.midRot = shotData.rotation;
				
				const distA = BABYLON.Vector3.Distance(replayState.startPos, replayState.midPos);
				const distB = BABYLON.Vector3.Distance(replayState.midPos, replayState.endPos);
				const totalDist = distA + distB;
				
				if (totalDist < 0.1) {
					replayState.durationA = totalResolveDuration / 2;
					replayState.durationB = totalResolveDuration / 2;
				} else {
					replayState.durationA = (distA / totalDist) * totalResolveDuration;
					replayState.durationB = (distB / totalDist) * totalResolveDuration;
				}
			} else {
				replayState.midPos = null;
				replayState.durationA = totalResolveDuration;
				replayState.durationB = 0;
			}
		}
	};
};
