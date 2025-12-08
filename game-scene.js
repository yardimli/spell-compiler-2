import * as BABYLON from 'babylonjs';

export const initGameScene = (scene) => {
	// --- Lights & Shadows ---
	const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), scene);
	hemiLight.intensity = 0.5;
	
	const pointLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 15, 0), scene);
	pointLight.intensity = 0.8;
	
	const shadowGenerator = new BABYLON.ShadowGenerator(1024, pointLight);
	shadowGenerator.useBlurExponentialShadowMap = true;
	shadowGenerator.blurKernel = 32;
	
	// --- Environment ---
	const envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData('./assets/environments/sanGiuseppeBridge.env', scene);
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
	
	return { shadowGenerator, groundSize };
};
