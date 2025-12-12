import * as BABYLON from '@babylonjs/core';

// --- Ghost Naming Lists ---
const adjectives = [
	'Silent', 'Dark', 'Vengeful', 'Ancient', 'Glowing',
	'Swift', 'Cursed', 'Hollow', 'Ethereal', 'Wicked'
];
const nouns = [
	'Phantom', 'Specter', 'Wraith', 'Shadow', 'Spirit',
	'Ghoul', 'Banshee', 'Poltergeist', 'Apparition', 'Soul'
];

const generateGhostName = () => {
	const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];
	return `${adj} ${noun}`;
};

// Cache materials to avoid recreation
let ghostMaterials = null;
let eyeMat = null;
let pupilMat = null;

const initMaterials = (scene) => {
	if (ghostMaterials) return;
	
	ghostMaterials = {};
	const colors = {
		2: new BABYLON.Color3(1, 0, 0), // Red
		3: new BABYLON.Color3(0, 1, 0), // Green
		4: new BABYLON.Color3(0, 0, 1) // Blue
	};
	
	Object.keys(colors).forEach(key => {
		const mat = new BABYLON.StandardMaterial(`ghostMat_${key}`, scene);
		mat.diffuseColor = colors[key];
		mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
		ghostMaterials[key] = mat;
	});
	
	eyeMat = new BABYLON.StandardMaterial('eyeMat', scene);
	eyeMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
	eyeMat.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.2);
	
	pupilMat = new BABYLON.StandardMaterial('pupilMat', scene);
	pupilMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
};

export const createGhost = (scene, shadowGenerator, spawnData, index, uiManager) => {
	initMaterials(scene);
	
	// 1. Visual Root
	const ghostNode = new BABYLON.TransformNode(`ghost_${index}`, scene);
	
	// 2. Head
	const head = BABYLON.MeshBuilder.CreateSphere('head', { diameter: 1.2 }, scene);
	head.position.y = 1.0;
	head.parent = ghostNode;
	head.material = ghostMaterials[spawnData.type] || ghostMaterials[2];
	
	// 3. Skirt
	const skirt = BABYLON.MeshBuilder.CreateCylinder('skirt', {
		height: 1.2,
		diameterTop: 1.2,
		diameterBottom: 1.8,
		tessellation: 16
	}, scene);
	skirt.position.y = 0.0;
	skirt.parent = ghostNode;
	skirt.material = ghostMaterials[spawnData.type] || ghostMaterials[2];
	
	// 4. Eyes
	const createEye = (xOffset) => {
		const eye = BABYLON.MeshBuilder.CreateSphere('eye', { diameter: 0.4 }, scene);
		eye.position.set(xOffset, 1.1, 0.5);
		eye.parent = ghostNode;
		eye.material = eyeMat;
		
		const pupil = BABYLON.MeshBuilder.CreateSphere('pupil', { diameter: 0.15 }, scene);
		pupil.position.set(0, 0, 0.18);
		pupil.parent = eye;
		pupil.material = pupilMat;
	};
	createEye(-0.25);
	createEye(0.25);
	
	shadowGenerator.addShadowCaster(head);
	shadowGenerator.addShadowCaster(skirt);
	
	// 5. Physics Collider (Invisible Parent)
	const collider = BABYLON.MeshBuilder.CreateCapsule(`ghostCollider_${index}`, { radius: 0.9, height: 2.2 }, scene);
	collider.position = spawnData.position.clone();
	collider.position.y = 2.0;
	collider.visibility = 0;
	
	// Parent visuals to collider
	ghostNode.parent = collider;
	ghostNode.position = new BABYLON.Vector3(0, 0, 0);
	ghostNode.rotation = new BABYLON.Vector3(0, 0, 0);
	
	// Physics Aggregate
	const ghostAgg = new BABYLON.PhysicsAggregate(
		collider,
		BABYLON.PhysicsShapeType.CAPSULE,
		{ mass: 10, friction: 0, restitution: 0 },
		scene
	);
	
	// Lock rotation to prevent tipping
	ghostAgg.body.setMassProperties({
		inertia: new BABYLON.Vector3(0, 0, 0)
	});
	
	// 6. Metadata & UI
	const ghostName = generateGhostName();
	const ghostEnergy = 100;
	const nextBulletType = Math.random() > 0.5 ? 'fire' : 'frost';
	
	if (uiManager && uiManager.createGhostLabel) {
		uiManager.createGhostLabel(collider, ghostName);
	}
	
	collider.metadata = {
		type: 'ghost',
		name: ghostName,
		energy: ghostEnergy,
		nextType: nextBulletType,
		nextPower: 1.0 // Placeholder, updated in movement loop
	};
	
	return {
		collider,
		ghostNode,
		ghostAgg,
		ghostName
	};
};
