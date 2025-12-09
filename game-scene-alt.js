import * as BABYLON from 'babylonjs';
import { initGameSceneAltRecording } from './game-scene-alt-recording';
import { initGameSceneAltPlayback } from './game-scene-alt-playback';

export const initGameSceneAlt = async (scene, shadowGenerator) => {
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
		
		scene.registerBeforeRender(() => {
			textMesh.rotate(BABYLON.Axis.Y, 0.01, BABYLON.Space.LOCAL);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Enemy Logic (Ghosts) ---
	const enemies = [];
	const enemySpeed = 4.0;
	
	// Helper to create Ghost Visuals
	const createGhostMesh = (name, color, position) => {
		const root = new BABYLON.TransformNode(name + 'Root', scene);
		root.position = position;
		
		// Head
		const head = BABYLON.MeshBuilder.CreateSphere(name + 'Head', { diameter: 1.5, segments: 16 }, scene);
		head.position.y = 0.5;
		head.parent = root;
		
		// Skirt
		const skirt = BABYLON.MeshBuilder.CreateCylinder(name + 'Skirt', { height: 0.8, diameter: 1.5 }, scene);
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
			const eye = BABYLON.MeshBuilder.CreateSphere('eye', { diameter: 0.4 }, scene);
			eye.material = eyeWhite;
			eye.position.set(x, 0.6, 0.6);
			eye.parent = root;
			
			const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', { diameter: 0.2 }, scene);
			pupil.material = eyePupil;
			pupil.position.set(0, 0, 0.15);
			pupil.parent = eye;
		};
		
		createEye(-0.3);
		createEye(0.3);
		
		shadowGenerator.addShadowCaster(head);
		shadowGenerator.addShadowCaster(skirt);
		
		return root;
	};
	
	// Enemy Definitions
	const enemyTypes = [
		{ name: 'Blinky', color: new BABYLON.Color3(1, 0, 0), startPos: new BABYLON.Vector3(-8, 2, -8) },
		{ name: 'Pinky', color: new BABYLON.Color3(1, 0.7, 0.8), startPos: new BABYLON.Vector3(8, 2, -8) },
		{ name: 'Inky', color: new BABYLON.Color3(0, 1, 1), startPos: new BABYLON.Vector3(-8, 2, 8) },
		{ name: 'Clyde', color: new BABYLON.Color3(1, 0.5, 0), startPos: new BABYLON.Vector3(8, 2, 8) }
	];
	
	enemyTypes.forEach((def) => {
		const visual = createGhostMesh(def.name, def.color, def.startPos);
		
		const agg = new BABYLON.PhysicsAggregate(
			visual,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 10, restitution: 0, friction: 0 },
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
		
		const enemyData = {
			mesh: visual,
			agg: agg,
			currentDir: currentDir,
			name: def.name,
			isFrozen: false
		};
		
		// --- Collision Logic ---
		agg.body.setCollisionCallbackEnabled(true);
		agg.body.getCollisionObservable().add((event) => {
			if (enemyData.isFrozen) return;
			
			const other = event.collidedAgainst.transformNode;
			if (!other) return;
			
			if (other.name.includes('player') || other.name.includes('Root')) {
				enemyData.currentDir = enemyData.currentDir.scale(-1);
			}
		});
		
		enemies.push(enemyData);
	});
	
	// --- AI Loop ---
	scene.onBeforeRenderObservable.add(() => {
		enemies.forEach(enemy => {
			if (enemy.isFrozen || !enemy.agg.body) return;
			
			const transform = enemy.mesh;
			const origin = transform.absolutePosition.clone();
			
			// Increased ray length to 2.2 to detect thin walls earlier
			// (Tile center to wall center is 2.0)
			const rayLength = 2.2;
			const ray = new BABYLON.Ray(origin, enemy.currentDir, rayLength);
			
			// Filter: Look for meshes with 'wall' in the name
			const hit = scene.pickWithRay(ray, (mesh) => {
				return mesh.name.includes('wall');
			});
			
			if (hit.hit) {
				const possibleDirs = [
					new BABYLON.Vector3(0, 0, 1),
					new BABYLON.Vector3(0, 0, -1),
					new BABYLON.Vector3(1, 0, 0),
					new BABYLON.Vector3(-1, 0, 0)
				];
				
				const validDirs = possibleDirs.filter(d => {
					const checkRay = new BABYLON.Ray(origin, d, rayLength);
					const checkHit = scene.pickWithRay(checkRay, (m) => m.name.includes('wall'));
					return !checkHit.hit;
				});
				
				if (validDirs.length > 0) {
					enemy.currentDir = validDirs[Math.floor(Math.random() * validDirs.length)];
				} else {
					enemy.currentDir = enemy.currentDir.scale(-1);
				}
			}
			
			const velocity = enemy.currentDir.scale(enemySpeed);
			enemy.agg.body.setLinearVelocity(new BABYLON.Vector3(velocity.x, -0.1, velocity.z));
			
			if (enemy.currentDir.lengthSquared() > 0.1) {
				const targetAngle = Math.atan2(enemy.currentDir.x, enemy.currentDir.z);
				transform.rotation.y = BABYLON.Scalar.LerpAngle(transform.rotation.y, targetAngle, 0.2);
			}
		});
	});
	
	const recordingModule = initGameSceneAltRecording();
	const playbackModule = initGameSceneAltPlayback();
	
	return {
		setBallsFrozen: (isFrozen) => {
			if (isFrozen) {
				recordingModule.freezeEnemies(enemies);
			} else {
				playbackModule.unfreezeEnemies(enemies);
			}
		}
	};
};
