import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager, playerManager) => {
	const bullets = [];
	let currentCharge = 0;
	let storedCharge = 0;
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	const fireCheckbox = document.getElementById('chk-fire');
	const fireControl = document.getElementById('fire-control');
	
	// Target Selection
	let currentTarget = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	const targetColor = new BABYLON.Color3(0, 1, 1);
	
	let isTurnActive = true;
	
	// --- Explosion Logic (Same as before) ---
	const createExplosion = (position, color = null) => {
		// ... (Keep existing explosion logic) ...
		const fragmentCount = 8;
		for (let i = 0; i < fragmentCount; i++) {
			const frag = BABYLON.MeshBuilder.CreatePolyhedron('frag', { type: 1, size: 0.3 }, scene);
			frag.position = position.clone();
			frag.position.addInPlace(new BABYLON.Vector3((Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5));
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			fragMat.diffuseColor = color || new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
			frag.material = fragMat;
			const fragAgg = new BABYLON.PhysicsAggregate(frag, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 0.2, restitution: 0.5 }, scene);
			const dir = new BABYLON.Vector3(Math.random()-0.5, Math.random(), Math.random()-0.5).normalize();
			fragAgg.body.applyImpulse(dir.scale(5 + Math.random() * 5), frag.absolutePosition);
			setTimeout(() => { frag.dispose(); fragAgg.dispose(); }, 1500);
		}
		
		scene.meshes.forEach((mesh) => {
			if (mesh.physicsBody) {
				const distance = BABYLON.Vector3.Distance(position, mesh.absolutePosition);
				if (distance < 2.0) {
					const direction = mesh.absolutePosition.subtract(position).normalize();
					mesh.physicsBody.applyImpulse(direction.scale(5.0 * (1 - (distance / 2.0))), mesh.absolutePosition);
				}
			}
		});
	};
	
	// --- Target Management ---
	const getVisibleTargets = () => {
		const camera = cameraManager.getActiveCamera();
		return scene.meshes.filter(m => m.name.startsWith('sphere') && m.isEnabled() && !m.isDisposed() && camera.isInFrustum(m));
	};
	
	const cycleTarget = () => {
		const visibleTargets = getVisibleTargets();
		if (visibleTargets.length === 0) { setTarget(null); return; }
		visibleTargets.sort((a, b) => a.name.localeCompare(b.name));
		let nextIndex = 0;
		if (currentTarget) {
			const currentIndex = visibleTargets.indexOf(currentTarget);
			if (currentIndex !== -1) nextIndex = (currentIndex + 1) % visibleTargets.length;
		}
		setTarget(visibleTargets[nextIndex]);
	};
	
	const setTarget = (mesh) => {
		if (currentTarget) highlightLayer.removeMesh(currentTarget);
		currentTarget = mesh;
		if (currentTarget) highlightLayer.addMesh(currentTarget, targetColor);
	};
	
	// Input
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) inputMap[key] = true;
		else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
			if (key === 'z') {
				storedCharge = Math.max(minCharge, currentCharge);
				fireGhostBullet(storedCharge);
				currentCharge = 0;
			}
			if (key === 'c' && isTurnActive) cycleTarget();
		}
	});
	
	// --- Fire Logic ---
	
	// 1. Ghost Bullet (Planning Phase)
	const fireGhostBullet = (power) => {
		// Calculate rotation needed to face target
		let aimRotation = playerVisual.rotation.y;
		
		if (currentTarget && !currentTarget.isDisposed()) {
			const dir = currentTarget.absolutePosition.subtract(playerVisual.absolutePosition);
			aimRotation = Math.atan2(dir.x, dir.z);
		} else {
			// If no target, use camera or player forward?
			// Let's use player visual forward
			aimRotation = playerVisual.rotation.y;
		}
		
		// Add Waypoint
		playerManager.addWaypoint('FIRE', {
			power: power,
			target: currentTarget, // Store reference (might be disposed later, handle with care)
			rotation: aimRotation
		});
		
		// Visual feedback (Ghost bullet)
		spawnBullet(false, power, playerVisual.absolutePosition, aimRotation, currentTarget);
	};
	
	// 2. Real Bullet (Replay Phase)
	const fireRealBullet = (waypointData) => {
		// Position is where the player is currently standing (which should be the waypoint pos)
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnBullet(true, waypointData.power, spawnPos, waypointData.rotation, waypointData.target);
	};
	
	const spawnBullet = (isReal, power, position, rotationY, target) => {
		const bullet = BABYLON.MeshBuilder.CreateSphere('bullet', { diameter: 0.4 }, scene);
		bullet.material = new BABYLON.StandardMaterial('bulletMat', scene);
		
		if (isReal) {
			bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 0);
			bullet.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
		} else {
			bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 1);
			bullet.material.alpha = 0.5;
		}
		
		const spawnHeight = position.clone();
		spawnHeight.y += 1.5;
		
		const rotationMatrix = BABYLON.Matrix.RotationY(rotationY);
		const aimDir = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Forward(), rotationMatrix).normalize();
		
		bullet.position = spawnHeight.add(aimDir.scale(1.5));
		shadowGenerator.addShadowCaster(bullet);
		
		const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.5, restitution: 0.8 }, scene);
		bulletAgg.body.setGravityFactor(0);
		bulletAgg.body.applyImpulse(aimDir.scale(power), bullet.absolutePosition);
		
		const bulletData = { mesh: bullet, agg: bulletAgg, age: 0, isDead: false, isReal: isReal };
		bullets.push(bulletData);
		
		bulletAgg.body.setCollisionCallbackEnabled(true);
		const collisionObserver = bulletAgg.body.getCollisionObservable().add((event) => {
			if (bulletData.isDead) return;
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const name = hitBody.transformNode.name;
			if (name.includes('wall') || name.includes('sphere') || name.includes('bullet')) {
				if (isReal) {
					createExplosion(bullet.absolutePosition);
					if (name.includes('sphere')) {
						createExplosion(hitBody.transformNode.absolutePosition, hitBody.transformNode.material?.diffuseColor);
						hitBody.transformNode.dispose();
					}
					bulletData.isDead = true;
					bulletAgg.body.getCollisionObservable().remove(collisionObserver);
				}
			}
		});
	};
	
	// Update Loop
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
		
		// Charging UI
		if (inputMap['z']) {
			if (currentCharge < maxCharge) currentCharge += chargeRate;
			powerContainer.style.display = 'block';
			powerBar.style.width = `${(currentCharge / maxCharge) * 100}%`;
		} else {
			powerContainer.style.display = 'none';
		}
	});
	
	return {
		setTurnActive: (active) => {
			isTurnActive = active;
			if (active) {
				fireControl.classList.remove('hidden');
			} else {
				fireControl.classList.add('hidden');
			}
		},
		fireFromWaypoint: fireRealBullet
	};
};
