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
	const maxTurnRadius = 15.0; // Fixed radius limit
	
	// Cinematic Move Variables
	let isResolvingMove = false;
	let resolveStartPos = new BABYLON.Vector3();
	let resolveTargetPos = new BABYLON.Vector3();
	let resolveStartTime = 0;
	const resolveDuration = 5.0; // 5 seconds
	let onResolveComplete = null;
	
	// --- Movement Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		// --- NEW: Handle Cinematic Resolution Movement ---
		if (isResolvingMove) {
			const now = performance.now();
			const elapsed = (now - resolveStartTime) / 1000;
			const t = Math.min(elapsed / resolveDuration, 1.0);
			
			// Smooth Step interpolation
			const smoothT = t * t * (3 - 2 * t);
			
			const newPos = BABYLON.Vector3.Lerp(resolveStartPos, resolveTargetPos, smoothT);
			
			// Move physics body kinematically to avoid physics issues
			playerAgg.body.setTargetTransform(newPos, playerRoot.rotationQuaternion);
			
			if (t >= 1.0) {
				isResolvingMove = false;
				// Re-enable dynamics
				playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
				if (onResolveComplete) onResolveComplete();
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
		
		// --- NEW: Radius Constraint Logic ---
		// Calculate where we would be
		const nextPos = playerRoot.absolutePosition.add(targetVelocity.scale(scene.getEngine().getDeltaTime() / 1000));
		const distFromStart = BABYLON.Vector3.Distance(
			new BABYLON.Vector3(nextPos.x, 0, nextPos.z),
			new BABYLON.Vector3(turnStartPosition.x, 0, turnStartPosition.z)
		);
		
		// If trying to move outside radius, zero out velocity in that direction
		if (distFromStart > maxTurnRadius) {
			// Simple clamp: stop movement if moving away
			// Vector from center to player
			const toPlayer = nextPos.subtract(turnStartPosition);
			// If dot product of velocity and toPlayer is positive, we are moving away
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
	
	// --- NEW: Exposed Methods for Turn Manager ---
	return {
		playerRoot,
		playerVisual,
		// Called when turn starts
		startTurn: () => {
			isInputEnabled = true;
			turnStartPosition.copyFrom(playerRoot.absolutePosition);
		},
		// Called when turn ends (before resolution)
		disableInput: () => {
			isInputEnabled = false;
		},
		// Called to execute the cinematic move
		resolveMovement: (targetPos, callback) => {
			isResolvingMove = true;
			onResolveComplete = callback;
			
			// 1. Reset to start position instantly
			// We use setTargetTransform to teleport physics body
			playerAgg.body.setTargetTransform(turnStartPosition, playerRoot.rotationQuaternion);
			
			// 2. Setup Lerp
			resolveStartPos.copyFrom(turnStartPosition);
			resolveTargetPos.copyFrom(targetPos);
			resolveStartTime = performance.now();
			
			// Switch to Kinematic for smooth controlled movement
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
		}
	};
};
