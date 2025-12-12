import * as BABYLON from '@babylonjs/core';

export const initGameTime = (scene, uiManager) => {
	// Configuration
	const SLOW_MO_FACTOR = 0.1;
	const DURATION = 10.0; // Seconds
	const COOLDOWN = 10.0; // Seconds
	
	// State
	let isSlowMotion = false;
	let activeTimer = 0;
	let cooldownTimer = 0;
	let timeScale = 1.0;
	
	// Physics Engine Reference
	const physicsPlugin = scene.getPhysicsEngine();
	// We don't change timeStep anymore, we scale velocities/gravity
	
	// --- Helper: Scale Physics World ---
	const scalePhysics = (factor) => {
		if (!physicsPlugin) return;
		
		// Scale Velocities of all bodies
		const bodies = physicsPlugin.getBodies();
		bodies.forEach(body => {
			// Linear Velocity
			const linVel = new BABYLON.Vector3();
			body.getLinearVelocityToRef(linVel);
			body.setLinearVelocity(linVel.scale(factor));
			
			// Angular Velocity
			const angVel = new BABYLON.Vector3();
			body.getAngularVelocityToRef(angVel);
			body.setAngularVelocity(angVel.scale(factor));
		});
	};
	
	// --- Public Methods ---
	
	const activateSlowMotion = () => {
		if (isSlowMotion || cooldownTimer > 0) return;
		
		isSlowMotion = true;
		activeTimer = DURATION;
		timeScale = SLOW_MO_FACTOR;
		
		// Apply Physics Scaling
		scalePhysics(SLOW_MO_FACTOR);
		
		// Update UI
		if (uiManager) {
			uiManager.setSlowMotionActive(true);
		}
	};
	
	const deactivateSlowMotion = () => {
		if (!isSlowMotion) return;
		
		isSlowMotion = false;
		cooldownTimer = COOLDOWN;
		timeScale = 1.0;
		
		// Restore Physics Scaling (Inverse Factor)
		scalePhysics(1.0 / SLOW_MO_FACTOR);
		
		// Update UI
		if (uiManager) {
			uiManager.setSlowMotionActive(false);
		}
	};
	
	const toggleSlowMotion = () => {
		if (isSlowMotion) {
			deactivateSlowMotion();
		} else {
			activateSlowMotion();
		}
	};
	
	// --- Update Loop ---
	scene.onBeforeRenderObservable.add(() => {
		const dt = scene.getEngine().getDeltaTime() / 1000;
		
		// Handle Active State
		if (isSlowMotion) {
			// We use unscaled dt for timers to track real-time duration
			activeTimer -= dt;
			if (activeTimer <= 0) {
				deactivateSlowMotion();
			}
		}
		
		// Handle Cooldown
		if (cooldownTimer > 0) {
			cooldownTimer -= dt;
			if (cooldownTimer < 0) cooldownTimer = 0;
		}
		
		// Update UI Button Text
		if (uiManager) {
			uiManager.updateSlowMotionButton(isSlowMotion, cooldownTimer);
		}
	});
	
	return {
		getTimeScale: () => timeScale,
		isSlowMotion: () => isSlowMotion,
		toggleSlowMotion,
		activateSlowMotion
	};
};
