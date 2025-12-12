import * as BABYLON from '@babylonjs/core';

export const initGameSceneAlt = async (scene, shadowGenerator, spawns, playerRoot, playerMethods, timeManager, uiManager) => {
	// Extract playerVisual from the playerMethods object (playerManager)
	const playerVisual = playerMethods.playerVisual;
	
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
			// Scale rotation speed by timeScale
			const ts = timeManager ? timeManager.getTimeScale() : 1.0;
			textMesh.rotate(BABYLON.Axis.Y, 0.01 * ts, BABYLON.Space.LOCAL);
			textAgg.body.setTargetTransform(textMesh.absolutePosition, textMesh.rotationQuaternion);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Particle Helper ---
	const createImpactParticles = (position, type) => {
		let color;
		if (type === 'fire') color = new BABYLON.Color3(1, 0.5, 0); // Orange
		else if (type === 'frost') color = new BABYLON.Color3(0.5, 0.8, 1); // Blue
		else color = new BABYLON.Color3(0.8, 0.8, 0.8); // Neutral/Grey
		
		const count = 8;
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		
		for (let i = 0; i < count; i++) {
			const p = BABYLON.MeshBuilder.CreatePolyhedron('p', { type: 1, size: 0.15 }, scene);
			p.position = position.clone();
			const mat = new BABYLON.StandardMaterial('pMat', scene);
			mat.emissiveColor = color;
			mat.disableLighting = true;
			p.material = mat;
			
			const agg = new BABYLON.PhysicsAggregate(p, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.1 }, scene);
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			// Scale impulse by timeScale
			agg.body.applyImpulse(dir.scale(2 * ts), p.absolutePosition);
			
			setTimeout(() => {
				p.dispose();
				agg.dispose();
			}, 500);
		}
	};
	
	// --- Track Active Enemy Bullets for Scaling and Cleanup ---
	const activeEnemyBullets = [];
	
	// Listen for Slow Motion to Scale Enemy Bullets
	if (timeManager && timeManager.addStateChangeListener) {
		timeManager.addStateChangeListener((isSlow) => {
			const scale = isSlow ? 3.0 : 1.0;
			activeEnemyBullets.forEach(b => {
				if (!b.isDisposed()) {
					b.scaling.setAll(scale);
				}
			});
		});
	}
	
	// Global loop for bullet cleanup (replaces setTimeout)
	scene.onBeforeRenderObservable.add(() => {
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		const dt = (scene.getEngine().getDeltaTime() / 1000) * ts;
		
		for (let i = activeEnemyBullets.length - 1; i >= 0; i--) {
			const bullet = activeEnemyBullets[i];
			
			if (bullet.isDisposed()) {
				activeEnemyBullets.splice(i, 1);
				continue;
			}
			
			// Update age
			if (bullet.metadata && typeof bullet.metadata.age === 'number') {
				bullet.metadata.age += dt;
				
				// Cleanup after max lifetime (variable based on power)
				const maxLife = bullet.metadata.maxLife || 5.0;
				if (bullet.metadata.age >= maxLife) {
					if (bullet.metadata.aggregate) {
						bullet.metadata.aggregate.dispose();
					}
					bullet.dispose();
					activeEnemyBullets.splice(i, 1);
				}
			}
		}
	});
	
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
			
			// --- Ghost State & Metadata ---
			// Initialize Energy and Next Bullet Type
			let ghostEnergy = 100;
			let nextBulletType = Math.random() > 0.5 ? 'fire' : 'frost';
			// We calculate intended power dynamically based on distance, but store a placeholder for UI
			let nextBulletPower = 1.0;
			
			// Attach metadata to collider (logic root) so picking can find it
			collider.metadata = {
				type: 'ghost',
				energy: ghostEnergy,
				nextType: nextBulletType,
				nextPower: nextBulletPower
			};
			
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
			// Use a countdown timer (game time) instead of Date.now() (real time)
			// Random start delay between 0 and 5 seconds + 8 seconds base
			let fireTimer = (Math.random() * 5.0) + 8.0;
			
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
				
				// Get Time Scale
				const ts = timeManager ? timeManager.getTimeScale() : 1.0;
				const dt = (scene.getEngine().getDeltaTime() / 1000) * ts;
				
				// Update Metadata for UI (Distance check for power prediction)
				const distToPlayer = BABYLON.Vector3.Distance(collider.position, playerRoot.position);
				// Simple linear mapping: 0m = 1.0, 30m = 0.1
				let predictedPower = Math.max(0.1, Math.min(1.0, 1.0 - (distToPlayer / 30.0)));
				// Cap predicted power by available energy
				if (ghostEnergy < predictedPower * 10) {
					predictedPower = ghostEnergy / 10;
				}
				collider.metadata.energy = ghostEnergy;
				collider.metadata.nextType = nextBulletType;
				collider.metadata.nextPower = predictedPower;
				
				// Decrement fire timer with game time
				if (!isAttacking && !isRotating) {
					fireTimer -= dt;
				}
				
				// --- Shooting Logic ---
				if (!isAttacking && !isRotating && fireTimer <= 0) {
					// Check if we have enough energy to fire even a weak shot (min 1 energy for 0.1 power)
					if (ghostEnergy >= 1.0) {
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
						const performAttack = async () => {
							// A. Turn to Player
							let startRot = ghostNode.rotation.y;
							// Normalize angles
							let diff = angleToPlayer - startRot;
							while (diff > Math.PI) diff -= Math.PI * 2;
							while (diff < -Math.PI) diff += Math.PI * 2;
							const endRot = startRot + diff;
							
							// Helper to animate rotation respecting Time Scale
							const animateTurn = (targetAngle) => {
								return new Promise(resolve => {
									const loop = () => {
										if (collider.isDisposed()) return;
										// Re-fetch dt inside loop as it changes
										const currentTs = timeManager ? timeManager.getTimeScale() : 1.0;
										const currentDt = (scene.getEngine().getDeltaTime() / 1000) * currentTs;
										
										const turnSpeed = 5.0;
										ghostNode.rotation.y = BABYLON.Scalar.Lerp(ghostNode.rotation.y, targetAngle, turnSpeed * currentDt);
										
										if (Math.abs(ghostNode.rotation.y - targetAngle) < 0.05) {
											ghostNode.rotation.y = targetAngle;
											resolve();
										} else {
											requestAnimationFrame(loop);
										}
									};
									loop();
								});
							};
							
							// Helper to wait game time
							const waitGameTime = (seconds) => {
								return new Promise(resolve => {
									let elapsed = 0;
									const timerLoop = () => {
										const ts = timeManager ? timeManager.getTimeScale() : 1.0;
										elapsed += (scene.getEngine().getDeltaTime() / 1000) * ts;
										if (elapsed >= seconds) resolve();
										else requestAnimationFrame(timerLoop);
									};
									timerLoop();
								});
							};
							
							await animateTurn(endRot);
							
							// --- NEW: Line of Sight Check ---
							let hasLineOfSight = false;
							
							const rayOrigin = collider.position.clone();
							rayOrigin.y += 1.0; // Eye height
							
							const rayTarget = playerRoot.position.clone();
							rayTarget.y += 1.0; // Player center height
							
							const direction = rayTarget.subtract(rayOrigin);
							const dist = direction.length();
							direction.normalize();
							
							const ray = new BABYLON.Ray(rayOrigin, direction, dist);
							
							const hit = scene.pickWithRay(ray, (mesh) => {
								// Ignore self (collider and visual children)
								if (mesh === collider || mesh.isDescendantOf(collider)) return false;
								// Ignore bullets
								if (mesh.name.toLowerCase().includes('bullet')) return false;
								// Ignore UI lines
								if (mesh.name === 'hLine' || mesh.name === 'vLine') return false;
								// Ignore skybox/text
								if (mesh.name === 'text' || mesh.name.includes('skyBox')) return false;
								
								return true;
							});
							
							if (hit && hit.hit && hit.pickedMesh) {
								const m = hit.pickedMesh;
								// Check if player (Root or Visual)
								if (m === playerRoot || m === playerVisual || m.isDescendantOf(playerRoot)) {
									hasLineOfSight = true;
								}
							}
							
							if (hasLineOfSight) {
								// B. Calculate Power & Fire Bullet
								// Recalculate distance at moment of firing
								const currentDist = BABYLON.Vector3.Distance(collider.position, playerRoot.position);
								
								// Power Logic: Close = High, Far = Low
								// Map 0m -> 1.0, 30m -> 0.1
								let power = Math.max(0.1, Math.min(1.0, 1.0 - (currentDist / 30.0)));
								
								// Conservation Logic:
								// If we are close (High Power) but energy is getting low (< 50),
								// or just randomly to save energy, reduce power.
								// 30% chance to halve power if power > 0.5
								if (power > 0.5 && Math.random() < 0.3) {
									power *= 0.5;
								}
								
								// Cost Logic: Full power (1.0) = 10 Energy
								let cost = power * 10;
								
								// If not enough energy, scale power down to what we can afford
								if (ghostEnergy < cost) {
									power = ghostEnergy / 10;
									cost = ghostEnergy;
								}
								
								// Deduct Energy
								ghostEnergy -= cost;
								
								const bulletType = nextBulletType;
								const bullet = BABYLON.MeshBuilder.CreateSphere('enemyBullet', { diameter: 0.4 }, scene);
								const bulletMat = new BABYLON.StandardMaterial('enemyBulletMat', scene);
								
								// Visuals: Same as player (Yellow)
								bulletMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
								bulletMat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
								bullet.material = bulletMat;
								
								// Store type and power in metadata for interaction
								// Scale lifetime by power: Base 2s + (Power * 3s) -> Max 5s
								const lifetime = 2.0 + (power * 3.0);
								
								bullet.metadata = {
									type: bulletType,
									power: power,
									age: 0,
									maxLife: lifetime
								};
								
								// Initial Scaling
								if (timeManager && timeManager.isSlowMotion()) {
									bullet.scaling.setAll(3.0);
								}
								
								// Track bullet
								activeEnemyBullets.push(bullet);
								
								// Position at ghost eye level
								const spawnPos = collider.position.clone();
								spawnPos.y += 1.0;
								const forward = new BABYLON.Vector3(Math.sin(endRot), 0, Math.cos(endRot));
								bullet.position = spawnPos.add(forward.scale(1.5));
								
								const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.5, restitution: 0.8 }, scene);
								bulletAgg.body.setGravityFactor(0);
								
								// Store aggregate for cleanup
								bullet.metadata.aggregate = bulletAgg;
								
								// Speed: Half of player (Player=20, so 10)
								// Scale impulse by timeScale
								const currentTs = timeManager ? timeManager.getTimeScale() : 1.0;
								bulletAgg.body.applyImpulse(forward.scale(10 * currentTs), bullet.absolutePosition);
								
								// Bullet Collision Logic
								bulletAgg.body.setCollisionCallbackEnabled(true);
								const bObserver = bulletAgg.body.getCollisionObservable().add((bEvent) => {
									const hit = bEvent.collidedAgainst;
									if (!hit || !hit.transformNode) return;
									const hitName = hit.transformNode.name;
									
									if (hitName === 'playerRoot' || hitName === 'playerVisual') {
										// Hit Player
										// Calculate effects based on power
										if (bulletType === 'fire') {
											// Full power = 10 damage
											const damage = Math.ceil(10 * power);
											playerMethods.takeDamage(damage);
											createImpactParticles(bullet.absolutePosition, 'fire');
										} else {
											// Full power = 5 seconds slow
											const slowDuration = 5.0 * power;
											playerMethods.applyFrost(slowDuration);
											createImpactParticles(bullet.absolutePosition, 'frost');
										}
									} else {
										// Hit Wall or Ghost -> Disappear with small particle
										createImpactParticles(bullet.absolutePosition, 'neutral');
									}
									
									// Destroy Bullet
									const idx = activeEnemyBullets.indexOf(bullet);
									if (idx > -1) activeEnemyBullets.splice(idx, 1);
									
									bulletAgg.dispose();
									bullet.dispose();
								});
								
								// C. Wait a moment (scaled by time)
								await waitGameTime(0.5);
							}
							
							// D. Turn Back to Movement Direction
							await animateTurn(originalRotY);
							
							// E. Resume & Pick Next Bullet Type
							isAttacking = false;
							nextBulletType = Math.random() > 0.5 ? 'fire' : 'frost';
							// Set next fire time (8-10 seconds game time)
							fireTimer = (Math.random() * 2.0) + 8.0;
						};
						
						performAttack();
					} else {
						// Not enough energy to fire, just reset timer to check again later
						fireTimer = 2.0;
					}
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
					// Scale velocity by timeScale
					const velocity = moveDir.scale(speed * ts);
					const currentLinearVel = new BABYLON.Vector3();
					ghostAgg.body.getLinearVelocityToRef(currentLinearVel);
					
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(velocity.x, currentLinearVel.y, velocity.z));
					
					// Stuck Check
					const horizontalSpeed = Math.sqrt(currentLinearVel.x ** 2 + currentLinearVel.z ** 2);
					// Use real time for stuck check timeout (stuck is a physics state, not game logic)
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
