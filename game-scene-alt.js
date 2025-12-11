import * as BABYLON from '@babylonjs/core';

export const initGameSceneAlt = async (scene, shadowGenerator, spawns) => {
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
	
	// --- Ghost Enemy Logic ---
	if (spawns && spawns.length > 0) {
		// Define materials for different ghost types
		const ghostMaterials = {};
		const colors = {
			2: new BABYLON.Color3(1, 0, 0), // Red
			3: new BABYLON.Color3(0, 1, 0), // Green
			4: new BABYLON.Color3(0, 0, 1)  // Blue
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
			createEye(0.25);  // Right Eye
			
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
				new BABYLON.Vector3(0, 0, 1),  // Forward
				new BABYLON.Vector3(0, 0, -1), // Back
				new BABYLON.Vector3(1, 0, 0),  // Right
				new BABYLON.Vector3(-1, 0, 0)  // Left
			];
			
			// Pick random initial direction
			let moveDir = directions[Math.floor(Math.random() * directions.length)];
			
			// State: Start by rotating to face the initial direction
			let isRotating = true;
			
			// Calculate initial target rotation based on direction
			// We rotate the VISUAL mesh (ghostNode), not the collider
			let targetRotY = Math.atan2(moveDir.x, moveDir.z);
			
			// Collision Callback
			ghostAgg.body.setCollisionCallbackEnabled(true);
			const collisionObservable = ghostAgg.body.getCollisionObservable();
			
			let lastTurnTime = 0;
			
			collisionObservable.add((event) => {
				// If already rotating, ignore collisions (we are effectively stationary)
				if (isRotating) return;
				
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
					// We add PI to current rotation to ensure a smooth 180 turn
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
			
			// Render Loop for Movement & Rotation
			const observer = scene.onBeforeRenderObservable.add(() => {
				if (collider.isDisposed()) {
					scene.onBeforeRenderObservable.remove(observer);
					return;
				}
				
				const dt = scene.getEngine().getDeltaTime() / 1000;
				
				if (isRotating) {
					// --- Rotation State ---
					// Interpolate rotation of the VISUAL mesh towards target
					const rotationSpeed = 5.0;
					const diff = Math.abs(targetRotY - ghostNode.rotation.y);
					
					if (diff < 0.05) {
						// Snap and switch to moving
						ghostNode.rotation.y = targetRotY;
						isRotating = false;
					} else {
						ghostNode.rotation.y = BABYLON.Scalar.Lerp(ghostNode.rotation.y, targetRotY, rotationSpeed * dt);
					}
					
					// Ensure zero horizontal velocity while rotating
					const vel = new BABYLON.Vector3();
					ghostAgg.body.getLinearVelocityToRef(vel);
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
					
				} else {
					// --- Moving State ---
					const velocity = moveDir.scale(speed);
					const currentLinearVel = new BABYLON.Vector3();
					ghostAgg.body.getLinearVelocityToRef(currentLinearVel);
					
					// Apply velocity (preserve gravity)
					ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(velocity.x, currentLinearVel.y, velocity.z));
					
					// Stuck Check: If velocity is very low but we aren't meant to be stopped
					const horizontalSpeed = Math.sqrt(currentLinearVel.x ** 2 + currentLinearVel.z ** 2);
					if (horizontalSpeed < 0.5 && Date.now() - lastTurnTime > 1000) {
						// Force a turn
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
