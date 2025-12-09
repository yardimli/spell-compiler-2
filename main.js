import * as BABYLON from 'babylonjs';
import * as Earcut from 'earcut';
import HavokPhysics from '@babylonjs/havok';

// Import Modules
import { initGameScene } from './game-scene';
import { initGameSceneAlt } from './game-scene-alt';
import { initGamePlayer } from './game-player';
import { initGameCamera } from './game-camera';
import { initGamePlayerFire } from './game-player-fire';
import { initGameTimeline } from './game-timeline';

const earcut = Earcut.default || Earcut;
window.earcut = earcut;
const havokWasmUrl = './HavokPhysics.wasm';

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);

// UI Elements
const timerSpinner = document.getElementById('timer-spinner');
const timerText = document.getElementById('timer-text');
const btnEndTurn = document.getElementById('btn-end-turn');

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
	
	// 1. Scene
	const { shadowGenerator } = initGameScene(scene);
	const sceneAltManager = await initGameSceneAlt(scene, shadowGenerator);
	
	// 2. Player & Camera
	const cameraManagerRef = { getActiveCamera: () => scene.activeCamera };
	const playerManager = initGamePlayer(scene, shadowGenerator, cameraManagerRef);
	const { playerRoot, playerVisual } = playerManager;
	
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	
	// 3. Fire System (Pass playerManager to add waypoints)
	const fireManager = initGamePlayerFire(scene, shadowGenerator, playerVisual, realCameraManager, playerManager);
	
	// 4. Timeline UI
	const timelineManager = initGameTimeline(playerManager);
	
	// 5. Turn Logic
	// --- CHANGED: Turn duration remains 30 seconds for thinking time ---
	const TURN_DURATION = 30;
	let timeLeft = TURN_DURATION;
	let timerInterval = null;
	let isTurnPhase = false;
	
	const updateTimerUI = () => {
		timerText.innerText = Math.ceil(timeLeft);
		const percentage = (timeLeft / TURN_DURATION) * 100;
		timerSpinner.style.background = `conic-gradient(#00ff00 ${percentage}%, #333 0%)`;
		if (timeLeft <= 5) timerSpinner.style.background = `conic-gradient(#ff0000 ${percentage}%, #333 0%)`;
	};
	
	const startTurn = () => {
		isTurnPhase = true;
		timeLeft = TURN_DURATION;
		updateTimerUI();
		btnEndTurn.disabled = false;
		
		sceneAltManager.setBallsFrozen(true);
		playerManager.startTurn();
		fireManager.setTurnActive(true);
		
		if (timerInterval) clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			timeLeft--;
			updateTimerUI();
			if (timeLeft <= 0) endTurn();
		}, 1000);
	};
	
	const endTurn = () => {
		if (!isTurnPhase) return;
		isTurnPhase = false;
		clearInterval(timerInterval);
		btnEndTurn.disabled = true;
		
		playerManager.disableInput();
		fireManager.setTurnActive(false);
		
		// Resolve Turn: Rewind -> Replay Waypoints
		playerManager.resolveTurnWithWaypoints(
			// Fire Callback (Replay Phase)
			(waypointData) => {
				fireManager.fireFromWaypoint(waypointData);
			},
			// On Replay Start (Rewind Complete)
			() => {
				sceneAltManager.setBallsFrozen(false);
			},
			// On Complete
			() => {
				startTurn();
			},
			// On Progress (Update Timeline UI)
			(index) => {
				timelineManager.updateProgress(index);
			}
		);
	};
	
	btnEndTurn.addEventListener('click', endTurn);
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
