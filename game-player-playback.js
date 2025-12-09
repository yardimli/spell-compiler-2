import * as BABYLON from 'babylonjs';

export const initGamePlayerPlayback = (scene, playerRoot, playerVisual, playerAgg, playerMat) => {
	
	// State
	let animationState = 'NONE'; // 'NONE', 'REWIND', 'REPLAY'
	
	let rewindState = {
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		endPos: new BABYLON.Vector3(),
		endRot: 0,
		startTime: 0,
		duration: 2.0,
		onComplete: null
	};
	
	let replayState = {
		waypoints: [],
		currentIndex: 0,
		startTime: 0,
		startPos: new BABYLON.Vector3(),
		startRot: 0,
		segmentDuration: 0,
		fireCallback: null,
		onComplete: null,
		onProgress: null
	};
	
	// --- Rewind Logic ---
	const startRewind = (waypoints, onReplayStart) => {
		animationState = 'REWIND';
		playerMat.alpha = 0.5;
		
		// Physics Reset
		playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
		playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
		playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
		
		rewindState.startPos.copyFrom(playerRoot.absolutePosition);
		rewindState.startRot = playerVisual.rotation.y;
		
		if (waypoints.length > 0) {
			rewindState.endPos.copyFrom(waypoints[0].position);
			rewindState.endRot = waypoints[0].rotation;
		} else {
			rewindState.endPos.copyFrom(rewindState.startPos);
		}
		
		rewindState.startTime = performance.now();
		rewindState.onComplete = onReplayStart;
	};
	
	const updateRewind = () => {
		const now = performance.now();
		const t = Math.min((now - rewindState.startTime) / (rewindState.duration * 1000), 1.0);
		const smoothT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
		
		const curPos = BABYLON.Vector3.Lerp(rewindState.startPos, rewindState.endPos, smoothT);
		const curRot = BABYLON.Scalar.LerpAngle(rewindState.startRot, rewindState.endRot, smoothT);
		
		playerAgg.body.setTargetTransform(curPos, playerRoot.rotationQuaternion);
		playerVisual.rotation.y = curRot;
		
		if (t >= 1.0) {
			animationState = 'REPLAY';
			playerMat.alpha = 1.0;
			if (rewindState.onComplete) rewindState.onComplete();
			replayState.currentIndex = 0;
			setupReplaySegment(0);
		}
	};
	
	// --- Replay Logic ---
	const setupReplaySegment = (index) => {
		if (index >= replayState.waypoints.length - 1) {
			animationState = 'NONE';
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
			if (replayState.onComplete) replayState.onComplete();
			return;
		}
		
		const currentWp = replayState.waypoints[index];
		
		replayState.currentIndex = index;
		replayState.startTime = performance.now();
		replayState.startPos.copyFrom(currentWp.position);
		replayState.startRot = currentWp.rotation;
		replayState.segmentDuration = Math.max(currentWp.duration, 0.01);
		
		if (replayState.onProgress) replayState.onProgress(index, 0);
	};
	
	const updateReplay = () => {
		const now = performance.now();
		const elapsed = (now - replayState.startTime) / 1000;
		const t = Math.min(elapsed / replayState.segmentDuration, 1.0);
		
		if (replayState.onProgress) {
			replayState.onProgress(replayState.currentIndex, t);
		}
		
		const nextWp = replayState.waypoints[replayState.currentIndex + 1];
		
		const smoothT = t * t * (3 - 2 * t);
		const curPos = BABYLON.Vector3.Lerp(replayState.startPos, nextWp.position, smoothT);
		const curRot = BABYLON.Scalar.LerpAngle(replayState.startRot, nextWp.rotation, smoothT);
		
		playerAgg.body.setTargetTransform(curPos, playerRoot.rotationQuaternion);
		playerVisual.rotation.y = curRot;
		
		if (t >= 1.0) {
			if (nextWp.type === 'FIRE') {
				if (replayState.fireCallback) {
					replayState.fireCallback(nextWp);
				}
			}
			setupReplaySegment(replayState.currentIndex + 1);
		}
	};
	
	return {
		update: () => {
			if (animationState === 'REWIND') updateRewind();
			else if (animationState === 'REPLAY') updateReplay();
		},
		startSequence: (waypoints, fireCallback, onReplayStart, onComplete, onProgress) => {
			replayState.waypoints = waypoints;
			replayState.fireCallback = fireCallback;
			replayState.onComplete = onComplete;
			replayState.onProgress = onProgress;
			
			startRewind(waypoints, onReplayStart);
		},
		getState: () => animationState
	};
};
