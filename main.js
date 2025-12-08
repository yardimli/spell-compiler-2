import * as BABYLON from 'babylonjs';
import * as Earcut from 'earcut';
import HavokPhysics from '@babylonjs/havok';

// Import Modules
import { initGameScene } from './game-scene';
import { initGameSceneAlt } from './game-scene-alt';
import { initGamePlayer } from './game-player';
import { initGameCamera } from './game-camera';
import { initGamePlayerFire } from './game-player-fire';

// 1. Safe Earcut Import
const earcut = Earcut.default || Earcut;
window.earcut = earcut;

// 2. Havok WASM URL
const havokWasmUrl = './HavokPhysics.wasm';

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);

const createScene = async function () {
	const scene = new BABYLON.Scene(engine);
	
	// --- Physics Initialization ---
	try {
		const havokInstance = await HavokPhysics({
			locateFile: () => havokWasmUrl
		});
		const hk = new BABYLON.HavokPlugin(true, havokInstance);
		scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), hk);
	} catch (e) {
		console.error('Failed to initialize physics:', e);
	}
	
	// --- 1. Initialize Scene (Environment, Floor, Walls) ---
	const { shadowGenerator } = initGameScene(scene);
	
	// --- 2. Initialize Alt Scene (Text, Random Balls) ---
	await initGameSceneAlt(scene, shadowGenerator);
	
	// --- 3. Initialize Camera (Pre-init to pass manager, but needs player root later) ---
	// We defer camera init slightly or pass a placeholder, but better to init player first.
	// However, Player needs Camera for movement direction.
	// Solution: Create a Camera Manager object that updates its internal reference.
	// For this specific flow:
	// 1. Create Camera Manager (creates cameras)
	// 2. Create Player (uses camera for input)
	// 3. Update Camera Manager with Player Target
	
	// Let's do a slight adjustment: Create Player first, but pass a "Camera Provider" object.
	// Actually, in game-player.js, we just need `cameraManager.getActiveCamera()`.
	// So we can init Camera first, but we need Player Root for the Follow Camera target.
	
	// Refined Order:
	// 1. Create Player (Physics). It needs a way to get camera direction.
	// 2. Create Camera. It needs Player Root to follow.
	
	// To solve the circular dependency:
	// We will create the Player first. Inside Player, we won't access camera until Render Loop (which happens after everything is init).
	// So we can pass a temporary object or just the future manager.
	
	const cameraManagerRef = { getActiveCamera: () => scene.activeCamera }; // Temporary
	
	// --- 3. Initialize Player ---
	const { playerRoot, playerVisual } = initGamePlayer(scene, shadowGenerator, cameraManagerRef);
	
	// --- 4. Initialize Camera System ---
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	
	// Update the ref so Player loop uses the real manager
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	
	// --- 5. Initialize Player Fire (Shooting) ---
	initGamePlayerFire(scene, shadowGenerator, playerVisual, realCameraManager);
	
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
