import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders'; // Import all loaders to ensure GLB support

export const createNoobCharacter = async (scene, spawnData, shadowGenerator, timeManager) => {
	// 1. Load the GLB Model
	let result;
	try {
		result = await BABYLON.SceneLoader.ImportMeshAsync(
			'',
			'./assets/characters/',
			'dave.glb',
			scene
		);
	} catch (e) {
		console.error('Failed to load noob_character.glb', e);
		return;
	}
	
	const rootMesh = result.meshes[0];
	const childMeshes = result.meshes.slice(1);
	
	// 2. Setup Physics Collider (Invisible Capsule)
	const colliderHeight = 4.0;
	const colliderRadius = 1.0;
	const collider = BABYLON.MeshBuilder.CreateCapsule('noobCollider', {
		radius: colliderRadius,
		height: colliderHeight
	}, scene);
	
	collider.position = spawnData.position.clone();
	collider.position.y += 2.0; // Adjust for pivot
	collider.visibility = 0; // Invisible physics body
	collider.metadata = { type: 'noob', name: 'Noob Character' };
	
	// 3. Setup Visual Pivot (Steering Node)
	// We use an intermediate node to handle steering, allowing us to rotate the model 180 degrees inside it.
	const visualPivot = new BABYLON.TransformNode('noobVisualPivot', scene);
	visualPivot.parent = collider;
	visualPivot.position = new BABYLON.Vector3(0, -2.0, 0); // Align with bottom of collider
	
	// Parent the GLB root to the pivot
	rootMesh.parent = visualPivot;
	rootMesh.position = new BABYLON.Vector3(0, 0, 0); // Centered on pivot
	
	// Reset GLB root rotation and apply 180 degree fix
	rootMesh.rotationQuaternion = null;
	// rootMesh.rotation = new BABYLON.Vector3(0, Math.PI, 0); // Rotate 180 degrees to fix backward walking
	
	// --- SCALING ---
	const scaleFactor = 4;
	rootMesh.scaling.setAll(scaleFactor);
	
	// Add shadows
	childMeshes.forEach(m => {
		shadowGenerator.addShadowCaster(m);
		m.receiveShadows = true;
	});
	
	// 4. Physics Aggregate
	const agg = new BABYLON.PhysicsAggregate(
		collider,
		BABYLON.PhysicsShapeType.CAPSULE,
		{ mass: 10, friction: 0, restitution: 0 },
		scene
	);
	
	// Lock rotation (inertia) so it doesn't tip over
	agg.body.setMassProperties({
		inertia: new BABYLON.Vector3(0, 0, 0)
	});
	
	// 5. Animation Setup
	const walkAnim = result.animationGroups.find(ag => ag.name === 'Armature.001|stupid duck walk');
	if (walkAnim) {
		walkAnim.start(true); // Loop
	} else {
		console.warn('Animation "Armature.001|stupid duck walk" not found in GLB.');
	}
	
	// 6. Movement Logic
	const animationSpeedFactor = 1.6;
	const speed = 3.0;
	let moveDir = new BABYLON.Vector3(0, 0, 1); // Start moving North
	let lastTurnTime = 0;
	
	// Randomize initial direction
	const randomAngle = 0; // Math.random() * Math.PI * 2;
	moveDir = new BABYLON.Vector3(Math.sin(randomAngle), 0, Math.cos(randomAngle));
	
	// Rotate the PIVOT, not the mesh directly
	visualPivot.rotation.y = randomAngle;
	
	// Helper: Turn 180 degrees
	const turnAround = () => {
		const now = Date.now();
		if (now - lastTurnTime < 500) return; // Debounce
		
		moveDir = moveDir.scale(-1); // Flip vector
		visualPivot.rotation.y += Math.PI; // Flip pivot
		lastTurnTime = now;
		
		// Reset velocity immediately to prevent sliding
		const vel = new BABYLON.Vector3();
		agg.body.getLinearVelocityToRef(vel);
		agg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
	};
	
	// Helper: Turn 90 degrees
	const turn90 = () => {
		const now = Date.now();
		if (now - lastTurnTime < 500) return; // Debounce
		
		// Rotate 90 degrees (PI/2)
		visualPivot.rotation.y += Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
		
		// Recalculate direction vector based on new rotation
		moveDir = new BABYLON.Vector3(Math.sin(visualPivot.rotation.y), 0, Math.cos(visualPivot.rotation.y));
		
		lastTurnTime = now;
		
		// Reset velocity immediately to prevent sliding
		const vel = new BABYLON.Vector3();
		agg.body.getLinearVelocityToRef(vel);
		agg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
	};
	
	// Collision Callback
	agg.body.setCollisionCallbackEnabled(true);
	agg.body.getCollisionObservable().add((event) => {
		const hitBody = event.collidedAgainst;
		if (!hitBody || !hitBody.transformNode) return;
		
		const name = hitBody.transformNode.name;
		// Turn around if hitting Wall, Player, or Ghost
		if (name.includes('wall') || name.includes('player') || name.includes('ghost') || name.includes('noob')) {
			turn90();
		}
	});
	
	// 7. Update Loop
	scene.onBeforeRenderObservable.add(() => {
		if (collider.isDisposed()) return;
		
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		
		// Update Animation Speed based on Time Scale
		if (walkAnim) {
			walkAnim.speedRatio = ts * animationSpeedFactor;
		}
		
		// Apply Movement
		const velocity = moveDir.scale(speed * ts);
		const currentLinearVel = new BABYLON.Vector3();
		agg.body.getLinearVelocityToRef(currentLinearVel);
		
		// Preserve Y velocity (gravity), override X/Z
		agg.body.setLinearVelocity(new BABYLON.Vector3(velocity.x, currentLinearVel.y, velocity.z));
		
		// Randomly change direction occasionally (every ~3-8 seconds)
		if (Math.random() < 0.002 * ts) {
			const angleChange = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
			const currentRot = visualPivot.rotation.y;
			const newRot = currentRot + angleChange;
			
			visualPivot.rotation.y = newRot;
			moveDir = new BABYLON.Vector3(Math.sin(newRot), 0, Math.cos(newRot));
		}
	});
	
	return {
		collider,
		rootMesh
	};
};
