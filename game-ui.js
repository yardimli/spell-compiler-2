import * as GUI from '@babylonjs/gui';

export const initGameUI = (scene, cameraManager) => {
	// Create the advanced texture (fullscreen UI)
	const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene);
	
	// --- Slow Motion Tint Overlay ---
	const slowMoOverlay = new GUI.Rectangle();
	slowMoOverlay.width = '100%';
	slowMoOverlay.height = '100%';
	slowMoOverlay.background = 'rgba(0, 100, 255, 0.2)'; // Blue tint
	slowMoOverlay.thickness = 0;
	slowMoOverlay.isHitTestVisible = false; // Let clicks pass through
	slowMoOverlay.isVisible = false;
	slowMoOverlay.zIndex = -1; // Behind other UI
	advancedTexture.addControl(slowMoOverlay);
	
	// --- Top Panel (Camera Controls) ---
	const topPanel = new GUI.StackPanel();
	topPanel.width = '700px'; // Increased width to accommodate new button
	topPanel.height = '60px';
	topPanel.isVertical = false;
	topPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
	topPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
	topPanel.top = '20px';
	advancedTexture.addControl(topPanel);
	
	// Helper to create styled buttons
	const createButton = (name, text, callback) => {
		const button = GUI.Button.CreateSimpleButton(name, text);
		button.width = '120px';
		button.height = '40px';
		button.color = 'white';
		button.background = 'rgba(0, 0, 0, 0.7)';
		button.cornerRadius = 5;
		button.thickness = 1;
		button.paddingLeft = '5px';
		button.paddingRight = '5px';
		button.fontSize = 14;
		button.fontFamily = 'sans-serif';
		button.fontWeight = 'bold';
		
		button.onPointerUpObservable.add(() => {
			if (callback) callback();
		});
		
		return button;
	};
	
	const btnFollow = createButton('btnFollow', 'Follow (1)', () => cameraManager.setCameraMode('follow'));
	const btnFirst = createButton('btnFirst', '1st Person (2)', () => cameraManager.setCameraMode('first'));
	const btnFree = createButton('btnFree', 'Free (3)', () => cameraManager.setCameraMode('free'));
	
	// --- Slow Motion Button with Progress Bar ---
	let onSlowMoToggle = null;
	// Create a container button instead of a simple button to hold the progress bar
	const btnSlowMo = GUI.Button.CreateImageOnlyButton('btnSlowMo', ''); // No image, just container
	btnSlowMo.width = '120px';
	btnSlowMo.height = '40px';
	btnSlowMo.thickness = 1;
	btnSlowMo.color = 'white';
	btnSlowMo.background = 'rgba(0, 0, 0, 0.7)';
	btnSlowMo.cornerRadius = 5;
	btnSlowMo.onPointerUpObservable.add(() => {
		if (onSlowMoToggle) onSlowMoToggle();
	});
	
	// Progress Bar (Background fill)
	const slowMoProgress = new GUI.Rectangle();
	slowMoProgress.width = '0px'; // Starts empty
	slowMoProgress.height = '100%';
	slowMoProgress.background = 'rgba(255, 255, 255, 0.3)';
	slowMoProgress.thickness = 0;
	slowMoProgress.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
	slowMoProgress.isHitTestVisible = false;
	btnSlowMo.addControl(slowMoProgress);
	
	// Text Label
	const slowMoText = new GUI.TextBlock();
	slowMoText.text = 'Slow Mo (G)';
	slowMoText.color = 'white';
	slowMoText.fontSize = 14;
	slowMoText.fontWeight = 'bold';
	slowMoText.isHitTestVisible = false;
	btnSlowMo.addControl(slowMoText);
	
	// --- Ghost Names Toggle Button ---
	let showGhostNames = false;
	const ghostLabels = []; // Store references to labels
	
	const toggleNames = () => {
		showGhostNames = !showGhostNames;
		btnNames.background = showGhostNames ? '#007bff' : 'rgba(0, 0, 0, 0.7)';
		// Update visibility of all existing labels
		ghostLabels.forEach(label => {
			if (label && !label.isDisposed) {
				label.isVisible = showGhostNames;
			}
		});
	};
	
	const btnNames = createButton('btnNames', 'Names: OFF', () => {
		toggleNames();
		btnNames.children[0].text = showGhostNames ? 'Names: ON' : 'Names: OFF';
	});
	
	topPanel.addControl(btnFollow);
	topPanel.addControl(btnFirst);
	topPanel.addControl(btnFree);
	topPanel.addControl(btnSlowMo);
	topPanel.addControl(btnNames); // Add new button
	
	// Function to update visual state of buttons
	const updateButtonStyles = () => {
		const activeMode = cameraManager.getCameraMode();
		const activeColor = '#007bff';
		const inactiveColor = 'rgba(0, 0, 0, 0.7)';
		
		const updateBtn = (btn, mode) => {
			const isActive = (activeMode === mode);
			btn.background = isActive ? activeColor : inactiveColor;
			
			if (isActive) {
				btn.alpha = 0.5;
				btn.isHitTestVisible = false;
			} else {
				btn.alpha = 1.0;
				btn.isHitTestVisible = true;
			}
		};
		
		updateBtn(btnFollow, 'follow');
		updateBtn(btnFirst, 'first');
		updateBtn(btnFree, 'free');
	};
	
	// --- Sync UI with Camera State ---
	scene.onBeforeRenderObservable.add(() => {
		updateButtonStyles();
	});
	
	// --- Bottom Panel (Instructions) ---
	const rectInfo = new GUI.Rectangle();
	rectInfo.width = '400px';
	rectInfo.height = '40px';
	rectInfo.cornerRadius = 5;
	rectInfo.color = 'transparent';
	rectInfo.thickness = 0;
	rectInfo.background = 'rgba(0, 0, 0, 0.5)';
	rectInfo.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
	rectInfo.bottom = '20px';
	advancedTexture.addControl(rectInfo);
	
	const labelInfo = new GUI.TextBlock();
	labelInfo.text = 'WASD to Move | SPACE to Jump | F to Fire';
	labelInfo.color = 'white';
	labelInfo.fontSize = 14;
	labelInfo.fontFamily = 'sans-serif';
	rectInfo.addControl(labelInfo);
	
	// --- Health Bar ---
	const healthContainer = new GUI.Rectangle();
	healthContainer.width = '200px';
	healthContainer.height = '20px';
	healthContainer.cornerRadius = 10;
	healthContainer.color = 'white';
	healthContainer.thickness = 2;
	healthContainer.background = 'rgba(0, 0, 0, 0.5)';
	healthContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
	healthContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
	healthContainer.left = '20px';
	healthContainer.top = '20px';
	advancedTexture.addControl(healthContainer);
	
	const healthBar = new GUI.Rectangle();
	healthBar.width = '100%';
	healthBar.height = '100%';
	healthBar.cornerRadius = 8;
	healthBar.color = 'transparent';
	healthBar.background = '#00ff00';
	healthBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
	healthContainer.addControl(healthBar);
	
	const healthText = new GUI.TextBlock();
	healthText.text = '100 / 100';
	healthText.color = 'white';
	healthText.fontSize = 12;
	healthContainer.addControl(healthText);
	
	// --- Game Over Screen ---
	const gameOverRect = new GUI.Rectangle();
	gameOverRect.width = '100%';
	gameOverRect.height = '100%';
	gameOverRect.background = 'rgba(0, 0, 0, 0.8)';
	gameOverRect.zIndex = 10;
	gameOverRect.isVisible = false;
	advancedTexture.addControl(gameOverRect);
	
	const gameOverText = new GUI.TextBlock();
	gameOverText.text = 'GAME OVER';
	gameOverText.color = 'red';
	gameOverText.fontSize = 60;
	gameOverText.fontWeight = 'bold';
	gameOverRect.addControl(gameOverText);
	
	// --- Bullet Debug Window Helper ---
	const createBulletDebugWindow = (mesh, type, power = 1.0) => {
		const rect = new GUI.Rectangle();
		rect.width = '120px';
		rect.height = '60px';
		rect.cornerRadius = 5;
		rect.color = 'white';
		rect.thickness = 1;
		rect.background = 'rgba(0, 0, 0, 0.8)';
		advancedTexture.addControl(rect);
		rect.linkWithMesh(mesh);
		rect.linkOffsetY = -50;
		
		const stack = new GUI.StackPanel();
		rect.addControl(stack);
		
		const label = new GUI.TextBlock();
		label.text = type.toUpperCase();
		label.color = type === 'fire' ? 'orange' : 'cyan';
		label.fontSize = 14;
		label.fontWeight = 'bold';
		label.height = '30px';
		stack.addControl(label);
		
		const powerLabel = new GUI.TextBlock();
		powerLabel.text = `PWR: ${(power * 100).toFixed(0)}%`;
		powerLabel.color = 'white';
		powerLabel.fontSize = 12;
		powerLabel.height = '20px';
		stack.addControl(powerLabel);
		
		// Remove after 2 seconds
		setTimeout(() => {
			rect.dispose();
		}, 2000);
	};
	
	// --- Ghost Debug Window Helper ---
	const createGhostDebugWindow = (mesh, energy, nextType, nextPower) => {
		const rect = new GUI.Rectangle();
		rect.width = '160px';
		rect.height = '80px';
		rect.cornerRadius = 5;
		rect.color = 'white';
		rect.thickness = 1;
		rect.background = 'rgba(0, 0, 0, 0.8)';
		advancedTexture.addControl(rect);
		rect.linkWithMesh(mesh);
		rect.linkOffsetY = -80;
		
		const stack = new GUI.StackPanel();
		rect.addControl(stack);
		
		const energyLabel = new GUI.TextBlock();
		energyLabel.text = `ENERGY: ${Math.floor(energy)}/100`;
		energyLabel.color = 'yellow';
		energyLabel.fontSize = 14;
		energyLabel.fontWeight = 'bold';
		energyLabel.height = '30px';
		stack.addControl(energyLabel);
		
		const nextLabel = new GUI.TextBlock();
		nextLabel.text = `NEXT: ${nextType.toUpperCase()}`;
		nextLabel.color = nextType === 'fire' ? 'orange' : 'cyan';
		nextLabel.fontSize = 12;
		nextLabel.height = '20px';
		stack.addControl(nextLabel);
		
		const powerLabel = new GUI.TextBlock();
		powerLabel.text = `PWR: ${(nextPower * 100).toFixed(0)}%`;
		powerLabel.color = 'white';
		powerLabel.fontSize = 12;
		powerLabel.height = '20px';
		stack.addControl(powerLabel);
		
		// Remove after 2 seconds
		setTimeout(() => {
			rect.dispose();
		}, 2000);
	};
	
	// --- Create Persistent Ghost Label ---
	const createGhostLabel = (mesh, name) => {
		const label = new GUI.TextBlock();
		label.text = name;
		label.color = 'white';
		label.fontSize = 14;
		label.fontWeight = 'bold';
		label.outlineWidth = 2;
		label.outlineColor = 'black';
		
		advancedTexture.addControl(label);
		label.linkWithMesh(mesh);
		label.linkOffsetY = -100; // Position above the ghost
		
		// Set initial visibility based on toggle state
		label.isVisible = showGhostNames;
		
		// Store for toggling later
		ghostLabels.push(label);
		
		// Clean up if mesh is disposed
		mesh.onDisposeObservable.add(() => {
			label.dispose();
			const index = ghostLabels.indexOf(label);
			if (index > -1) {
				ghostLabels.splice(index, 1);
			}
		});
		
		return label;
	};
	
	// --- Exposed Methods ---
	return {
		advancedTexture,
		setSlowMotionCallback: (cb) => { onSlowMoToggle = cb; },
		setSlowMotionActive: (isActive) => {
			slowMoOverlay.isVisible = isActive;
		},
		updateSlowMotionButton: (isActive, cooldown, maxCooldown) => {
			if (isActive) {
				slowMoText.text = 'ACTIVE';
				btnSlowMo.background = '#007bff';
				slowMoProgress.width = '0px';
			} else if (cooldown > 0) {
				slowMoText.text = Math.ceil(cooldown) + 's';
				btnSlowMo.background = 'rgba(50, 50, 50, 0.7)';
				btnSlowMo.isHitTestVisible = false;
				
				// Update Progress Bar Width
				const percent = (cooldown / maxCooldown) * 100;
				slowMoProgress.width = `${percent}%`;
			} else {
				slowMoText.text = 'Slow Mo (G)';
				btnSlowMo.background = 'rgba(0, 0, 0, 0.7)';
				btnSlowMo.isHitTestVisible = true;
				slowMoProgress.width = '0px';
			}
		},
		createBulletDebugWindow,
		createGhostDebugWindow,
		createGhostLabel, // Exported new method
		updateHealth: (current, max) => {
			const percentage = Math.max(0, current / max);
			healthBar.width = `${percentage * 100}%`;
			healthText.text = `${Math.ceil(current)} / ${max}`;
			
			if (percentage > 0.5) healthBar.background = '#00ff00';
			else if (percentage > 0.25) healthBar.background = '#ffff00';
			else healthBar.background = '#ff0000';
		},
		showGameOver: () => {
			gameOverRect.isVisible = true;
		}
	};
};
