import * as BABYLON from '@babylonjs/core';
import { createGhost } from './game-ghost-create';
import { initGhostMovement } from './game-ghosts-movement';
import { initBulletSystem } from './game-ghost-bullet';
import { createNoobCharacter } from './game-noob-character';

// Updated signature to accept noobSpawns
export const initGameSceneAlt = async (scene, shadowGenerator, ghostSpawns, noobSpawns, playerRoot, playerMethods, timeManager, uiManager) => {
	const playerVisual = playerMethods.playerVisual;
	
	// --- 3D Text (Legacy) ---
	const fontURL = './assets/fonts/Kenney%20Future%20Regular.json';
	try {
		const fontResponse = await fetch(fontURL);
		const fontData = await fontResponse.json();
		
		if (!fontData || !fontData.boundingBox) {
			throw new Error('Font data is missing boundingBox');
		}
		
		const textMesh = BABYLON.MeshBuilder.CreateText(
			'text',
			'REALTIME',
			fontData,
			{ size: 2, depth: 0.5, resolution: 64 },
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
		
		textMesh.position.y = 12;
		textMesh.position.x = 0;
		textMesh.position.z = 0;
		
		const textAgg = new BABYLON.PhysicsAggregate(
			textMesh,
			BABYLON.PhysicsShapeType.CONVEX_HULL,
			{ mass: 0, restitution: 0.9 },
			scene
		);
		
		textAgg.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
		textAgg.body.disablePreStep = false;
		
		scene.registerBeforeRender(() => {
			const ts = timeManager ? timeManager.getTimeScale() : 1.0;
			textMesh.rotate(BABYLON.Axis.Y, 0.01 * ts, BABYLON.Space.LOCAL);
			textAgg.body.setTargetTransform(textMesh.absolutePosition, textMesh.rotationQuaternion);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Initialize Bullet System ---
	initBulletSystem(scene, timeManager);
	
	// --- Initialize Ghosts ---
	if (ghostSpawns && ghostSpawns.length > 0) {
		ghostSpawns.forEach((spawn, index) => {
			// 1. Create Visuals & Physics
			const ghostEntity = createGhost(scene, shadowGenerator, spawn, index, uiManager);
			
			// 2. Attach AI / Movement
			initGhostMovement(scene, ghostEntity, playerRoot, playerVisual, playerMethods, timeManager);
		});
	}
	
	// --- Initialize Noob Characters ---
	if (noobSpawns && noobSpawns.length > 0) {
		noobSpawns.forEach((spawn) => {
			createNoobCharacter(scene, spawn, shadowGenerator, timeManager);
		});
	}
	
	return {};
};
