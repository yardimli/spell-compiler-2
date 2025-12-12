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
	
	// 3. UI System (Initialize first to pass callbacks to player)
	// We need the real camera manager for UI buttons, but we can pass the ref object for now
	// and update the ref's methods later, or initialize UI after camera.
	// However, UI needs to be passed to Player. Player needs Camera.
	// Solution: Init UI with the Ref.
	const uiManager = initGameUI(scene, cameraManagerRef);
	
	// 4. Player
	const playerManager = initGamePlayer(scene, shadowGenerator, cameraManagerRef, playerStartPosition, uiManager);
	const { playerRoot, playerVisual } = playerManager;
	
	// 5. Scene Alt (Ghosts/Enemies) - Now needs player info for AI
	await initGameSceneAlt(scene, shadowGenerator, ballSpawns, playerRoot, playerManager);
	
	// 6. Real Camera
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	// Update the reference so Player and UI use the real camera logic
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	cameraManagerRef.setCameraMode = realCameraManager.setCameraMode;
	cameraManagerRef.getCameraMode = realCameraManager.getCameraMode;
	
	// 7. Fire System (Player Shooting)
	initGamePlayerFire(scene, shadowGenerator, playerVisual, realCameraManager);
	
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
