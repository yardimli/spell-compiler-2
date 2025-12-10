import * as BABYLON from '@babylonjs/core';

export const initGameScene = async (scene) => {
	// --- Lights & Shadows ---
	const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), scene);
	hemiLight.intensity = 0.5;
	
	const pointLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 25, 0), scene);
	pointLight.intensity = 0.8;
	
	const shadowGenerator = new BABYLON.ShadowGenerator(2048, pointLight);
	shadowGenerator.useBlurExponentialShadowMap = true;
	shadowGenerator.blurKernel = 32;
	
	// --- Environment ---
	const envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData('./assets/environments/sanGiuseppeBridge.env', scene);
	scene.environmentTexture = envTexture;
	scene.createDefaultSkybox(envTexture, true, 1000);
	
	// --- Load Map File ---
	let mapData = '';
	try {
		const response = await fetch('./assets/map.txt');
		mapData = await response.text();
	} catch (e) {
		console.error('Failed to load map.txt', e);
		// Fallback map if file missing
		mapData = '1 1 1\n1 5 1\n1 1 1';
	}
	
	// Parse Map
	// Split by new lines, then split by spaces (handling multiple spaces or tabs)
	const rows = mapData.trim().split('\n').map(row => row.trim().split(/\s+/));
	const rowCount = rows.length;
	const colCount = rows[0].length;
	
	const TILE_SIZE = 5;
	const WALL_HEIGHT = 4;
	const groundWidth = colCount * TILE_SIZE;
	const groundHeight = rowCount * TILE_SIZE;
	
	// Calculate offsets to center the map at (0,0,0)
	const xOffset = -groundWidth / 2 + (TILE_SIZE / 2);
	const zOffset = -groundHeight / 2 + (TILE_SIZE / 2); // Map rows usually go Top->Bottom, which is +Z to -Z or -Z to +Z depending on preference.
	// Here we map Row 0 to -Z (Top) or +Z. Let's map Row 0 to +Z (Top of map) to match array visual.
	// Actually, usually in 2D arrays: Row 0 is "Top". In 3D, +Z is "Forward".
	// So Row 0 = +Z_Max, Row Max = -Z_Max.
	const zStart = groundHeight / 2 - (TILE_SIZE / 2);
	
	// --- Materials ---
	const createFloorTexture = (scene) => {
		const texture = new BABYLON.Texture('./assets/game/floor.jpg', scene);
		texture.uScale = colCount;
		texture.vScale = rowCount;
		return texture;
	};
	
	const createWallTexture = (scene) => {
		const texture = new BABYLON.Texture('./assets/game/walls.jpg', scene);
		return texture;
	};
	
	const floorTexture = createFloorTexture(scene);
	const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
	groundMat.diffuseTexture = floorTexture;
	groundMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
	groundMat.specularPower = 264;
	
	const wallTexture = createWallTexture(scene);
	const wallMat = new BABYLON.StandardMaterial('wallMat', scene);
	wallMat.diffuseTexture = wallTexture;
	wallMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
	wallMat.specularPower = 264;
	
	// --- Ground ---
	const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: groundWidth, height: groundHeight, subdivisions: 100 }, scene);
	ground.material = groundMat;
	ground.receiveShadows = true;
	
	new BABYLON.PhysicsAggregate(
		ground,
		BABYLON.PhysicsShapeType.BOX,
		{ mass: 0, restitution: 0.5 },
		scene
	);
	
	// --- Map Parsing & Object Creation ---
	let playerStartPosition = new BABYLON.Vector3(0, 5, 0); // Default
	const ballSpawns = []; // Stores { position, type }
	
	for (let r = 0; r < rowCount; r++) {
		for (let c = 0; c < colCount; c++) {
			const cellValue = rows[r][c];
			
			// Calculate Position
			// X = Column index * size + offset
			// Z = Start Z - (Row index * size)
			const posX = xOffset + (c * TILE_SIZE);
			const posZ = zStart - (r * TILE_SIZE);
			const position = new BABYLON.Vector3(posX, WALL_HEIGHT / 2, posZ);
			
			if (cellValue === '1') {
				// Wall
				const wall = BABYLON.MeshBuilder.CreateBox(`wall_${r}_${c}`, {
					width: TILE_SIZE,
					height: WALL_HEIGHT,
					depth: TILE_SIZE
				}, scene);
				wall.position = position;
				wall.material = wallMat;
				wall.receiveShadows = true;
				shadowGenerator.addShadowCaster(wall);
				
				new BABYLON.PhysicsAggregate(
					wall,
					BABYLON.PhysicsShapeType.BOX,
					{ mass: 0, restitution: 0.5 },
					scene
				);
			} else if (cellValue === '5') {
				// Player Start (Adjust Y for capsule height)
				playerStartPosition = new BABYLON.Vector3(posX, 5, posZ);
			} else if (['2', '3', '4'].includes(cellValue)) {
				// Ball Spawns
				ballSpawns.push({
					position: new BABYLON.Vector3(posX, 10, posZ), // Drop from height
					type: parseInt(cellValue)
				});
			}
		}
	}
	
	return {
		shadowGenerator,
		playerStartPosition,
		ballSpawns
	};
};
