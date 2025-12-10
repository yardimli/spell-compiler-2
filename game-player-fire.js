import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	const bullets = [];
	
	// --- Explosion Logic ---
	const createExplosion = (position, color = null) => {
		const fragmentCount = 8;
		for (let i = 0; i < fragmentCount; i++) {
			const frag = BABYLON.MeshBuilder.CreatePolyhedron('frag', { type: 1, size: 0.3 }, scene);
			frag.position = position.clone();
			frag.position.addInPlace(new BABYLON.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
			
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			fragMat.diffuseColor = color || new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
			frag.material = fragMat;
			
			const fragAgg = new BABYLON.PhysicsAggregate(frag, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 0.2, restitution: 0.5 }, scene);
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			fragAgg.body.applyImpulse(dir.scale(5 + Math.random() * 5), frag.absolutePosition);
			
			setTimeout(() => {
				frag.dispose();
				fragAgg.dispose();
			}, 1500);
		}
		
		scene.meshes.forEach((mesh) => {
			if (mesh.physicsBody) {
				const distance = BABYLON.Vector3.Distance(position, mesh.absolutePosition);
				if (distance < 4.0) {
					const direction = mesh.absolutePosition.subtract(position).normalize();
					mesh.physicsBody.applyImpulse(direction.scale(10.0 * (1 - (distance / 4.0))), mesh.absolutePosition);
				}
			}
		});
	};
	
	// --- Bullet Spawning ---
	const spawnBullet = () => {
		const bullet = BABYLON.MeshBuilder.CreateSphere('bullet', { diameter: 0.4 }, scene);
		bullet.material = new BABYLON.StandardMaterial('bulletMat', scene);
		bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 0);
		bullet.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
		
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnPos.y += 1.5;
		
		// Determine aim direction based on player rotation
		const rotationMatrix = BABYLON.Matrix.RotationY(playerVisual.rotation.y);
		const aimDir = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Forward(), rotationMatrix).normalize();
		
		bullet.position = spawnPos.add(aimDir.scale(1.5));
		shadowGenerator.addShadowCaster(bullet);
		
		const power = 50; // Fixed power for real-time
		const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.5, restitution: 0.8 }, scene);
		bulletAgg.body.setGravityFactor(0);
		bulletAgg.body.applyImpulse(aimDir.scale(power), bullet.absolutePosition);
		
		const bulletData = { mesh: bullet, agg: bulletAgg, age: 0, isDead: false };
		bullets.push(bulletData);
		
		bulletAgg.body.setCollisionCallbackEnabled(true);
		const collisionObserver = bulletAgg.body.getCollisionObservable().add((event) => {
			if (bulletData.isDead) return;
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const name = hitBody.transformNode.name;
			if (name.includes('wall') || name.includes('sphere') || name.includes('bullet')) {
				createExplosion(bullet.absolutePosition);
				if (name.includes('sphere')) {
					createExplosion(hitBody.transformNode.absolutePosition, hitBody.transformNode.material?.diffuseColor);
					// hitBody.transformNode.dispose(); // Optional: Destroy target
				}
				bulletData.isDead = true;
				bulletAgg.body.getCollisionObservable().remove(collisionObserver);
			}
		});
	};
	
	// --- Input Listener for Firing ---
	scene.onPointerObservable.add((pointerInfo) => {
		// Left click (0) is Pan in FollowCam, Right (2) is Rotate.
		// Let's use Middle Click (1) or a Keyboard Key (F) for shooting to avoid conflict,
		// OR just check if we are in First Person mode where Left Click makes sense.
		// For simplicity: Press 'F' or Left Click if in First Person.
		
		if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
			const camera = cameraManager.getActiveCamera();
			// If FPS, Left Click shoots
			if (camera.name === 'firstPersonCam' && pointerInfo.event.button === 0) {
				spawnBullet();
			}
		}
	});
	
	scene.onKeyboardObservable.add((kbInfo) => {
		if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			if (kbInfo.event.key.toLowerCase() === 'f') {
				spawnBullet();
			}
		}
	});
	
	// --- Update Loop (Bullet Cleanup) ---
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		for (let i = bullets.length - 1; i >= 0; i--) {
			const b = bullets[i];
			b.age += dt;
			if (b.isDead || b.age > 3.0) {
				b.agg.dispose();
				b.mesh.dispose();
				bullets.splice(i, 1);
			}
		}
	});
	
	return {};
};
