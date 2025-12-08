import * as BABYLON from 'babylonjs';

export const initGameCamera = (scene, canvas, playerRoot) => {
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
