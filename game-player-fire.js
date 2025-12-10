import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	const bullets = [];
	
	// --- Target Selection State ---
	let currentTarget = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	const targetColor = new BABYLON.Color3(0, 1, 1); // Cyan highlight
	
	const setTarget = (mesh) => {
		if (currentTarget) highlightLayer.removeMesh(currentTarget);
		
		// Toggle off if clicking the same target
		if (currentTarget === mesh) {
			currentTarget = null;
			return;
		}
		
		currentTarget = mesh;
		if (currentTarget) highlightLayer.addMesh(currentTarget, targetColor);
	};
	
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
		
		let aimDir;
		
		// Check if target exists and is valid
		if (currentTarget && !currentTarget.isDisposed()) {
			// Aim at target
			aimDir = currentTarget.absolutePosition.subtract(spawnPos).normalize();
		} else {
			// Default: Aim forward based on player rotation
			const rotationMatrix = BABYLON.Matrix.RotationY(playerVisual.rotation.y);
			aimDir = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Forward(), rotationMatrix).normalize();
		}
		
		bullet.position = spawnPos.add(aimDir.scale(1.5));
		shadowGenerator.addShadowCaster(bullet);
		
		const power = 20;
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
					
					// If we destroyed our current target, clear selection
					if (currentTarget === hitBody.transformNode) {
						setTarget(null);
					}
					// hitBody.transformNode.dispose(); // Optional: Destroy target
				}
				bulletData.isDead = true;
				bulletAgg.body.getCollisionObservable().remove(collisionObserver);
			}
		});
	};
	
	// --- Helper: Face Target ---
	const faceTarget = () => {
		if (currentTarget && !currentTarget.isDisposed()) {
			const dir = currentTarget.absolutePosition.subtract(playerVisual.absolutePosition);
			// Calculate angle to target (Y rotation)
			const angle = Math.atan2(dir.x, dir.z);
			playerVisual.rotation.y = angle;
		}
	};
	
	// --- Input Listener ---
	scene.onPointerObservable.add((pointerInfo) => {
		if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 0) {
			
			const camera = cameraManager.getActiveCamera();
			let pickedMesh = null;
			
			if (camera.name === 'firstPersonCam') {
				// In First Person, cast a ray from the camera center
				const ray = camera.getForwardRay(1000);
				
				// --- CHANGED: Filter out player meshes so we don't pick ourselves ---
				const hit = scene.pickWithRay(ray, (mesh) => {
					// Ignore the player visual and any children (like the cap)
					if (mesh === playerVisual || mesh.isDescendantOf(playerVisual)) return false;
					// Ignore the player root (parent of visual)
					if (mesh === playerVisual.parent) return false;
					// Ignore bullets
					if (mesh.name === 'bullet') return false;
					
					return true;
				});
				
				if (hit && hit.hit) {
					pickedMesh = hit.pickedMesh;
				}
			} else {
				// In Third Person / Free Cam, use the mouse cursor position
				if (pointerInfo.pickInfo && pointerInfo.pickInfo.hit) {
					pickedMesh = pointerInfo.pickInfo.pickedMesh;
				}
			}
			
			// Apply selection if we hit a sphere
			if (pickedMesh && pickedMesh.name.startsWith('sphere')) {
				setTarget(pickedMesh);
			}
		}
	});
	
	scene.onKeyboardObservable.add((kbInfo) => {
		if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			if (kbInfo.event.key.toLowerCase() === 'f') {
				// If we have a target, turn to face it first
				if (currentTarget) {
					faceTarget();
				}
				spawnBullet();
			}
		}
	});
	
	// --- Update Loop (Bullet Cleanup) ---
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		// Cleanup bullets
		for (let i = bullets.length - 1; i >= 0; i--) {
			const b = bullets[i];
			b.age += dt;
			if (b.isDead || b.age > 5.0) {
				b.agg.dispose();
				b.mesh.dispose();
				bullets.splice(i, 1);
			}
		}
		
		// Cleanup Target Highlight if target disposed externally
		if (currentTarget && currentTarget.isDisposed()) {
			setTarget(null);
		}
	});
	
	return {};
};
