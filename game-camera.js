import * as BABYLON from 'babylonjs';

export const initGameCamera = (scene, canvas, playerRoot) => {
	// Prevent context menu on right click for the canvas (needed for panning)
	canvas.oncontextmenu = (e) => { e.preventDefault(); };
	
	// 1. Follow Camera (Third Person)
	const followCam = new BABYLON.ArcRotateCamera('followCam', -Math.PI / 2, Math.PI / 2.5, 20, new BABYLON.Vector3(0, 0, 0), scene);
	followCam.wheelPrecision = 50;
	followCam.lowerBetaLimit = 0.1;
	followCam.upperBetaLimit = (Math.PI / 2) - 0.1;
	followCam.lowerRadiusLimit = 5;
	followCam.upperRadiusLimit = 50;
	
	// 2. First Person Camera
	const firstPersonCam = new BABYLON.UniversalCamera('firstPersonCam', new BABYLON.Vector3(0, 0, 0), scene);
	firstPersonCam.minZ = 0.1;
	firstPersonCam.speed = 0; // Movement handled by player physics, this just looks
	firstPersonCam.angularSensibility = 2000;
	
	// 3. Free Camera (God Mode)
	const freeCam = new BABYLON.UniversalCamera('freeCam', new BABYLON.Vector3(0, 20, -30), scene);
	freeCam.setTarget(BABYLON.Vector3.Zero());
	freeCam.speed = 1.0;
	// Detach default keys so we can handle specific logic if needed,
	// but keeping them allows WASD movement of the camera itself.
	// We will add custom mouse logic below.
	
	// Default active
	scene.activeCamera = followCam;
	followCam.attachControl(canvas, true);
	
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
		}
	});
	
	// --- Free Camera Custom Inputs (Zoom & Pan) ---
	let isRightMouseDown = false;
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
				if (pointerInfo.event.button === 2) { // Right Click
					isRightMouseDown = true;
					lastPointerX = pointerInfo.event.clientX;
					lastPointerY = pointerInfo.event.clientY;
				}
				break;
			case BABYLON.PointerEventTypes.POINTERUP:
				if (pointerInfo.event.button === 2) {
					isRightMouseDown = false;
				}
				break;
			case BABYLON.PointerEventTypes.POINTERMOVE:
				if (isRightMouseDown) {
					const x = pointerInfo.event.clientX;
					const y = pointerInfo.event.clientY;
					const diffX = x - lastPointerX;
					const diffY = y - lastPointerY;
					
					lastPointerX = x;
					lastPointerY = y;
					
					const panSensitivity = 0.05;
					
					// Calculate Panning Directions relative to Camera
					const right = freeCam.getDirection(BABYLON.Vector3.Right());
					const up = freeCam.getDirection(BABYLON.Vector3.Up());
					
					// Invert X/Y for natural drag feel
					const moveX = right.scale(-diffX * panSensitivity);
					const moveY = up.scale(diffY * panSensitivity);
					
					freeCam.position.addInPlace(moveX).addInPlace(moveY);
				}
				break;
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
