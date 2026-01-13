// Updated script.js for better alignment and real-time detection
let videoStream;
let detectionInterval;
let cameraStarted = false;
let socket; // Added for WebSocket
let lastDetectionData = null; // Store last detection results

function openCamera() {
    const cameraContainer = document.getElementById('cameraContainer');
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const scanContainer = document.getElementById('scanContainer');
    const scanImage = scanContainer.querySelector('.scanpng');
    const scanTitle = scanContainer.querySelector('h2');
    if (scanImage) scanImage.style.display = 'none';
    if (scanTitle) scanTitle.style.display = 'none';

    cameraContainer.style.display = "block";
    
    // Show the capture button
    const captureButton = document.getElementById('captureButton');
    if (captureButton) {
        captureButton.style.display = 'flex';
    }

    socket = io();

    socket.on('connect', () => {
        console.log('Connected to WebSocket server');
        cameraStarted = true;
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket server');
        cameraStarted = false;
    });

    socket.on('detection_results', (data) => {
        // console.log('Detections received:', data);
        
        // Check for warning message (negative sample)
        if (data.warning) {
            showWarning(data.warning);
        }
        
        if (data.detections && data.detections.length > 0) {
            drawDetections(data);
            // Show details panel with detection results
            showDetailsPanel(data.detections, 'camera');
        } else {
            // console.log("No detections in data or detections array is empty.");
             const canvas = document.getElementById('canvas');
             const ctx = canvas.getContext('2d');
             const video = document.getElementById('video');
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // Redraw video frame
        }
    });

    socket.on('detection_error', (data) => {
        console.error("Detection error from server:", data.error);
        // Pwede din idisplay yung error sa user using dialogs or UI elements
    });

    navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment' // Use back camera on mobile devices
        }
    })
    .then(stream => {
        videoStream = stream;
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            video.play()
                .then(() => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.style.display = 'block'; // Make sure canvas is visible
                    startRealTimeDetection();
                })
                .catch(err => {
                    console.error("Error playing video:", err);
                });
        };
    })
    .catch(err => {
        console.error("Camera error:", err);
        alert("Error accessing camera. Please make sure you have granted camera permissions.");
        if (scanImage) scanImage.style.display = 'block';
        if (scanTitle) scanTitle.style.display = 'block';
    });
}

function closeCamera() {
    const cameraContainer = document.getElementById('cameraContainer');
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const scanContainer = document.getElementById('scanContainer');

    // Show the scan image and text again
    const scanImage = scanContainer.querySelector('.scanpng');
    const scanTitle = scanContainer.querySelector('h2');
    if (scanImage) scanImage.style.display = 'block';
    if (scanTitle) scanTitle.style.display = 'block';

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        videoStream = null;
    }
    
    if (socket && socket.connected) { // Disconnect WebSocket
        socket.disconnect();
        socket = null;
        console.log("WebSocket disconnected by client.");
    }
    
    // Hide both video and canvas
    cameraContainer.style.display = "none";
    canvas.style.display = 'none';
    
    // Hide the capture button
    const captureButton = document.getElementById('captureButton');
    if (captureButton) {
        captureButton.style.display = 'none';
    }
    
    // No need to clear detection interval since we're not using automatic detection
    cameraStarted = false; // Explicitly set to false
    
    // Close details panel if open
    closeDetails();
    
    // Clear detection data and hide the show details button
    lastDetectionData = null;
    updateShowDetailsButton();
}

function uploadImage() {
    document.getElementById('imageUpload').click();
}

function closeUpload() {
    const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
    const uploadCanvas = document.getElementById('uploadCanvas');
    uploadPreviewContainer.style.display = 'none';
    
    document.getElementById('imageUpload').value = '';
    
    // Close details panel if open
    closeDetails();
    
    // Clear detection data and hide the show details button
    lastDetectionData = null;
    updateShowDetailsButton();
}

async function saveAssessment(imageBlob, detection, source) {
    const formData = new FormData();
    formData.append('image', imageBlob);
    formData.append('assessment', detection.label);
    formData.append('confidence', detection.score);
    formData.append('source', source);

    try {
        const response = await fetch('/save_assessment', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            console.error('Failed to save assessment:', await response.text());
        }
    } catch (error) {
        console.error('Error saving assessment:', error);
    }
}

// Removed automatic captureFrameAndSend function - now using manual capture only

