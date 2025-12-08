import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	const thrownBalls = [];
	let currentCharge = 0;
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	
	// --- NEW: Target Selection Variables ---
	let currentTarget = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	// Color for the glow effect (Greenish-Blue)
	const targetColor = new BABYLON.Color3(0, 1, 1);
	
	// --- NEW: Explosion Logic ---
	const createExplosion = (position) => {
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
			
			// Fragment Material (Orange/Yellow for explosion look)
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			fragMat.diffuseColor = new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
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
	
	// --- NEW: Target Management Functions ---
	
	// Helper to find all valid targets currently in the camera's view
	const getVisibleTargets = () => {
		const camera = cameraManager.getActiveCamera();
		// Filter meshes: Must start with 'sphere' (from game-scene-alt), be enabled, and inside frustum
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
			// No targets available
			setTarget(null);
			return;
		}
		
		// Sort targets to ensure consistent cycling order (e.g., by name or distance)
		// Here we sort by name for stability
		visibleTargets.sort((a, b) => a.name.localeCompare(b.name));
		
		let nextIndex = 0;
		
		if (currentTarget) {
			const currentIndex = visibleTargets.indexOf(currentTarget);
			if (currentIndex !== -1) {
				// Pick the next one, wrapping around
				nextIndex = (currentIndex + 1) % visibleTargets.length;
			}
		}
		
		setTarget(visibleTargets[nextIndex]);
	};
	
	const setTarget = (mesh) => {
		// Clear previous highlight
		if (currentTarget) {
			highlightLayer.removeMesh(currentTarget);
		}
		
		currentTarget = mesh;
		
		// Add new highlight
		if (currentTarget) {
			highlightLayer.addMesh(currentTarget, targetColor);
		}
	};
	
	// Input handling for charging/firing/targeting
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
			
			if (key === 'c') {
				fireBall();
			}
			// --- NEW: Cycle Target on 'x' ---
			if (key === 'x') {
				cycleTarget();
			}
		}
	});
	
	const fireBall = () => {
		const throwPower = Math.max(minCharge, currentCharge);
		
		// Create Ball
		const ball = BABYLON.MeshBuilder.CreateSphere('thrownBall', { diameter: 0.8 }, scene);
		ball.material = new BABYLON.StandardMaterial('thrownMat', scene);
		ball.material.diffuseColor = new BABYLON.Color3(1, 0, 0);
		
		// Calculate Spawn Position
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnPos.y += 1.5; // Eye level
		
		// Get aim direction from player visual
		const aimDir = playerVisual.getDirection(BABYLON.Vector3.Forward());
		aimDir.normalize();
		
		// Offset spawn
		ball.position = spawnPos.add(aimDir.scale(1.5));
		
		shadowGenerator.addShadowCaster(ball);
		
		// Physics
		const ballAgg = new BABYLON.PhysicsAggregate(
			ball,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 0.5, restitution: 0.8 },
			scene
		);
		
		// Apply Force (Initial Launch)
		ballAgg.body.applyImpulse(aimDir.scale(throwPower), ball.absolutePosition);
		
		// Track
		// --- CHANGED: Store target in ball data ---
		const ballData = {
			mesh: ball,
			agg: ballAgg,
			age: 0,
			isDead: false,
			target: currentTarget // Attach current target (can be null)
		};
		thrownBalls.push(ballData);
		
		// --- Collision Logic ---
		ballAgg.body.setCollisionCallbackEnabled(true);
		
		const collisionObserver = ballAgg.body.getCollisionObservable().add((event) => {
			if (ballData.isDead) return;
			
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const hitMesh = hitBody.transformNode;
			const name = hitMesh.name;
			
			// Requirement: Bounce on ground, Explode on Wall or Ball
			const isTarget = name.includes('wall') || name.includes('sphere') || name.includes('thrownBall');
			
			if (isTarget) {
				createExplosion(ball.absolutePosition);
				ballData.isDead = true;
				ballAgg.body.getCollisionObservable().remove(collisionObserver);
				
				// If we hit the target we were aiming at, clear the global target selection
				if (ballData.target && hitMesh === ballData.target) {
					setTarget(null);
				}
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
		
		// --- NEW: Check Target Visibility ---
		if (currentTarget) {
			const camera = cameraManager.getActiveCamera();
			// If target is disposed or out of view, deselect it
			if (currentTarget.isDisposed() || !currentTarget.isEnabled() || !camera.isInFrustum(currentTarget)) {
				setTarget(null);
			}
		}
		
		// 1. Lifecycle Management & Homing Logic
		for (let i = thrownBalls.length - 1; i >= 0; i--) {
			const b = thrownBalls[i];
			b.age += dt;
			
			if (b.isDead) {
				b.agg.dispose();
				b.mesh.dispose();
				thrownBalls.splice(i, 1);
				continue;
			}
			
			// --- NEW: Homing Logic ---
			if (b.target && !b.target.isDisposed()) {
				// Calculate direction to target
				const targetPos = b.target.absolutePosition;
				const ballPos = b.mesh.absolutePosition;
				const direction = targetPos.subtract(ballPos).normalize();
				
				// Apply homing force (steering)
				// We apply a continuous force to steer the ball towards the target
				const homingForce = 15.0 * dt; // Adjust strength as needed
				b.agg.body.applyImpulse(direction.scale(homingForce), ballPos);
			}
			
			// Increased lifetime to allow for bounces
			if (b.age > 5.0) {
				b.mesh.scaling.scaleInPlace(0.98);
				
				if (b.mesh.scaling.x < 0.1) {
					b.agg.dispose();
					b.mesh.dispose();
					thrownBalls.splice(i, 1);
				}
			}
		}
		
		// 2. Charging Logic
		if (inputMap['c']) {
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
