import * as BABYLON from '@babylonjs/core';

export const initGameSceneAlt = async (scene, shadowGenerator, ballSpawns) => {
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
			textMesh.rotate(BABYLON.Axis.Y, 0.01, BABYLON.Space.LOCAL);
			textAgg.body.setTargetTransform(textMesh.absolutePosition, textMesh.rotationQuaternion);
		});
	} catch (e) {
		console.error('Failed to create 3D text:', e);
	}
	
	// --- Spawn Balls from Map Data ---
	if (ballSpawns && ballSpawns.length > 0) {
		ballSpawns.forEach((spawn, index) => {
			const sphere = BABYLON.MeshBuilder.CreateSphere(`sphere_${index}`, { diameter: 1.5 }, scene);
			sphere.position = spawn.position.clone();
			
			const ballMat = new BABYLON.StandardMaterial(`ballMat_${index}`, scene);
			
			// Color based on type (2, 3, 4)
			switch (spawn.type) {
				case 2:
					ballMat.diffuseColor = new BABYLON.Color3(1, 0, 0); // Red
					break;
				case 3:
					ballMat.diffuseColor = new BABYLON.Color3(0, 1, 0); // Green
					break;
				case 4:
					ballMat.diffuseColor = new BABYLON.Color3(0, 0, 1); // Blue
					break;
				default:
					ballMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
			}
			
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
		});
	}
	
	return {};
};
