// Minimal initialization - just for UI demonstration
// Full functionality will be implemented in later steps

document.addEventListener('DOMContentLoaded', () => {
    // Metadata panel toggle
    const metadataToggle = document.getElementById('metadata-toggle');
    const metadataContent = document.getElementById('metadata-content');
    
    if (metadataToggle && metadataContent) {
        metadataToggle.addEventListener('click', () => {
            metadataToggle.classList.toggle('expanded');
            metadataContent.classList.toggle('expanded');
        });
    }
    
    // Initialize canvas size
    const canvas = document.getElementById('waveform-canvas');
    if (canvas) {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    function resizeCanvas() {
        const container = canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        // Account for section markers and time display
        const availableHeight = rect.height - 40; // 40px for section markers
        
        canvas.width = rect.width;
        canvas.height = availableHeight;
        
        // Draw placeholder waveform
        drawPlaceholder();
    }
    
    function drawPlaceholder() {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw some example waveform bars
        const barCount = 200;
        const barWidth = canvas.width / barCount;
        const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a8dadc'];
        
        for (let i = 0; i < barCount; i++) {
            const stemHeight = canvas.height / 4;
            
            colors.forEach((color, stemIndex) => {
                const amplitude = Math.random() * 0.8 + 0.2;
                const height = stemHeight * amplitude * 0.5;
                const y = stemIndex * stemHeight + (stemHeight - height) / 2;
                
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7;
                ctx.fillRect(i * barWidth, y, barWidth - 1, height);
            });
        }
        
        ctx.globalAlpha = 1;
        
        // Draw section dividers (vertical lines)
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        [0.25, 0.6].forEach(pos => {
            ctx.beginPath();
            ctx.moveTo(canvas.width * pos, 0);
            ctx.lineTo(canvas.width * pos, canvas.height);
            ctx.stroke();
        });
        
        // Draw playhead
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, 0);
        ctx.lineTo(50, canvas.height);
        ctx.stroke();
    }
});
