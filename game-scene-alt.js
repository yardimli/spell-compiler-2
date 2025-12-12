import * as BABYLON from '@babylonjs/core';

export const initGameSceneAlt = async (scene, shadowGenerator, spawns, playerRoot, playerMethods) => {
	// --- 3D Text (Kept from original) ---
	const fontURL = './assets/fonts/Kenney%20Future%20Regular.json';
	try {
		const fontResponse = await fetch(fontURL);
		const fontData = await fontResponse.json();
		
		if (!fontData || !fontData.boundingBox) {
			throw new Error('Font data is missing boundingBox');
		}
		
		const textMesh = BABYLON.MeshBuilder.CreateText(
			'text',
			'REALTIME',
			fontData,
			{ size: 2, depth: 0.5, resolution: 64 },
			scene
		);
		
		const silverMat = new BABYLON.PBRMaterial('silver', scene);
		silverMat.metallic = 1.0;
		silverMat.roughness = 0.15;
		silverMat.albedoColor = new BABYLON.Color3(0.9, 0.9, 0.9);
		textMesh.material = silverMat;
		
		shadowGenerator.addShadowCaster(textMesh);
		
		textMesh.computeWorldMatrix(true);
		const center = textMesh.getBoundingInfo().boundingBox.center;
		textMesh.position.x -= center.x;
		textMesh.position.y -= center.y;
		textMesh.position.z -= center.z;
		textMesh.bakeCurrentTransformIntoVertices();
		
		textMesh.position.y = 12;
		textMesh.position.x = 0;
		textMesh.position.z = 0;
		
		const textAgg = new BABYLON.PhysicsAggregate(
			textMesh,
			BABYLON.PhysicsShapeType.CONVEX_HULL,
			{ mass: 0, restitution: 0.9 },
			scene
		);
		
		textAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
		textAgg.body.disablePreStep = false;
		
		scene.registerBeforeRender(() => {
			textMesh.rotate(BABYLON.Axis.Y, 0.01, BABYLON.Space.LOCAL);
			textAgg.body.setTargetTransform(textMesh.absolutePosition, textMesh.rotationQuaternion);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Particle Helper ---
	const createImpactParticles = (position, type) => {
		const color = type === 'fire' ? new BABYLON.Color3(1, 0.2, 0) : new BABYLON.Color3(0.5, 0.8, 1);
		const count = 5;
		
		for (let i = 0; i < count; i++) {
			const p = BABYLON.MeshBuilder.CreatePolyhedron('p', { type: 1, size: 0.15 }, scene);
			p.position = position.clone();
			const mat = new BABYLON.StandardMaterial('pMat', scene);
			mat.emissiveColor = color;
			mat.disableLighting = true;
			p.material = mat;
			
			const agg = new BABYLON.PhysicsAggregate(p, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.1 }, scene);
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			agg.body.applyImpulse(dir.scale(2), p.absolutePosition);
			
			setTimeout(() => {
				p.dispose();
				agg.dispose();
			}, 500);
		}
	};
	
	// --- Ghost Enemy Logic ---
	if (spawns && spawns.length > 0) {
		// Define materials for different ghost types
		const ghostMaterials = {};
		const colors = {
			2: new BABYLON.Color3(1, 0, 0), // Red
			3: new BABYLON.Color3(0, 1, 0), // Green
			4: new BABYLON.Color3(0, 0, 1) // Blue
		};
		
		Object.keys(colors).forEach(key => {
			const mat = new BABYLON.StandardMaterial(`ghostMat_${key}`, scene);
			mat.diffuseColor = colors[key];
			mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
			ghostMaterials[key] = mat;
		});
		
		const eyeMat = new BABYLON.StandardMaterial('eyeMat', scene);
		eyeMat.diffuseColor = new BABYLON.Color3(1, 1, 1); // White eyes
		eyeMat.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2);
		
		const pupilMat = new BABYLON.StandardMaterial('pupilMat', scene);
		pupilMat.diffuseColor = new BABYLON.Color3(0, 0, 0); // Black pupils
		
		// Helper to create a Ghost Mesh
		const createGhostMesh = (index, type) => {
			const root = new BABYLON.TransformNode(`ghost_${index}`, scene);
			
			// 1. Head (Sphere)
			const head = BABYLON.MeshBuilder.CreateSphere('head', { diameter: 1.2 }, scene);
			head.position.y = 1.0;
			head.parent = root;
			head.material = ghostMaterials[type] || ghostMaterials[2];
			
			// 2. Skirt (Cylinder with different top/bottom diameters)
			const skirt = BABYLON.MeshBuilder.CreateCylinder('skirt', {
				height: 1.2,
				diameterTop: 1.2,
				diameterBottom: 1.8,
				tessellation: 16
			}, scene);
			skirt.position.y = 0.0; // Below head
			skirt.parent = root;
			skirt.material = ghostMaterials[type] || ghostMaterials[2];
			
			// 3. Eyes (to indicate direction)
			const createEye = (xOffset) => {
				const eye = BABYLON.MeshBuilder.CreateSphere('eye', { diameter: 0.4 }, scene);
				eye.position.set(xOffset, 1.1, 0.5); // Slightly forward and up
				eye.parent = root;
				eye.material = eyeMat;
				
				const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', { diameter: 0.15 }, scene);
				pupil.position.set(0, 0, 0.18); // Slightly forward of eye
				pupil.parent = eye;
				pupil.material = pupilMat;
			};
			
			createEye(-0.25); // Left Eye
			createEye(0.25); // Right Eye
			
			shadowGenerator.addShadowCaster(head);
			shadowGenerator.addShadowCaster(skirt);
			
			return root;
		};
		
		// Spawn Ghosts
		spawns.forEach((spawn, index) => {
			const ghostNode = createGhostMesh(index, spawn.type);
			
			// Physics Aggregate (Capsule for smooth movement)
			const collider = BABYLON.MeshBuilder.CreateCapsule(`ghostCollider_${index}`, { radius: 0.9, height: 2.2 }, scene);
			collider.position = spawn.position.clone();
			collider.position.y = 2.0; // Adjust height
			collider.visibility = 0; // Invisible physics body
			
			// Parent the visual parts to the collider
			ghostNode.parent = collider;
			ghostNode.position = new BABYLON.Vector3(0, 0, 0); // Reset relative pos
			
			// Initialize visual rotation to 0 (relative to collider)
			ghostNode.rotation = new BABYLON.Vector3(0, 0, 0);
			
			const ghostAgg = new BABYLON.PhysicsAggregate(
				collider,
				BABYLON.PhysicsShapeType.CAPSULE,
				{ mass: 10, friction: 0, restitution: 0 },
				scene
			);
			
			// Lock rotation on the physics body so it doesn't tip over or spin due to collisions
			ghostAgg.body.setMassProperties({
				inertia: new BABYLON.Vector3(0, 0, 0)
			});
			
			// --- Movement Logic ---
			const speed = 6.0;
			const directions = [
				new BABYLON.Vector3(0, 0, 1), // Forward
				new BABYLON.Vector3(0, 0, -1), // Back
				new BABYLON.Vector3(1, 0, 0), // Right
				new BABYLON.Vector3(-1, 0, 0) // Left
			];
			
			// Pick random initial direction
			let moveDir = directions[Math.floor(Math.random() * directions.length)];
			
			// State: Start by rotating to face the initial direction
			let isRotating = true;
			let isAttacking = false; // New State for shooting
			
			// Calculate initial target rotation based on direction
			let targetRotY = Math.atan2(moveDir.x, moveDir.z);
			
			// Collision Callback
			ghostAgg.body.setCollisionCallbackEnabled(true);
			const collisionObservable = ghostAgg.body.getCollisionObservable();
			
			let lastTurnTime = 0;
			
			// --- Shooting Timer ---
			// Random start delay between 0 and 5 seconds, then interval of 8-10s
			let nextFireTime = Date.now() + (Math.random() * 5000) + 8000;
			
			collisionObservable.add((event) => {
				// If already rotating or attacking, ignore collisions
				if (isRotating || isAttacking) return;
				
				const now = Date.now();
				// Debounce to prevent rapid flipping
				if (now - lastTurnTime < 500) return;
				
				const hitBody = event.collidedAgainst;
				if (!hitBody || !hitBody.transformNode) return;
				
				const name = hitBody.transformNode.name;
				
				// Turn 180 if hitting Wall, Player, or another Ghost
				if (name.includes('wall') || name.includes('player') || name.includes('ghost')) {
					// 1. Flip Direction
					moveDir = moveDir.scale(-1);
					
					// 2. Set Target Rotation (Add 180 degrees / PI)
					targetRotY = ghostNode.rotation.y + Math.PI;
					
					// 3. Enter Rotating State
					isRotating = true;
					lastTurnTime = now;
					
					// 4. Stop Movement Immediately
					const vel = new BABYLON.Vector3();
					ghostAgg.body.getLinearVelocityToRef(vel);
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
				}
			});
			
			// Render Loop for Movement & Rotation & Shooting
			const observer = scene.onBeforeRenderObservable.add(() => {
				if (collider.isDisposed()) {
					scene.onBeforeRenderObservable.remove(observer);
					return;
				}
				
				const dt = scene.getEngine().getDeltaTime() / 1000;
				const now = Date.now();
				
				// --- Shooting Logic ---
				if (!isAttacking && !isRotating && now > nextFireTime) {
					// Start Attack Sequence
					isAttacking = true;
					
					// 1. Stop Movement
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
					
					// 2. Calculate Angle to Player
					const dirToPlayer = playerRoot.position.subtract(collider.position);
					const angleToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);
					
					// 3. Store original rotation (movement direction)
					const originalRotY = ghostNode.rotation.y;
					
					// 4. Sequence: Turn -> Fire -> Turn Back -> Resume
					// We use a coroutine-like structure via setTimeout for simplicity in this loop
					const performAttack = async () => {
						// A. Turn to Player (Instant or fast lerp - doing instant for responsiveness logic, or we could animate)
						// Let's animate the turn to player over 0.5s
						let t = 0;
						const startRot = ghostNode.rotation.y;
						// Normalize angles
						let diff = angleToPlayer - startRot;
						while (diff > Math.PI) diff -= Math.PI * 2;
						while (diff < -Math.PI) diff += Math.PI * 2;
						const endRot = startRot + diff;
						
						// Simple animation loop helper
						const animateTurn = (target, duration) => {
							return new Promise(resolve => {
								const startTime = Date.now();
								const loop = () => {
									const elapsed = (Date.now() - startTime) / 1000;
									const pct = Math.min(elapsed / duration, 1);
									ghostNode.rotation.y = BABYLON.Scalar.Lerp(startRot, target, pct);
									if (pct < 1) requestAnimationFrame(loop);
									else resolve();
								};
								loop();
							});
						};
						
						// Turn to player
						ghostNode.rotation.y = endRot; // Snap for now to ensure accuracy, or implement smooth turn
						
						// B. Fire Bullet
						const bulletType = Math.random() > 0.5 ? 'fire' : 'frost';
						const bullet = BABYLON.MeshBuilder.CreateSphere('enemyBullet', { diameter: 0.4 }, scene);
						const bulletMat = new BABYLON.StandardMaterial('enemyBulletMat', scene);
						
						if (bulletType === 'fire') {
							bulletMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0); // Orange
							bulletMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
						} else {
							bulletMat.diffuseColor = new BABYLON.Color3(0.5, 0.8, 1); // Light Blue
							bulletMat.emissiveColor = new BABYLON.Color3(0, 0.5, 1);
						}
						bullet.material = bulletMat;
						
						// Position at ghost eye level
						const spawnPos = collider.position.clone();
						spawnPos.y += 1.0;
						const forward = new BABYLON.Vector3(Math.sin(endRot), 0, Math.cos(endRot));
						bullet.position = spawnPos.add(forward.scale(1.5));
						
						const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.5, restitution: 0.8 }, scene);
						bulletAgg.body.setGravityFactor(0);
						
						// Speed: Half of player (Player=20, so 10)
						bulletAgg.body.applyImpulse(forward.scale(10), bullet.absolutePosition);
						
						// Bullet Collision Logic
						bulletAgg.body.setCollisionCallbackEnabled(true);
						const bObserver = bulletAgg.body.getCollisionObservable().add((bEvent) => {
							const hit = bEvent.collidedAgainst;
							if (!hit || !hit.transformNode) return;
							const hitName = hit.transformNode.name;
							
							if (hitName === 'playerRoot' || hitName === 'playerVisual') {
								// Hit Player
								if (bulletType === 'fire') {
									playerMethods.takeDamage(10);
									createImpactParticles(bullet.absolutePosition, 'fire');
								} else {
									playerMethods.applyFrost();
									createImpactParticles(bullet.absolutePosition, 'frost');
								}
							} else {
								// Hit Wall or Ghost
								createImpactParticles(bullet.absolutePosition, 'neutral');
							}
							
							// Destroy Bullet
							bullet.dispose();
							bulletAgg.dispose();
						});
						
						// Cleanup bullet after 5 seconds if no hit
						setTimeout(() => {
							if (!bullet.isDisposed()) {
								bullet.dispose();
								bulletAgg.dispose();
							}
						}, 5000);
						
						// C. Wait a moment
						await new Promise(r => setTimeout(r, 500));
						
						// D. Turn Back to Movement Direction
						ghostNode.rotation.y = originalRotY;
						
						// E. Resume
						isAttacking = false;
						// Set next fire time (8-10 seconds)
						nextFireTime = Date.now() + (Math.random() * 2000) + 8000;
					};
					
					performAttack();
				}
				
				if (isAttacking) {
					// Ensure velocity is zero while attacking
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
					return;
				}
				
				if (isRotating) {
					// --- Rotation State ---
					const rotationSpeed = 5.0;
					const diff = Math.abs(targetRotY - ghostNode.rotation.y);
					
					if (diff < 0.05) {
						ghostNode.rotation.y = targetRotY;
						isRotating = false;
					} else {
						ghostNode.rotation.y = BABYLON.Scalar.Lerp(ghostNode.rotation.y, targetRotY, rotationSpeed * dt);
					}
					
					const vel = new BABYLON.Vector3();
					ghostAgg.body.getLinearVelocityToRef(vel);
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
					
				} else {
					// --- Moving State ---
					const velocity = moveDir.scale(speed);
					const currentLinearVel = new BABYLON.Vector3();
					ghostAgg.body.getLinearVelocityToRef(currentLinearVel);
					
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(velocity.x, currentLinearVel.y, velocity.z));
					
					// Stuck Check
					const horizontalSpeed = Math.sqrt(currentLinearVel.x ** 2 + currentLinearVel.z ** 2);
					if (horizontalSpeed < 0.5 && Date.now() - lastTurnTime > 1000) {
						moveDir = moveDir.scale(-1);
						targetRotY = ghostNode.rotation.y + Math.PI;
						isRotating = true;
						lastTurnTime = Date.now();
					}
				}
			});
		});
	}
	
	return {};
};