function drawDetections(result) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const video = document.getElementById('video');

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Redraw the video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.font = "18px Arial";

    if (result.detections) {
        result.detections.forEach(detection => {
            // Set color based on label
            if (detection.label === "Unripe") {
                ctx.strokeStyle = "green";
                ctx.fillStyle = "green";
            } else if (detection.label === "Ripe") {
                ctx.strokeStyle = "yellow";
                ctx.fillStyle = "yellow";
            } else if (detection.label === "Rotten") {
                ctx.strokeStyle = "red";
                ctx.fillStyle = "red";
            } else {
                // Default color if label doesn't match
                ctx.strokeStyle = "blue";
                ctx.fillStyle = "blue";
            }
            
            // Use relative coordinates to scale to current canvas size
            if (detection.box_relative && detection.box_relative.length === 4) {
                const [rel_x1, rel_y1, rel_x2, rel_y2] = detection.box_relative;
                
                // Scale relative coordinates to current canvas dimensions
                const x1 = rel_x1 * canvas.width;
                const y1 = rel_y1 * canvas.height;
                const x2 = rel_x2 * canvas.width;
                const y2 = rel_y2 * canvas.height;
                
                const width = x2 - x1;
                const height = y2 - y1;
                
                // Draw bounding box
                ctx.strokeRect(x1, y1, width, height);
                
                // Draw label if score is high enough
                if (detection.score > 0.1) {
                    const label = `${detection.label} (${(detection.score * 100).toFixed(1)}%)`;
                    ctx.fillText(label, x1, y1 - 5);
                }
            } else {
                // Fallback to absolute coordinates (for backward compatibility)
                console.warn('Using absolute coordinates - may not align properly');
                const [x1, y1, x2, y2] = detection.box;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            }
        });
    }
}

// Add event listener for file upload
document.getElementById('imageUpload').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    try {
        const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
        const canvas = document.getElementById('uploadCanvas');
        const ctx = canvas.getContext('2d');
        
        // Clear any previous image data
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Show the upload preview container
        uploadPreviewContainer.style.display = 'block';
        
        // Create a temporary image and load the file
        const img = new Image();
        
        // Create object URL for the file
        const objectUrl = URL.createObjectURL(file);
        console.log('Created object URL:', objectUrl);
        
        // Clean up function to remove old resources
        const cleanup = () => {
            URL.revokeObjectURL(objectUrl);
            img.onload = null;
            img.onerror = null;
        };
        
        img.onload = async function() {
            console.log('Image loaded successfully:', img.width, 'x', img.height);
            try {
                // Create FormData for detection
                const formData = new FormData();
                formData.append('image', file);

                console.log('Sending file:', file.name, 'Size:', file.size, 'Type:', file.type);

                // Send the image to the server for detection
                const response = await fetch('/detect_frame', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                console.log('Detection result:', result);
                
                if (!response.ok) {
                    throw new Error(result.error || 'Detection failed');
                }
                
                // Check for warning message (negative sample)
                if (result.warning) {
                    showWarning(result.warning);
                }

                // Set canvas size to match container while maintaining aspect ratio
                const container = canvas.parentElement;
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                // Calculate the scale to fit the image
                const scale = Math.min(
                    containerWidth / img.width,
                    containerHeight / img.height
                );
                
                // Calculate the actual dimensions after scaling
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                
                // Set canvas dimensions
                canvas.width = containerWidth;
                canvas.height = containerHeight;
                
                // Calculate position to center the image
                const x = (containerWidth - scaledWidth) / 2;
                const y = (containerHeight - scaledHeight) / 2;
                
                // Clear canvas and draw new image
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                
                // Draw detections
                if (result.detections && result.detections.length > 0) {
                    ctx.lineWidth = 2;
                    ctx.font = "14px Arial";
                    
                    result.detections.forEach(detection => {
                        // Set color based on each detection's label
                        if (detection.label === "Unripe") {
                            ctx.strokeStyle = "green";
                            ctx.fillStyle = "green";
                        } else if (detection.label === "Ripe") {
                            ctx.strokeStyle = "yellow";
                            ctx.fillStyle = "yellow";
                        } else if (detection.label === "Rotten") {
                            ctx.strokeStyle = "red";
                            ctx.fillStyle = "red";
                        } else {
                            // Default color if label doesn't match
                            ctx.strokeStyle = "blue";
                            ctx.fillStyle = "blue";
                        }
                        
                        // Use relative coordinates for proper scaling
                        if (detection.box_relative && detection.box_relative.length === 4) {
                            const [rel_x1, rel_y1, rel_x2, rel_y2] = detection.box_relative;
                            
                            // Calculate box coordinates relative to the scaled image area
                            const boxX = x + (rel_x1 * scaledWidth);
                            const boxY = y + (rel_y1 * scaledHeight);
                            const boxWidth = (rel_x2 - rel_x1) * scaledWidth;
                            const boxHeight = (rel_y2 - rel_y1) * scaledHeight;
                            
                            // Draw box
                            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
                            
                            // Draw label with proper positioning
                            if (detection.score > 0.1) {  // Only show label for confident detections
                                const label = `${detection.label} (${(detection.score * 100).toFixed(1)}%)`;
                                const labelY = boxY > 30 ? boxY - 10 : boxY + 30;
                                
                                // Set text color same as box
                                ctx.fillText(label, boxX + 5, labelY);
                            }
                        } else {
                            // Fallback to absolute coordinates (backward compatibility)
                            console.warn('Using absolute coordinates for upload detection - may not align properly');
                            const [x1, y1, x2, y2] = detection.box;
                            
                            // Scale and adjust coordinates (old method)
                            const boxX = x + (x1 * scale);
                            const boxY = y + (y1 * scale);
                            const boxWidth = (x2 - x1) * scale;
                            const boxHeight = (y2 - y1) * scale;
                            
                            ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
                        }
                    });
                    
                    // Show details panel with detection results
                    showDetailsPanel(result.detections, 'upload');
                }
                
                // Clean up resources after successful processing
                cleanup();
                
            } catch (error) {
                console.error("Detection error:", error);
                alert("Error processing image: " + error.message);
                closeUpload();
                cleanup();
            }
        };

        img.onerror = function(err) {
            console.error("Error loading image:", err);
            alert("Error loading the selected image. Please try another file.");
            closeUpload();
            cleanup();
        };
        
        // Set the image source after setting up handlers
        img.src = objectUrl;
        
    } catch (error) {
        console.error("Error handling upload:", error);
        alert("Error uploading image: " + error.message);
        closeUpload();
    }
});

