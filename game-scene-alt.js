import * as BABYLON from 'babylonjs';
import { initGameSceneAltRecording } from './game-scene-alt-recording';
import { initGameSceneAltPlayback } from './game-scene-alt-playback';

export const initGameSceneAlt = async (scene, shadowGenerator, startPositions, gridConfig) => {
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
	
	// --- Grid Navigation Helpers ---
	const { mazeMap, tileSize, startX, startZ, rows, cols } = gridConfig;
	
	// Convert World Position to Grid Coordinates (Row, Col)
	const getGridPos = (position) => {
		const c = Math.round((position.x - startX) / tileSize);
		const r = Math.round((startZ - position.z) / tileSize);
		return { r, c };
	};
	
	// Convert Grid Coordinates to World Position (Center of tile)
	const getWorldPos = (r, c) => {
		const x = startX + c * tileSize;
		const z = startZ - r * tileSize;
		return new BABYLON.Vector3(x, 1.5, z);
	};
	
	// Check if a cell is a valid path (0 or string)
	const isValidTile = (r, c) => {
		if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
		const cell = mazeMap[r][c];
		return cell === 0 || typeof cell === 'string';
	};
	
	// --- Ghost Logic (Ghosts) ---
	const ghosts = [];
	const ghostSpeed = 6.0;
	const ghostDiameter = 4.2;
	const ghostRadius = ghostDiameter / 2;
	
	// Helper to create Ghost Visuals
	const createGhostMesh = (name, color, position) => {
		const root = new BABYLON.TransformNode(name + 'Root', scene);
		root.position = position;
		
		// Head
		const head = BABYLON.MeshBuilder.CreateSphere(name + 'Head', { diameter: ghostDiameter, segments: 16 }, scene);
		head.position.y = 0.5;
		head.parent = root;
		
		// Skirt
		const skirt = BABYLON.MeshBuilder.CreateCylinder(name + 'Skirt', { height: 0.8, diameter: ghostDiameter }, scene);
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
			const eye = BABYLON.MeshBuilder.CreateSphere('eye', { diameter: 0.6 }, scene);
			eye.material = eyeWhite;
			eye.position.set(x, 0.8, 1.0);
			eye.parent = root;
			
			const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', { diameter: 0.3 }, scene);
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
	
	// CHANGED: Added 'Ghost' prefix to names to make collision detection reliable
	const ghostTypes = [
		{ name: 'GhostBlinky', color: new BABYLON.Color3(1, 0, 0), startPos: getPos('A', new BABYLON.Vector3(0, 2, 2)) },
		{ name: 'GhostPinky', color: new BABYLON.Color3(1, 0.7, 0.8), startPos: getPos('B', new BABYLON.Vector3(-3, 2, 0)) },
		{ name: 'GhostInky', color: new BABYLON.Color3(0, 1, 1), startPos: getPos('C', new BABYLON.Vector3(3, 2, 0)) },
		{ name: 'GhostClyde', color: new BABYLON.Color3(1, 0.5, 0), startPos: getPos('D', new BABYLON.Vector3(0, 2, -2)) }
	];
	
	let onPlayerCaughtCallback = null;
	
	ghostTypes.forEach((def) => {
		const visual = createGhostMesh(def.name, def.color, def.startPos);
		
		const agg = new BABYLON.PhysicsAggregate(
			visual,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 10, restitution: 0, friction: 0, radius: ghostRadius },
			scene
		);
		
		agg.body.setMassProperties({
			inertia: new BABYLON.Vector3(0, 0, 0)
		});
		agg.body.setLinearDamping(0);
		agg.body.setAngularDamping(1);
		
		// Initial Direction (Random valid)
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
			hasTurnedInCell: false,
			collisionCooldown: 0 // NEW: Cooldown to prevent rapid flipping
		};
		
		// --- Collision Logic (Gameplay Events Only) ---
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
				ghostData.hasTurnedInCell = false;
			} else if (other.name.includes('Ghost')) {
				// CHANGED: If ghosts hit each other, reverse to walk away
				if (ghostData.collisionCooldown <= 0) {
					ghostData.currentDir = ghostData.currentDir.scale(-1);
					ghostData.hasTurnedInCell = false; // Allow re-evaluation
					ghostData.collisionCooldown = 30; // 0.5s debounce (at 60fps)
				}
			}
		});
		
		ghosts.push(ghostData);
	});
	
	// --- AI Loop (Grid Based) ---
	scene.onBeforeRenderObservable.add(() => {
		ghosts.forEach(ghost => {
			if (ghost.isFrozen || !ghost.agg.body) return;
			
			// NEW: Decrement cooldown
			if (ghost.collisionCooldown > 0) {
				ghost.collisionCooldown--;
			}
			
			const currentPos = ghost.mesh.absolutePosition;
			const { r, c } = getGridPos(currentPos);
			const tileCenter = getWorldPos(r, c);
			
			// Calculate distance to the center of the current tile (ignoring Y)
			const distToCenter = Math.sqrt(
				Math.pow(currentPos.x - tileCenter.x, 2) +
				Math.pow(currentPos.z - tileCenter.z, 2)
			);
			
			// Threshold to consider "at center" of tile
			const centerThreshold = 0.2;
			
			// 1. Decision Making (At Center of Tile)
			if (distToCenter < centerThreshold) {
				if (!ghost.hasTurnedInCell) {
					// We have arrived at a new tile center. Time to decide direction.
					
					// Define directions: Forward, Backward, Left, Right
					const forward = ghost.currentDir.clone();
					const backward = forward.scale(-1);
					const right = BABYLON.Vector3.Cross(new BABYLON.Vector3(0, 1, 0), forward);
					const left = right.scale(-1);
					
					// Map directions to grid offsets
					const getDirOffset = (vec) => {
						if (Math.abs(vec.z) > 0.5) return { dr: vec.z > 0 ? -1 : 1, dc: 0 }; // Z-up is Row-down
						if (Math.abs(vec.x) > 0.5) return { dr: 0, dc: vec.x > 0 ? 1 : -1 };
						return { dr: 0, dc: 0 };
					};
					
					const checkDir = (vec) => {
						const off = getDirOffset(vec);
						return isValidTile(r + off.dr, c + off.dc);
					};
					
					const validOptions = [];
					
					// Check Forward
					if (checkDir(forward)) validOptions.push(forward);
					// Check Left
					if (checkDir(left)) validOptions.push(left);
					// Check Right
					if (checkDir(right)) validOptions.push(right);
					
					// Decision Logic:
					// 1. If we have options (Forward/Left/Right), pick one.
					// 2. If no options (Dead End), we MUST go Backward.
					// 3. If multiple options, prefer Forward, but sometimes turn.
					
					if (validOptions.length === 0) {
						// Dead End
						ghost.currentDir = backward;
					} else {
						// Pac-Man style: Ghosts hate reversing.
						// Simple AI: 20% chance to turn if possible, otherwise go straight.
						// If straight isn't possible, forced to turn.
						
						const canGoStraight = validOptions.some(v => v.equals(forward));
						const turns = validOptions.filter(v => !v.equals(forward));
						
						if (canGoStraight && turns.length > 0) {
							if (Math.random() < 0.25) {
								ghost.currentDir = turns[Math.floor(Math.random() * turns.length)];
							} else {
								ghost.currentDir = forward;
							}
						} else if (canGoStraight) {
							ghost.currentDir = forward;
						} else {
							// Must turn
							ghost.currentDir = turns[Math.floor(Math.random() * turns.length)];
						}
					}
					
					// Mark that we made a decision for this tile
					ghost.hasTurnedInCell = true;
				}
			} else if (distToCenter > 0.5) {
				// Reset flag once we leave the center area
				ghost.hasTurnedInCell = false;
			}
			
			// 2. Apply Movement
			// Velocity is strictly along the current direction
			const velocity = ghost.currentDir.scale(ghostSpeed);
			
			// 3. Track Centering (Correction)
			// If moving X, correct Z towards center. If moving Z, correct X.
			const correctionForce = 5.0;
			let correctionX = 0;
			let correctionZ = 0;
			
			if (Math.abs(ghost.currentDir.x) > 0.5) {
				// Moving X, fix Z
				const diffZ = tileCenter.z - currentPos.z;
				correctionZ = diffZ * correctionForce;
			} else {
				// Moving Z, fix X
				const diffX = tileCenter.x - currentPos.x;
				correctionX = diffX * correctionForce;
			}
			
			// Combine forward velocity with centering correction
			ghost.agg.body.setLinearVelocity(new BABYLON.Vector3(
				velocity.x + correctionX,
				-0.1, // Gravity/Grounding
				velocity.z + correctionZ
			));
			
			// 4. Visual Rotation
			if (ghost.currentDir.lengthSquared() > 0.1) {
				const targetAngle = Math.atan2(ghost.currentDir.x, ghost.currentDir.z);
				// Smooth rotation
				ghost.mesh.rotation.y = BABYLON.Scalar.LerpAngle(ghost.mesh.rotation.y, targetAngle, 0.2);
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
