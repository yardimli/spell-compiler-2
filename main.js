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
// Stats UI
const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');
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
	
	// 1. Scene (Maze) - Returns gems and start positions
	const { shadowGenerator, gems, startPositions } = initGameScene(scene);
	
	// 2. Ghosts (Replaces Alt Scene) - Pass start positions
	const sceneAltManager = await initGameSceneAlt(scene, shadowGenerator, startPositions);
	
	// 3. Player & Camera - Pass start position for Player (P)
	const cameraManagerRef = { getActiveCamera: () => scene.activeCamera };
	const playerManager = initGamePlayer(scene, shadowGenerator, cameraManagerRef, startPositions['P']);
	const { playerRoot, playerVisual } = playerManager;
	
	const realCameraManager = initGameCamera(scene, canvas, playerRoot);
	cameraManagerRef.getActiveCamera = realCameraManager.getActiveCamera;
	
	// 4. Fire System (Pass playerManager to add waypoints)
	const fireManager = initGamePlayerFire(scene, shadowGenerator, playerVisual, realCameraManager, playerManager);
	
	// 5. Timeline UI
	const timelineManager = initGameTimeline(playerManager);
	
	// Game State Logic
	let score = 0;
	let lives = 3;
	
	const updateStatsUI = () => {
		scoreDisplay.innerText = `SCORE: ${score}`;
		livesDisplay.innerText = `LIVES: ${lives}`;
	};
	
	// Gem Collection Loop
	scene.onBeforeRenderObservable.add(() => {
		// --- Only collect gems during REPLAY phase ---
		if (playerManager.getPlaybackState() !== 'REPLAY') return;
		
		if (!playerRoot || gems.length === 0) return;
		
		const playerPos = playerRoot.absolutePosition;
		
		for (let i = gems.length - 1; i >= 0; i--) {
			const gem = gems[i];
			if (gem.isDisposed()) {
				gems.splice(i, 1);
				continue;
			}
			
			// Simple distance check for collection
			// Increased threshold to 3.5 to ensure collection even if physics keeps player slightly away
			// Player Radius (2.2) + Gem Radius (0.4) + Buffer
			if (BABYLON.Vector3.Distance(playerPos, gem.position) < 3.5) {
				gem.dispose();
				gems.splice(i, 1);
				score += 100;
				updateStatsUI();
			}
		}
	});
	
	// Win Condition
	playerManager.setOnWin(() => {
		alert(`YOU WIN! Final Score: ${score}`);
		// Reset Game
		// location.reload();
	});
	
	// Lose Condition (Ghost Catch)
	sceneAltManager.setOnPlayerCaught(() => {
		lives--;
		updateStatsUI();
		
		if (lives <= 0) {
			alert(`GAME OVER! Final Score: ${score}`);
			// location.reload();
		} else {
			// Respawn Player
			playerManager.respawn();
			// Reset Turn
			startTurn();
		}
	});
	
	// 6. Turn Logic
	const TURN_DURATION = 15;
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
		
		// Freeze ghosts during planning phase
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
		
		canvas.focus();
		
		// Resolve Turn: Rewind -> Replay Waypoints
		playerManager.resolveTurnWithWaypoints(
			// Fire Callback (Replay Phase)
			(waypointData) => {
				fireManager.fireFromWaypoint(waypointData);
			},
			// On Replay Start (Rewind Complete)
			() => {
				// Unfreeze ghosts during action phase
				sceneAltManager.setBallsFrozen(false);
			},
			// On Complete
			() => {
				startTurn();
			},
			// On Progress (Update Timeline UI)
			(index, progress) => {
				timelineManager.updateProgress(index, progress);
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
