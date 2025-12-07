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
	const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 15, new BABYLON.Vector3(0, 0, 0), scene);
	camera.attachControl(canvas, true);
	camera.wheelPrecision = 50;
	
	// --- Lights & Shadows ---
	const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
	hemiLight.intensity = 0.5;
	
	const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 15, 0), scene);
	pointLight.intensity = 0.8;
	
	// 1. Create Shadow Generator
	const shadowGenerator = new BABYLON.ShadowGenerator(1024, pointLight);
	shadowGenerator.useBlurExponentialShadowMap = true;
	shadowGenerator.blurKernel = 32;
	
	// --- Environment ---
	const envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("./assets/environments/studio.env", scene);
	scene.environmentTexture = envTexture;
	scene.createDefaultSkybox(envTexture, true, 1000);
	
	// --- Grid Surface ---
	// Create ground with 100 subdivisions as requested
	const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50, subdivisions: 100 }, scene);
	ground.receiveShadows = true;
	
	// --- Texture Generation with Loops ---
	// We use a 2000x2000 texture to fit 100x100 tiles (20px each) perfectly.
	const textureSize = 2000;
	const tilesCount = 20;
	const tileSize = textureSize / tilesCount; // 20px
	
	const gridTexture = new BABYLON.DynamicTexture("gridTexture", { width: textureSize, height: textureSize }, scene, false);
	const ctx = gridTexture.getContext();
	
	// Loop to fill the ground with 100x100 tiles
	for (let x = 0; x < tilesCount; x++) {
		for (let y = 0; y < tilesCount; y++) {
			// Checkerboard logic: if sum of indices is even, use White, else Red
			if ((x + y) % 2 === 0) {
				ctx.fillStyle = "#FFFFFF"; // White
			} else {
				ctx.fillStyle = "#FF0000"; // Red
			}
			// Draw the tile
			ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
		}
	}
	gridTexture.update();
	
	const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
	groundMat.diffuseTexture = gridTexture;
	
	// Modified: Changed specularColor to white (1, 1, 1) or gray to enable shininess on the tiles
	groundMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
	
	// Added: Set specularPower to control the sharpness of the highlight (higher = glossier/sharper)
	groundMat.specularPower = 264;
	
	ground.material = groundMat;
	
	// --- Physics: Ground ---
	new BABYLON.PhysicsAggregate(
		ground,
		BABYLON.PhysicsShapeType.BOX,
		{ mass: 0, restitution: 0.5 },
		scene
	);
	
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
		sphere.position.x = (Math.random() * 20) - 10;
		sphere.position.z = (Math.random() * 20) - 10;
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
			{ mass: 1, restitution: 0.8, friction: 0.5 },
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
