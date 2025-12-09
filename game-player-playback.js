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
		// For Rewind, we use ANIMATED (Kinematic) to move directly to start without collision issues
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
		
		// Use setTargetTransform for Rewind (Teleport/Kinematic)
		playerAgg.body.setTargetTransform(curPos, playerRoot.rotationQuaternion);
		playerVisual.rotation.y = curRot;
		
		if (t >= 1.0) {
			animationState = 'REPLAY';
			playerMat.alpha = 1.0;
			
			// --- Switch to DYNAMIC for Replay ---
			// This ensures the player collides with walls during playback.
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
			// Reset velocities to prevent leftover momentum
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
			playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
			
			if (rewindState.onComplete) rewindState.onComplete();
			replayState.currentIndex = 0;
			setupReplaySegment(0);
		}
	};
	
	// --- Replay Logic ---
	const setupReplaySegment = (index) => {
		if (index >= replayState.waypoints.length - 1) {
			animationState = 'NONE';
			// Ensure we stay dynamic
			playerAgg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
			playerAgg.body.setLinearVelocity(BABYLON.Vector3.Zero());
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
		// Calculate where we *want* to be
		const targetPos = BABYLON.Vector3.Lerp(replayState.startPos, nextWp.position, smoothT);
		const curRot = BABYLON.Scalar.LerpAngle(replayState.startRot, nextWp.rotation, smoothT);
		
		// --- Physics Movement ---
		// Instead of teleporting (setTargetTransform), we apply Velocity.
		// This forces the physics engine to resolve collisions (e.g., walls).
		const currentPos = playerRoot.absolutePosition;
		const diff = targetPos.subtract(currentPos);
		
		// P-Controller for velocity: Move towards target proportional to distance
		// Scale factor determines how "stiff" the movement is.
		const velocity = diff.scale(60.0); // High gain to track closely
		
		// Clamp velocity to prevent tunneling if we get too far behind (e.g., stuck on wall)
		const maxSpeed = 20.0;
		if (velocity.length() > maxSpeed) {
			velocity.normalize().scaleInPlace(maxSpeed);
		}
		
		playerAgg.body.setLinearVelocity(velocity);
		// Zero out angular velocity to prevent tipping
		playerAgg.body.setAngularVelocity(BABYLON.Vector3.Zero());
		
		// Apply rotation visually (Capsules usually don't rotate via physics on Y easily)
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
