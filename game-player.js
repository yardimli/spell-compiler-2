import * as BABYLON from '@babylonjs/core';

export const initGamePlayer = (scene, shadowGenerator, cameraManager, startPosition) => {
	const playerHeight = 4;
	const playerRadius = 1;
	const speed = 15.0;
	const jumpForce = 8.0;
	
	// --- CHANGED: Dynamic Rotation Speed Parameters ---
	// Start slow for fine adjustments, speed up for turning around
	const minRotationSpeed = 0.01;
	const maxRotationSpeed = 0.08;
	const rotationAcceleration = 0.002; // How much speed increases per frame
	let currentRotationSpeed = minRotationSpeed;
	
	// 1. Player Root (Physics Body) - Invisible
	const playerRoot = BABYLON.MeshBuilder.CreateCapsule('playerRoot', { height: playerHeight, radius: playerRadius }, scene);
	
	// Use the passed start position, or default if null
	if (startPosition) {
		playerRoot.position.copyFrom(startPosition);
	} else {
		playerRoot.position.set(0, 5, 0);
	}
	
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
	
	// --- Input Handling (Real-time) ---
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
	
	// --- Main Update Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		const dt = scene.getEngine().getDeltaTime() / 1000;
		const camera = cameraManager.getActiveCamera();
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		// Hide/Show Cap based on camera
		if (cap) cap.setEnabled(!isFirstPerson);
		
		let moveDir = new BABYLON.Vector3(0, 0, 0);
		
		// Direction Calculation
		if (isFirstPerson) {
			// --- CHANGED: FPS Movement (Strafe + Look) ---
			// Camera controls rotation (Mouse Look).
			// WASD controls movement relative to Camera.
			
			const camForward = camera.getDirection(BABYLON.Vector3.Forward());
			camForward.y = 0; camForward.normalize();
			
			const camRight = camera.getDirection(BABYLON.Vector3.Right());
			camRight.y = 0; camRight.normalize();
			
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			
			moveDir = camForward.scale(z).add(camRight.scale(x));
			
			// If moving, align player body to camera look direction
			if (moveDir.lengthSquared() > 0.001) {
				playerVisual.rotation.y = camera.rotation.y;
			}
			
		} else {
			// TPS / Free Cam Movement relative to camera view
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			
			// Only calculate direction if keys are pressed
			if (z !== 0 || x !== 0) {
				const camForward = camera.getDirection(BABYLON.Vector3.Forward());
				camForward.y = 0; camForward.normalize();
				const camRight = camera.getDirection(BABYLON.Vector3.Right());
				camRight.y = 0; camRight.normalize();
				
				// Calculate desired move direction
				const desiredDir = camForward.scale(z).add(camRight.scale(x)).normalize();
				
				// --- Shortest Path Rotation & Turn-Before-Move Logic ---
				
				// 1. Calculate target angle
				const targetRotation = Math.atan2(desiredDir.x, desiredDir.z);
				
				// 2. Calculate difference between current and target
				let diff = targetRotation - playerVisual.rotation.y;
				
				// 3. Normalize difference to -PI to +PI for shortest turn
				while (diff > Math.PI) diff -= Math.PI * 2;
				while (diff < -Math.PI) diff += Math.PI * 2;
				
				// 4. Rotate towards target
				const turnSpeed = 10.0; // Radians per second
				const step = turnSpeed * dt;
				
				if (Math.abs(diff) > step) {
					// Rotate by step in the correct direction
					playerVisual.rotation.y += Math.sign(diff) * step;
				} else {
					// Snap to target if close enough
					playerVisual.rotation.y = targetRotation;
				}
				
				// 5. Only allow movement if we are roughly facing the target
				// Threshold of ~11 degrees (0.2 radians)
				if (Math.abs(diff) < 0.2) {
					moveDir = desiredDir;
				} else {
					// If turning, do not add movement force yet
					moveDir = new BABYLON.Vector3(0, 0, 0);
				}
			}
		}
		
		const isJumping = inputMap[' '];
		
		// Physics Application
		if (moveDir.length() > 0) moveDir.normalize();
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		const targetVelocity = moveDir.scale(speed);
		
		// Raycast for ground check
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		
		let yVel = currentVel.y;
		if (isJumping && hit.hit) yVel = jumpForce;
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
	});
	
	return {
		playerRoot,
		playerVisual
	};
};
