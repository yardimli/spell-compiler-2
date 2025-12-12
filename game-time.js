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
	const defaultTimeStep = 1 / 60;
	
	// --- Public Methods ---
	
	const activateSlowMotion = () => {
		if (isSlowMotion || cooldownTimer > 0) return;
		
		isSlowMotion = true;
		activeTimer = DURATION;
		timeScale = SLOW_MO_FACTOR;
		
		// Slow down physics
		if (physicsPlugin) {
			physicsPlugin.setTimeStep(defaultTimeStep * SLOW_MO_FACTOR);
		}
		
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
		
		// Reset physics
		if (physicsPlugin) {
			physicsPlugin.setTimeStep(defaultTimeStep);
		}
		
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
