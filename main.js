import * as BABYLON from '@babylonjs/core';
import * as Earcut from 'earcut';
import HavokPhysics from '@babylonjs/havok';

// Import Modules
import { initGameScene } from './game-scene';
import { initGameSceneAlt } from './game-scene-alt';
import { initGamePlayer } from './game-player';
import { initGameCamera } from './game-camera';
import { initGamePlayerFire } from './game-player-fire';
import { initGameUI } from './game-ui';
import { initGameTime } from './game-time'; // New Import

const earcut = Earcut.default || Earcut;
window.earcut = earcut;
const havokWasmUrl = './HavokPhysics.wasm';

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);

const createScene = async function () {
	const scene = new BABYLON.Scene(engine);
	
	// Physics
	try {
		const havokInstance = await HavokPhysics({ locateFile: () => havokWasmUrl });
		const hk = new BABYLON.HavokPlugin(true, havokInstance);
		scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), hk);
	} catch (e) {
		console.error('Failed to initialize physics:', e);
	}
	
	// 1. Scene (Load Map)
	const { shadowGenerator, playerStartPosition, ballSpawns } = await initGameScene(scene);
	
	// 2. Camera Manager Reference (Placeholder)
	const cameraManagerRef = { getActiveCamera: () => scene.activeCamera };
	
	// 3. UI System
	const uiManager = initGameUI(scene, cameraManagerRef);
	
	// 4. Time Manager (New)
	const timeManager = initGameTime(scene, uiManager);
	
	// 5. Player (Pass timeManager)
	const playerManager = initGamePlayer(scene, shadowGenerator, cameraManagerRef, playerStartPosition, uiManager, timeManager);
	const { playerRoot, playerVisual } = playerManager;
	
	// 6. Scene Alt (Ghosts/Enemies) - Pass timeManager and uiManager
	await initGameSceneAlt(scene, shadowGenerator, ballSpawns, playerRoot, playerManager, timeManager, uiManager);
	
	// 7. Real Camera
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	// Update the reference so Player and UI use the real camera logic
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	cameraManagerRef.setCameraMode = realCameraManager.setCameraMode;
	cameraManagerRef.getCameraMode = realCameraManager.getCameraMode;
	
	// 8. Fire System (Player Shooting) - Pass timeManager AND uiManager
	initGamePlayerFire(scene, shadowGenerator, playerVisual, realCameraManager, timeManager, uiManager);
	
	// Connect UI Slow Mo Button to Time Manager
	uiManager.setSlowMotionCallback(() => timeManager.toggleSlowMotion());
	
	// Focus canvas so keyboard events (WASD) work immediately
	canvas.focus();
	
	return scene;
};

createScene().then(scene => {
	engine.runRenderLoop(function () {
		scene.render();
	});
});

window.addEventListener('resize', function () {
	engine.resize();
});
