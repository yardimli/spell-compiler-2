import * as BABYLON from '@babylonjs/core';
import { fireGhostBullet } from './game-ghost-bullet';

export const initGhostMovement = (scene, ghostEntity, playerRoot, playerVisual, playerMethods, timeManager) => {
	const { collider, ghostNode, ghostAgg, ghostName } = ghostEntity;
	
	// Movement Config
	const speed = 6.0;
	const directions = [
		new BABYLON.Vector3(0, 0, 1),
		new BABYLON.Vector3(0, 0, -1),
		new BABYLON.Vector3(1, 0, 0),
		new BABYLON.Vector3(-1, 0, 0)
	];
	
	let moveDir = directions[Math.floor(Math.random() * directions.length)];
	let isRotating = true;
	let isAttacking = false;
	let targetRotY = Math.atan2(moveDir.x, moveDir.z);
	let lastTurnTime = 0;
	let fireTimer = (Math.random() * 5.0) + 8.0;
	
	// Collision Callback (Bounce off walls)
	ghostAgg.body.setCollisionCallbackEnabled(true);
	ghostAgg.body.getCollisionObservable().add((event) => {
		if (isRotating || isAttacking) return;
		
		const now = Date.now();
		if (now - lastTurnTime < 500) return;
		
		const hitBody = event.collidedAgainst;
		if (!hitBody || !hitBody.transformNode) return;
		
		const name = hitBody.transformNode.name;
		if (name.includes('wall') || name.includes('player') || name.includes('ghost')) {
			moveDir = moveDir.scale(-1);
			targetRotY = ghostNode.rotation.y + Math.PI;
			isRotating = true;
			lastTurnTime = now;
			
			const vel = new BABYLON.Vector3();
			ghostAgg.body.getLinearVelocityToRef(vel);
			ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
		}
	});
	
	// Main AI Loop
	const observer = scene.onBeforeRenderObservable.add(() => {
		if (collider.isDisposed()) {
			scene.onBeforeRenderObservable.remove(observer);
			return;
		}
		
		const ts = timeManager ? timeManager.getTimeScale() : 1.0;
		const dt = (scene.getEngine().getDeltaTime() / 1000) * ts;
		
		// 1. Update Metadata (Power Prediction)
		const distToPlayer = BABYLON.Vector3.Distance(collider.position, playerRoot.position);
		// Updated: Increased falloff distance to 50.0 for stronger shots at range
		let predictedPower = Math.max(0.1, Math.min(1.0, 1.0 - (distToPlayer / 50.0)));
		if (collider.metadata.energy < predictedPower * 10) {
			predictedPower = collider.metadata.energy / 10;
		}
		collider.metadata.nextPower = predictedPower;
		
		// 2. Timer
		if (!isAttacking && !isRotating) {
			fireTimer -= dt;
		}
		
		// 3. Attack Logic
		if (!isAttacking && !isRotating && fireTimer <= 0) {
			if (collider.metadata.energy >= 1.0) {
				performAttackSequence();
			} else {
				fireTimer = 2.0;
			}
		}
		
		// 4. Movement / Rotation Execution
		if (isAttacking) {
			ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
		} else if (isRotating) {
			const rotationSpeed = 5.0;
			const diff = Math.abs(targetRotY - ghostNode.rotation.y);
			
			if (diff < 0.05) {
				ghostNode.rotation.y = targetRotY;
				isRotating = false;
			} else {
				ghostNode.rotation.y = BABYLON.Scalar.Lerp(ghostNode.rotation.y, targetRotY, rotationSpeed * dt);
			}
			// Stop sliding while turning
			const vel = new BABYLON.Vector3();
			ghostAgg.body.getLinearVelocityToRef(vel);
			ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, vel.y, 0));
		} else {
			// Move
			const velocity = moveDir.scale(speed * ts);
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
	
	// --- Async Attack Sequence ---
	const performAttackSequence = async () => {
		isAttacking = true;
		ghostAgg.body.setLinearVelocity(new BABYLON.Vector3(0, 0, 0));
		
		const dirToPlayer = playerRoot.position.subtract(collider.position);
		const angleToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);
		const originalRotY = ghostNode.rotation.y;
		
		// Helper: Turn
		const animateTurn = (targetAngle) => {
			return new Promise(resolve => {
				const loop = () => {
					if (collider.isDisposed()) return;
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
		
		// Helper: Wait
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
		
		// A. Turn to Player
		let startRot = ghostNode.rotation.y;
		let diff = angleToPlayer - startRot;
		while (diff > Math.PI) diff -= Math.PI * 2;
		while (diff < -Math.PI) diff += Math.PI * 2;
		const endRot = startRot + diff;
		
		await animateTurn(endRot);
		
		// B. LOS Check
		let hasLineOfSight = false;
		const rayOrigin = collider.position.clone();
		rayOrigin.y += 1.0;
		const rayTarget = playerRoot.position.clone();
		rayTarget.y += 1.0;
		const direction = rayTarget.subtract(rayOrigin);
		const dist = direction.length();
		direction.normalize();
		
		const ray = new BABYLON.Ray(rayOrigin, direction, dist);
		const hit = scene.pickWithRay(ray, (mesh) => {
			if (mesh === collider || mesh.isDescendantOf(collider)) return false;
			if (mesh.name.toLowerCase().includes('bullet')) return false;
			if (mesh.name === 'hLine' || mesh.name === 'vLine') return false;
			if (mesh.name === 'text' || mesh.name.includes('skyBox')) return false;
			return true;
		});
		
		if (hit && hit.hit && hit.pickedMesh) {
			const m = hit.pickedMesh;
			if (m === playerRoot || m === playerVisual || m.isDescendantOf(playerRoot)) {
				hasLineOfSight = true;
			}
		}
		
		// C. Fire
		if (hasLineOfSight) {
			const currentDist = BABYLON.Vector3.Distance(collider.position, playerRoot.position);
			// Updated: Use 50.0 divisor for stronger power at range
			let power = Math.max(0.1, Math.min(1.0, 1.0 - (currentDist / 50.0)));
			
			// Removed random power dampening to make ghosts more aggressive
			// if (power > 0.5 && Math.random() < 0.3) power *= 0.5;
			
			let cost = power * 10;
			if (collider.metadata.energy < cost) {
				power = collider.metadata.energy / 10;
				cost = collider.metadata.energy;
			}
			
			collider.metadata.energy -= cost;
			console.log(`[FIRE] ${ghostName} fired ${collider.metadata.nextType}. Power: ${power.toFixed(2)}`);
			
			const spawnPos = collider.position.clone();
			spawnPos.y += 1.0;
			const forward = new BABYLON.Vector3(Math.sin(endRot), 0, Math.cos(endRot));
			
			fireGhostBullet(
				scene,
				spawnPos,
				forward,
				collider.metadata.nextType,
				power,
				playerMethods,
				timeManager,
				ghostName // Pass name for logging
			);
			
			await waitGameTime(0.5);
		} else {
			// Log missing LOS
			console.log(`[LOS] ${ghostName} CANNOT see the player.`);
		}
		
		// D. Return & Reset
		await animateTurn(originalRotY);
		
		isAttacking = false;
		collider.metadata.nextType = Math.random() > 0.5 ? 'fire' : 'frost';
		fireTimer = (Math.random() * 2.0) + 8.0;
	};
};
