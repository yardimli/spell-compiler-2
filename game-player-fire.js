import * as BABYLON from '@babylonjs/core';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager, timeManager, uiManager) => {
	const bullets = [];
	
	// --- Target Selection State ---
	let currentTargetRoot = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	const targetColor = new BABYLON.Color3(0, 1, 1); // Cyan highlight
	
	// --- Smooth Turn State ---
	let isTurning = false;
	let targetRotation = 0;
	let pendingShot = false;
	
	// --- Listen for Slow Motion to Scale Bullets ---
	if (timeManager && timeManager.addStateChangeListener) {
		timeManager.addStateChangeListener((isSlow) => {
			const scale = isSlow ? 3.0 : 1.0;
			bullets.forEach(b => {
				if (!b.mesh.isDisposed()) {
					b.mesh.scaling.setAll(scale);
				}
			});
		});
	}
	
	// --- Crosshair Mesh (Babylon Objects) ---
	const createCrosshair = () => {
		const crosshairRoot = new BABYLON.TransformNode('crosshairRoot', scene);
		
		const mat = new BABYLON.StandardMaterial('crosshairMat', scene);
		mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
		mat.disableLighting = true;
		
		// Horizontal line
		const hLine = BABYLON.MeshBuilder.CreatePlane('hLine', { width: 0.05, height: 0.003 }, scene);
		hLine.material = mat;
		hLine.parent = crosshairRoot;
		hLine.isPickable = false;
		hLine.renderingGroupId = 1;
		
		// Vertical line
		const vLine = BABYLON.MeshBuilder.CreatePlane('vLine', { width: 0.003, height: 0.05 }, scene);
		vLine.material = mat;
		vLine.parent = crosshairRoot;
		vLine.isPickable = false;
		vLine.renderingGroupId = 1;
		
		crosshairRoot.setEnabled(false);
		return crosshairRoot;
	};
	
	const crosshair = createCrosshair();
	
	// --- Helper to recursively get all meshes from a root ---
	const getAllMeshes = (node, list = []) => {
		if (node instanceof BABYLON.Mesh) {
			list.push(node);
		}
		const children = node.getChildren();
		for (const child of children) {
			getAllMeshes(child, list);
		}
		return list;
	};
	
	// --- Set Target Logic ---
	const setTarget = (rootNode) => {
		if (currentTargetRoot) {
			const oldMeshes = getAllMeshes(currentTargetRoot);
			oldMeshes.forEach(m => highlightLayer.removeMesh(m));
		}
		
		if (currentTargetRoot === rootNode) {
			currentTargetRoot = null;
			return;
		}
		
		currentTargetRoot = rootNode;
		if (currentTargetRoot) {
			const newMeshes = getAllMeshes(currentTargetRoot);
			newMeshes.forEach(m => highlightLayer.addMesh(m, targetColor));
		}
	};
	
	// --- Explosion Logic ---
	const createExplosion = (position, color = null) => {
		const fragmentCount = 8;
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		
		for (let i = 0; i < fragmentCount; i++) {
			const frag = BABYLON.MeshBuilder.CreatePolyhedron('frag', {
				type: 1,
				size: 0.3
			}, scene);
			frag.position = position.clone();
			frag.position.addInPlace(new BABYLON.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
			
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			fragMat.diffuseColor = color || new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
			frag.material = fragMat;
			
			const fragAgg = new BABYLON.PhysicsAggregate(frag, BABYLON.PhysicsShapeType.CONVEX_HULL, {
				mass: 0.2,
				restitution: 0.5
			}, scene);
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			// Scale impulse by timeScale
			fragAgg.body.applyImpulse(dir.scale((5 + Math.random() * 5) * ts), frag.absolutePosition);
			
			setTimeout(() => {
				frag.dispose();
				fragAgg.dispose();
			}, 1500);
		}
		
		scene.meshes.forEach((mesh) => {
			if (mesh.physicsBody) {
				const distance = BABYLON.Vector3.Distance(position, mesh.absolutePosition);
				if (distance < 4.0) {
					const direction = mesh.absolutePosition.subtract(position).normalize();
					// Scale impulse by timeScale
					mesh.physicsBody.applyImpulse(direction.scale(10.0 * (1 - (distance / 4.0)) * ts), mesh.absolutePosition);
				}
			}
		});
	};
	
	// --- Bullet Spawning ---
	const spawnBullet = () => {
		const bullet = BABYLON.MeshBuilder.CreateSphere('bullet', {
			diameter: 0.4
		}, scene);
		bullet.material = new BABYLON.StandardMaterial('bulletMat', scene);
		bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 0);
		bullet.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
		
		// Metadata for analysis
		bullet.metadata = { type: 'standard' };
		
		// Initial Scaling based on Slow Mo state
		if (timeManager && timeManager.isSlowMotion()) {
			bullet.scaling.setAll(3.0);
		}
		
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnPos.y += 1.5;
		
		let aimDir;
		const camera = cameraManager.getActiveCamera();
		const isFPS = (camera.name === 'firstPersonCam');
		
		if (currentTargetRoot && !currentTargetRoot.isDisposed()) {
			let targetPos = currentTargetRoot.absolutePosition.clone();
			const head = currentTargetRoot.getChildren().find(c => c.name === 'head');
			if (head) targetPos = head.absolutePosition.clone();
			
			aimDir = targetPos.subtract(spawnPos).normalize();
		} else {
			if (isFPS) {
				aimDir = camera.getDirection(BABYLON.Vector3.Forward());
			} else {
				const rotationMatrix = BABYLON.Matrix.RotationY(playerVisual.rotation.y);
				aimDir = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Forward(), rotationMatrix).normalize();
			}
		}
		
		bullet.position = spawnPos.add(aimDir.scale(1.5));
		shadowGenerator.addShadowCaster(bullet);
		
		const power = 20;
		const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, {
			mass: 0.5,
			restitution: 0.8
		}, scene);
		bulletAgg.body.setGravityFactor(0);
		
		// Scale impulse by timeScale
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		bulletAgg.body.applyImpulse(aimDir.scale(power * ts), bullet.absolutePosition);
		
		const bulletData = {
			mesh: bullet,
			agg: bulletAgg,
			age: 0,
			isDead: false
		};
		bullets.push(bulletData);
		
		bulletAgg.body.setCollisionCallbackEnabled(true);
		const collisionObserver = bulletAgg.body.getCollisionObservable().add((event) => {
			if (bulletData.isDead) return;
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const name = hitBody.transformNode.name;
			if (name.includes('wall') || name.includes('ghost') || name.includes('bullet')) {
				createExplosion(bullet.absolutePosition);
				
				if (name.includes('ghost')) {
					const visualChildren = hitBody.transformNode.getChildren();
					let explosionColor = null;
					const findMat = (node) => {
						if (node.material) return node.material.diffuseColor;
						for (const child of node.getChildren()) {
							const col = findMat(child);
							if (col) return col;
						}
						return null;
					};
					explosionColor = findMat(hitBody.transformNode);
					
					createExplosion(hitBody.transformNode.absolutePosition, explosionColor);
					
					if (currentTargetRoot && (currentTargetRoot === hitBody.transformNode || hitBody.transformNode.isDescendantOf(currentTargetRoot))) {
						setTarget(null);
					}
					
					hitBody.transformNode.dispose();
				}
				
				bulletData.isDead = true;
				bulletAgg.body.getCollisionObservable().remove(collisionObserver);
			}
		});
	};
	
	// --- Helper: Face Target ---
	const faceTarget = () => {
		if (currentTargetRoot && !currentTargetRoot.isDisposed()) {
			const dir = currentTargetRoot.absolutePosition.subtract(playerVisual.absolutePosition);
			const desiredAngle = Math.atan2(dir.x, dir.z);
			
			const currentAngle = playerVisual.rotation.y;
			let diff = desiredAngle - currentAngle;
			
			while (diff <= -Math.PI) diff += Math.PI * 2;
			while (diff > Math.PI) diff -= Math.PI * 2;
			
			targetRotation = currentAngle + diff;
			
			isTurning = true;
			pendingShot = true;
		} else {
			spawnBullet();
		}
	};
	
	// --- Input Listener ---
	scene.onPointerObservable.add((pointerInfo) => {
		if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 0) {
			
			const camera = cameraManager.getActiveCamera();
			const isFPS = (camera.name === 'firstPersonCam');
			const isSlowMo = timeManager && timeManager.isSlowMotion();
			
			// --- 1. Analyze Logic (Slow Motion Only) ---
			if (isSlowMo) {
				let pickRay;
				
				if (isFPS) {
					// In FPS, we target exactly what is in the center of the screen
					pickRay = camera.getForwardRay(100);
				} else {
					// In other modes, we target what is under the mouse cursor
					pickRay = scene.createPickingRay(
						scene.pointerX,
						scene.pointerY,
						BABYLON.Matrix.Identity(),
						camera
					);
				}
				
				// Pick the first mesh hit by the ray, filtering out the player itself
				const hit = scene.pickWithRay(pickRay, (mesh) => {
					// Ignore Player
					if (mesh === playerVisual || mesh.isDescendantOf(playerVisual)) return false;
					if (mesh.name === 'playerRoot') return false;
					// Ignore UI lines
					if (mesh.name === 'hLine' || mesh.name === 'vLine') return false;
					// Ignore invisible physics colliders (like ghost capsules) so we can hit the mesh inside
					if (mesh.visibility === 0) return false;
					return true;
				});
				
				if (hit && hit.hit && hit.pickedMesh) {
					const mesh = hit.pickedMesh;
					// Check if it's a bullet (Player or Enemy)
					if (mesh.name.toLowerCase().includes('bullet')) {
						const type = (mesh.metadata && mesh.metadata.type) ? mesh.metadata.type : 'standard';
						if (uiManager && uiManager.createBulletDebugWindow) {
							uiManager.createBulletDebugWindow(mesh, type);
						}
						// If we clicked a bullet, we do NOT fire.
						return;
					}
				}
			}
			
			// --- 2. Firing / Targeting Logic (If not analyzing a bullet) ---
			const canvas = scene.getEngine().getRenderingCanvas();
			const isLocked = (document.pointerLockElement === canvas);
			
			if (isFPS && isLocked) {
				spawnBullet();
				return;
			}
			
			let pickedMesh = null;
			
			// For targeting, we use the standard pointer ray (works for both FPS unlocked and Free/Follow)
			const ray = scene.createPickingRay(
				scene.pointerX,
				scene.pointerY,
				BABYLON.Matrix.Identity(),
				camera
			);
			
			const hit = scene.pickWithRay(ray, (mesh) => {
				if (mesh === playerVisual || mesh.isDescendantOf(playerVisual)) return false;
				if (mesh === playerVisual.parent) return false;
				if (mesh.name === 'playerRoot') return false;
				if (mesh.name === 'bullet') return false;
				if (mesh.name === 'hLine' || mesh.name === 'vLine') return false;
				return true;
			});
			
			if (hit && hit.hit) {
				pickedMesh = hit.pickedMesh;
			}
			
			if (pickedMesh) {
				let node = pickedMesh;
				let ghostRoot = null;
				
				while (node) {
					if (node.name.includes('ghost')) {
						if (node.name.startsWith('ghost_') && !node.name.includes('Collider')) {
							ghostRoot = node;
							break;
						}
						if (node.name.startsWith('ghostCollider_')) {
							const children = node.getChildren();
							ghostRoot = children.find(c => c.name.startsWith('ghost_'));
							break;
						}
					}
					node = node.parent;
				}
				
				if (ghostRoot) {
					setTarget(ghostRoot);
				} else {
					setTarget(null);
				}
			} else {
				setTarget(null);
			}
		}
	});
	
	scene.onKeyboardObservable.add((kbInfo) => {
		if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			if (kbInfo.event.key.toLowerCase() === 'f') {
				faceTarget();
			}
		}
	});
	
	// --- Update Loop (Bullet Cleanup & Smooth Turn) ---
	scene.onBeforeRenderObservable.add(() => {
		// Get Time Scale
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		const dt = (scene.getEngine().getDeltaTime() / 1000) * ts;
		
		const camera = cameraManager.getActiveCamera();
		const isFPS = (camera.name === 'firstPersonCam');
		
		if (isFPS && !currentTargetRoot) {
			if (!crosshair.isEnabled() || crosshair.parent !== camera) {
				crosshair.setEnabled(true);
				crosshair.parent = camera;
				crosshair.position = new BABYLON.Vector3(0, 0, 1);
				crosshair.rotation = new BABYLON.Vector3(0, 0, 0);
			}
		} else {
			crosshair.setEnabled(false);
		}
		
		// Smooth Turn Logic
		if (isTurning) {
			playerVisual.rotation.y = BABYLON.Scalar.Lerp(playerVisual.rotation.y, targetRotation, 5.0 * dt);
			
			const diff = Math.abs(targetRotation - playerVisual.rotation.y);
			
			if (diff < 0.01) {
				playerVisual.rotation.y = targetRotation;
				isTurning = false;
				
				if (pendingShot) {
					spawnBullet();
					pendingShot = false;
				}
			}
		}
		
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
		
		if (currentTargetRoot && currentTargetRoot.isDisposed()) {
			setTarget(null);
		}
	});
	
	return {};
};
