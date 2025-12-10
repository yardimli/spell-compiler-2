import * as BABYLON from 'babylonjs';
import * as Earcut from 'earcut';
import HavokPhysics from '@babylonjs/havok';

// Import Modules
import { initGameScene } from './game-scene';
import { initGameSceneAlt } from './game-scene-alt';
import { initGamePlayer } from './game-player';
import { initGameCamera } from './game-camera';
import { initGamePlayerFire } from './game-player-fire';

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
	// initGameScene is now async and returns map data
	const { shadowGenerator, playerStartPosition, ballSpawns } = await initGameScene(scene);
	
	// 2. Scene Alt (Balls)
	// Pass the ball spawns from the map
	await initGameSceneAlt(scene, shadowGenerator, ballSpawns);
	
	// 3. Player & Camera
	const cameraManagerRef = { getActiveCamera: () => scene.activeCamera };
	
	// Pass playerStartPosition from map
	const playerManager = initGamePlayer(scene, shadowGenerator, cameraManagerRef, playerStartPosition);
	const { playerRoot, playerVisual } = playerManager;
	
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	
	// 4. Fire System (Real-time)
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
