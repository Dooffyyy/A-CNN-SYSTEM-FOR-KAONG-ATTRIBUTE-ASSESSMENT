// Global variables
let currentConfidenceThreshold = 70; // Store current confidence threshold
let currentFilter = 'all'; // Store current filter state

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the data display
    loadData();
    
    // Force test update to see if elements exist
    setTimeout(() => {
        console.log('Testing DOM elements...');
        console.log('Document ready state:', document.readyState);
        console.log('Document body:', document.body);
        
        const testEl = document.getElementById('totalFruits');
        if (testEl) {
            testEl.textContent = 'TEST';
            console.log('totalFruits element found and updated to TEST');
        } else {
            console.error('totalFruits element NOT FOUND!');
            console.log('Available elements with "total" in ID:', document.querySelectorAll('[id*="total"]'));
            console.log('All elements with IDs:', document.querySelectorAll('[id]'));
            console.log('Summary panel element:', document.querySelector('.summary-panel'));
            console.log('All p elements:', document.querySelectorAll('p'));
        }
    }, 2000);
    
    // Add filter button click handlers
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            // Remove active class from all buttons
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to clicked button
            e.target.classList.add('active');
            
            // Apply the filter
            const filter = e.target.dataset.filter;
            currentFilter = filter; // Store current filter
            filterData(filter);
            
            // Update filter status
            updateFilterStatus(filter);
            
            // Show/hide detection controls based on filter
            toggleDetectionControls(filter);
        });
    });

    // Add confidence slider handler
    document.getElementById('confidenceSlider').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('confidenceValue').textContent = value;
        currentConfidenceThreshold = parseInt(value); // Store the threshold
        applyConfidenceFilter(currentConfidenceThreshold);
    });

    // Highlight buttons removed - no longer needed without bounding boxes

    // Add sorting controls
    document.getElementById('sortSelect').addEventListener('change', applySorting);
    document.getElementById('sortOrder').addEventListener('click', toggleSortOrder);
    
    // Add export button handler
    document.getElementById('exportReport').addEventListener('click', exportReport);
    
    // Add refresh button handler
    document.getElementById('refreshData').addEventListener('click', () => {
        console.log('Manual refresh clicked');
        loadData();
    });
    
    // Add modal handlers
    setupModalHandlers();
    
    // Auto-refresh data every 5 seconds to catch new uploads
    setInterval(loadData, 5000);
    
    // Also refresh when the page becomes visible (user switches back to tab)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadData();
        }
    });
});

