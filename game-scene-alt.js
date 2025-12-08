import * as BABYLON from 'babylonjs';

export const initGameSceneAlt = async (scene, shadowGenerator) => {
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
		
		textMesh.position.y = 12;
		textMesh.position.x = 6;
		textMesh.position.z = 16;
		
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
	
	// --- Bouncing Balls (Environment) ---
	const ballCount = 10;
	const ballAggregates = []; // Store physics bodies to control them later
	
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
		
		const agg = new BABYLON.PhysicsAggregate(
			sphere,
			BABYLON.PhysicsShapeType.SPHERE,
			{ mass: 1, restitution: 0.9, friction: 0.2 },
			scene
		);
		ballAggregates.push(agg);
	}
	
	// --- Control Function for Turn System ---
	return {
		setBallsFrozen: (isFrozen) => {
			// 1. Cleanup: Remove any aggregates whose meshes have been disposed (destroyed)
			for (let i = ballAggregates.length - 1; i >= 0; i--) {
				const agg = ballAggregates[i];
				if (!agg || !agg.body || !agg.transformNode || agg.transformNode.isDisposed()) {
					ballAggregates.splice(i, 1);
				}
			}
			
			// 2. Apply State to remaining valid balls
			ballAggregates.forEach(agg => {
				if (agg && agg.body) {
					if (isFrozen) {
						// Lock them in place
						agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
					} else {
						// Unlock them
						agg.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
						
						// --- FIX: Force wake up using correct API ---
						if (agg.body.setActivationState) {
							agg.body.setActivationState(BABYLON.PhysicsActivationState.ACTIVE);
						} else {
							// Fallback: Apply a tiny negligible impulse to force the physics engine to wake the body
							agg.body.applyImpulse(new BABYLON.Vector3(0, -0.001, 0), agg.transformNode.absolutePosition);
						}
					}
				}
			});
		}
	};
};
