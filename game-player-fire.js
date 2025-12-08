import * as BABYLON from 'babylonjs';

export const initGamePlayerFire = (scene, shadowGenerator, playerVisual, cameraManager) => {
	const thrownBalls = [];
	let currentCharge = 0;
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	
	// Input handling for charging/firing
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
			
			if (key === 'z') {
				fireBall();
			}
		}
	});
	
	const fireBall = () => {
		const throwPower = Math.max(minCharge, currentCharge);
		
		// Create Ball
		const ball = BABYLON.MeshBuilder.CreateSphere('thrownBall', { diameter: 0.8 }, scene);
		ball.material = new BABYLON.StandardMaterial('thrownMat', scene);
		ball.material.diffuseColor = new BABYLON.Color3(1, 0, 0);
		
		// Calculate Spawn Position
		const spawnPos = playerVisual.absolutePosition.clone();
		spawnPos.y += 1.5; // Eye level
		
		// --- CHANGED: Get aim direction from player visual instead of camera ---
		// The player wants to shoot where the avatar is facing.
		const aimDir = playerVisual.getDirection(BABYLON.Vector3.Forward());
		aimDir.normalize();
		
		// Offset spawn
		ball.position = spawnPos.add(aimDir.scale(1.5));
		
		shadowGenerator.addShadowCaster(ball);
		
		// Physics
		const ballAgg = new BABYLON.PhysicsAggregate(
			ball,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 0.5, restitution: 0.8 },
			scene
		);
		
		// Apply Force
		ballAgg.body.applyImpulse(aimDir.scale(throwPower), ball.absolutePosition);
		
		// Track
		thrownBalls.push({ mesh: ball, agg: ballAgg, age: 0 });
		
		// Reset UI
		currentCharge = 0;
		powerContainer.style.display = 'none';
		powerBar.style.width = '0%';
	};
	
	// Update Loop
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		// 1. Lifecycle Management (Shrink & Delete)
		for (let i = thrownBalls.length - 1; i >= 0; i--) {
			const b = thrownBalls[i];
			b.age += dt;
			
			if (b.age > 2.0) {
				b.mesh.scaling.scaleInPlace(0.98);
				
				if (b.mesh.scaling.x < 0.1) {
					b.agg.dispose();
					b.mesh.dispose();
					thrownBalls.splice(i, 1);
				}
			}
		}
		
		// 2. Charging Logic
		if (inputMap['z']) {
			if (currentCharge < maxCharge) {
				currentCharge += chargeRate;
				if (currentCharge > maxCharge) currentCharge = maxCharge;
			}
			
			powerContainer.style.display = 'block';
			const percentage = (currentCharge / maxCharge) * 100;
			powerBar.style.width = `${percentage}%`;
		}
	});
};
