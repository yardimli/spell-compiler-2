import * as BABYLON from 'babylonjs';
import * as Earcut from 'earcut';

// 1. Safe Earcut Import
// Vite/Webpack sometimes wraps CommonJS modules. We ensure we get the function.
const earcut = Earcut.default || Earcut;
window.earcut = earcut; // Global backup

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);

const createScene = async function () {
	const scene = new BABYLON.Scene(engine);
	
	// --- Camera & Light ---
	const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 15, new BABYLON.Vector3(0, 0, 0), scene);
	camera.attachControl(canvas, true);
	camera.wheelPrecision = 50;
	
	const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
	hemiLight.intensity = 0.7;
	
	const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 10, 0), scene);
	pointLight.intensity = 0.5;
	
	// --- Environment (Reflections) ---
	const envTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("./assets/environments/studio.env", scene);
	scene.environmentTexture = envTexture;
	scene.createDefaultSkybox(envTexture, true, 1000);
	
	// --- Grid Surface ---
	const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
	const gridTexture = new BABYLON.DynamicTexture("gridTexture", 512, scene, true);
	const ctx = gridTexture.getContext();
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, 512, 512);
	ctx.strokeStyle = "#444444";
	ctx.lineWidth = 2;
	ctx.beginPath();
	for (let i = 0; i <= 512; i += 64) {
		ctx.moveTo(i, 0);
		ctx.lineTo(i, 512);
		ctx.moveTo(0, i);
		ctx.lineTo(512, i);
	}
	ctx.stroke();
	gridTexture.update();
	
	const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
	groundMat.diffuseTexture = gridTexture;
	groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
	groundMat.diffuseTexture.uScale = 10;
	groundMat.diffuseTexture.vScale = 10;
	ground.material = groundMat;
	
	// --- 3D Text ---
	// We use a different font URL that is more reliable
	const fontURL = "./assets/fonts/Kenney%20Future%20Regular.json";
	
	try {
		const fontResponse = await fetch(fontURL);
		const fontData = await fontResponse.json();
		
		// Validate data before use
		if (!fontData || !fontData.boundingBox) {
			console.error("Invalid font data loaded:", fontData);
			throw new Error("Font data is missing boundingBox");
		}
		
		const textMesh = BABYLON.MeshBuilder.CreateText(
			"text",
			"Hello World",
			fontData,
			{
				size: 2,
				depth: 0.5,
				resolution: 64,
			}
			, scene);
		
		textMesh.position.y = 2;
		textMesh.position.x = -6;
		
		// Silver Material
		const silverMat = new BABYLON.PBRMaterial("silver", scene);
		silverMat.metallic = 1.0;
		silverMat.roughness = 0.15;
		silverMat.albedoColor = new BABYLON.Color3(0.9, 0.9, 0.9);
		textMesh.material = silverMat;
		
		// --- FIX START ---
		// 1. Calculate Pivot ONCE (not in the loop).
		// 2. Use 'center' (Local) instead of 'centerWorld'. setPivotPoint expects local space.
		textMesh.computeWorldMatrix(true);
		const center = textMesh.getBoundingInfo().boundingBox.center;
		textMesh.setPivotPoint(center);
		// --- FIX END ---
		
		// Spin Animation
		scene.registerBeforeRender(() => {
			textMesh.rotation.y += 0.01;
			// Removed setPivotPoint from here to prevent flickering
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
		
		const ballMat = new BABYLON.StandardMaterial(`ballMat${i}`, scene);
		ballMat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
		ballMat.specularColor = new BABYLON.Color3(1, 1, 1);
		ballMat.specularPower = 64;
		sphere.material = ballMat;
		
		const offset = Math.random() * Math.PI;
		sphere.onBeforeRenderObservable.add(() => {
			sphere.position.y = 0.75 + Math.abs(Math.sin((performance.now() * 0.002) + offset)) * 3;
		});
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
