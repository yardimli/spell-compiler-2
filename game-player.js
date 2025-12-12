import * as BABYLON from '@babylonjs/core';

export const initGamePlayer = (scene, shadowGenerator, cameraManager, startPosition, uiManager, timeManager) => {
	const playerHeight = 4;
	const playerRadius = 1;
	const baseSpeed = 15.0;
	const jumpForce = 8.0;
	
	// --- Player State ---
	let health = 100;
	const maxHealth = 100;
	let isDead = false;
	
	// Frost Effect State
	let speedMultiplier = 1.0;
	let frostTimeout = null;
	
	// 1. Player Root (Physics Body) - Invisible
	const playerRoot = BABYLON.MeshBuilder.CreateCapsule('playerRoot', { height: playerHeight, radius: playerRadius }, scene);
	
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
			// Toggle Slow Motion
			if (key === 'g' && timeManager) {
				timeManager.toggleSlowMotion();
			}
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
		}
	});
	
	// --- Public Methods for Damage/Status ---
	const takeDamage = (amount) => {
		if (isDead) return;
		health -= amount;
		if (health < 0) health = 0;
		
		// Update UI
		if (uiManager && uiManager.updateHealth) {
			uiManager.updateHealth(health, maxHealth);
		}
		
		// Flash Red
		const originalColor = playerMat.diffuseColor.clone();
		playerMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
		setTimeout(() => {
			if (!isDead) playerMat.diffuseColor = originalColor;
		}, 200);
		
		if (health <= 0) {
			die();
		}
	};
	
	// Modified: applyFrost now accepts duration in seconds
	const applyFrost = (durationSeconds = 3.0) => {
		if (isDead) return;
		
		// Slow speed by half
		speedMultiplier = 0.5;
		
		// Visual indication (Blue)
		playerMat.diffuseColor = new BABYLON.Color3(0.5, 0.8, 1.0);
		
		// Reset timer if already frozen
		if (frostTimeout) clearTimeout(frostTimeout);
		
		frostTimeout = setTimeout(() => {
			if (!isDead) {
				speedMultiplier = 1.0;
				playerMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0); // Reset color
			}
		}, durationSeconds * 1000); // Convert to ms
	};
	
	const die = () => {
		isDead = true;
		if (uiManager && uiManager.showGameOver) {
			uiManager.showGameOver();
		}
		// Disable physics movement
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
		// Optional: Tip over
		playerAgg.body.setMassProperties({ inertia: new BABYLON.Vector3(1, 1, 1) });
	};
	
	// --- Main Update Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body || isDead) return;
		
		// Get Time Scale
		const timeScale = timeManager ? timeManager.getTimeScale() : 1.0;
		// Scale dt for manual calculations (like rotation)
		const dt = (scene.getEngine().getDeltaTime() / 1000) * timeScale;
		
		const camera = cameraManager.getActiveCamera();
		const isFirstPerson = (camera.name === 'firstPersonCam');
		
		// Hide/Show Cap based on camera
		if (cap) cap.setEnabled(!isFirstPerson);
		
		let moveDir = new BABYLON.Vector3(0, 0, 0);
		
		// Direction Calculation
		if (isFirstPerson) {
			const camForward = camera.getDirection(BABYLON.Vector3.Forward());
			camForward.y = 0; camForward.normalize();
			
			const camRight = camera.getDirection(BABYLON.Vector3.Right());
			camRight.y = 0; camRight.normalize();
			
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			
			moveDir = camForward.scale(z).add(camRight.scale(x));
			
			if (moveDir.lengthSquared() > 0.001) {
				playerVisual.rotation.y = camera.rotation.y;
			}
		} else {
			let z = (inputMap['w']) ? 1 : 0; z -= (inputMap['s']) ? 1 : 0;
			let x = (inputMap['d']) ? 1 : 0; x -= (inputMap['a']) ? 1 : 0;
			
			if (z !== 0 || x !== 0) {
				const camForward = camera.getDirection(BABYLON.Vector3.Forward());
				camForward.y = 0; camForward.normalize();
				const camRight = camera.getDirection(BABYLON.Vector3.Right());
				camRight.y = 0; camRight.normalize();
				
				const desiredDir = camForward.scale(z).add(camRight.scale(x)).normalize();
				
				const targetRotation = Math.atan2(desiredDir.x, desiredDir.z);
				let diff = targetRotation - playerVisual.rotation.y;
				
				while (diff > Math.PI) diff -= Math.PI * 2;
				while (diff < -Math.PI) diff += Math.PI * 2;
				
				const turnSpeed = 10.0;
				const step = turnSpeed * dt; // Scaled dt
				
				if (Math.abs(diff) > step) {
					playerVisual.rotation.y += Math.sign(diff) * step;
				} else {
					playerVisual.rotation.y = targetRotation;
				}
				
				if (Math.abs(diff) < 0.2) {
					moveDir = desiredDir;
				} else {
					moveDir = new BABYLON.Vector3(0, 0, 0);
				}
			}
		}
		
		const isJumping = inputMap[' '];
		
		if (moveDir.length() > 0) moveDir.normalize();
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		
		// Apply Speed Multiplier (Frost Effect) AND Time Scale
		// We multiply by timeScale because we are manually setting velocity every frame.
		// If time is slow, we want the player to cover less distance per frame.
		const targetVelocity = moveDir.scale(baseSpeed * speedMultiplier * timeScale);
		
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		
		let yVel = currentVel.y;
		if (isJumping && hit.hit) {
			// Scale jump force by timeScale so jump height remains consistent
			// (since gravity is also scaled by timeScale^2)
			yVel = jumpForce * timeScale;
		}
		
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
	});
	
	return {
		playerRoot,
		playerVisual,
		takeDamage,
		applyFrost
	};
};
