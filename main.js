import * as BABYLON from 'babylonjs';
import * as Earcut from 'earcut';
import HavokPhysics from '@babylonjs/havok';

// 1. Safe Earcut Import
const earcut = Earcut.default || Earcut;
window.earcut = earcut; // Global backup

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
	
	// --- Camera ---
	const camera = new BABYLON.ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2.5, 20, new BABYLON.Vector3(0, 0, 0), scene);
	camera.attachControl(canvas, true);
	camera.wheelPrecision = 50;
	camera.lowerBetaLimit = 0.1;
	camera.upperBetaLimit = (Math.PI / 2) - 0.1;
	camera.lowerRadiusLimit = 5;
	camera.upperRadiusLimit = 50;
	
	// --- Lights & Shadows ---
	const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), scene);
	hemiLight.intensity = 0.5;
	
	const pointLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 15, 0), scene);
	pointLight.intensity = 0.8;
	
	const shadowGenerator = new BABYLON.ShadowGenerator(1024, pointLight);
	shadowGenerator.useBlurExponentialShadowMap = true;
	shadowGenerator.blurKernel = 32;
	
	// --- Environment ---
	const envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData('./assets/environments/studio.env', scene);
	scene.environmentTexture = envTexture;
	scene.createDefaultSkybox(envTexture, true, 1000);
	
	// --- Constants ---
	const groundSize = 50;
	const wallHeight = 4;
	const wallThickness = 2;
	
	// --- Texture Generation Functions ---
	const createFloorTexture = (scene, tileSize) => {
		const texture = new BABYLON.Texture('./assets/game/floor.jpg', scene);
		texture.uScale = groundSize / tileSize;
		texture.vScale = groundSize / tileSize;
		return texture;
	};
	
	const createWallTexture = (scene) => {
		const texture = new BABYLON.Texture('./assets/game/walls.jpg', scene);
		return texture;
	};
	
	// --- Grid Surface (Floor) ---
	const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: groundSize, height: groundSize, subdivisions: 100 }, scene);
	ground.receiveShadows = true;
	
	const floorTileSize = 5;
	const floorTexture = createFloorTexture(scene, floorTileSize);
	
	const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
	groundMat.diffuseTexture = floorTexture;
	groundMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
	groundMat.specularPower = 264;
	ground.material = groundMat;
	
	// --- Physics: Ground ---
	new BABYLON.PhysicsAggregate(
		ground,
		BABYLON.PhysicsShapeType.BOX,
		{ mass: 0, restitution: 0.5 },
		scene
	);
	
	// --- Walls ---
	const wallTileSize = 10;
	const wallTexture = createWallTexture(scene);
	
	const wallMat = new BABYLON.StandardMaterial('wallMat', scene);
	wallMat.diffuseTexture = wallTexture;
	wallMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
	wallMat.specularPower = 264;
	
	const faceUV = [];
	faceUV[0] = new BABYLON.Vector4(0, 0, groundSize / wallTileSize, wallHeight / wallTileSize);
	faceUV[1] = new BABYLON.Vector4(0, 0, groundSize / wallTileSize, wallHeight / wallTileSize);
	faceUV[2] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, wallHeight / wallTileSize);
	faceUV[3] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, wallHeight / wallTileSize);
	faceUV[4] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, groundSize / wallTileSize);
	faceUV[5] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, groundSize / wallTileSize);
	
	const wallOffset = groundSize / 2;
	
	const wallsConfig = [
		{ x: 0, z: wallOffset, rotation: 0 },
		{ x: 0, z: -wallOffset, rotation: Math.PI },
		{ x: wallOffset, z: 0, rotation: -Math.PI / 2 },
		{ x: -wallOffset, z: 0, rotation: Math.PI / 2 }
	];
	
	wallsConfig.forEach((config, index) => {
		const wall = BABYLON.MeshBuilder.CreateBox(`wall_${index}`, {
			width: groundSize,
			height: wallHeight,
			depth: wallThickness,
			faceUV: faceUV
		}, scene);
		
		wall.position.set(config.x, wallHeight / 2, config.z);
		wall.rotation.y = config.rotation;
		wall.material = wallMat;
		wall.receiveShadows = true;
		shadowGenerator.addShadowCaster(wall);
		
		new BABYLON.PhysicsAggregate(
			wall,
			BABYLON.PhysicsShapeType.BOX,
			{ mass: 0, restitution: 0.5 },
			scene
		);
	});
	
	// --- 3D Text ---
	const fontURL = './assets/fonts/Kenney%20Future%20Regular.json';
	
	try {
		const fontResponse = await fetch(fontURL);
		const fontData = await fontResponse.json();
		
		if (!fontData || !fontData.boundingBox) {
			throw new Error('Font data is missing boundingBox');
		}
		
		const textMesh = BABYLON.MeshBuilder.CreateText(
			'text',
			'Hello World',
			fontData,
			{
				size: 2,
				depth: 0.5,
				resolution: 64
			},
			scene
		);
		
		const silverMat = new BABYLON.PBRMaterial('silver', scene);
		silverMat.metallic = 1.0;
		silverMat.roughness = 0.15;
		silverMat.albedoColor = new BABYLON.Color3(0.9, 0.9, 0.9);
		textMesh.material = silverMat;
		
		shadowGenerator.addShadowCaster(textMesh);
		
		textMesh.computeWorldMatrix(true);
		const center = textMesh.getBoundingInfo().boundingBox.center;
		textMesh.position.x -= center.x;
		textMesh.position.y -= center.y;
		textMesh.position.z -= center.z;
		textMesh.bakeCurrentTransformIntoVertices();
		
		textMesh.position.y = 2;
		textMesh.position.x = -6;
		
		const textAgg = new BABYLON.PhysicsAggregate(
			textMesh,
			BABYLON.PhysicsShapeType.CONVEX_HULL,
			{ mass: 0, restitution: 0.9 },
			scene
		);
		
		textAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
		textAgg.body.disablePreStep = false;
		
		scene.registerBeforeRender(() => {
			textMesh.rotate(BABYLON.Axis.Y, 0.01, BABYLON.Space.LOCAL);
			textAgg.body.setTargetTransform(textMesh.absolutePosition, textMesh.rotationQuaternion);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Bouncing Balls ---
	const ballCount = 10;
	for (let i = 0; i < ballCount; i++) {
		const sphere = BABYLON.MeshBuilder.CreateSphere(`sphere${i}`, { diameter: 1.5 }, scene);
		sphere.position.x = (Math.random() * 40) - 20;
		sphere.position.z = (Math.random() * 40) - 20;
		sphere.position.y = 10 + Math.random() * 5;
		
		const ballMat = new BABYLON.StandardMaterial(`ballMat${i}`, scene);
		ballMat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
		ballMat.specularColor = new BABYLON.Color3(1, 1, 1);
		ballMat.specularPower = 64;
		sphere.material = ballMat;
		
		shadowGenerator.addShadowCaster(sphere);
		
		new BABYLON.PhysicsAggregate(
			sphere,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 1, restitution: 0.9, friction: 0.2 },
			scene
		);
	}
	
	// --- Player Character ---
	const playerHeight = 4;
	const playerRadius = 1;
	
	// 1. Player Root (Physics Body) - Invisible
	// This mesh handles the physics collisions and movement.
	const playerRoot = BABYLON.MeshBuilder.CreateCapsule('playerRoot', { height: playerHeight, radius: playerRadius }, scene);
	playerRoot.position.set(0, 5, 0);
	playerRoot.visibility = 0; // Hide the physics body
	
	// 2. Player Visual (Visible Mesh) - Child of Root
	// This mesh handles the visual representation and rotation.
	const playerVisual = BABYLON.MeshBuilder.CreateCapsule('playerVisual', { height: playerHeight, radius: playerRadius }, scene);
	playerVisual.parent = playerRoot; // Attach to root
	
	const playerMat = new BABYLON.StandardMaterial('playerMat', scene);
	playerMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0);
	playerVisual.material = playerMat;
	shadowGenerator.addShadowCaster(playerVisual);
	
	// 3. Physics Aggregate on Root
	const playerAgg = new BABYLON.PhysicsAggregate(
		playerRoot,
		BABYLON.PhysicsShapeType.CAPSULE,
		{ mass: 1, friction: 0, restitution: 0 },
		scene
	);
	
	// Lock rotation on the physics body so it doesn't tip over
	playerAgg.body.setMassProperties({
		inertia: new BABYLON.Vector3(0, 0, 0)
	});
	
	// --- Player Controls ---
	const inputMap = {};
	scene.onKeyboardObservable.add((kbInfo) => {
		const type = kbInfo.type;
		const key = kbInfo.event.key.toLowerCase();
		if (type === BABYLON.KeyboardEventTypes.KEYDOWN) {
			inputMap[key] = true;
		} else if (type === BABYLON.KeyboardEventTypes.KEYUP) {
			inputMap[key] = false;
		}
	});
	
	const speed = 8.0;
	const jumpForce = 6.0;
	
	// --- Game Loop / Character Update ---
	scene.onBeforeRenderObservable.add(() => {
		if (!playerAgg.body) return;
		
		// 1. Camera Follow Logic
		// Target the playerRoot position
		const targetPos = playerRoot.position.clone();
		targetPos.y += 1.0;
		camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), targetPos, 0.1));
		
		// 2. Calculate Input Direction
		let z = (inputMap['w'] || inputMap['arrowup']) ? 1 : 0;
		z -= (inputMap['s'] || inputMap['arrowdown']) ? 1 : 0;
		
		let x = (inputMap['d'] || inputMap['arrowright']) ? 1 : 0;
		x -= (inputMap['a'] || inputMap['arrowleft']) ? 1 : 0;
		
		const isJumping = inputMap[' '];
		
		// 3. Movement Logic
		// Get camera forward direction (projected on XZ plane)
		const camForward = camera.getDirection(BABYLON.Vector3.Forward());
		camForward.y = 0;
		camForward.normalize();
		
		const camRight = camera.getDirection(BABYLON.Vector3.Right());
		camRight.y = 0;
		camRight.normalize();
		
		// Calculate move vector based on inputs relative to camera
		const moveDir = camForward.scale(z).add(camRight.scale(x));
		
		if (moveDir.length() > 0) {
			moveDir.normalize();
		}
		
		// Get current velocity to preserve Y (gravity)
		const currentVel = new BABYLON.Vector3();
		playerAgg.body.getLinearVelocityToRef(currentVel);
		
		// Apply movement velocity (X and Z), preserve Y
		const targetVelocity = moveDir.scale(speed);
		
		// Jump Logic
		// Raycast down to check if grounded
		const ray = new BABYLON.Ray(playerRoot.position, new BABYLON.Vector3(0, -1, 0), (playerHeight / 2) + 0.1);
		const hit = scene.pickWithRay(ray, (mesh) => mesh !== playerRoot && mesh !== playerVisual);
		const isGrounded = hit.hit;
		
		let yVel = currentVel.y;
		
		if (isJumping && isGrounded) {
			yVel = jumpForce;
		}
		
		// Set the new velocity to the physics body
		playerAgg.body.setLinearVelocity(new BABYLON.Vector3(targetVelocity.x, yVel, targetVelocity.z));
		
		// 4. Visual Rotation
		// Rotate the visual mesh to face movement direction
		if (moveDir.lengthSquared() > 0.01) {
			const targetRotation = Math.atan2(moveDir.x, moveDir.z);
			
			// Smooth rotation for the visual mesh only
			const currentRotation = playerVisual.rotation.y;
			// Helper to interpolate angles correctly (handling 0 -> 360 wrap)
			const rotation = BABYLON.Scalar.LerpAngle(currentRotation, targetRotation, 0.2);
			
			playerVisual.rotation.y = rotation;
		}
	});
	
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
