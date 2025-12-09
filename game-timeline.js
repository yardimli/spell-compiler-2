export const initGameTimeline = (playerManager) => {
	const container = document.getElementById('timeline-container');
	const MAX_DURATION = 5.0; // Total recording time
	
	const render = (waypoints, activeIndex = -1) => {
		container.innerHTML = '';
		
		waypoints.forEach((wp, index) => {
			// Skip the very last waypoint for rendering blocks
			if (index === waypoints.length - 1) return;
			
			const el = document.createElement('div');
			el.className = `timeline-item type-${wp.type.toLowerCase()}`;
			
			if (index === activeIndex) {
				el.classList.add('active');
			}
			
			// --- CHANGED: Strict Proportional Width ---
			const duration = wp.duration || 0;
			const percent = (duration / MAX_DURATION) * 100;
			el.style.width = `${percent}%`;
			// Removed flex-grow to ensure empty space remains empty
			
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
		updateProgress: (index) => {
			const items = container.querySelectorAll('.timeline-item');
			items.forEach((item, i) => {
				if (i === index) item.classList.add('active');
				else item.classList.remove('active');
			});
		}
	};
};
