import * as BABYLON from '@babylonjs/core';

const activeEnemyBullets = [];

// --- Particle Helper ---
const createImpactParticles = (scene, position, type, timeManager) => {
	let color;
	if (type === 'fire') color = new BABYLON.Color3(1, 0.5, 0);
	else if (type === 'frost') color = new BABYLON.Color3(0.5, 0.8, 1);
	else color = new BABYLON.Color3(0.8, 0.8, 0.8);
	
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
		
		agg.body.applyImpulse(dir.scale(2 * ts), p.absolutePosition);
		
		setTimeout(() => {
			p.dispose();
			agg.dispose();
		}, 500);
	}
};

// --- Initialization (Cleanup & Scaling Listeners) ---
export const initBulletSystem = (scene, timeManager) => {
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
	
	// Global loop for bullet cleanup
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
};

// --- Fire Logic ---
export const fireGhostBullet = (scene, originPos, direction, type, power, playerMethods, timeManager) => {
	const bullet = BABYLON.MeshBuilder.CreateSphere('enemyBullet', { diameter: 0.4 }, scene);
	const bulletMat = new BABYLON.StandardMaterial('enemyBulletMat', scene);
	
	bulletMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
	bulletMat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0);
	bullet.material = bulletMat;
	
	// Scale lifetime by power
	const lifetime = 2.0 + (power * 3.0);
	
	bullet.metadata = {
		type: type,
		power: power,
		age: 0,
		maxLife: lifetime
	};
	
	// Initial Scaling
	if (timeManager && timeManager.isSlowMotion()) {
		bullet.scaling.setAll(3.0);
	}
	
	activeEnemyBullets.push(bullet);
	
	// Position at origin (usually eye level)
	bullet.position = originPos.clone().add(direction.scale(1.5));
	
	const bulletAgg = new BABYLON.PhysicsAggregate(bullet, BABYLON.PhysicsShapeType.SPHERE, { mass: 0.5, restitution: 0.8 }, scene);
	bulletAgg.body.setGravityFactor(0);
	bullet.metadata.aggregate = bulletAgg;
	
	const currentTs = timeManager ? timeManager.getTimeScale() : 1.0;
	bulletAgg.body.applyImpulse(direction.scale(10 * currentTs), bullet.absolutePosition);
	
	// Collision Logic
	bulletAgg.body.setCollisionCallbackEnabled(true);
	bulletAgg.body.getCollisionObservable().add((bEvent) => {
		const hit = bEvent.collidedAgainst;
		if (!hit || !hit.transformNode) return;
		const hitName = hit.transformNode.name;
		
		if (hitName === 'playerRoot' || hitName === 'playerVisual') {
			if (type === 'fire') {
				const damage = Math.ceil(10 * power);
				playerMethods.takeDamage(damage);
				createImpactParticles(scene, bullet.absolutePosition, 'fire', timeManager);
			} else {
				const slowDuration = 5.0 * power;
				playerMethods.applyFrost(slowDuration);
				createImpactParticles(scene, bullet.absolutePosition, 'frost', timeManager);
			}
		} else {
			createImpactParticles(scene, bullet.absolutePosition, 'neutral', timeManager);
		}
		
		// Destroy Bullet
		const idx = activeEnemyBullets.indexOf(bullet);
		if (idx > -1) activeEnemyBullets.splice(idx, 1);
		
		bulletAgg.dispose();
		bullet.dispose();
	});
};
