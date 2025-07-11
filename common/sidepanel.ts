document.querySelectorAll('.panel').forEach(panel => {
    const header = panel.querySelector('.panel-header');
    if (!header) return;
  
    header.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  });

export function setupCollapsiblePanels() {
    document.querySelectorAll('.panel .panel-header').forEach(header => {
      header.addEventListener('click', () => {
        const panel = header.parentElement;
        if (!panel) return;
        panel.classList.toggle('collapsed');
      });
    });
  }
  
  // Call it once after panels are rendered:
  setupCollapsiblePanels();