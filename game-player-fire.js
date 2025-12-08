import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	const bullets = [];
	let currentCharge = 0;
	let storedCharge = 0; // The power set by the user
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	const fireCheckbox = document.getElementById('chk-fire');
	const fireControl = document.getElementById('fire-control');
	
	// --- Target Selection Variables ---
	let currentTarget = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	const targetColor = new BABYLON.Color3(0, 1, 1);
	
	// --- Turn State Variables ---
	let isTurnActive = true;
	let willFireAtEnd = false;
	
	// --- Explosion Logic ---
	const createExplosion = (position, color = null) => {
		const fragmentCount = 8;
		for (let i = 0; i < fragmentCount; i++) {
			const frag = BABYLON.MeshBuilder.CreatePolyhedron('frag', { type: 1, size: 0.3 }, scene);
			frag.position = position.clone();
			frag.position.addInPlace(new BABYLON.Vector3(
				(Math.random() - 0.5) * 0.5,
				(Math.random() - 0.5) * 0.5,
				(Math.random() - 0.5) * 0.5
			));
			
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			if (color) {
				fragMat.diffuseColor = color;
			} else {
				fragMat.diffuseColor = new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
			}
			frag.material = fragMat;
			
			const fragAgg = new BABYLON.PhysicsAggregate(
				frag,
				BABYLON.PhysicsShapeType.CONVEX_HULL,
				{ mass: 0.2, restitution: 0.5 },
				scene
			);
			
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			const force = 5 + Math.random() * 5;
			fragAgg.body.applyImpulse(dir.scale(force), frag.absolutePosition);
			
			setTimeout(() => {
				frag.dispose();
				fragAgg.dispose();
			}, 1500);
		}
		
		const explosionRadius = 2.0;
		const explosionForce = 5.0;
		
		scene.meshes.forEach((mesh) => {
			if (mesh.physicsBody) {
				const distance = BABYLON.Vector3.Distance(position, mesh.absolutePosition);
				if (distance < explosionRadius) {
					const direction = mesh.absolutePosition.subtract(position).normalize();
					const forceMagnitude = explosionForce * (1 - (distance / explosionRadius));
					mesh.physicsBody.applyImpulse(direction.scale(forceMagnitude), mesh.absolutePosition);
				}
			}
		});
	};
	
	// --- Target Management ---
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
				// On Release: Store charge and fire a "Test/Ghost" bullet
				storedCharge = Math.max(minCharge, currentCharge);
				fireBullet(false, storedCharge); // false = Test Shot
				currentCharge = 0; // Reset charging accumulator
			}
			if (key === 'c' && isTurnActive) {
				cycleTarget();
			}
		}
	});
	
	// --- Checkbox Logic ---
	fireCheckbox.addEventListener('change', (e) => {
		willFireAtEnd = e.target.checked;
	});
	
	// --- Fire Bullet Logic ---
	// isReal: true = End of turn shot (explodes), false = Test shot (bounces, no damage)
	const fireBullet = (isReal, power) => {
		const throwPower = power;
		
		const bullet = BABYLON.MeshBuilder.CreateSphere('bullet', { diameter: 0.4 }, scene);
		bullet.material = new BABYLON.StandardMaterial('bulletMat', scene);
		
		if (isReal) {
			bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 0); // Yellow
			bullet.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
		} else {
			// Ghost Bullet Appearance
			bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 1);
			bullet.material.alpha = 0.5; // Semi-transparent
		}
		
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnPos.y += 1.5;
		
		let aimDir;
		if (currentTarget && !currentTarget.isDisposed()) {
			aimDir = currentTarget.absolutePosition.subtract(spawnPos).normalize();
		} else {
			aimDir = playerVisual.getDirection(BABYLON.Vector3.Forward());
			aimDir.normalize();
		}
		
		bullet.position = spawnPos.add(aimDir.scale(1.5));
		shadowGenerator.addShadowCaster(bullet);
		
		const bulletAgg = new BABYLON.PhysicsAggregate(
			bullet,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 0.5, restitution: 0.8 },
			scene
		);
		
		bulletAgg.body.setGravityFactor(0);
		bulletAgg.body.applyImpulse(aimDir.scale(throwPower), bullet.absolutePosition);
		
		const bulletData = {
			mesh: bullet,
			agg: bulletAgg,
			age: 0,
			isDead: false,
			target: currentTarget,
			isReal: isReal
		};
		bullets.push(bulletData);
		
		bulletAgg.body.setCollisionCallbackEnabled(true);
		
		const collisionObserver = bulletAgg.body.getCollisionObservable().add((event) => {
			if (bulletData.isDead) return;
			
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const hitMesh = hitBody.transformNode;
			const name = hitMesh.name;
			
			const isWall = name.includes('wall');
			const isTargetSphere = name.includes('sphere');
			const isOtherBullet = name.includes('bullet');
			
			if (isWall || isTargetSphere || isOtherBullet) {
				
				// If it's a Real Bullet, it explodes and destroys
				if (isReal) {
					createExplosion(bullet.absolutePosition);
					
					if (isTargetSphere) {
						let debrisColor = null;
						if (hitMesh.material && hitMesh.material.diffuseColor) {
							debrisColor = hitMesh.material.diffuseColor;
						}
						createExplosion(hitMesh.absolutePosition, debrisColor);
						
						if (currentTarget === hitMesh) setTarget(null);
						
						hitMesh.dispose();
					}
					
					// Destroy bullet
					bulletData.isDead = true;
					bulletAgg.body.getCollisionObservable().remove(collisionObserver);
				} else {
					// If it's a Test Bullet
					// It should NOT explode itself immediately on wall hit, so user sees bounce.
					// But if it hits a target, maybe it just bounces off?
					// We do nothing here, letting physics handle the bounce.
					// We only destroy it if it's "stuck" or too old (handled in render loop)
				}
			}
		});
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
		
		for (let i = bullets.length - 1; i >= 0; i--) {
			const b = bullets[i];
			b.age += dt;
			
			if (b.isDead) {
				b.agg.dispose();
				b.mesh.dispose();
				bullets.splice(i, 1);
				continue;
			}
			
			// Cleanup old bullets
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
			// While charging, show the growing bar
			powerContainer.style.display = 'block';
			const percentage = (currentCharge / maxCharge) * 100;
			powerBar.style.width = `${percentage}%`;
		} else {
			// When not charging, show the stored charge
			if (storedCharge > 0) {
				powerContainer.style.display = 'block';
				const percentage = (storedCharge / maxCharge) * 100;
				powerBar.style.width = `${percentage}%`;
			} else {
				// If no stored charge and not charging, hide
				powerContainer.style.display = 'none';
				powerBar.style.width = '0%';
			}
		}
	});
	
	// --- External Control ---
	return {
		setTurnActive: (active) => {
			isTurnActive = active;
			if (active) {
				fireControl.classList.remove('hidden');
				fireCheckbox.checked = false;
				willFireAtEnd = false;
				// Keep stored charge from previous turn? Or reset?
				// "last power user sets should be the one used" implies persistence.
			} else {
				fireControl.classList.add('hidden');
			}
		},
		executeTurnFire: () => {
			if (willFireAtEnd) {
				// Use the stored charge to fire a REAL bullet
				const power = storedCharge > 0 ? storedCharge : minCharge;
				fireBullet(true, power);
			}
		}
	};
};
