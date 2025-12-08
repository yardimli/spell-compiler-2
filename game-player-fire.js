import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	// --- CHANGED: Renamed thrownBalls to bullets ---
	const bullets = [];
	let currentCharge = 0;
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	
	// --- Target Selection Variables ---
	let currentTarget = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	const targetColor = new BABYLON.Color3(0, 1, 1);
	
	// --- Explosion Logic ---
	const createExplosion = (position, color = null) => {
		// 1. Visual Fragments (Debris)
		const fragmentCount = 8;
		for (let i = 0; i < fragmentCount; i++) {
			const frag = BABYLON.MeshBuilder.CreatePolyhedron('frag', { type: 1, size: 0.3 }, scene);
			frag.position = position.clone();
			// Randomize start position slightly
			frag.position.addInPlace(new BABYLON.Vector3(
				(Math.random() - 0.5) * 0.5,
				(Math.random() - 0.5) * 0.5,
				(Math.random() - 0.5) * 0.5
			));
			
			// Fragment Material
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			if (color) {
				fragMat.diffuseColor = color;
			} else {
				// Default Orange/Yellow for explosion look
				fragMat.diffuseColor = new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
			}
			frag.material = fragMat;
			
			// Fragment Physics
			const fragAgg = new BABYLON.PhysicsAggregate(
				frag,
				BABYLON.PhysicsShapeType.CONVEX_HULL,
				{ mass: 0.2, restitution: 0.5 },
				scene
			);
			
			// Send fragments flying in random directions
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			const force = 5 + Math.random() * 5;
			fragAgg.body.applyImpulse(dir.scale(force), frag.absolutePosition);
			
			// Cleanup fragments after 1.5 seconds
			setTimeout(() => {
				frag.dispose();
				fragAgg.dispose();
			}, 1500);
		}
		
		// 2. Physics Push (Radial Impulse)
		const explosionRadius = 2.0;
		const explosionForce = 5.0;
		
		scene.meshes.forEach((mesh) => {
			// Apply to objects with physics bodies
			if (mesh.physicsBody) {
				const distance = BABYLON.Vector3.Distance(position, mesh.absolutePosition);
				
				if (distance < explosionRadius) {
					const direction = mesh.absolutePosition.subtract(position).normalize();
					const forceMagnitude = explosionForce * (1 - (distance / explosionRadius));
					
					// Apply impulse (pushes dynamic objects away)
					mesh.physicsBody.applyImpulse(direction.scale(forceMagnitude), mesh.absolutePosition);
				}
			}
		});
	};
	
	// --- Target Management Functions ---
	
	const getVisibleTargets = () => {
		const camera = cameraManager.getActiveCamera();
		return scene.meshes.filter(m => {
			return m.name.startsWith('sphere') &&
				m.isEnabled() &&
				!m.isDisposed() &&
				camera.isInFrustum(m);
		});
	};
	
	const cycleTarget = () => {
		const visibleTargets = getVisibleTargets();
		
		if (visibleTargets.length === 0) {
			setTarget(null);
			return;
		}
		
		visibleTargets.sort((a, b) => a.name.localeCompare(b.name));
		
		let nextIndex = 0;
		
		if (currentTarget) {
			const currentIndex = visibleTargets.indexOf(currentTarget);
			if (currentIndex !== -1) {
				nextIndex = (currentIndex + 1) % visibleTargets.length;
			}
		}
		
		setTarget(visibleTargets[nextIndex]);
	};
	
	const setTarget = (mesh) => {
		if (currentTarget) {
			highlightLayer.removeMesh(currentTarget);
		}
		
		currentTarget = mesh;
		
		if (currentTarget) {
			highlightLayer.addMesh(currentTarget, targetColor);
		}
	};
	
	// Input handling
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
			
			if (key === 'z') {
				fireBullet();
			}
			if (key === 'c') {
				cycleTarget();
			}
		}
	});
	
	// --- CHANGED: Renamed fireBall to fireBullet ---
	const fireBullet = () => {
		const throwPower = Math.max(minCharge, currentCharge);
		
		// Create Bullet (formerly Ball)
		const bullet = BABYLON.MeshBuilder.CreateSphere('bullet', { diameter: 0.4 }, scene);
		bullet.material = new BABYLON.StandardMaterial('bulletMat', scene);
		bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 0); // Yellow bullet
		bullet.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
		
		// Calculate Spawn Position
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnPos.y += 1.5;
		
		// --- CHANGED: Aiming Logic ---
		// If we have a target, calculate vector directly to its center
		let aimDir;
		if (currentTarget && !currentTarget.isDisposed()) {
			// Vector from spawn to target center
			aimDir = currentTarget.absolutePosition.subtract(spawnPos).normalize();
		} else {
			// Default: Player forward direction
			aimDir = playerVisual.getDirection(BABYLON.Vector3.Forward());
			aimDir.normalize();
		}
		
		bullet.position = spawnPos.add(aimDir.scale(1.5));
		
		shadowGenerator.addShadowCaster(bullet);
		
		// Physics
		const bulletAgg = new BABYLON.PhysicsAggregate(
			bullet,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 0.5, restitution: 0.8 },
			scene
		);
		
		// --- NEW: Disable Gravity for this bullet ---
		// This ensures it travels in a straight line
		bulletAgg.body.setGravityFactor(0);
		
		// Apply Force
		bulletAgg.body.applyImpulse(aimDir.scale(throwPower), bullet.absolutePosition);
		
		// Track
		// --- CHANGED: Renamed ballData to bulletData ---
		const bulletData = {
			mesh: bullet,
			agg: bulletAgg,
			age: 0,
			isDead: false,
			target: currentTarget
		};
		bullets.push(bulletData);
		
		// --- Collision Logic ---
		bulletAgg.body.setCollisionCallbackEnabled(true);
		
		const collisionObserver = bulletAgg.body.getCollisionObservable().add((event) => {
			if (bulletData.isDead) return;
			
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const hitMesh = hitBody.transformNode;
			const name = hitMesh.name;
			
			// Check what we hit
			const isWall = name.includes('wall');
			const isTargetSphere = name.includes('sphere');
			const isOtherBullet = name.includes('bullet');
			
			if (isWall || isTargetSphere || isOtherBullet) {
				// 1. Explode the bullet itself
				createExplosion(bullet.absolutePosition);
				
				// --- CHANGED: Logic for destroying the target ---
				if (isTargetSphere) {
					// 2. Explode the target sphere
					// Pass the sphere's color if possible, or default
					let debrisColor = null;
					if (hitMesh.material && hitMesh.material.diffuseColor) {
						debrisColor = hitMesh.material.diffuseColor;
					}
					createExplosion(hitMesh.absolutePosition, debrisColor);
					
					// 3. Destroy the target
					// If this was our locked target, clear the lock first
					if (currentTarget === hitMesh) {
						setTarget(null);
					} else if (bulletData.target === hitMesh) {
						// If it was the specific target of this bullet
						setTarget(null);
					}
					
					// Dispose the mesh (PhysicsAggregate usually cleans up automatically with mesh disposal in Havok plugin)
					hitMesh.dispose();
				}
				
				// Mark bullet for removal
				bulletData.isDead = true;
				bulletAgg.body.getCollisionObservable().remove(collisionObserver);
			}
		});
		
		// Reset UI
		currentCharge = 0;
		powerContainer.style.display = 'none';
		powerBar.style.width = '0%';
	};
	
	// Update Loop
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		if (currentTarget) {
			const camera = cameraManager.getActiveCamera();
			if (currentTarget.isDisposed() || !currentTarget.isEnabled() || !camera.isInFrustum(currentTarget)) {
				setTarget(null);
			}
		}
		
		// --- CHANGED: Iterate over bullets array ---
		for (let i = bullets.length - 1; i >= 0; i--) {
			const b = bullets[i];
			b.age += dt;
			
			if (b.isDead) {
				b.agg.dispose();
				b.mesh.dispose();
				bullets.splice(i, 1);
				continue;
			}
			
			// --- REMOVED: Homing Logic ---
			// We removed the continuous force application here.
			// The bullet now travels in a straight line based on the initial impulse
			// and the fact that gravity is disabled (setGravityFactor(0)).
			
			// Lifetime check
			if (b.age > 5.0) {
				b.mesh.scaling.scaleInPlace(0.98);
				
				if (b.mesh.scaling.x < 0.1) {
					b.agg.dispose();
					b.mesh.dispose();
					bullets.splice(i, 1);
				}
			}
		}
		
		// Charging Logic
		if (inputMap['z']) {
			if (currentCharge < maxCharge) {
				currentCharge += chargeRate;
				if (currentCharge > maxCharge) currentCharge = maxCharge;
			}
			
			powerContainer.style.display = 'block';
			const percentage = (currentCharge / maxCharge) * 100;
			powerBar.style.width = `${percentage}%`;
		}
	});
};
