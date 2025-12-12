import * as BABYLON from '@babylonjs/core';

export const initGameCamera = (scene, canvas, playerRoot) => {
	// Prevent context menu on right click for the canvas
	canvas.oncontextmenu = (e) => {
		e.preventDefault();
	};
	
	// 1. Follow Camera (Third Person)
	const followCam = new BABYLON.ArcRotateCamera('followCam', -Math.PI / 2, Math.PI / 2.5, 20, new BABYLON.Vector3(0, 0, 0), scene);
	followCam.wheelPrecision = 50;
	followCam.lowerBetaLimit = 0.1;
	followCam.upperBetaLimit = (Math.PI / 2) - 0.1;
	followCam.lowerRadiusLimit = 5;
	followCam.upperRadiusLimit = 50;
	
	// Goal: Left Click (0) = Pan, Right Click (2) = Rotate
	followCam.panningMouseButton = 0; // Set Pan to Left Click
	
	// Reassign button mapping: [Primary(Rotate), Secondary(Pan), Tertiary(Zoom)]
	if (followCam.inputs.attached.pointers) {
		followCam.inputs.attached.pointers.buttons = [2, 0];
	}
	
	// 2. First Person Camera
	const firstPersonCam = new BABYLON.UniversalCamera('firstPersonCam', new BABYLON.Vector3(0, 0, 0), scene);
	firstPersonCam.minZ = 0.1;
	firstPersonCam.speed = 0; // Movement handled by player physics
	firstPersonCam.angularSensibility = 2000;
	
	// 3. Free Camera (God Mode)
	const freeCam = new BABYLON.UniversalCamera('freeCam', new BABYLON.Vector3(0, 20, -30), scene);
	freeCam.setTarget(BABYLON.Vector3.Zero());
	freeCam.speed = 1.0;
	
	// Remove default mouse input to prevent conflicts
	freeCam.inputs.removeByType('FreeCameraMouseInput');
	
	// Default active
	scene.activeCamera = followCam;
	followCam.attachControl(canvas, true);
	
	// Track current mode string for UI
	let currentMode = 'follow';
	
	// --- Camera Logic Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (scene.activeCamera === followCam) {
			// Smooth follow target
			const targetPos = playerRoot.position.clone();
			targetPos.y += 1.0;
			followCam.setTarget(BABYLON.Vector3.Lerp(followCam.getTarget(), targetPos, 0.1));
		} else if (scene.activeCamera === firstPersonCam) {
			// Snap to player head
			const headPos = playerRoot.position.clone();
			headPos.y += 1.5; // Eye level
			firstPersonCam.position = headPos;
			
			// Clamp Pitch (Up/Down) to prevent flipping
			const limit = 1.5; // Approx 85 degrees
			if (firstPersonCam.rotation.x > limit) firstPersonCam.rotation.x = limit;
			if (firstPersonCam.rotation.x < -limit) firstPersonCam.rotation.x = -limit;
		}
	});
	
	// --- Free Camera Custom Inputs (Look & Pan) ---
	let isRightMouseDown = false;
	let isLeftMouseDown = false;
	let lastPointerX = 0;
	let lastPointerY = 0;
	
	scene.onPointerObservable.add((pointerInfo) => {
		// Only apply if Free Camera is active
		if (scene.activeCamera !== freeCam) return;
		
		switch (pointerInfo.type) {
			case BABYLON.PointerEventTypes.POINTERWHEEL: {
				// Zoom In/Out
				const event = pointerInfo.event;
				const delta = event.deltaY > 0 ? -1 : 1;
				const zoomSpeed = 2.0;
				const forward = freeCam.getDirection(BABYLON.Vector3.Forward());
				freeCam.position.addInPlace(forward.scale(delta * zoomSpeed));
				break;
			}
			case BABYLON.PointerEventTypes.POINTERDOWN:
				lastPointerX = pointerInfo.event.clientX;
				lastPointerY = pointerInfo.event.clientY;
				if (pointerInfo.event.button === 2) { // Right Click
					isRightMouseDown = true;
				} else if (pointerInfo.event.button === 0) { // Left Click
					isLeftMouseDown = true;
				}
				break;
			case BABYLON.PointerEventTypes.POINTERUP:
				if (pointerInfo.event.button === 2) {
					isRightMouseDown = false;
				} else if (pointerInfo.event.button === 0) {
					isLeftMouseDown = false;
				}
				break;
			case BABYLON.PointerEventTypes.POINTERMOVE: {
				const x = pointerInfo.event.clientX;
				const y = pointerInfo.event.clientY;
				const diffX = x - lastPointerX;
				const diffY = y - lastPointerY;
				
				lastPointerX = x;
				lastPointerY = y;
				
				if (isRightMouseDown) {
					// Rotate Camera (Look around)
					const sensitivity = 0.002;
					freeCam.rotation.y += diffX * sensitivity;
					freeCam.rotation.x += diffY * sensitivity;
				} else if (isLeftMouseDown) {
					// Pan Camera
					const panSensitivity = 0.05;
					const right = freeCam.getDirection(BABYLON.Vector3.Right());
					const up = freeCam.getDirection(BABYLON.Vector3.Up());
					
					// Invert X/Y for natural drag feel
					const moveX = right.scale(-diffX * panSensitivity);
					const moveY = up.scale(diffY * panSensitivity);
					
					freeCam.position.addInPlace(moveX).addInPlace(moveY);
				}
				break;
			}
		}
	});
	
	// --- Pointer Lock Event ---
	// Allow clicking canvas to lock pointer in FPS mode
	canvas.addEventListener('click', () => {
		if (currentMode === 'first') {
			// Check if already locked to avoid unnecessary requests
			if (document.pointerLockElement === canvas) return;
			
			// Ensure canvas has focus for keyboard events
			canvas.focus();
			
			// Request pointer lock safely
			const requestLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
			if (requestLock) {
				// Call with canvas context
				const promise = requestLock.call(canvas);
				// Modern browsers return a promise; catch errors to prevent "Uncaught runtime error"
				if (promise instanceof Promise) {
					promise.catch((err) => {
						// This catches "The user has exited the lock before this request was completed"
						// and other lock denial errors.
						console.debug('Pointer lock request failed:', err);
					});
				}
			}
		}
	});
	
	// --- Handle Pointer Lock Change (ESC key) ---
	document.addEventListener('pointerlockchange', () => {
		// If lock is lost (user pressed ESC) and we are in first person
		if (document.pointerLockElement === null && currentMode === 'first') {
			// Reset pitch to look straight ahead (Horizon)
			firstPersonCam.rotation.x = 0;
			// We keep rotation.y (Yaw) so the player doesn't snap to a different direction horizontally
		}
	}, false);
	
	// --- Switching Logic ---
	const setCameraMode = (mode) => {
		if (currentMode === mode) return; // No change needed
		
		let newCam = null;
		if (mode === 'follow') newCam = followCam;
		else if (mode === 'first') newCam = firstPersonCam;
		else if (mode === 'free') newCam = freeCam;
		
		if (newCam) {
			scene.activeCamera.detachControl();
			scene.activeCamera = newCam;
			scene.activeCamera.attachControl(canvas, true);
			currentMode = mode;
			
			// Focus canvas so keyboard events (WASD) work immediately
			canvas.focus();
			
			// Handle Pointer Lock State
			if (mode === 'first') {
				// We do NOT auto-lock here to avoid errors.
				// User must click canvas to lock.
			} else {
				// If leaving first person, ensure we unlock
				if (document.exitPointerLock) {
					document.exitPointerLock();
				}
			}
		}
	};
	
	// --- Keyboard Shortcuts (1, 2, 3) ---
	scene.onKeyboardObservable.add((kbInfo) => {
		if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			const key = kbInfo.event.key;
			if (key === '1') {
				setCameraMode('follow');
			} else if (key === '2') {
				setCameraMode('first');
			} else if (key === '3') {
				setCameraMode('free');
			}
		}
	});
	
	// Return manager object to allow other modules to get active camera
	return {
		getActiveCamera: () => scene.activeCamera,
		setCameraMode,
		getCameraMode: () => currentMode
	};
};
