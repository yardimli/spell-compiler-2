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
	const groundSize = 80; // Increased ground size to accommodate larger maze
	const wallHeight = 4;
	
	// --- Wall Configuration ---
	const tileSize = 3; // Distance between grid centers
	const wallThickness = 1; // Thin walls
	
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
	
	const floorTexture = createFloorTexture(scene, 5);
	
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
	
	// --- Maze Generation ---
	// 1 = Wall, 0 = Path
	// --- CHANGED: Added 2 layers of outer walls (padding) ---
	const mazeMap = [
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Row 0: Top Border
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 1: Top Path
		[1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // Row 2: Top Blocks
		[1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // Row 3: Top Blocks (Thick)
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 4: Horizontal Path
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 5: T-Junctions & L-Shapes
		[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // Row 6: Path
		[1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1], // Row 7: Walls curving in
		[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // Row 8: Path around Center
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 9: Ghost House Top (Door in middle)
		[1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1], // Row 10: Ghost House Inside
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 11: Ghost House Bottom
		[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // Row 12: Path
		[1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1], // Row 13: Walls curving out
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 14: Horizontal Path
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 15: Lower T-Junctions
		[1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1], // Row 16: Lower Path Split
		[1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1], // Row 17: Bottom L-Shapes
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 18: Path
		[1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1], // Row 19: Bottom Blocks
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 20: Bottom Path
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // Row 21: Bottom Border
	];
	
	const wallMat = new BABYLON.StandardMaterial('wallMat', scene);
	wallMat.diffuseTexture = createWallTexture(scene);
	wallMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
	
	const rows = mazeMap.length;
	const cols = mazeMap[0].length;
	const startX = -(cols * tileSize) / 2 + tileSize / 2;
	const startZ = (rows * tileSize) / 2 - tileSize / 2;
	
	// --- Helper to create a physics wall segment ---
	const createWallSegment = (name, width, depth, position) => {
		const wall = BABYLON.MeshBuilder.CreateBox(name, {
			width: width,
			height: wallHeight,
			depth: depth
		}, scene);
		
		wall.position = position;
		wall.material = wallMat;
		wall.receiveShadows = true;
		shadowGenerator.addShadowCaster(wall);
		
		new BABYLON.PhysicsAggregate(
			wall,
			BABYLON.PhysicsShapeType.BOX,
			{ mass: 0, restitution: 0.1, friction: 0.0 },
			scene
		);
	};
	
	// --- Logic: Joints and Links ---
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (mazeMap[r][c] === 1) {
				const posX = startX + c * tileSize;
				const posZ = startZ - r * tileSize;
				const posY = wallHeight / 2;
				
				// 1. Create the "Joint"
				createWallSegment(
					`wall_joint_${r}_${c}`,
					wallThickness,
					wallThickness,
					new BABYLON.Vector3(posX, posY, posZ)
				);
				
				// 2. Check Right Neighbor (Connect horizontally)
				if (c + 1 < cols && mazeMap[r][c + 1] === 1) {
					const linkWidth = tileSize - wallThickness;
					const linkPos = new BABYLON.Vector3(posX + tileSize / 2, posY, posZ);
					
					createWallSegment(
						`wall_linkH_${r}_${c}`,
						linkWidth + 0.02,
						wallThickness,
						linkPos
					);
				}
				
				// 3. Check Bottom Neighbor (Connect vertically)
				if (r + 1 < rows && mazeMap[r + 1][c] === 1) {
					const linkDepth = tileSize - wallThickness;
					const linkPos = new BABYLON.Vector3(posX, posY, posZ - tileSize / 2);
					
					createWallSegment(
						`wall_linkV_${r}_${c}`,
						wallThickness,
						linkDepth + 0.02,
						linkPos
					);
				}
			}
		}
	}
	
	return { shadowGenerator, groundSize };
};