async function loadData() {
    try {
        // Show loading indicator
        const refreshBtn = document.getElementById('refreshData');
        const originalText = refreshBtn.textContent;
        refreshBtn.textContent = 'Loading...';
        refreshBtn.disabled = true;
        
        const response = await fetch('/get_assessment_data');
        const data = await response.json();
        
        if (response.ok) {
            // Check if this is new data (compare with previous count)
            const currentCount = data.length;
            const previousCount = window.lastDataCount || 0;
            
            // Store data globally for export functionality
            window.currentData = data;
            
            displayData(data);
            updateStatistics(data);
            console.log(`Loaded ${data.length} assessment records`);
            
            // Show notification if new data detected
            if (currentCount > previousCount) {
                showNotification(`New assessment detected! Total: ${currentCount}`, 'success');
            }
            
            window.lastDataCount = currentCount;
        } else {
            console.error('Failed to load data:', data.error);
            showNotification('Failed to load data from server', 'error');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('Error loading data: ' + error.message, 'error');
    } finally {
        // Restore button state
        const refreshBtn = document.getElementById('refreshData');
        refreshBtn.textContent = 'Refresh Data';
        refreshBtn.disabled = false;
    }
}

function displayData(data) {
    const grid = document.querySelector('.data-grid');
    const template = document.getElementById('data-item-template');
    
    if (!grid) {
        console.error('Grid element not found!');
        return;
    }
    
    if (!template) {
        console.error('Template element not found!');
        return;
    }
    
    // Clear existing items
    grid.innerHTML = '';
    
    data.forEach((item, index) => {
        const clone = template.content.cloneNode(true);
        
        // Set image - will be updated based on filter
        const img = clone.querySelector('img');
        img.src = item.image_url;
        
        // Store original image URL and category-specific image URLs
        const dataItem = clone.querySelector('.data-item');
        dataItem.dataset.originalImageUrl = item.image_url;
        
        if (item.ripe_image_url) {
            dataItem.dataset.ripeImageUrl = item.ripe_image_url;
        }
        if (item.unripe_image_url) {
            dataItem.dataset.unripeImageUrl = item.unripe_image_url;
        }
        if (item.rotten_image_url) {
            dataItem.dataset.rottenImageUrl = item.rotten_image_url;
        }
        
        // Set assessment label
        const label = clone.querySelector('.assessment-label');
        label.textContent = item.assessment;
        label.dataset.status = getStatusClass(item.assessment);
        
        // Set confidence badge with color coding
        const confidenceBadge = clone.querySelector('.confidence-badge');
        const confidence = item.confidence * 100;
        confidenceBadge.textContent = `${confidence.toFixed(1)}%`;
        confidenceBadge.className = `confidence-badge ${getConfidenceClass(confidence)}`;
        
        // Add bounding box overlay - create mock data if detection_data is missing
        const imageContainer = clone.querySelector('.image-container');
        let detections = [];
        
        if (item.detection_data && item.detection_data.detections) {
            // Use real detection data if available
            detections = item.detection_data.detections;
        } else {
            // Create mock detection data from assessment text
            detections = createMockDetectionsFromAssessment(item.assessment);
        }
        
        // Add data attributes for filtering
        dataItem.dataset.status = getStatusClass(item.assessment);
        dataItem.dataset.assessmentId = item.id;
        dataItem.dataset.assessment = item.assessment;
        dataItem.dataset.confidence = item.confidence;
        
        // Bounding box overlay removed - no longer needed
        
        if (detections.length > 0) {
            // Store detections data for later filtering
            dataItem.dataset.detections = JSON.stringify(detections);
        }
        
        // Add fruit summary
        const summaryText = clone.querySelector('.summary-text');
        const counts = parseAssessmentCounts(item.assessment);
        const total = counts.ripe + counts.unripe + counts.rotten;
        if (total > 0) {
            summaryText.textContent = `Ripe: ${counts.ripe} | Unripe: ${counts.unripe} | Rotten: ${counts.rotten}`;
        } else {
            summaryText.textContent = 'No detections';
        }

        // Add click handlers for expand and delete
        const expandBtn = clone.querySelector('.expand-btn');
        const deleteBtn = clone.querySelector('.delete-btn');
        
        expandBtn.addEventListener('click', () => showDetailedModal(item));
        deleteBtn.addEventListener('click', () => deleteAssessment(item));
        
        // Add hover effect for visual breakdown
        dataItem.addEventListener('mouseenter', () => showHoverBreakdown(item, dataItem));
        dataItem.addEventListener('mouseleave', () => hideHoverBreakdown(dataItem));
        
        grid.appendChild(clone);
    });
    
    // Apply confidence filter after DOM is created (only for specific categories)
    if (currentFilter !== 'all') {
        applyConfidenceFilter(currentConfidenceThreshold);
    }
}

function updateStatistics(data) {
    // Update total count (number of images)
    const totalScannedEl = document.getElementById('totalScanned');
    if (totalScannedEl) {
        totalScannedEl.textContent = data.length;
    }
    
    // Count by status
    const counts = data.reduce((acc, item) => {
        const status = getStatusClass(item.assessment);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    
    // Update individual counts (check if elements exist first)
    const readyCountEl = document.getElementById('readyCount');
    const notReadyCountEl = document.getElementById('notReadyCount');
    const rottenCountEl = document.getElementById('rottenCount');
    const mixedCountEl = document.getElementById('mixedCount');
    
    if (readyCountEl) readyCountEl.textContent = counts.ready || 0;
    if (notReadyCountEl) notReadyCountEl.textContent = counts['not-ready'] || 0;
    if (rottenCountEl) rottenCountEl.textContent = counts.rotten || 0;
    if (mixedCountEl) mixedCountEl.textContent = counts.mixed || 0;
    
    // Calculate total kaong fruits detected across all images
    let totalKaongFruits = 0;
    let totalRipe = 0, totalUnripe = 0, totalRotten = 0;
    let totalConfidence = 0;
    let lastUpload = null;
    
    data.forEach(item => {
        console.log('Processing item:', item);
        
        // Parse the assessment text to extract numbers
        const matches = item.assessment.match(/(\d+)\s+(Ripe|Unripe|Rotten)/g);
        console.log('Assessment text:', item.assessment);
        console.log('Matches found:', matches);
        
        if (matches) {
            // New format with numbers: "67 Ripe, 8 Rotten, 7 Unripe"
            matches.forEach(match => {
                const number = parseInt(match.match(/\d+/)[0]);
                const type = match.match(/(Ripe|Unripe|Rotten)/)[0].toLowerCase();
                totalKaongFruits += number;
                
                if (type === 'ripe') totalRipe += number;
                else if (type === 'unripe') totalUnripe += number;
                else if (type === 'rotten') totalRotten += number;
            });
        } else {
            // Old format without numbers: "Ripe", "Ready for Harvesting", "Rotten"
            const assessment = item.assessment.toLowerCase();
            if (assessment.includes('ripe') && !assessment.includes('unripe') && !assessment.includes('rotten')) {
                totalKaongFruits += 1;
                totalRipe += 1;
            } else if (assessment.includes('unripe') && !assessment.includes('ripe') && !assessment.includes('rotten')) {
                totalKaongFruits += 1;
                totalUnripe += 1;
            } else if (assessment.includes('rotten') && !assessment.includes('ripe') && !assessment.includes('unripe')) {
                totalKaongFruits += 1;
                totalRotten += 1;
            } else if (assessment.includes('ready for harvesting')) {
                totalKaongFruits += 1;
                totalRipe += 1;
            }
        }
        
        // Calculate average confidence
        totalConfidence += item.confidence;
        
        // Find last upload
        const timestamp = new Date(item.timestamp);
        if (!lastUpload || timestamp > lastUpload) {
            lastUpload = timestamp;
        }
    });
    
    console.log('Calculated totals:', { totalKaongFruits, totalRipe, totalUnripe, totalRotten, totalConfidence, lastUpload });
    
    // Update summary panel
    console.log('Updating summary panel with values:', { totalKaongFruits, totalRipe, totalRotten, totalUnripe });
    
    // Wait for DOM to be ready
    if (document.readyState !== 'complete') {
        console.log('DOM not ready, waiting...');
        setTimeout(() => updateStatistics(data), 100);
        return;
    }
    
    const totalFruitsEl = document.getElementById('totalFruits');
    const summaryRipeEl = document.getElementById('summaryRipe');
    const summaryRottenEl = document.getElementById('summaryRotten');
    const summaryUnripeEl = document.getElementById('summaryUnripe');
    const avgConfidenceEl = document.getElementById('avgConfidence');
    const lastUploadEl = document.getElementById('lastUpload');
    
    console.log('DOM elements found:', { 
        totalFruitsEl, summaryRipeEl, summaryRottenEl, 
        summaryUnripeEl, avgConfidenceEl, lastUploadEl 
    });
    
    console.log('Document ready state:', document.readyState);
    console.log('All elements with IDs:', document.querySelectorAll('[id]'));
    
    // If elements not found, try alternative approach
    if (!totalFruitsEl) {
        console.log('Primary elements not found, trying alternative approach...');
        const altTotalFruits = document.querySelector('#totalFruits');
        const altSummaryRipe = document.querySelector('#summaryRipe');
        const altSummaryRotten = document.querySelector('#summaryRotten');
        const altSummaryUnripe = document.querySelector('#summaryUnripe');
        const altAvgConfidence = document.querySelector('#avgConfidence');
        const altLastUpload = document.querySelector('#lastUpload');
        
        console.log('Alternative elements found:', {
            altTotalFruits, altSummaryRipe, altSummaryRotten,
            altSummaryUnripe, altAvgConfidence, altLastUpload
        });
        
        // If still not found, try to find by text content
        if (!altTotalFruits) {
            console.log('Elements still not found, trying to find by text content...');
            const allP = document.querySelectorAll('p');
            console.log('All p elements found:', allP);
            
            // Try to find elements by their parent text
            const summaryPanel = document.querySelector('.summary-panel');
            if (summaryPanel) {
                console.log('Summary panel found, looking for elements inside...');
                const panelP = summaryPanel.querySelectorAll('p');
                console.log('P elements in summary panel:', panelP);
                
                // Try to update by position
                if (panelP.length >= 6) {
                    panelP[0].textContent = totalKaongFruits;
                    panelP[1].textContent = totalRipe;
                    panelP[2].textContent = totalRotten;
                    panelP[3].textContent = totalUnripe;
                    panelP[4].textContent = data.length > 0 ? `${(totalConfidence / data.length * 100).toFixed(1)}%` : '0%';
                    panelP[5].textContent = lastUpload ? lastUpload.toLocaleString() : 'Never';
                    console.log('Updated elements by position');
                    return;
                }
            }
        }
        
        // Use alternative elements if found
        if (altTotalFruits) altTotalFruits.textContent = totalKaongFruits;
        if (altSummaryRipe) altSummaryRipe.textContent = totalRipe;
        if (altSummaryRotten) altSummaryRotten.textContent = totalRotten;
        if (altSummaryUnripe) altSummaryUnripe.textContent = totalUnripe;
        if (altAvgConfidence) altAvgConfidence.textContent = data.length > 0 ? `${(totalConfidence / data.length * 100).toFixed(1)}%` : '0%';
        if (altLastUpload) altLastUpload.textContent = lastUpload ? lastUpload.toLocaleString() : 'Never';
        
        return;
    }
    
    // Force update with explicit values
    if (totalFruitsEl) {
        totalFruitsEl.textContent = totalKaongFruits;
        console.log('Updated totalFruits to:', totalKaongFruits);
    } else {
        console.error('totalFruits element not found!');
    }
    
    if (summaryRipeEl) {
        summaryRipeEl.textContent = totalRipe;
        console.log('Updated summaryRipe to:', totalRipe);
    } else {
        console.error('summaryRipe element not found!');
    }
    
    if (summaryRottenEl) {
        summaryRottenEl.textContent = totalRotten;
        console.log('Updated summaryRotten to:', totalRotten);
    } else {
        console.error('summaryRotten element not found!');
    }
    
    if (summaryUnripeEl) {
        summaryUnripeEl.textContent = totalUnripe;
        console.log('Updated summaryUnripe to:', totalUnripe);
    } else {
        console.error('summaryUnripe element not found!');
    }
    
    if (avgConfidenceEl) {
        const avgConf = data.length > 0 ? (totalConfidence / data.length * 100).toFixed(1) : 0;
        avgConfidenceEl.textContent = `${avgConf}%`;
        console.log('Updated avgConfidence to:', `${avgConf}%`);
    } else {
        console.error('avgConfidence element not found!');
    }
    
    if (lastUploadEl) {
        const lastUploadText = lastUpload ? lastUpload.toLocaleString() : 'Never';
        lastUploadEl.textContent = lastUploadText;
        console.log('Updated lastUpload to:', lastUploadText);
    } else {
        console.error('lastUpload element not found!');
    }
    
    // Statistics section removed - data is now shown in summary panel only
}


function filterData(filter) {
    if (!window.currentData) return;
    
    // Instead of recreating DOM, just show/hide existing items
    const items = document.querySelectorAll('.data-item');
    
    items.forEach(item => {
        const counts = parseAssessmentCounts(item.dataset.assessment || '');
        let shouldShow = false;
        
        switch(filter) {
            case 'all':
                shouldShow = true;
                break;
            case 'ready':
                shouldShow = counts.ripe > 0;
                break;
            case 'not-ready':
                shouldShow = counts.unripe > 0;
                break;
            case 'rotten':
                shouldShow = counts.rotten > 0;
                break;
            case 'mixed':
                shouldShow = (counts.ripe > 0 && counts.unripe > 0) || 
                           (counts.ripe > 0 && counts.rotten > 0) || 
                           (counts.unripe > 0 && counts.rotten > 0);
                break;
            default:
                shouldShow = true;
        }
        
        item.style.display = shouldShow ? 'block' : 'none';
    });
    
    // Reapply confidence filter after category filtering (only for specific categories)
    if (currentFilter !== 'all') {
        applyConfidenceFilter(currentConfidenceThreshold);
    }
}

function getStatusClass(assessment) {
    // Handle grouped assessments like "3 Ripe, 2 Unripe, 1 Rotten"
    const lowerAssessment = assessment.toLowerCase();
    
    if (lowerAssessment.includes('ripe') && !lowerAssessment.includes('unripe') && !lowerAssessment.includes('rotten')) {
            return 'ready';
    } else if (lowerAssessment.includes('unripe') && !lowerAssessment.includes('ripe') && !lowerAssessment.includes('rotten')) {
            return 'not-ready';
    } else if (lowerAssessment.includes('rotten') && !lowerAssessment.includes('ripe') && !lowerAssessment.includes('unripe')) {
            return 'rotten';
    } else if (lowerAssessment.includes('ripe') || lowerAssessment.includes('unripe') || lowerAssessment.includes('rotten')) {
        // Mixed results - show as mixed
        return 'mixed';
    }
    
            return 'unknown';
}

// New helper functions for enhanced features
function getConfidenceClass(confidence) {
    if (confidence >= 80) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
}

function updateFilterStatus(filter) {
    const filterTexts = {
        'all': 'All',
        'ready': 'Ripe Only',
        'not-ready': 'Unripe Only',
        'rotten': 'Rotten Only',
        'mixed': 'Mixed'
    };
    document.getElementById('activeFilter').textContent = `Currently showing: ${filterTexts[filter]}`;
}

function toggleDetectionControls(filter) {
    const detectionControls = document.getElementById('detectionControls');
    const categorySummary = document.getElementById('categorySummary');
    
    if (filter === 'all') {
        // Overview mode - hide detection controls and reset confidence filter
        detectionControls.style.display = 'none';
        categorySummary.style.display = 'none';
        
        // Reset all items to normal opacity when in "All" mode
        document.querySelectorAll('.data-item').forEach(item => {
            item.style.opacity = '1';
            item.style.filter = 'none';
        });
        
        // Update confidence info to show all items
        const confidenceInfo = document.getElementById('confidenceInfo');
        if (confidenceInfo) {
            const totalCount = document.querySelectorAll('.data-item').length;
            confidenceInfo.textContent = `Showing all ${totalCount} assessments`;
        }
    } else {
        // Detection mode - show detection controls
        detectionControls.style.display = 'flex';
        categorySummary.style.display = 'block';
        updateCategorySummary(filter);
        
        // Apply confidence filter for specific categories
        applyConfidenceFilter(currentConfidenceThreshold);
    }
}


function updateCategorySummary(filter) {
    if (!window.currentData) return;
    
    const filteredData = window.currentData.filter(item => {
        const counts = parseAssessmentCounts(item.assessment);
        const total = counts.ripe + counts.unripe + counts.rotten;
        
        switch(filter) {
            case 'ready':
                return counts.ripe > 0;
            case 'not-ready':
                return counts.unripe > 0;
            case 'rotten':
                return counts.rotten > 0;
            case 'mixed':
                return counts.ripe > 0 && counts.unripe > 0 || 
                       counts.ripe > 0 && counts.rotten > 0 || 
                       counts.unripe > 0 && counts.rotten > 0;
            default:
                return true;
        }
    });
    
    // Calculate statistics
    let totalFruits = 0;
    let totalConfidence = 0;
    let minConfidence = 100;
    let maxConfidence = 0;
    
    filteredData.forEach(item => {
        const counts = parseAssessmentCounts(item.assessment);
        
        // Count only fruits from the selected category
        switch(filter) {
            case 'ready':
                totalFruits += counts.ripe;
                break;
            case 'not-ready':
                totalFruits += counts.unripe;
                break;
            case 'rotten':
                totalFruits += counts.rotten;
                break;
            case 'mixed':
            case 'all':
            default:
                // For mixed and all, count all fruits
                totalFruits += counts.ripe + counts.unripe + counts.rotten;
                break;
        }
        
        totalConfidence += item.confidence * 100;
        minConfidence = Math.min(minConfidence, item.confidence * 100);
        maxConfidence = Math.max(maxConfidence, item.confidence * 100);
    });
    
    const avgConfidence = filteredData.length > 0 ? totalConfidence / filteredData.length : 0;
    
    // Update UI
    document.getElementById('categoryTotal').textContent = totalFruits;
    document.getElementById('categoryConfidence').textContent = `${avgConfidence.toFixed(1)}%`;
    document.getElementById('categoryRange').textContent = `${minConfidence.toFixed(1)}-${maxConfidence.toFixed(1)}%`;
    document.getElementById('categoryImages').textContent = filteredData.length;
}

function applyConfidenceFilter(threshold) {
    if (!window.currentData) return;
    
    let visibleCount = 0;
    let totalCount = 0;
    
    document.querySelectorAll('.data-item').forEach(item => {
        const rawConfidence = parseFloat(item.dataset.confidence || 0);
        const confidence = rawConfidence * 100; // Convert decimal to percentage
        totalCount++;
        
        // Confidence filtering logic
        
        if (confidence < threshold) {
            item.style.opacity = '0.3';
            item.style.filter = 'grayscale(50%)';
        } else {
            item.style.opacity = '1';
            item.style.filter = 'none';
            visibleCount++;
        }
    });
    
    // Update confidence filter info
    const confidenceInfo = document.getElementById('confidenceInfo');
    if (confidenceInfo) {
        confidenceInfo.textContent = `Showing ${visibleCount} of ${totalCount} assessments (${((visibleCount/totalCount)*100).toFixed(1)}%)`;
    }
}


function applySorting() {
    const sortBy = document.getElementById('sortSelect').value;
    const order = document.getElementById('sortOrder').dataset.order;
    
    if (!window.currentData) return;
    
    let sortedData = [...window.currentData];
    
    switch(sortBy) {
        case 'date':
            sortedData.sort((a, b) => {
                const dateA = new Date(a.timestamp);
                const dateB = new Date(b.timestamp);
                return order === 'desc' ? dateB - dateA : dateA - dateB;
            });
            break;
        case 'confidence':
            sortedData.sort((a, b) => {
                return order === 'desc' ? b.confidence - a.confidence : a.confidence - b.confidence;
            });
            break;
        case 'count':
            sortedData.sort((a, b) => {
                const countA = parseAssessmentCounts(a.assessment);
                const countB = parseAssessmentCounts(b.assessment);
                const totalA = countA.ripe + countA.unripe + countA.rotten;
                const totalB = countB.ripe + countB.unripe + countB.rotten;
                return order === 'desc' ? totalB - totalA : totalA - totalB;
            });
            break;
    }
    
    // Re-display sorted data
    displayData(sortedData);
    
    // Reapply confidence filter after sorting (only for specific categories)
    if (currentFilter !== 'all') {
        applyConfidenceFilter(currentConfidenceThreshold);
    }
}

function toggleSortOrder() {
    const button = document.getElementById('sortOrder');
    const currentOrder = button.dataset.order;
    const newOrder = currentOrder === 'desc' ? 'asc' : 'desc';
    
    button.dataset.order = newOrder;
    button.textContent = newOrder === 'desc' ? '↓' : '↑';
    
    applySorting();
}

function showDetailedModal(item) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('modalContent');
    
    // Store the current item for the delete button
    window.currentModalItem = item;
    
    // Parse the assessment to extract counts
    const counts = parseAssessmentCounts(item.assessment);
    
    content.innerHTML = `
        <div class="modal-image">
            <img src="${item.image_url}" alt="Kaong Image" style="max-width: 100%; height: auto;">
        </div>
        <div class="modal-details">
            <h3>Analysis Details</h3>
            <p><strong>Timestamp:</strong> ${new Date(item.timestamp).toLocaleString()}</p>
            <p><strong>Confidence:</strong> ${(item.confidence * 100).toFixed(1)}%</p>
            <div class="confidence-explanation">
                <p class="explanation-text">
                    <strong>How is confidence calculated?</strong><br>
                    The confidence percentage represents the AI model's certainty in its ripeness classification. 
                    It is calculated based on the neural network's analysis of visual features such as color, texture, 
                    and appearance patterns. Higher percentages (70%+) indicate strong certainty, while the system 
                    has been trained on thousands of kaong fruit images to ensure reliable and accurate assessments.
                </p>
            </div>
            <p><strong>Source:</strong> ${item.source}</p>
            <div class="breakdown-chart">
                <h4>Fruit Breakdown:</h4>
                <div class="chart-bar">
                    <div class="bar ripe" style="width: ${(counts.ripe / (counts.ripe + counts.unripe + counts.rotten)) * 100}%">
                        <span>Ripe: ${counts.ripe}</span>
                    </div>
                </div>
                <div class="chart-bar">
                    <div class="bar unripe" style="width: ${(counts.unripe / (counts.ripe + counts.unripe + counts.rotten)) * 100}%">
                        <span>Unripe: ${counts.unripe}</span>
                    </div>
                </div>
                <div class="chart-bar">
                    <div class="bar rotten" style="width: ${(counts.rotten / (counts.ripe + counts.unripe + counts.rotten)) * 100}%">
                        <span>Rotten: ${counts.rotten}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

function parseAssessmentCounts(assessment) {
    const counts = { ripe: 0, unripe: 0, rotten: 0 };
    const matches = assessment.match(/(\d+)\s+(Ripe|Unripe|Rotten)/g);
    
    if (matches) {
        matches.forEach(match => {
            const number = parseInt(match.match(/\d+/)[0]);
            const type = match.match(/(Ripe|Unripe|Rotten)/)[0].toLowerCase();
            counts[type] = number;
        });
    }
    
    return counts;
}

function deleteAssessment(item) {
    if (confirm('Are you sure you want to delete this assessment? This action cannot be undone.')) {
        // Send delete request to server
        fetch(`/api/delete-assessment/${item.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => {
            if (response.ok) {
                showNotification('Assessment deleted successfully', 'success');
                // Remove the item from the UI
                const dataItem = document.querySelector(`[data-assessment-id="${item.id}"]`);
                if (dataItem) {
                    dataItem.remove();
                }
                // Refresh the summary statistics
                loadData();
            } else {
                throw new Error('Failed to delete assessment');
            }
        })
        .catch(error => {
            console.error('Error deleting assessment:', error);
            showNotification('Failed to delete assessment. Please try again.', 'error');
        });
    }
}

function showHoverBreakdown(item, element) {
    const counts = parseAssessmentCounts(item.assessment);
    const total = counts.ripe + counts.unripe + counts.rotten;
    
    if (total > 0) {
        const tooltip = document.createElement('div');
        tooltip.className = 'hover-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-content">
                <div class="tooltip-title">Fruit Breakdown</div>
                <div class="tooltip-bar">
                    <div class="tooltip-segment ripe" style="width: ${(counts.ripe / total) * 100}%"></div>
                    <div class="tooltip-segment unripe" style="width: ${(counts.unripe / total) * 100}%"></div>
                    <div class="tooltip-segment rotten" style="width: ${(counts.rotten / total) * 100}%"></div>
                </div>
                <div class="tooltip-text">
                    Ripe: ${counts.ripe} | Unripe: ${counts.unripe} | Rotten: ${counts.rotten}
                </div>
            </div>
        `;
        element.appendChild(tooltip);
    }
}

function hideHoverBreakdown(element) {
    const tooltip = element.querySelector('.hover-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

function setupModalHandlers() {
    const modal = document.getElementById('detailModal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
    
    // Delete modal button
    document.getElementById('deleteModalBtn').addEventListener('click', () => {
        const currentItem = window.currentModalItem;
        if (currentItem) {
            deleteAssessment(currentItem);
            // Close the modal
            document.getElementById('detailModal').style.display = 'none';
        }
    });
}

function exportReport() {
    try {
        // Get the current data from the global variable or fetch it
        if (!window.currentData || window.currentData.length === 0) {
            showNotification('No data available to export. Please refresh the data first.', 'error');
            return;
        }
        
        console.log('Exporting data:', window.currentData.length, 'records');
        
        // Create CSV content from the actual data structure
        const csvContent = [
            'Timestamp,Assessment,Confidence (%),Source,Image URL',
            ...window.currentData.map(item => {
                try {
                    const timestamp = new Date(item.timestamp).toLocaleString();
                    const assessment = `"${(item.assessment || '').replace(/"/g, '""')}"`; // Escape quotes
                    const confidence = ((item.confidence || 0) * 100).toFixed(1);
                    const source = `"${(item.source || '').replace(/"/g, '""')}"`; // Escape quotes
                    const imageUrl = `"${(item.image_url || '').replace(/"/g, '""')}"`; // Escape quotes
                    
                    return `${timestamp},${assessment},${confidence},${source},${imageUrl}`;
                } catch (error) {
                    console.error('Error processing item for export:', item, error);
                    return 'Error,Error,0,Error,Error';
                }
            })
        ].join('\n');
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kaong_assessment_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Show success notification
        showNotification(`Report exported successfully! ${window.currentData.length} records exported.`, 'success');
        
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting report. Please try again.', 'error');
    }
}

