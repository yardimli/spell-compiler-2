import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	const thrownBalls = [];
	let currentCharge = 0;
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	
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
			const force =  5+  Math.random() * 5;
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
	
	// Input handling for charging/firing
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
			
			if (key === 'z') {
				fireBall();
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
		
		// Apply Force
		ballAgg.body.applyImpulse(aimDir.scale(throwPower), ball.absolutePosition);
		
		// Track
		const ballData = { mesh: ball, agg: ballAgg, age: 0, isDead: false };
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
			// We check if the hit object is a target we want to explode on.
			// Walls are named 'wall_x', balls are 'spherex' or 'thrownBall'.
			const isTarget = name.includes('wall') || name.includes('sphere') || name.includes('thrownBall');
			
			if (isTarget) {
				createExplosion(ball.absolutePosition);
				ballData.isDead = true;
				ballAgg.body.getCollisionObservable().remove(collisionObserver);
			}
			// If not target (e.g. 'ground'), do nothing -> Physics handles bounce.
		});
		
		// Reset UI
		currentCharge = 0;
		powerContainer.style.display = 'none';
		powerBar.style.width = '0%';
	};
	
	// Update Loop
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		// 1. Lifecycle Management
		for (let i = thrownBalls.length - 1; i >= 0; i--) {
			const b = thrownBalls[i];
			b.age += dt;
			
			if (b.isDead) {
				b.agg.dispose();
				b.mesh.dispose();
				thrownBalls.splice(i, 1);
				continue;
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
