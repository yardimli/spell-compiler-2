export const initGameTimeline = (playerManager) => {
	const container = document.getElementById('timeline-container');
	
	const render = (waypoints, activeIndex = -1) => {
		container.innerHTML = '';
		
		waypoints.forEach((wp, index) => {
			const el = document.createElement('div');
			el.className = `timeline-item type-${wp.type.toLowerCase()}`;
			
			if (index === activeIndex) {
				el.classList.add('active');
			}
			
			// Title
			const title = document.createElement('span');
			title.innerText = wp.type === 'MOVE' ? 'MOVE' : 'FIRE';
			el.appendChild(title);
			
			// Info (Power for shots)
			if (wp.type === 'FIRE') {
				const info = document.createElement('span');
				info.className = 'timeline-info';
				info.innerText = `Pow: ${Math.round(wp.power)}`;
				el.appendChild(info);
			} else {
				const info = document.createElement('span');
				info.className = 'timeline-info';
				info.innerText = `#${index}`;
				el.appendChild(info);
			}
			
			// Delete Button (Don't allow deleting the start point index 0)
			if (index > 0) {
				const delBtn = document.createElement('div');
				delBtn.className = 'delete-btn';
				delBtn.innerText = 'X';
				delBtn.onclick = (e) => {
					e.stopPropagation();
					playerManager.removeWaypoint(index);
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
