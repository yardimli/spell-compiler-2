import * as BABYLON from 'babylonjs';

export const initGamePlayerFireRecording = (scene, playerVisual, cameraManager, playerManager) => {
	// UI Elements
	const powerContainer = document.getElementById('power-container');
	const powerBar = document.getElementById('power-bar');
	const fireControl = document.getElementById('fire-control');
	
	// State
	let currentCharge = 0;
	let storedCharge = 0;
	const maxCharge = 50;
	const chargeRate = 0.5;
	const minCharge = 5;
	
	let currentTarget = null;
	const highlightLayer = new BABYLON.HighlightLayer('targetHighlight', scene);
	const targetColor = new BABYLON.Color3(0, 1, 1);
	let isTurnActive = true;
	
	// Input Map
	const inputMap = {};
	
	// --- Helper: Face Target ---
	const faceTarget = (target) => {
		if (!target || target.isDisposed()) return;
		const dir = target.absolutePosition.subtract(playerVisual.absolutePosition);
		const angle = Math.atan2(dir.x, dir.z);
		playerVisual.rotation.y = angle;
	};
	
	// --- Target Management ---
	const getVisibleTargets = () => {
		const camera = cameraManager.getActiveCamera();
		return scene.meshes.filter(m => m.name.startsWith('sphere') && m.isEnabled() && !m.isDisposed() && camera.isInFrustum(m));
	};
	
	const setTarget = (mesh) => {
		if (currentTarget) highlightLayer.removeMesh(currentTarget);
		currentTarget = mesh;
		if (currentTarget) highlightLayer.addMesh(currentTarget, targetColor);
	};
	
	const cycleTarget = () => {
		const visibleTargets = getVisibleTargets();
		if (visibleTargets.length === 0) {
			setTarget(null);
			return;
		}
		visibleTargets.sort((a, b) => a.name.localeCompare(b.name));
		let nextIndex = 0;
		if (currentTarget) {
			const currentIndex = visibleTargets.indexOf(currentTarget);
			if (currentIndex !== -1) nextIndex = (currentIndex + 1) % visibleTargets.length;
		}
		setTarget(visibleTargets[nextIndex]);
		faceTarget(currentTarget);
	};
	
	// --- Ghost Bullet Logic ---
	const fireGhostBullet = (power, spawnBulletVisual) => {
		// Check Time Budget
		const remaining = playerManager.MAX_RECORDING_TIME - playerManager.getRecordedTime();
		if (remaining < playerManager.FIRE_COST) {
			console.log("Not enough time to fire!");
			return;
		}
		
		let aimRotation = playerVisual.rotation.y;
		if (currentTarget && !currentTarget.isDisposed()) {
			const dir = currentTarget.absolutePosition.subtract(playerVisual.absolutePosition);
			aimRotation = Math.atan2(dir.x, dir.z);
		}
		playerVisual.rotation.y = aimRotation;
		
		// Add Waypoint
		playerManager.addWaypoint('FIRE', {
			power: power,
			target: currentTarget,
			rotation: aimRotation
		});
		
		// Visual feedback (Ghost)
		spawnBulletVisual(false, power, playerVisual.absolutePosition, aimRotation, currentTarget);
	};
	
	// --- Input Listeners ---
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) inputMap[key] = true;
		else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
			if (key === 'z') {
				storedCharge = Math.max(minCharge, currentCharge);
				// Trigger event to spawn ghost via orchestrator
				if (onFireGhost) onFireGhost(storedCharge);
				currentCharge = 0;
			}
			if (key === 'c' && isTurnActive) cycleTarget();
		}
	});
	
	scene.onPointerObservable.add((pointerInfo) => {
		if (!isTurnActive) return;
		if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 0) {
			const pickInfo = pointerInfo.pickInfo;
			if (pickInfo && pickInfo.hit && pickInfo.pickedMesh && pickInfo.pickedMesh.name.startsWith('sphere')) {
				setTarget(pickInfo.pickedMesh);
				faceTarget(pickInfo.pickedMesh);
			}
		}
	});
	
	// Callback for orchestrator
	let onFireGhost = null;
	
	return {
		update: () => {
			if (inputMap['z']) {
				if (currentCharge < maxCharge) currentCharge += chargeRate;
				powerContainer.style.display = 'block';
				powerBar.style.width = `${(currentCharge / maxCharge) * 100}%`;
			} else {
				powerContainer.style.display = 'none';
			}
		},
		setTurnActive: (active) => {
			isTurnActive = active;
			if (active) fireControl.classList.remove('hidden');
			else fireControl.classList.add('hidden');
		},
		setOnFireGhost: (cb) => { onFireGhost = cb; },
		fireGhostBullet // Exposed to be called by internal logic via wrapper
	};
};
