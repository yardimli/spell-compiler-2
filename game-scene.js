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
	const groundSize = 80;
	const wallHeight = 4;
	
	// --- Wall Configuration ---
	const tileSize = 3;
	const wallThickness = 1;
	
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
	const ground = BABYLON.MeshBuilder.CreateGround('ground', {
		width: groundSize,
		height: groundSize,
		subdivisions: 100
	}, scene);
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
	// 1 = Wall, 0 = Path, Strings = Start Positions
	const mazeMap = [
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // Row 0
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 1
		[1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // Row 2
		[1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // Row 3
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 4
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 5
		[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // Row 6
		[1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1], // Row 7
		[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 'D', 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // Row 8
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 9: Ghost House Top
		[1, 0, 1, 1, 1, 0, 0, 'A', 1, 0, 'B', 0, 1, 'C', 0, 0, 1, 1, 1, 0, 1], // Row 10: Ghost House Inside (Added D)
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 11: Ghost House Bottom
		[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // Row 12
		[1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1], // Row 13
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 14
		[1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // Row 15
		[1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1], // Row 16
		[1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1], // Row 17
		[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 18
		[1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1], // Row 19
		[1, 'P', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // Row 20
		[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // Row 21
	];
	
	const wallMat = new BABYLON.StandardMaterial('wallMat', scene);
	wallMat.diffuseTexture = createWallTexture(scene);
	wallMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
	
	const rows = mazeMap.length;
	const cols = mazeMap[0].length;
	const startX = -(cols * tileSize) / 2 + tileSize / 2;
	const startZ = (rows * tileSize) / 2 - tileSize / 2;
	
	// --- Start Positions Container ---
	const startPositions = {};
	
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
	
	// --- Floor Markers Helper ---
	const createMarker = (text, position, color) => {
		const plane = BABYLON.MeshBuilder.CreatePlane('marker_' + text, { size: 2 }, scene);
		plane.position = position.clone();
		plane.position.y = 0.05; // Slightly above ground
		plane.rotation.x = Math.PI / 2;
		
		const dt = new BABYLON.DynamicTexture('dt_' + text, { width: 128, height: 128 }, scene);
		dt.hasAlpha = true;
		const ctx = dt.getContext();
		ctx.font = 'bold 80px Arial';
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, 64, 64);
		dt.update();
		
		const mat = new BABYLON.StandardMaterial('mat_' + text, scene);
		mat.diffuseTexture = dt;
		mat.useAlphaFromDiffuseTexture = true;
		mat.specularColor = BABYLON.Color3.Black();
		mat.emissiveColor = BABYLON.Color3.White();
		plane.material = mat;
	};
	
	const markerColors = {
		'A': '#FF0000',   // Blinky
		'B': '#FFB8FF',   // Pinky
		'C': '#00FFFF',   // Inky
		'D': '#FFB852',   // Clyde
		'P': '#00FF00'    // Player
	};
	
	// --- Spawn Gems ---
	const gems = [];
	const gemMat = new BABYLON.StandardMaterial('gemMat', scene);
	gemMat.diffuseColor = new BABYLON.Color3(1, 0.84, 0); // Gold
	gemMat.emissiveColor = new BABYLON.Color3(0.5, 0.4, 0);
	
	// Define Ghost Pen area (Rows 9-11, Cols ~6-14) to exclude gems
	const isGhostPen = (r, c) => {
		return (r >= 9 && r <= 11 && c >= 6 && c <= 14);
	};
	
	// --- Logic: Joints, Links, and Parsing ---
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const cell = mazeMap[r][c];
			const posX = startX + c * tileSize;
			const posZ = startZ - r * tileSize;
			const position = new BABYLON.Vector3(posX, 0, posZ);
			
			// 1. Walls
			if (cell === 1) {
				const posY = wallHeight / 2;
				
				// Joint
				createWallSegment(
					`wall_joint_${r}_${c}`,
					wallThickness,
					wallThickness,
					new BABYLON.Vector3(posX, posY, posZ)
				);
				
				// Right Neighbor
				if (c + 1 < cols && mazeMap[r][c + 1] === 1) {
					const linkWidth = tileSize - wallThickness;
					const linkPos = new BABYLON.Vector3(posX + tileSize / 2, posY, posZ);
					createWallSegment(`wall_linkH_${r}_${c}`, linkWidth + 0.02, wallThickness, linkPos);
				}
				
				// Bottom Neighbor
				if (r + 1 < rows && mazeMap[r + 1][c] === 1) {
					const linkDepth = tileSize - wallThickness;
					const linkPos = new BABYLON.Vector3(posX, posY, posZ - tileSize / 2);
					createWallSegment(`wall_linkV_${r}_${c}`, wallThickness, linkDepth + 0.02, linkPos);
				}
			}
			// 2. Start Positions (Strings)
			else if (typeof cell === 'string') {
				startPositions[cell] = position.clone();
				startPositions[cell].y = 1.5; // Default height for entities
				
				// Create Visual Marker
				if (markerColors[cell]) {
					createMarker(cell, position, markerColors[cell]);
				}
			}
			
			// 3. Gems (Path or Start Position)
			// Spawn gems on paths (0) or start positions (strings) if not in ghost pen
			if ((cell === 0 || typeof cell === 'string') && !isGhostPen(r, c)) {
				// Don't spawn gem on Player start
				if (cell !== 'P') {
					const gem = BABYLON.MeshBuilder.CreateSphere(`gem_${r}_${c}`, { diameter: 0.8 }, scene);
					gem.position = new BABYLON.Vector3(posX, 1.0, posZ);
					gem.material = gemMat;
					
					scene.registerBeforeRender(() => {
						gem.rotation.y += 0.02;
						gem.position.y = 1.0 + Math.sin(performance.now() * 0.003) * 0.2;
					});
					
					gems.push(gem);
				}
			}
		}
	}
	
	// NEW: Return grid configuration so ghosts can navigate
	return {
		shadowGenerator,
		groundSize,
		gems,
		startPositions,
		gridConfig: {
			mazeMap,
			tileSize,
			startX,
			startZ,
			rows,
			cols
		}
	};
};
