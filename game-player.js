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
	
	// Cinematic Move Variables
	let isResolvingMove = false;
	
	// Replay State
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
	
	const totalResolveDuration = 5.0; // Total time for the cinematic
	
	// --- Movement Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		// --- NEW: Handle Cinematic Resolution Movement ---
		if (isResolvingMove) {
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
				isResolvingMove = false;
				playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
				if (replayState.onCompleteCallback) replayState.onCompleteCallback();
			}
			return; // Skip standard input logic
		}
		
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
		resolveMovement: (targetPos, targetRot, shotData, onFireCallback, onComplete) => {
			isResolvingMove = true;
			
			// 1. Reset to start position instantly
			if (!playerRoot.rotationQuaternion) {
				playerRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
			}
			playerAgg.body.setTargetTransform(turnStartPosition, playerRoot.rotationQuaternion);
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
			playerVisual.rotation.y = turnStartRotation;
			
			// 2. Setup Replay State
			replayState.startPos.copyFrom(turnStartPosition);
			replayState.startRot = turnStartRotation;
			replayState.endPos.copyFrom(targetPos);
			replayState.endRot = targetRot;
			replayState.startTime = performance.now();
			replayState.onFireCallback = onFireCallback;
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
			
			// Switch to Kinematic for smooth controlled movement
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
		}
	};
};
