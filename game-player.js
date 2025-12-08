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
	// Position slightly forward (Z) and up (Y) relative to player center
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
	
	// Lock rotation on the physics body so it doesn't tip over
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
	
	// --- Movement Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		// Get active camera
		const camera = cameraManager.getActiveCamera();
		const isFreeCam = (camera.name === 'freeCam');
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		// --- Visibility Logic ---
		// Hide cap in First Person view to prevent blocking the camera
		if (isFirstPerson) {
			if (cap.isEnabled()) cap.setEnabled(false);
		} else {
			if (!cap.isEnabled()) cap.setEnabled(true);
		}
		
		// Calculate Input Direction
		let z = (inputMap['w']) ? 1 : 0;
		z -= (inputMap['s']) ? 1 : 0;
		
		let x = (inputMap['d']) ? 1 : 0;
		x -= (inputMap['a']) ? 1 : 0;
		
		const isJumping = inputMap[' '];
		
		let moveDir = new BABYLON.Vector3(0, 0, 0);
		
		if (isFreeCam) {
			// In Free Cam, movement is World Relative (W = North/Z+, D = East/X+)
			// We do NOT use camera direction
			moveDir = new BABYLON.Vector3(x, 0, z);
		} else {
			// In Follow/First Person, movement is Camera Relative
			const camForward = camera.getDirection(BABYLON.Vector3.Forward());
			camForward.y = 0;
			camForward.normalize();
			
			const camRight = camera.getDirection(BABYLON.Vector3.Right());
			camRight.y = 0;
			camRight.normalize();
			
			moveDir = camForward.scale(z).add(camRight.scale(x));
		}
		
		if (moveDir.length() > 0) {
			moveDir.normalize();
		}
		
		// Get current velocity to preserve Y (gravity)
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		
		const targetVelocity = moveDir.scale(speed);
		
		// Jump Logic
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		const isGrounded = hit.hit;
		
		let yVel = currentVel.y;
		
		if (isJumping && isGrounded) {
			yVel = jumpForce;
		}
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
		
		// Visual Rotation
		// We rotate the visual mesh to face the movement direction
		if (moveDir.lengthSquared() > 0.01) {
			const targetRotation = Math.atan2(moveDir.x, moveDir.z);
			const currentRotation = playerVisual.rotation.y;
			const rotation = BABYLON.Scalar.LerpAngle(currentRotation, targetRotation, 0.2);
			playerVisual.rotation.y = rotation;
		}
	});
	
	return { playerRoot, playerVisual };
};
