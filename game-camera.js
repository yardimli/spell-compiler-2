import * as BABYLON from 'babylonjs';

export const initGameCamera = (scene, canvas, playerRoot) => {
	// Prevent context menu on right click for the canvas
	canvas.oncontextmenu = (e) => { e.preventDefault(); };
	
	// 1. Follow Camera (Third Person)
	const followCam = new BABYLON.ArcRotateCamera('followCam', -Math.PI / 2, Math.PI / 2.5, 20, new BABYLON.Vector3(0, 20, 0), scene);
	followCam.wheelPrecision = 50;
	followCam.lowerBetaLimit = 0.1;
	followCam.beta = 0.5;
	followCam.upperBetaLimit = (Math.PI / 2) - 0.1;
	followCam.lowerRadiusLimit = 5;
	followCam.upperRadiusLimit = 50;
	
	// --- CHANGED: Swap Mouse Controls for Follow Camera ---
	// Goal: Left Click (0) = Pan, Right Click (2) = Rotate
	followCam.panningMouseButton = 0; // Set Pan to Left Click
	
	// Reassign button mapping: [Primary(Rotate), Secondary(Pan), Tertiary(Zoom)]
	// We map Primary to Right(2) and Secondary to Left(0)
	// Ensure pointers input is attached before modifying
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
	
	// --- NEW: Remove default mouse input ---
	// This prevents the default behavior (Left Click Rotate) from conflicting with our custom controls.
	// We want Right Click to Rotate and Left Click to Pan, handled manually below.
	freeCam.inputs.removeByType('FreeCameraMouseInput');
	
	// Default active
	scene.activeCamera = followCam;
	followCam.attachControl(canvas, true);
	
	// --- Camera Logic Loop ---
	scene.onBeforeRenderObservable.add(() => {
		if (scene.activeCamera === followCam) {
			// Smooth follow target
			const targetPos = playerRoot.position.clone();
			targetPos.y += 11.0;
			followCam.setTarget(BABYLON.Vector3.Lerp(followCam.getTarget(), targetPos, 0.1));
		} else if (scene.activeCamera === firstPersonCam) {
			// Snap to player head
			const headPos = playerRoot.position.clone();
			headPos.y += 1.5; // Eye level
			firstPersonCam.position = headPos;
			
			// --- CHANGED: Sync Camera Rotation with Player Rotation in FPS ---
			// Since A/D now rotates the player mesh, the camera must follow that rotation.
			// We find the player visual (child of root) to get the rotation.
			const playerVisual = playerRoot.getChildren().find(m => m.name === 'playerVisual');
			if (playerVisual) {
				firstPersonCam.rotation.y = playerVisual.rotation.y;
			}
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
				
				// --- CHANGED: Right Click = Rotate (Look), Left Click = Pan ---
				// Swapped logic to match the comment and intended behavior.
				// Previously, Right Click was triggering Pan, which felt like "dragging very little".
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
	
	// --- UI Logic ---
	const btnFollow = document.getElementById('btn-follow');
	const btnFirst = document.getElementById('btn-first');
	const btnFree = document.getElementById('btn-free');
	
	const setActiveBtn = (btn) => {
		[btnFollow, btnFirst, btnFree].forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
	};
	
	const switchCamera = (newCam, btn) => {
		if (scene.activeCamera !== newCam) {
			scene.activeCamera.detachControl();
			scene.activeCamera = newCam;
			scene.activeCamera.attachControl(canvas, true);
			setActiveBtn(btn);
			
			// Focus canvas so keyboard events (WASD) work immediately
			canvas.focus();
		}
	};
	
	btnFollow.addEventListener('click', () => switchCamera(followCam, btnFollow));
	btnFirst.addEventListener('click', () => switchCamera(firstPersonCam, btnFirst));
	btnFree.addEventListener('click', () => switchCamera(freeCam, btnFree));
	
	// Return manager object to allow other modules to get active camera
	return {
		getActiveCamera: () => scene.activeCamera
	};
};
