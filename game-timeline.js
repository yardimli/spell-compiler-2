export const initGameTimeline = (playerManager) => {
	const container = document.getElementById('timeline-container');
	const MAX_DURATION = 5.0; // Total recording time
	
	const render = (waypoints, activeIndex = -1) => {
		container.innerHTML = '';
		
		waypoints.forEach((wp, index) => {
			// Skip the very last waypoint for rendering blocks
			if (index === waypoints.length - 1) return;
			
			const duration = wp.duration || 0;
			
			// Skip zero-duration blocks (transitions)
			// This prevents rendering invisible slivers for instant transitions
			if (duration < 0.01) return;
			
			const el = document.createElement('div');
			el.className = `timeline-item type-${wp.type.toLowerCase()}`;
			
			// Store the original waypoint index
			el.dataset.index = index;
			
			if (index === activeIndex) {
				el.classList.add('active');
			}
			
			// Progress Fill Element
			const fill = document.createElement('div');
			fill.className = 'progress-fill';
			el.appendChild(fill);
			
			// Strict Proportional Width
			const percent = (duration / MAX_DURATION) * 100;
			el.style.width = `${percent}%`;
			
			// Title
			const title = document.createElement('span');
			if (wp.type === 'MOVE') title.innerText = 'MV';
			else if (wp.type === 'FIRE') title.innerText = 'FR';
			else if (wp.type === 'WAIT') title.innerText = 'WT';
			else title.innerText = wp.type;
			el.appendChild(title);
			
			// Info
			if (wp.type === 'FIRE') {
				const info = document.createElement('span');
				info.className = 'timeline-info';
				info.innerText = `${Math.round(wp.power)}`;
				el.appendChild(info);
			} else {
				const info = document.createElement('span');
				info.className = 'timeline-info';
				info.innerText = `${duration.toFixed(1)}s`;
				el.appendChild(info);
			}
			
			// Delete Button (Only on last segment)
			if (index === waypoints.length - 2) {
				const delBtn = document.createElement('div');
				delBtn.className = 'delete-btn';
				delBtn.innerText = 'X';
				delBtn.onclick = (e) => {
					e.stopPropagation();
					playerManager.removeWaypoint(index + 1);
					
					// --- NEW: Focus back to game canvas ---
					const canvas = document.getElementById('renderCanvas');
					if (canvas) canvas.focus();
				};
				el.appendChild(delBtn);
			}
			
			container.appendChild(el);
		});
	};

// Subscribe to player updates
	playerManager.onWaypointsChanged.add((waypoints) => {
		render(waypoints);
	});
	
	return {
		updateProgress: (activeIndex, progress = 0) => {
			const items = container.querySelectorAll('.timeline-item');
			items.forEach((item) => {
				// Use dataset index for comparison
				const itemIndex = parseInt(item.dataset.index);
				const fill = item.querySelector('.progress-fill');
				
				if (itemIndex < activeIndex) {
					// Completed items
					item.classList.remove('active');
					if (fill) fill.style.width = '100%';
				} else if (itemIndex === activeIndex) {
					// Current item
					item.classList.add('active');
					if (fill) fill.style.width = `${progress * 100}%`;
				} else {
					// Future items
					item.classList.remove('active');
					if (fill) fill.style.width = '0%';
				}
			});
		}
	};
};
