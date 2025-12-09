import * as BABYLON from 'babylonjs';

export const initGamePlayerFirePlayback = (scene, shadowGenerator) => {
	
	// --- Explosion Logic ---
	const createExplosion = (position, color = null) => {
		const fragmentCount = 8;
		for (let i = 0; i < fragmentCount; i++) {
			const frag = BABYLON.MeshBuilder.CreatePolyhedron('frag', { type: 1, size: 0.3 }, scene);
			frag.position = position.clone();
			frag.position.addInPlace(new BABYLON.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
			
			const fragMat = new BABYLON.StandardMaterial('fragMat', scene);
			fragMat.diffuseColor = color || new BABYLON.Color3(1, 0.5 + Math.random() * 0.5, 0);
			frag.material = fragMat;
			
			const fragAgg = new BABYLON.PhysicsAggregate(frag, BABYLON.PhysicsShapeType.CONVEX_HULL, { mass: 0.2, restitution: 0.5 }, scene);
			const dir = new BABYLON.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
			fragAgg.body.applyImpulse(dir.scale(5 + Math.random() * 5), frag.absolutePosition);
			
			setTimeout(() => {
				frag.dispose();
				fragAgg.dispose();
			}, 1500);
		}
		
		scene.meshes.forEach((mesh) => {
			if (mesh.physicsBody) {
				const distance = BABYLON.Vector3.Distance(position, mesh.absolutePosition);
				if (distance < 2.0) {
					const direction = mesh.absolutePosition.subtract(position).normalize();
					mesh.physicsBody.applyImpulse(direction.scale(5.0 * (1 - (distance / 2.0))), mesh.absolutePosition);
				}
			}
		});
	};
	
	// --- Bullet Spawning ---
	const spawnBullet = (isReal, power, position, rotationY, target, bulletsArray) => {
		const bullet = BABYLON.MeshBuilder.CreateSphere('bullet', { diameter: 0.4 }, scene);
		bullet.material = new BABYLON.StandardMaterial('bulletMat', scene);
		
		if (isReal) {
			bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 0);
			bullet.material.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
		} else {
			bullet.material.diffuseColor = new BABYLON.Color3(1, 1, 1);
			bullet.material.alpha = 0.5;
		}
		
		const spawnHeight = position.clone();
		spawnHeight.y += 1.5;
		
		let aimDir;
		if (target && !target.isDisposed()) {
			aimDir = target.absolutePosition.subtract(spawnHeight).normalize();
		} else {
			const rotationMatrix = BABYLON.Matrix.RotationY(rotationY);
			aimDir = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Forward(), rotationMatrix).normalize();
		}
		
		bullet.position = spawnHeight.add(aimDir.scale(1.5));
		shadowGenerator.addShadowCaster(bullet);
		
		const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.5, restitution: 0.8 }, scene);
		bulletAgg.body.setGravityFactor(0);
		bulletAgg.body.applyImpulse(aimDir.scale(power), bullet.absolutePosition);
		
		const bulletData = { mesh: bullet, agg: bulletAgg, age: 0, isDead: false, isReal: isReal };
		bulletsArray.push(bulletData);
		
		bulletAgg.body.setCollisionCallbackEnabled(true);
		const collisionObserver = bulletAgg.body.getCollisionObservable().add((event) => {
			if (bulletData.isDead) return;
			const hitBody = event.collidedAgainst;
			if (!hitBody || !hitBody.transformNode) return;
			
			const name = hitBody.transformNode.name;
			if (name.includes('wall') || name.includes('sphere') || name.includes('bullet')) {
				if (isReal) {
					createExplosion(bullet.absolutePosition);
					if (name.includes('sphere')) {
						createExplosion(hitBody.transformNode.absolutePosition, hitBody.transformNode.material?.diffuseColor);
						hitBody.transformNode.dispose();
					}
					bulletData.isDead = true;
					bulletAgg.body.getCollisionObservable().remove(collisionObserver);
				}
			}
		});
	};
	
	return {
		spawnBullet
	};
};