function startRealTimeDetection() {
    // Removed automatic detection - now only manual capture
    console.log("Camera started - ready for manual capture");
}

// Manual capture function
function captureImage() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const captureButton = document.getElementById('captureButton');
    
    if (!video || !canvas || !socket || !socket.connected) {
        console.error("Camera or socket not ready");
        return;
    }
    
    // Disable button during processing
    captureButton.disabled = true;
    captureButton.textContent = '⏳ Analyzing...';
    
    try {
        // Create a temporary canvas to capture the current frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Convert to data URL
        const imageDataURL = tempCanvas.toDataURL('image/jpeg', 0.8);
        
        // Send frame for detection
        socket.emit('detect_video_frame', { image_data_url: imageDataURL });
        
        // Draw the captured frame on the main canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        console.log("Image captured and sent for analysis");
        
    } catch (error) {
        console.error("Error capturing image:", error);
        alert("Error capturing image. Please try again.");
    } finally {
        // Re-enable button after a short delay
        setTimeout(() => {
            captureButton.disabled = false;
            captureButton.textContent = '📸 Capture & Analyze';
        }, 2000);
    }
}

// Warning display function for negative samples
function showWarning(message) {
    // Remove any existing warnings
    const existingWarning = document.querySelector('.warning-notification');
    if (existingWarning) {
        existingWarning.remove();
    }
    
    // Create warning element
    const warning = document.createElement('div');
    warning.className = 'warning-notification';
    warning.innerHTML = `
        <div class="warning-content">
            <div class="warning-icon">⚠️</div>
            <div class="warning-message">${message}</div>
            <button class="warning-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
    `;
    
    // Add styles
    warning.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff6b6b;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        max-width: 500px;
        animation: slideInWarning 0.3s ease-out;
        border: 2px solid #ff5252;
    `;
    
    // Add animation keyframes if not already added
    if (!document.querySelector('#warning-styles')) {
        const style = document.createElement('style');
        style.id = 'warning-styles';
        style.textContent = `
            @keyframes slideInWarning {
                from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            @keyframes slideOutWarning {
                from { transform: translateX(-50%) translateY(0); opacity: 1; }
                to { transform: translateX(-50%) translateY(-20px); opacity: 0; }
            }
            .warning-content {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .warning-icon {
                font-size: 20px;
            }
            .warning-message {
                flex: 1;
                font-weight: 500;
            }
            .warning-close {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .warning-close:hover {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(warning);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (warning.parentNode) {
            warning.style.animation = 'slideOutWarning 0.3s ease-in';
            setTimeout(() => warning.remove(), 300);
        }
    }, 5000);
}

// Function to show details panel
function showDetailsPanel(detections, source) {
    // Only proceed if there are valid detections
    if (!detections || detections.length === 0) {
        // Clear any previous detection data and hide button
        lastDetectionData = null;
        updateShowDetailsButton();
        return;
    }
    
    // Check if there are any valid fruit detections (Ripe, Unripe, or Rotten)
    const hasValidFruits = detections.some(d => 
        d.label === 'Ripe' || d.label === 'Unripe' || d.label === 'Rotten'
    );
    
    if (!hasValidFruits) {
        // No valid fruit detections, clear data and hide button
        lastDetectionData = null;
        updateShowDetailsButton();
        return;
    }
    
    // Store detection data for later retrieval
    lastDetectionData = {
        detections: detections,
        source: source,
        timestamp: new Date().toLocaleString()
    };
    
    // Update the show details button visibility
    updateShowDetailsButton();
    
    // Render the details
    renderDetailsPanel(detections, source, lastDetectionData.timestamp);
}

// Function to render details panel content
function renderDetailsPanel(detections, source, timestamp) {
    // Count detections by label
    const counts = { Ripe: 0, Unripe: 0, Rotten: 0 };
    let totalConfidence = 0;
    
    detections.forEach(detection => {
        const label = detection.label;
        if (counts.hasOwnProperty(label)) {
            counts[label]++;
            totalConfidence += detection.score;
        }
    });
    
    const total = counts.Ripe + counts.Unripe + counts.Rotten;
    const avgConfidence = total > 0 ? (totalConfidence / detections.length * 100).toFixed(1) : 0;
    
    // Create summary text
    const summaryParts = [];
    if (counts.Ripe > 0) summaryParts.push(`${counts.Ripe} Ripe`);
    if (counts.Unripe > 0) summaryParts.push(`${counts.Unripe} Unripe`);
    if (counts.Rotten > 0) summaryParts.push(`${counts.Rotten} Rotten`);
    const summaryText = summaryParts.join(', ');
    
    // Populate details content
    const detailsContent = document.getElementById('detailsContent');
    detailsContent.innerHTML = `
        <div class="details-section">
            <p><strong>Timestamp:</strong> ${timestamp}</p>
            <p><strong>Confidence:</strong> ${avgConfidence}%</p>
            <div class="confidence-explanation">
                <p class="explanation-text">
                    <strong>How is confidence calculated?</strong><br>
                    The confidence percentage represents the AI model's certainty in its ripeness classification. 
                    It is calculated based on the neural network's analysis of visual features such as color, texture, 
                    and appearance patterns. Higher percentages (70%+) indicate strong certainty, while the system 
                    has been trained on thousands of kaong fruit images to ensure reliable and accurate assessments.
                </p>
            </div>
            <p><strong>Source:</strong> ${source === 'upload' ? 'Image Upload' : 'Camera Scan'}</p>
            <div class="breakdown-chart">
                <h4>Fruit Breakdown:</h4>
                ${total > 0 ? `
                <div class="chart-bar">
                    <div class="bar ripe" style="width: ${(counts.Ripe / total) * 100}%">
                        <span>Ripe: ${counts.Ripe}</span>
                    </div>
                </div>
                <div class="chart-bar">
                    <div class="bar unripe" style="width: ${(counts.Unripe / total) * 100}%">
                        <span>Unripe: ${counts.Unripe}</span>
                    </div>
                </div>
                <div class="chart-bar">
                    <div class="bar rotten" style="width: ${(counts.Rotten / total) * 100}%">
                        <span>Rotten: ${counts.Rotten}</span>
                    </div>
                </div>
                ` : '<p>No fruits detected</p>'}
            </div>
            <div class="summary-text">
                <p><strong>Summary:</strong> ${summaryText || 'No detections'}</p>
            </div>
        </div>
    `;
    
    // Show the details panel
    const detailsPanel = document.getElementById('detailsPanel');
    detailsPanel.style.display = 'block';
}

// Function to show stored details again
function showStoredDetails() {
    if (lastDetectionData) {
        renderDetailsPanel(
            lastDetectionData.detections,
            lastDetectionData.source,
            lastDetectionData.timestamp
        );
    }
}

// Function to update show details button visibility
function updateShowDetailsButton() {
    const showDetailsBtn = document.getElementById('showDetailsBtn');
    if (showDetailsBtn) {
        // Only show button if there's valid detection data with actual fruit detections
        if (lastDetectionData && lastDetectionData.detections && lastDetectionData.detections.length > 0) {
            const hasValidFruits = lastDetectionData.detections.some(d => 
                d.label === 'Ripe' || d.label === 'Unripe' || d.label === 'Rotten'
            );
            if (hasValidFruits) {
                showDetailsBtn.style.display = 'block';
            } else {
                showDetailsBtn.style.display = 'none';
            }
        } else {
            showDetailsBtn.style.display = 'none';
        }
    }
}

// Function to close details panel
function closeDetails() {
    const detailsPanel = document.getElementById('detailsPanel');
    detailsPanel.style.display = 'none';
    // Don't clear lastDetectionData so user can reopen it
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize show details button visibility
    updateShowDetailsButton();
});