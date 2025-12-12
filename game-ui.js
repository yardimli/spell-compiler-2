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
	topPanel.width = '550px';
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
	
	topPanel.addControl(btnFollow);
	topPanel.addControl(btnFirst);
	topPanel.addControl(btnFree);
	topPanel.addControl(btnSlowMo);
	
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
	const createBulletDebugWindow = (mesh, type) => {
		const rect = new GUI.Rectangle();
		rect.width = '100px';
		rect.height = '40px';
		rect.cornerRadius = 5;
		rect.color = 'white';
		rect.thickness = 1;
		rect.background = 'rgba(0, 0, 0, 0.8)';
		advancedTexture.addControl(rect);
		rect.linkWithMesh(mesh);
		rect.linkOffsetY = -50;
		
		const label = new GUI.TextBlock();
		label.text = type.toUpperCase();
		label.color = type === 'fire' ? 'orange' : 'cyan';
		label.fontSize = 14;
		label.fontWeight = 'bold';
		rect.addControl(label);
		
		// Remove after 2 seconds
		setTimeout(() => {
			rect.dispose();
		}, 2000);
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
				
				// Update Progress Bar Width (Inverse: fills up as cooldown finishes, or drains?
				// Let's make it drain: 100% at start of cooldown, 0% at end)
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
