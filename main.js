import * as BABYLON from 'babylonjs';
import * as Earcut from 'earcut';
import HavokPhysics from '@babylonjs/havok';

// 1. Safe Earcut Import
const earcut = Earcut.default || Earcut;
window.earcut = earcut; // Global backup

// 2. Havok WASM URL
const havokWasmUrl = "./HavokPhysics.wasm";

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
		console.error("Failed to initialize physics:", e);
	}
	
	// --- Camera ---
	const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 60, new BABYLON.Vector3(0, 0, 0), scene);
	camera.attachControl(canvas, true);
	camera.wheelPrecision = 50;
	
	// --- Lights & Shadows ---
	const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
	hemiLight.intensity = 0.5;
	
	const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 15, 0), scene);
	pointLight.intensity = 0.8;
	
	const shadowGenerator = new BABYLON.ShadowGenerator(1024, pointLight);
	shadowGenerator.useBlurExponentialShadowMap = true;
	shadowGenerator.blurKernel = 32;
	
	// --- Environment ---
	const envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("./assets/environments/studio.env", scene);
	scene.environmentTexture = envTexture;
	scene.createDefaultSkybox(envTexture, true, 1000);
	
	// --- Constants ---
	const groundSize = 50;
	const wallHeight = 4;
	const wallThickness = 2;
	
	// --- Texture Generation Functions ---
	
	/**
	 * Creates the floor texture using an image and scales it based on tile size.
	 * @param {BABYLON.Scene} scene
	 * @param {number} tileSize - The size of one tile in world units.
	 * @returns {BABYLON.Texture}
	 */
	const createFloorTexture = (scene, tileSize) => {
		const texture = new BABYLON.Texture("./assets/game/floor.jpg", scene);
		// Calculate UV scale: Mesh Size / Tile Size
		texture.uScale = groundSize / tileSize;
		texture.vScale = groundSize / tileSize;
		return texture;
	};
	
	/**
	 * Creates the wall texture using an image.
	 * Note: We do NOT scale the texture here anymore. We scale UVs on the mesh (faceUV).
	 * @param {BABYLON.Scene} scene
	 * @returns {BABYLON.Texture}
	 */
	const createWallTexture = (scene) => {
		const texture = new BABYLON.Texture("./assets/game/walls.jpg", scene);
		return texture;
	};
	
	// --- Grid Surface (Floor) ---
	const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: groundSize, height: groundSize, subdivisions: 100 }, scene);
	ground.receiveShadows = true;
	
	// Create Floor Material
	const floorTileSize = 5; // Variable to decide the size of each floor tile
	const floorTexture = createFloorTexture(scene, floorTileSize);
	
	const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
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
	// Create Wall Material
	const wallTileSize = 10; // Variable to decide the size of each wall tile
	const wallTexture = createWallTexture(scene); // Texture is 1x1 scale
	
	const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
	wallMat.diffuseTexture = wallTexture;
	wallMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
	wallMat.specularPower = 264;
	
	// Calculate faceUVs to ensure texture tiles correctly on all sides (Front, Top, Side)
	// We map the UVs so that 1 UV unit = 'wallTileSize' world units.
	const faceUV = [];
	// Indices: 0:Front, 1:Back, 2:Right, 3:Left, 4:Top, 5:Bottom
	
	// Front & Back (Size: groundSize x wallHeight)
	faceUV[0] = new BABYLON.Vector4(0, 0, groundSize / wallTileSize, wallHeight / wallTileSize);
	faceUV[1] = new BABYLON.Vector4(0, 0, groundSize / wallTileSize, wallHeight / wallTileSize);
	
	// Right & Left (Size: wallThickness x wallHeight)
	faceUV[2] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, wallHeight / wallTileSize);
	faceUV[3] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, wallHeight / wallTileSize);
	
	// Top & Bottom (Size: groundSize x wallThickness)
	// Fix: Swapped U and V scaling because the default UV mapping for Top/Bottom faces
	// aligns V with the X-axis (Width) and U with the Z-axis (Depth) in this context,
	// causing the texture to stretch if not inverted.
	faceUV[4] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, groundSize / wallTileSize);
	faceUV[5] = new BABYLON.Vector4(0, 0, wallThickness / wallTileSize, groundSize / wallTileSize);
	
	const wallOffset = groundSize / 2;
	
	// Configuration for the 4 walls.
	const wallsConfig = [
		{ x: 0, z: wallOffset, rotation: 0 },             // Top (North)
		{ x: 0, z: -wallOffset, rotation: Math.PI },      // Bottom (South)
		{ x: wallOffset, z: 0, rotation: -Math.PI / 2 },  // Right (East)
		{ x: -wallOffset, z: 0, rotation: Math.PI / 2 }   // Left (West)
	];
	
	wallsConfig.forEach((config, index) => {
		const wall = BABYLON.MeshBuilder.CreateBox(`wall_${index}`, {
			width: groundSize,
			height: wallHeight,
			depth: wallThickness,
			faceUV: faceUV // Apply the calculated UVs
		}, scene);
		
		// Position and Rotate
		wall.position.set(config.x, wallHeight / 2, config.z);
		wall.rotation.y = config.rotation;
		
		// Apply material
		wall.material = wallMat;
		wall.receiveShadows = true;
		shadowGenerator.addShadowCaster(wall);
		
		// Physics
		new BABYLON.PhysicsAggregate(
			wall,
			BABYLON.PhysicsShapeType.BOX,
			{ mass: 0, restitution: 0.5 },
			scene
		);
	});
	
	// --- 3D Text ---
	const fontURL = "./assets/fonts/Kenney%20Future%20Regular.json";
	
	try {
		const fontResponse = await fetch(fontURL);
		const fontData = await fontResponse.json();
		
		if (!fontData || !fontData.boundingBox) {
			throw new Error("Font data is missing boundingBox");
		}
		
		const textMesh = BABYLON.MeshBuilder.CreateText(
			"text",
			"Hello World",
			fontData,
			{
				size: 2,
				depth: 0.5,
				resolution: 64
			},
			scene
		);
		
		const silverMat = new BABYLON.PBRMaterial("silver", scene);
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
		console.error("Failed to create 3D text:", e);
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
			{ mass: 1, restitution: 0.9, friction: 0.01 },
			scene
		);
	}
	
	return scene;
};

createScene().then(scene => {
	engine.runRenderLoop(function () {
		scene.render();
	});
});

window.addEventListener("resize", function () {
	engine.resize();
});
