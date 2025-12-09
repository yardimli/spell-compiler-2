import * as BABYLON from 'babylonjs';
import {initGameSceneAltRecording} from './game-scene-alt-recording';
import {initGameSceneAltPlayback} from './game-scene-alt-playback';

export const initGameSceneAlt = async (scene, shadowGenerator, startPositions) => {
	// --- 3D Text ---
	const fontURL = './assets/fonts/Kenney%20Future%20Regular.json';
	try {
		const fontResponse = await fetch(fontURL);
		const fontData = await fontResponse.json();
		
		if (!fontData || !fontData.boundingBox) {
			throw new Error('Font data is missing boundingBox');
		}
		
		const textMesh = BABYLON.MeshBuilder.CreateText(
			'text',
			'PAC-MAZE',
			fontData,
			{size: 2, depth: 0.5, resolution: 64},
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
		
		scene.registerBeforeRender(() => {
			textMesh.rotate(BABYLON.Axis.Y, 0.01, BABYLON.Space.LOCAL);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Ghost Logic (Ghosts) ---
	const ghosts = [];
	const ghostSpeed = 4.0;
	const ghostDiameter = 4.2;
	const ghostRadius = ghostDiameter / 2;
	
	// Helper to create Ghost Visuals
	const createGhostMesh = (name, color, position) => {
		const root = new BABYLON.TransformNode(name + 'Root', scene);
		root.position = position;
		
		// Head
		const head = BABYLON.MeshBuilder.CreateSphere(name + 'Head', {diameter: ghostDiameter, segments: 16}, scene);
		head.position.y = 0.5;
		head.parent = root;
		
		// Skirt
		const skirt = BABYLON.MeshBuilder.CreateCylinder(name + 'Skirt', {height: 0.8, diameter: ghostDiameter}, scene);
		skirt.position.y = 0;
		skirt.parent = root;
		
		// Material
		const mat = new BABYLON.StandardMaterial(name + 'Mat', scene);
		mat.diffuseColor = color;
		mat.specularPower = 16;
		head.material = mat;
		skirt.material = mat;
		
		// Eyes
		const eyeWhite = new BABYLON.StandardMaterial('eyeWhite', scene);
		eyeWhite.diffuseColor = BABYLON.Color3.White();
		const eyePupil = new BABYLON.StandardMaterial('eyePupil', scene);
		eyePupil.diffuseColor = BABYLON.Color3.Blue();
		
		const createEye = (x) => {
			const eye = BABYLON.MeshBuilder.CreateSphere('eye', {diameter: 0.6}, scene);
			eye.material = eyeWhite;
			eye.position.set(x, 0.8, 1.0);
			eye.parent = root;
			
			const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', {diameter: 0.3}, scene);
			pupil.material = eyePupil;
			pupil.position.set(0, 0, 0.25);
			pupil.parent = eye;
		};
		
		createEye(-0.6);
		createEye(0.6);
		
		shadowGenerator.addShadowCaster(head);
		shadowGenerator.addShadowCaster(skirt);
		
		return root;
	};
	
	// Ghost Definitions
	const getPos = (key, defaultVec) => {
		return (startPositions && startPositions[key]) ? startPositions[key] : defaultVec;
	};
	
	const ghostTypes = [
		{name: 'Blinky', color: new BABYLON.Color3(1, 0, 0), startPos: getPos('A', new BABYLON.Vector3(0, 2, 2))},
		{name: 'Pinky', color: new BABYLON.Color3(1, 0.7, 0.8), startPos: getPos('B', new BABYLON.Vector3(-3, 2, 0))},
		{name: 'Inky', color: new BABYLON.Color3(0, 1, 1), startPos: getPos('C', new BABYLON.Vector3(3, 2, 0))},
		{name: 'Clyde', color: new BABYLON.Color3(1, 0.5, 0), startPos: getPos('D', new BABYLON.Vector3(0, 2, -2))}
	];
	
	let onPlayerCaughtCallback = null;
	
	ghostTypes.forEach((def) => {
		const visual = createGhostMesh(def.name, def.color, def.startPos);
		
		const agg = new BABYLON.PhysicsAggregate(
			visual,
			BABYLON.PhysicsShapeType.SPHERE,
			{mass: 10, restitution: 0, friction: 0, radius: ghostRadius},
			scene
		);
		
		agg.body.setMassProperties({
			inertia: new BABYLON.Vector3(0, 0, 0)
		});
		agg.body.setLinearDamping(0);
		agg.body.setAngularDamping(1);
		
		const directions = [
			new BABYLON.Vector3(0, 0, 1),
			new BABYLON.Vector3(0, 0, -1),
			new BABYLON.Vector3(1, 0, 0),
			new BABYLON.Vector3(-1, 0, 0)
		];
		let currentDir = directions[Math.floor(Math.random() * directions.length)];
		
		const ghostData = {
			mesh: visual,
			agg: agg,
			currentDir: currentDir,
			name: def.name,
			isFrozen: false,
			turnCooldown: 0,
			stuckFrames: 0 // Counter to detect if physically stuck
		};
		
		// --- Collision Logic (Gameplay Events Only) ---
		// We rely on physics for the actual "stop", but we use this to detect Player catch
		agg.body.setCollisionCallbackEnabled(true);
		agg.body.getCollisionObservable().add((event) => {
			if (ghostData.isFrozen) return;
			
			const other = event.collidedAgainst.transformNode;
			if (!other) return;
			
			if (other.name.includes('player')) {
				console.log(`${ghostData.name} caught the player!`);
				if (onPlayerCaughtCallback) {
					onPlayerCaughtCallback();
				}
				// Bounce back slightly on catch
				ghostData.currentDir = ghostData.currentDir.scale(-1);
			}
		});
		
		ghosts.push(ghostData);
	});
	
	// --- AI Loop ---
	scene.onBeforeRenderObservable.add(() => {
		ghosts.forEach(ghost => {
			if (ghost.isFrozen || !ghost.agg.body) return;
			
			if (ghost.turnCooldown > 0) {
				ghost.turnCooldown--;
			}
			
			const transform = ghost.mesh;
			const origin = transform.absolutePosition.clone();
			
			// Vectors
			const forward = ghost.currentDir.clone();
			const up = new BABYLON.Vector3(0, 1, 0);
			const right = BABYLON.Vector3.Cross(up, forward);
			const left = right.scale(-1);
			
			// --- Raycast Setup ---
			// We ONLY use raycasts to detect wall openings (structure).
			// We do NOT use them to detect other ghosts (physics handles that).
			const rayLength = 4.0;
			const rayLeft = new BABYLON.Ray(origin, left, rayLength);
			const rayRight = new BABYLON.Ray(origin, right, rayLength);
			
			const predicate = (m) => m.name.includes('wall');
			
			const hitLeft = scene.pickWithRay(rayLeft, predicate);
			const hitRight = scene.pickWithRay(rayRight, predicate);
			
			// --- Velocity Check (Stuck Detection) ---
			const currentVel = new BABYLON.Vector3();
			ghost.agg.body.getLinearVelocityToRef(currentVel);
			const speed = Math.sqrt(currentVel.x * currentVel.x + currentVel.z * currentVel.z);
			
			// If we are supposed to be moving but speed is near zero, we hit a wall or another ghost.
			if (speed < 0.5) {
				ghost.stuckFrames++;
			} else {
				ghost.stuckFrames = 0;
			}
			
			// --- Decision Making ---
			
			// 1. Physically Stuck (Hit Wall or Ghost)
			if (ghost.stuckFrames > 5) {
				// We hit something solid. We MUST pick a new direction.
				const possibleDirs = [];
				
				// Check Left
				if (!hitLeft.hit) possibleDirs.push(left);
				// Check Right
				if (!hitRight.hit) possibleDirs.push(right);
				// Check Back (Reverse) - always an option if trapped
				possibleDirs.push(forward.scale(-1));
				
				// Pick a random valid direction
				ghost.currentDir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
				
				// Reset stuck counter and add cooldown so we don't spin instantly
				ghost.stuckFrames = 0;
				ghost.turnCooldown = 20;
			}
			// 2. Moving Freely (Check for Junctions)
			else if (ghost.turnCooldown === 0) {
				// We are moving fine, but let's see if there is an opening to turn
				const openOptions = [];
				if (!hitLeft.hit) openOptions.push(left);
				if (!hitRight.hit) openOptions.push(right);
				
				if (openOptions.length > 0) {
					// 15% chance to take a turn if available (Pac-Man ghost behavior)
					if (Math.random() < 0.15) {
						ghost.currentDir = openOptions[Math.floor(Math.random() * openOptions.length)];
						ghost.turnCooldown = 45; // Don't turn again immediately
					}
				}
			}
			
			// --- Apply Movement ---
			// Always apply velocity in the chosen direction.
			// If we hit a wall, Havok will stop the mesh, 'speed' will drop, and 'stuckFrames' will trigger a turn.
			const velocity = ghost.currentDir.scale(ghostSpeed);
			ghost.agg.body.setLinearVelocity(new BABYLON.Vector3(velocity.x, -0.1, velocity.z));
			
			// Visual Rotation
			if (ghost.currentDir.lengthSquared() > 0.1) {
				const targetAngle = Math.atan2(ghost.currentDir.x, ghost.currentDir.z);
				transform.rotation.y = BABYLON.Scalar.LerpAngle(transform.rotation.y, targetAngle, 0.2);
			}
		});
	});
	
	const recordingModule = initGameSceneAltRecording();
	const playbackModule = initGameSceneAltPlayback();
	
	return {
		setBallsFrozen: (isFrozen) => {
			if (isFrozen) {
				recordingModule.freezeGhosts(ghosts);
			} else {
				playbackModule.unfreezeGhosts(ghosts);
			}
		},
		setOnPlayerCaught: (cb) => {
			onPlayerCaughtCallback = cb;
		}
	};
};
