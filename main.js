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

// --- UI Elements ---
const timerSpinner = document.getElementById('timer-spinner');
const timerText = document.getElementById('timer-text');
const btnEndTurn = document.getElementById('btn-end-turn');

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
	
	// --- 1. Initialize Scene ---
	const { shadowGenerator } = initGameScene(scene);
	
	// --- 2. Initialize Alt Scene (Balls) ---
	const sceneAltManager = await initGameSceneAlt(scene, shadowGenerator);
	
	// --- 3. Initialize Player & Camera ---
	const cameraManagerRef = { getActiveCamera: () => scene.activeCamera };
	
	const playerManager = initGamePlayer(scene, shadowGenerator, cameraManagerRef);
	const { playerRoot, playerVisual } = playerManager;
	
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	
	// --- 4. Initialize Fire System ---
	const fireManager = initGamePlayerFire(scene, shadowGenerator, playerVisual, realCameraManager);
	
	// --- 5. Turn System Logic ---
	const TURN_DURATION = 30;
	let timeLeft = TURN_DURATION;
	let timerInterval = null;
	let isTurnPhase = false;
	
	const updateTimerUI = () => {
		timerText.innerText = timeLeft;
		const percentage = (timeLeft / TURN_DURATION) * 100;
		// Update conic gradient
		timerSpinner.style.background = `conic-gradient(#00ff00 ${percentage}%, #333 0%)`;
		
		if (timeLeft <= 5) {
			timerSpinner.style.background = `conic-gradient(#ff0000 ${percentage}%, #333 0%)`;
		}
	};
	
	const startTurn = () => {
		isTurnPhase = true;
		timeLeft = TURN_DURATION;
		updateTimerUI();
		btnEndTurn.disabled = false;
		
		// 1. Freeze Balls
		sceneAltManager.setBallsFrozen(true);
		
		// 2. Enable Player Input & Set Start Pos
		playerManager.startTurn();
		
		// 3. Enable Fire UI
		fireManager.setTurnActive(true);
		
		// 4. Start Timer
		if (timerInterval) clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			timeLeft--;
			updateTimerUI();
			
			if (timeLeft <= 0) {
				endTurn();
			}
		}, 1000);
	};
	
	const endTurn = () => {
		if (!isTurnPhase) return;
		isTurnPhase = false;
		clearInterval(timerInterval);
		btnEndTurn.disabled = true;
		
		// 1. Disable Player Input
		playerManager.disableInput();
		
		// 2. Hide Fire UI
		fireManager.setTurnActive(false);
		
		// 3. Unfreeze Balls (Start moving again)
		sceneAltManager.setBallsFrozen(false);
		
		// 4. Execute Fire (if queued)
		// Prompt says: "user should fire the bullet before starting to move"
		fireManager.executeTurnFire();
		
		// 5. Resolve Movement (Cinematic)
		// Capture where the player ended up
		const targetPos = playerRoot.absolutePosition.clone();
		
		// Reset and Animate
		playerManager.resolveMovement(targetPos, () => {
			// Callback when movement animation is done
			// Start next turn
			startTurn();
		});
	};
	
	btnEndTurn.addEventListener('click', endTurn);
	
	// Start the first turn
	startTurn();
	
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
