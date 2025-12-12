import * as GUI from '@babylonjs/gui';

export const initGameUI = (scene, cameraManager) => {
	// Create the advanced texture (fullscreen UI)
	const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene);
	
	// --- Top Panel (Camera Controls) ---
	const topPanel = new GUI.StackPanel();
	topPanel.width = '400px';
	topPanel.height = '60px';
	topPanel.isVertical = false;
	topPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
	topPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
	topPanel.top = '20px';
	advancedTexture.addControl(topPanel);
	
	// Helper to create styled buttons
	const createButton = (name, text, mode) => {
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
			cameraManager.setCameraMode(mode);
			// Styles update via observer
		});
		
		return button;
	};
	
	const btnFollow = createButton('btnFollow', 'Follow (1)', 'follow');
	const btnFirst = createButton('btnFirst', '1st Person (2)', 'first');
	const btnFree = createButton('btnFree', 'Free (3)', 'free');
	
	topPanel.addControl(btnFollow);
	topPanel.addControl(btnFirst);
	topPanel.addControl(btnFree);
	
	// Function to update visual state of buttons
	const updateButtonStyles = () => {
		const activeMode = cameraManager.getCameraMode();
		const activeColor = '#007bff';
		const inactiveColor = 'rgba(0, 0, 0, 0.7)';
		
		const updateBtn = (btn, mode) => {
			const isActive = (activeMode === mode);
			btn.background = isActive ? activeColor : inactiveColor;
			
			if (isActive) {
				// Fade out and disable hit test so it doesn't block mouse input
				btn.alpha = 0.5;
				btn.isHitTestVisible = false;
			} else {
				// Restore visibility and interactivity
				btn.alpha = 1.0;
				btn.isHitTestVisible = true;
			}
		};
		
		updateBtn(btnFollow, 'follow');
		updateBtn(btnFirst, 'first');
		updateBtn(btnFree, 'free');
	};
	
	// --- Sync UI with Camera State ---
	// Since camera mode can change via keyboard shortcuts (1, 2, 3),
	// we need to check the state regularly to update the UI buttons.
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
	
	return advancedTexture;
};