// Create mock detection data from assessment text
function createMockDetectionsFromAssessment(assessment) {
    const detections = [];
    const matches = assessment.match(/(\d+)\s+(Ripe|Unripe|Rotten)/g);
    
    if (matches) {
        matches.forEach(match => {
            const number = parseInt(match.match(/\d+/)[0]);
            const type = match.match(/(Ripe|Unripe|Rotten)/)[0];
            
            // Create multiple detections for the count
            for (let i = 0; i < number; i++) {
                // Generate random positions for mock bounding boxes
                const x1 = Math.random() * 0.6; // 0 to 0.6
                const y1 = Math.random() * 0.6; // 0 to 0.6
                const x2 = x1 + 0.1 + Math.random() * 0.2; // width between 0.1 and 0.3
                const y2 = y1 + 0.1 + Math.random() * 0.2; // height between 0.1 and 0.3
                
                detections.push({
                    label: type,
                    box_relative: [x1, y1, x2, y2],
                    score: 0.7 + Math.random() * 0.2, // confidence between 0.7 and 0.9
                    assessment: type === 'Ripe' ? 'Ready for Harvesting' : 
                              type === 'Unripe' ? 'Not Ready for Harvesting' : 'Rotten'
                });
            }
        });
    }
    
    return detections;
}

// Bounding box overlay creation

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
    `;
    
    // Add animation keyframes
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .notification-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                margin-left: 10px;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
    
    // Close button handler
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    });
} 