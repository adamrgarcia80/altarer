// State management
let altarPieces = [];
let selectedPiece = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let pieceCounter = 0;
let objectLabelCounter = 0;
let usedImageUrls = new Set(); // Track used image URLs to prevent duplicates
let zoomLevel = 1;
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let spacePressed = false;
let currentMantra = null; // Store current mantra text
let clickStartTime = 0; // Track click start time for deselection
let clickStartPos = { x: 0, y: 0 }; // Track click start position for deselection
let wasSelectedOnMouseDown = false; // Track if piece was selected when mousedown occurred
const CLICK_THRESHOLD = 5; // pixels of movement to consider it a drag
const CLICK_TIME_THRESHOLD = 200; // milliseconds to consider it a click vs drag

// Grid snap distance
const SNAP_DISTANCE = 50;
const MIN_SIZE = 80;
const MAX_SIZE = 800;
const BROADER_TOPICS = [
    'found object',
    'household artifact',
    'street photography',
    'botanical detail',
    'architecture fragment',
    'textile pattern',
    'industrial design',
    'vintage illustration',
    'folk art',
    'mechanical device',
    'everyday ritual',
    'ephemera',
];

const WILDCARD_TOPICS = [
    'abstract texture',
    'scientific illustration',
    'cosmic landscape',
    'natural history specimen',
    'microscopic image',
    'cartography fragment',
    'weather phenomena',
    'art museum interior',
    'astronomical plate',
    'geometric study',
];

function getRandomEntry(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function chooseFetchTopic(subject) {
    if (!subject) {
        const roll = Math.random();
        if (roll < 0.4) return getRandomEntry(BROADER_TOPICS);
        if (roll < 0.7) return getRandomEntry(WILDCARD_TOPICS);
        return null;
    }
    
    const roll = Math.random();
    if (roll < 0.5) {
        return subject;
    } else if (roll < 0.75) {
        return `${subject} ${getRandomEntry(BROADER_TOPICS)}`;
    } else if (roll < 0.9) {
        return getRandomEntry(BROADER_TOPICS);
    } else if (roll < 0.97) {
        return getRandomEntry(WILDCARD_TOPICS);
    }
    return null;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadArchive();
    // Initialize content wrapper for transforms
    initializeContentWrapper();
});

function initializeContentWrapper() {
    const canvas = document.getElementById('canvas');
    let contentWrapper = document.getElementById('canvas-content');
    if (!contentWrapper) {
        contentWrapper = document.createElement('div');
        contentWrapper.id = 'canvas-content';
        contentWrapper.style.position = 'absolute';
        contentWrapper.style.top = '0';
        contentWrapper.style.left = '0';
        contentWrapper.style.width = '100%';
        contentWrapper.style.height = '100%';
        canvas.appendChild(contentWrapper);
    }
}

function initializeEventListeners() {
    document.getElementById('createAltar').addEventListener('click', createAltarCluster);
    document.getElementById('rearrange').addEventListener('click', rearrangeCluster);
    document.getElementById('gridAssemble').addEventListener('click', assembleGrid);
    document.getElementById('mantra').addEventListener('click', addMantra);
    document.getElementById('ceremony').addEventListener('click', startCeremony);
    document.getElementById('clearCanvas').addEventListener('click', clearCanvas);
    document.getElementById('saveAltar').addEventListener('click', saveAltarToArchive);
    document.getElementById('viewArchive').addEventListener('click', openArchive);
    document.querySelector('.close').addEventListener('click', closeArchive);
    
    // ADD OBJECT dropdown (replaces individual buttons)
    const addObjectToggle = document.getElementById('addObjectToggle');
    const addObjectMenu = document.getElementById('addObjectMenu');
    const addObjectWrapper = document.querySelector('.add-object-wrapper');
    if (addObjectToggle && addObjectMenu) {
        addObjectToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            addObjectMenu.classList.toggle('open');
        });
        
        // Handle menu item clicks
        const menuItems = addObjectMenu.querySelectorAll('.add-object-menu__item');
        menuItems.forEach(item => {
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                const action = item.getAttribute('data-action');
                addObjectMenu.classList.remove('open');
                
                if (action === 'random') {
                    createNewAltarPiece();
                } else {
                    createSubjectPiece(action);
                }
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (event) => {
            if (addObjectWrapper && !addObjectWrapper.contains(event.target)) {
                addObjectMenu.classList.remove('open');
            }
        });
    }
    
    const canvas = document.getElementById('canvas');
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    
    // Update cursor based on hover target
    canvas.addEventListener('mousemove', updateCanvasCursor);
    
    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Zoom on scroll
    canvas.addEventListener('wheel', handleZoom, { passive: false });
    
    // Pan with right mouse button or space + drag
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) {
            spacePressed = true;
            e.preventDefault();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            spacePressed = false;
            if (isPanning) {
                isPanning = false;
                canvas.style.cursor = 'crosshair';
            }
        }
    });
    
    canvas.addEventListener('mousedown', (e) => {
        // Allow panning on background with left click (not just right click or space)
        // Only prevent if clicking on a piece
        if (!e.target.closest('.altar-piece') && !e.target.classList.contains('resize-handle')) {
            // Left click on background = pan
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                isPanning = true;
                const container = canvas.parentElement;
                const containerRect = container.getBoundingClientRect();
                // Store the initial mouse position and current pan offset
                panStart.x = e.clientX - containerRect.left;
                panStart.y = e.clientY - containerRect.top;
                const startPanX = panOffset.x;
                const startPanY = panOffset.y;
                // Store the difference for smooth panning
                panStart.panX = startPanX;
                panStart.panY = startPanY;
                canvas.style.cursor = 'grabbing';
            }
            // Right mouse button also works for panning
            else if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                isPanning = true;
                const container = canvas.parentElement;
                const containerRect = container.getBoundingClientRect();
                panStart.x = e.clientX - containerRect.left;
                panStart.y = e.clientY - containerRect.top;
                panStart.panX = panOffset.x;
                panStart.panY = panOffset.y;
                canvas.style.cursor = 'grabbing';
            }
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if (isPanning) {
            isPanning = false;
            const target = document.elementFromPoint(e.clientX, e.clientY);
            updateCanvasCursor({ target: target || canvas });
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            const container = canvas.parentElement;
            const containerRect = container.getBoundingClientRect();
            // Calculate pan offset based on mouse movement
            const deltaX = e.clientX - containerRect.left - panStart.x;
            const deltaY = e.clientY - containerRect.top - panStart.y;
            panOffset.x = panStart.panX + deltaX;
            panOffset.y = panStart.panY + deltaY;
            applyTransform();
        }
    });
    
    const infoToggle = document.getElementById('infoToggle');
    const infoPanel = document.getElementById('infoPanel');
    const infoClose = document.getElementById('infoClose');
    if (infoToggle && infoPanel) {
        infoToggle.addEventListener('click', () => {
            infoPanel.classList.toggle('open');
        });
        
        if (infoClose) {
            infoClose.addEventListener('click', () => {
                infoPanel.classList.remove('open');
            });
        }
        
        infoPanel.addEventListener('click', (event) => {
            // Allow clicking links without closing
            if (event.target.closest('a')) {
                return;
            }
            infoPanel.classList.remove('open');
        });
    }
    
    // Object Info Panel
    const objectInfoToggle = document.getElementById('objectInfoToggle');
    const objectInfoPanel = document.getElementById('objectInfoPanel');
    const objectInfoClose = document.getElementById('objectInfoClose');
    const objectInfoContent = document.getElementById('objectInfoContent');
    
    if (objectInfoToggle && objectInfoPanel && objectInfoContent) {
        objectInfoToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
                populateObjectInfo();
                objectInfoPanel.classList.toggle('open');
            } catch (error) {
                console.error('Error opening object info panel:', error);
            }
        });
        
        if (objectInfoClose) {
            objectInfoClose.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                objectInfoPanel.classList.remove('open');
            });
        }
        
        objectInfoPanel.addEventListener('click', (event) => {
            // Don't close if clicking the close button (it has its own handler)
            if (event.target.closest('.object-info-panel__close')) {
                return;
            }
            // Allow clicking links without closing
            if (event.target.closest('a')) {
                return;
            }
            objectInfoPanel.classList.remove('open');
        });
    } else {
        console.warn('Object info panel elements not found:', {
            toggle: !!objectInfoToggle,
            panel: !!objectInfoPanel,
            content: !!objectInfoContent
        });
    }
    
}

function getSourceFromUrl(url) {
    if (!url) return 'Unknown';
    if (url.includes('wikimedia.org') || url.includes('commons.wikimedia.org')) return 'Wikimedia Commons';
    if (url.includes('nasa.gov') || url.includes('images-api.nasa.gov')) return 'NASA';
    if (url.includes('loc.gov')) return 'Library of Congress';
    if (url.includes('archive.org')) return 'Internet Archive';
    if (url.includes('openverse')) return 'Openverse';
    return 'Public Domain';
}

function populateObjectInfo() {
    const objectInfoContent = document.getElementById('objectInfoContent');
    if (!objectInfoContent) return;
    
    if (altarPieces.length === 0) {
        objectInfoContent.innerHTML = '<p>NO OBJECTS ON SCREEN</p>';
        return;
    }
    
    let html = '';
    altarPieces.forEach((piece, index) => {
        const source = getSourceFromUrl(piece.originalUrl);
        const dimensions = `${Math.round(piece.width)} × ${Math.round(piece.height)}px`;
        const label = piece.label || `OBJECT ${index + 1}`;
        
        html += `<p>${label}. SOURCE: ${source}. DIMENSIONS: ${dimensions}.${piece.originalUrl ? ` PROVENANCE: <a href="${piece.originalUrl}" target="_blank">${piece.originalUrl}</a>` : ''}</p>`;
    });
    
    objectInfoContent.innerHTML = html;
}

function handleZoom(e) {
    e.preventDefault();
    
    // Support both vertical and horizontal scrolling
    const deltaY = e.deltaY > 0 ? 0.9 : 1.1;
    
    // Zoom based on vertical scroll
    const newZoom = Math.max(0.5, Math.min(3, zoomLevel * deltaY));
    
    if (newZoom !== zoomLevel) {
        const canvas = document.getElementById('canvas');
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        // Mouse position relative to container (where cursor is)
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;
        
        // Current zoom point in canvas coordinates (where cursor is pointing)
        const zoomPointX = (mouseX - panOffset.x) / zoomLevel;
        const zoomPointY = (mouseY - panOffset.y) / zoomLevel;
        
        zoomLevel = newZoom;
        
        // Adjust pan to zoom towards cursor position
        panOffset.x = mouseX - zoomPointX * zoomLevel;
        panOffset.y = mouseY - zoomPointY * zoomLevel;
        
        applyTransform();
    }
    
    // Horizontal scroll for panning (strafe left/right)
    if (e.deltaX !== 0) {
        panOffset.x -= e.deltaX * 0.5;
        applyTransform();
    }
}

function applyTransform() {
    const canvas = document.getElementById('canvas');
    // Get or create wrapper for content that should transform (not grid)
    let contentWrapper = document.getElementById('canvas-content');
    if (!contentWrapper) {
        initializeContentWrapper();
        contentWrapper = document.getElementById('canvas-content');
        
        // Move all existing pieces and mantra into wrapper
        const pieces = canvas.querySelectorAll('.altar-piece');
        pieces.forEach(piece => {
            if (piece.parentElement === canvas) {
                contentWrapper.appendChild(piece);
            }
        });
        
        const mantra = document.getElementById('mantra-text');
        if (mantra && mantra.parentElement === canvas) {
            contentWrapper.appendChild(mantra);
        }
    }
    
    // Normal 2D view
    contentWrapper.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    contentWrapper.style.transformStyle = 'flat';
    contentWrapper.style.transformOrigin = 'center center';
}


async function createNewAltarPiece() {
    await createSubjectPiece(null);
}

function getSubjectLoadingMessage(subject) {
    const messages = {
        'bell': ['RINGING THE BELL', 'TOLLING THE BELL', 'CALLING THE BELL'],
        'candle': ['LIGHTING THE CANDLE', 'IGNITING THE FLAME', 'KINDLING THE CANDLE'],
        'pedestal': ['RAISING THE PEDESTAL', 'ERECTING THE BASE', 'PLACING THE PEDESTAL'],
        'flowers': ['GATHERING FLOWERS', 'PLUCKING THE BLOOM', 'ARRANGING FLOWERS'],
        'smoke': ['SUMMONING SMOKE', 'RISING THE SMOKE', 'CALLING THE SMOKE'],
        'flame': ['CALLING THE FLAME', 'IGNITING THE FIRE', 'KINDLING THE FLAME'],
        'bones': ['CASTING THE BONES', 'GATHERING BONES', 'ARRANGING THE BONES'],
        'feathers': ['FINDING THE FEATHER', 'PLACING THE FEATHER', 'GATHERING FEATHERS'],
        'trinket': ['DISCOVERING THE TRINKET', 'PLACING THE TRINKET', 'FINDING THE TRINKET'],
        'symbol': ['SCRIBING THE SYMBOL', 'DRAWING THE SYMBOL', 'CARVING THE SYMBOL'],
        'book': ['SUMMONING A BOOK', 'OPENING THE BOOK', 'FINDING THE BOOK']
    };
    
    if (subject && messages[subject]) {
        const subjectMessages = messages[subject];
        return subjectMessages[Math.floor(Math.random() * subjectMessages.length)];
    }
    
    // Default messages for random
    const defaultMessages = ['SUMMONING AN OBJECT', 'CALLING FORTH', 'GATHERING PIECES', 'FINDING AN ARTIFACT'];
    return defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
}

async function createSubjectPiece(subject) {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = getSubjectLoadingMessage(subject);
    document.getElementById('canvas').appendChild(loading);
    
    try {
        const fetchTopic = chooseFetchTopic(subject);
        // Fetch a unique image (not used in current composition)
        let imageUrl = null;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!imageUrl && attempts < maxAttempts) {
            const candidateUrl = await fetchWikipediaCommonsImage(fetchTopic);
            
            // Check if this image URL has already been used
            if (!usedImageUrls.has(candidateUrl)) {
                imageUrl = candidateUrl;
                usedImageUrls.add(candidateUrl);
            } else {
                attempts++;
                // Try again with a different category or delay
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        if (!imageUrl) {
            // If we couldn't find a unique image, use fallback
            imageUrl = await fetchFallbackImage();
            usedImageUrls.add(imageUrl);
        }
        
        // Extract subject from image (remove background) - create transparent PNG
        const processedImageUrl = await extractSubjectFromImage(imageUrl);
        
        // Create unique altar piece
        const sizeMultiplier = 1.2;
        const baseWidth = 150 + Math.random() * 100;
        const baseHeight = 150 + Math.random() * 100;
        
        const piece = {
            id: `piece-${Date.now()}-${pieceCounter++}`,
            x: Math.random() * (window.innerWidth - 300) + 100,
            y: Math.random() * (window.innerHeight - 400) + 100,
            width: baseWidth * sizeMultiplier,
            height: baseHeight * sizeMultiplier,
            imageUrl: processedImageUrl || imageUrl, // Use processed transparent PNG or fallback
            originalUrl: imageUrl, // Store original URL for tracking
            rotation: 0, // Keep at 90 degrees (no rotation)
            label: generatePieceLabel()
        };
        
        altarPieces.push(piece);
        renderAltarPiece(piece);
    } catch (error) {
        console.error('Error creating altar piece:', error);
        alert('Failed to generate altar piece. Please try again.');
    } finally {
        loading.remove();
    }
}

async function createAltarCluster() {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'CREATING ALTAR...';
    document.getElementById('canvas').appendChild(loading);
    
    try {
        // Subject-specific objects for altar
        const altarSubjects = ['flame', 'bones', 'feathers', 'symbol', 'trinket', 'smoke', 'book'];
        
        // Number of pieces in the cluster (5-8 pieces)
        const clusterSize = 5 + Math.floor(Math.random() * 4);
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        // Cluster center point - always center of canvas
        const centerX = canvasRect.width / 2;
        const centerY = canvasRect.height / 2;
        
        // Create multiple pieces in a cluster with different scales
        const pieces = [];
        
        for (let i = 0; i < clusterSize; i++) {
            // Select a random subject from altar subjects
            const subject = altarSubjects[Math.floor(Math.random() * altarSubjects.length)];
            
            // Fetch a unique image for this subject
            let imageUrl = null;
            let attempts = 0;
            const maxAttempts = 15;
            
            while (!imageUrl && attempts < maxAttempts) {
                const candidateUrl = await fetchWikipediaCommonsImage(subject);
                
                // Check if this image URL has already been used
                if (!usedImageUrls.has(candidateUrl)) {
                    imageUrl = candidateUrl;
                    usedImageUrls.add(candidateUrl);
                } else {
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            if (!imageUrl) {
                // If we couldn't find a unique image, skip this piece
                continue;
            }
            
            // Extract subject from image (remove background) - create transparent PNG
            const processedImageUrl = await extractSubjectFromImage(imageUrl);
            
            // More scale variation (ranging from small to large)
            const scaleFactor = 0.5 + Math.random() * 1.0; // 0.5 to 1.5x (more variation)
            const baseSize = 100 + Math.random() * 100; // Base size 100-200 (more variation)
            const width = baseSize * scaleFactor;
            const height = baseSize * scaleFactor;
            
            // Position pieces in cluster - some can float away from cluster
            let angle, distance, offsetX, offsetY;
            
            // Decide if this piece should be in cluster or floating (20% chance to float)
            const isFloating = Math.random() < 0.2;
            
            if (isFloating) {
                // Floating piece - closer to cluster, random angle
                angle = Math.random() * Math.PI * 2;
                const avgSize = (width + height) / 2;
                distance = avgSize * (1.0 + Math.random() * 0.8); // 1.0x to 1.8x away (closer)
                offsetX = Math.cos(angle) * distance;
                offsetY = Math.sin(angle) * distance;
            } else {
                // Cluster piece - most images should be mostly visible, don't just stack
                // Use polar coordinates for cluster shape
                angle = (Math.PI * 2 * i) / clusterSize + (Math.random() - 0.5) * 0.5;
                // Distance so pieces are mostly visible with slight overlap (about 10-20% overlap max)
                const avgSize = (width + height) / 2;
                const maxDistance = avgSize * 0.7; // Pieces can be up to 70% of size apart
                distance = Math.random() * maxDistance * 0.6 + avgSize * 0.2; // Minimum 20% of size, up to 60% of max
                offsetX = Math.cos(angle) * distance;
                offsetY = Math.sin(angle) * distance;
            }
            
            // Add some random jitter for organic feel
            const jitterX = (Math.random() - 0.5) * Math.max(width, height) * 0.2;
            const jitterY = (Math.random() - 0.5) * Math.max(width, height) * 0.2;
            
            // Position relative to center, accounting for piece dimensions
            const x = centerX + offsetX + jitterX - width / 2;
            const y = centerY + offsetY + jitterY - height / 2;
            
            // Ensure pieces stay within canvas bounds
            const clampedX = Math.max(0, Math.min(x, canvasRect.width - width));
            const clampedY = Math.max(0, Math.min(y, canvasRect.height - height));
            
            const piece = {
                id: `piece-${Date.now()}-${pieceCounter++}`,
                x: clampedX,
                y: clampedY,
                width: width,
                height: height,
                imageUrl: processedImageUrl || imageUrl,
                originalUrl: imageUrl,
                rotation: 0,
                label: generatePieceLabel()
            };
            
            pieces.push(piece);
        }
        
        // Render all pieces
        pieces.forEach(piece => {
            altarPieces.push(piece);
            renderAltarPiece(piece);
        });
        
    } catch (error) {
        console.error('Error creating altar cluster:', error);
        alert('Failed to generate altar. Please try again.');
    } finally {
        loading.remove();
    }
}

function rearrangeCluster() {
    if (altarPieces.length === 0) {
        alert('No pieces to rearrange.');
        return;
    }
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    // Cluster center point - always center of canvas
    const centerX = canvasRect.width / 2;
    const centerY = canvasRect.height / 2;
    
    // Choose a random arrangement pattern for variety
    const pattern = Math.floor(Math.random() * 4);
    
    // Shuffle pieces array to randomize layering order
    const shuffledPieces = [...altarPieces].sort(() => Math.random() - 0.5);
    
    // Rearrange existing pieces into a new cluster
    shuffledPieces.forEach((piece, i) => {
        const clusterSize = shuffledPieces.length;
        let angle, distance, offsetX, offsetY;
        
        if (pattern === 0) {
            // Pattern 1: Circular with varied spacing - 15% more variety
            angle = (Math.PI * 2 * i) / clusterSize + (Math.random() - 0.5) * 0.9; // Increased from 0.6
            const avgSize = (piece.width + piece.height) / 2;
            const baseDistance = avgSize * (0.3 + Math.random() * 0.7); // Increased range from 0.4-0.9 to 0.3-1.0
            distance = baseDistance;
        } else if (pattern === 1) {
            // Pattern 2: Spiral arrangement - 15% more variety
            const spiralAngle = (Math.PI * 2 * i) / clusterSize + (Math.random() - 0.5) * 0.5; // Added angle variation
            const spiralRadius = (i / clusterSize) * (150 + Math.random() * 100) + 30; // More varied radius
            angle = spiralAngle;
            distance = spiralRadius;
        } else if (pattern === 2) {
            // Pattern 3: Grid-like with offset - 15% more variety
            const cols = Math.ceil(Math.sqrt(clusterSize));
            const row = Math.floor(i / cols);
            const col = i % cols;
            const avgSize = (piece.width + piece.height) / 2;
            const spacing = avgSize * (0.5 + Math.random() * 0.3); // More varied spacing
            offsetX = (col - (cols - 1) / 2) * spacing + (Math.random() - 0.5) * avgSize * 0.45; // Increased from 0.3
            offsetY = (row - (Math.ceil(clusterSize / cols) - 1) / 2) * spacing + (Math.random() - 0.5) * avgSize * 0.45; // Increased from 0.3
            distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
            angle = Math.atan2(offsetY, offsetX);
        } else {
            // Pattern 4: Organic cluster with varied distances - 15% more variety
            angle = (Math.PI * 2 * i) / clusterSize + (Math.random() - 0.5) * 1.2; // Increased from 0.8
            const avgSize = (piece.width + piece.height) / 2;
            const minDist = avgSize * (0.2 + Math.random() * 0.2); // More varied min
            const maxDist = avgSize * (1.0 + Math.random() * 0.4); // More varied max
            distance = minDist + Math.random() * (maxDist - minDist);
        }
        
        if (pattern !== 2) {
            offsetX = Math.cos(angle) * distance;
            offsetY = Math.sin(angle) * distance;
        }
        
        // More scale variation (0.6x to 1.4x of original size) - more variety
        const scaleFactor = 0.6 + Math.random() * 0.8;
        const newWidth = piece.width * scaleFactor;
        const newHeight = piece.height * scaleFactor;
        
        // Add more random jitter for organic feel - 15% more variety
        const jitterX = (Math.random() - 0.5) * Math.max(newWidth, newHeight) * 0.35; // Increased from 0.2
        const jitterY = (Math.random() - 0.5) * Math.max(newWidth, newHeight) * 0.35; // Increased from 0.2
        
        // Decide if this piece should be in cluster or floating (25% chance to float)
        const isFloating = Math.random() < 0.25;
        
        let finalX, finalY;
        if (isFloating) {
            // Floating piece - closer to cluster, don't clamp as tightly
            const floatAngle = Math.random() * Math.PI * 2;
            const avgSize = (newWidth + newHeight) / 2;
            const floatDistance = avgSize * (1.0 + Math.random() * 0.8); // 1.0x to 1.8x away (closer)
            finalX = centerX + Math.cos(floatAngle) * floatDistance - newWidth / 2;
            finalY = centerY + Math.sin(floatAngle) * floatDistance - newHeight / 2;
        } else {
            // Position relative to center, accounting for piece dimensions
            finalX = centerX + offsetX + jitterX - newWidth / 2;
            finalY = centerY + offsetY + jitterY - newHeight / 2;
        }
        
        // Ensure pieces stay within canvas bounds (but allow floating pieces more freedom)
        const clampedX = Math.max(-newWidth * 0.5, Math.min(finalX, canvasRect.width - newWidth * 0.5));
        const clampedY = Math.max(-newHeight * 0.5, Math.min(finalY, canvasRect.height - newHeight * 0.5));
        
        // Update piece position and size
        piece.x = clampedX;
        piece.y = clampedY;
        piece.width = newWidth;
        piece.height = newHeight;
        
        // Update DOM element
        const pieceElement = document.getElementById(piece.id);
        if (pieceElement) {
            pieceElement.style.left = `${piece.x}px`;
            pieceElement.style.top = `${piece.y}px`;
            pieceElement.style.width = `${piece.width}px`;
            pieceElement.style.height = `${piece.height}px`;
            
            // Randomize z-index for layering (pieces behind can come to front)
            const randomZIndex = Math.floor(Math.random() * 1000) + 10;
            pieceElement.style.zIndex = randomZIndex;
        }
    });
}

function generateMantra() {
    const mantras = [
        "The bones remember what the flesh forgets",
        "In the space between breaths, eternity waits",
        "Smoke carries prayers to places words cannot reach",
        "Every flame is a memory of the first fire",
        "Feathers fall where angels fear to tread",
        "The bell tolls for no one and everyone",
        "Candles burn backwards through time",
        "Symbols dream themselves into existence",
        "The book writes itself in reverse",
        "Trinkets hold more power than crowns",
        "The plinth elevates nothing to everything",
        "Pedestals crumble under the weight of meaning",
        "Flowers bloom in the absence of light",
        "The altar remembers every hand that touched it",
        "Silence speaks louder than all mantras",
        "Dust motes dance in sacred geometry",
        "The void between objects holds the truth",
        "Ritual is memory made manifest",
        "Each object is a door to another world",
        "The space around things defines them",
        "Time folds around sacred objects",
        "The unseen binds the seen together",
        "Matter dreams of becoming spirit",
        "The threshold between worlds is thin",
        "Objects outlive their makers",
        "The ritual writes itself in fire",
        "Every surface reflects another dimension",
        "The altar is a map of the invisible",
        "Gravity bends around sacred spaces",
        "The past and future meet at the altar",
        "Objects accumulate meaning like dust",
        "The ritual is the space between actions",
        "Each piece is a fragment of the whole",
        "The altar breathes when no one watches",
        "Time slows in the presence of the sacred",
        "Objects remember their first purpose",
        "The ritual exists in the gaps",
        "Every arrangement is a prayer",
        "The altar is a window to elsewhere",
        "Objects speak in the language of absence",
        "The ritual is never the same twice",
        "Each placement alters the universe",
        "The altar collects moments like a magnet",
        "Objects resonate with forgotten frequencies",
        "The ritual is a conversation with the void",
        "Every altar is a temporary universe",
        "Objects cast shadows in other dimensions",
        "The ritual is the space between breaths",
        "Each piece is a question without an answer",
        "The altar is a map of the impossible",
        "Objects hold the memory of their making",
        "The ritual is a bridge to nowhere",
        "Every arrangement is a temporary truth",
        "The altar is a mirror of the mind",
        "Objects exist in multiple states simultaneously",
        "The ritual is the pause between thoughts",
        "Each piece is a key to a locked door",
        "The altar is a portal to the in-between",
        "Objects dream of their own destruction",
        "The ritual is the silence between words",
        "Every altar is a question posed to the void",
        "The altar is a map of the unspoken"
    ];
    
    return mantras[Math.floor(Math.random() * mantras.length)];
}

function addMantra() {
    // Remove existing mantra if it exists
    const existingMantra = document.getElementById('mantra-text');
    if (existingMantra) {
        existingMantra.remove();
    }
    
    // Generate single mantra phrase
    const mantraText = generateMantra();
    currentMantra = mantraText.toUpperCase();
    
    // Create mantra text element
    const mantraElement = document.createElement('div');
    mantraElement.id = 'mantra-text';
    mantraElement.className = 'mantra-text';
    mantraElement.textContent = currentMantra;
    
    // Add to content wrapper so it scales with zoom/pan
    const canvas = document.getElementById('canvas');
    let contentWrapper = document.getElementById('canvas-content');
    if (!contentWrapper) {
        initializeContentWrapper();
        contentWrapper = document.getElementById('canvas-content');
    }
    contentWrapper.appendChild(mantraElement);
}

let ceremonyActive = false;
let ceremonyInterval = null;
let ceremonyTime = 0; // Track time for smooth rotation
let imageFlash = null; // Image flash overlay element
let lastImageFlashTime = 0; // Track last image flash

function startCeremony() {
    const ceremonyButton = document.getElementById('ceremony');
    if (ceremonyActive) {
        // Stop ceremony
        ceremonyActive = false;
        ceremonyTime = 0;
        lastImageFlashTime = 0;
        if (ceremonyInterval) {
            clearInterval(ceremonyInterval);
            ceremonyInterval = null;
        }
        if (imageFlash) {
            imageFlash.remove();
            imageFlash = null;
        }
        // Reset all pieces to smaller resting circle
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const centerX = canvasRect.width / 2;
        const centerY = canvasRect.height / 2;
        
        altarPieces.forEach((piece, i) => {
            const pieceElement = document.getElementById(piece.id);
            if (pieceElement) {
                const angle = (Math.PI * 2 * i) / altarPieces.length;
                const radius = Math.min(canvasRect.width, canvasRect.height) * 0.26; // Smaller resting circle
                const x = centerX + Math.cos(angle) * radius - piece.width / 2;
                const y = centerY + Math.sin(angle) * radius - piece.height / 2;
                
                piece.x = x;
                piece.y = y;
                pieceElement.style.transition = 'all 2s ease';
                pieceElement.style.left = `${x}px`;
                pieceElement.style.top = `${y}px`;
                pieceElement.style.transform = '';
                pieceElement.style.filter = '';
            }
        });
        
        // Reset mantra
        const mantraElement = document.getElementById('mantra-text');
        if (mantraElement) {
            mantraElement.style.transition = 'all 2s ease';
            mantraElement.style.transform = 'translate(-50%, -50%)';
            mantraElement.style.opacity = '1';
            mantraElement.style.filter = '';
            mantraElement.style.textShadow = '';
        }
        
        // Reset grid - fade back in
        const gridOverlay = document.querySelector('.grid-overlay');
        if (gridOverlay) {
            gridOverlay.style.transition = 'opacity 3s ease';
            gridOverlay.style.opacity = '1';
        }
        
        if (ceremonyButton) {
            ceremonyButton.classList.remove('is-active');
            ceremonyButton.blur();
        }
        
        return;
    }
    
    // Start ceremony - slow and ominous ritual
    ceremonyActive = true;
    ceremonyTime = 0;
    lastImageFlashTime = 0;
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const centerX = canvasRect.width / 2;
    const centerY = canvasRect.height / 2;
    
    // Create image flash overlay
    imageFlash = document.createElement('div');
    imageFlash.style.position = 'fixed';
    imageFlash.style.top = '0';
    imageFlash.style.left = '0';
    imageFlash.style.width = '100%';
    imageFlash.style.height = '100%';
    imageFlash.style.pointerEvents = 'none';
    imageFlash.style.zIndex = '9998';
    imageFlash.style.display = 'none';
    imageFlash.style.backgroundSize = 'cover';
    imageFlash.style.backgroundPosition = 'center';
    imageFlash.style.opacity = '0';
    imageFlash.style.transition = 'none'; // Sharp blink, no easing
    document.body.appendChild(imageFlash);
    
    // Fade out grid smoothly
    const gridOverlay = document.querySelector('.grid-overlay');
    if (gridOverlay) {
        gridOverlay.style.transition = 'opacity 3s ease';
        gridOverlay.style.opacity = '0';
    }
    
    if (ceremonyButton) {
        ceremonyButton.classList.add('is-active');
    }
    
    // Arrange pieces in a circle initially - 35% smaller resting size
    altarPieces.forEach((piece, i) => {
        const pieceElement = document.getElementById(piece.id);
        if (pieceElement) {
            const angle = (Math.PI * 2 * i) / altarPieces.length;
            const radius = Math.min(canvasRect.width, canvasRect.height) * 0.26; // 35% smaller (0.4 * 0.65)
            const x = centerX + Math.cos(angle) * radius - piece.width / 2;
            const y = centerY + Math.sin(angle) * radius - piece.height / 2;
            
            piece.x = x;
            piece.y = y;
            pieceElement.style.transition = 'all 3s ease';
            pieceElement.style.left = `${x}px`;
            pieceElement.style.top = `${y}px`;
        }
    });
    
    // Continuous slow, ominous animation loop
    ceremonyInterval = setInterval(() => {
        ceremonyTime += 0.035; // Speed up ceremony (was 0.022)
        
        // Flash images from altar pieces - slowed down by 50%
        const timeSinceLastImageFlash = ceremonyTime - lastImageFlashTime;
        if (altarPieces.length > 0 && timeSinceLastImageFlash > 0.8 && Math.random() < 0.12) { // Slower: 0.8s cooldown (was 0.4s), 12% chance
            lastImageFlashTime = ceremonyTime;
            const randomPiece = altarPieces[Math.floor(Math.random() * altarPieces.length)];
            imageFlash.style.backgroundImage = `url(${randomPiece.imageUrl})`;
            imageFlash.style.display = 'block';
            imageFlash.style.opacity = '0.8';
            setTimeout(() => {
                if (imageFlash) {
                    imageFlash.style.opacity = '0';
                    setTimeout(() => {
                        if (imageFlash) {
                            imageFlash.style.display = 'none';
                        }
                    }, 30);
                }
            }, 30);
        }
        
        altarPieces.forEach((piece, i) => {
            const pieceElement = document.getElementById(piece.id);
            if (pieceElement) {
                // Calculate position on rotating circle - larger during motion
                const angle = (Math.PI * 2 * i) / altarPieces.length + ceremonyTime;
                const radius = Math.min(canvasRect.width, canvasRect.height) * 0.55; // Larger circle during animation
                const x = centerX + Math.cos(angle) * radius - piece.width / 2;
                const y = centerY + Math.sin(angle) * radius - piece.height / 2;
                
                // Rotation speed kept the same
                const rotation = ceremonyTime * 10 + i * 10;
                // Subtle breathing scale
                const scale = 0.95 + Math.sin(ceremonyTime * 0.3 + i) * 0.05;
                // Ominous desaturation
                const saturation = 30 + Math.sin(ceremonyTime * 0.4) * 10;
                const brightness = 60 + Math.sin(ceremonyTime * 0.5) * 15;
                
                pieceElement.style.transition = 'all 3s ease';
                pieceElement.style.left = `${x}px`;
                pieceElement.style.top = `${y}px`;
                pieceElement.style.transform = `rotate(${rotation}deg) scale(${scale})`;
                pieceElement.style.filter = `grayscale(${50 + Math.sin(ceremonyTime * 0.2) * 20}%) saturate(${saturation}%) brightness(${brightness}%)`;
            }
        });
        
        // Animate mantra if it exists - glitchy, ghostly blurring effect
        const mantraElement = document.getElementById('mantra-text');
        if (mantraElement) {
            const mantraScale = 1.0 + Math.sin(ceremonyTime * 0.2) * 0.05;
            const mantraOpacity = 0.6 + Math.sin(ceremonyTime * 0.3) * 0.2; // More ghostly (lower base opacity)
            
            // Random glitchy blur effect
            const blurAmount = Math.random() * 3 + Math.sin(ceremonyTime * 2) * 1; // 0-4px blur with variation
            const blurX = (Math.random() - 0.5) * 2; // Random horizontal offset
            const blurY = (Math.random() - 0.5) * 2; // Random vertical offset
            
            mantraElement.style.transition = 'none'; // No transition for glitchy effect
            mantraElement.style.transform = `translate(calc(-50% + ${blurX}px), calc(-50% + ${blurY}px)) scale(${mantraScale})`;
            mantraElement.style.opacity = mantraOpacity;
            mantraElement.style.filter = `blur(${blurAmount}px)`;
            mantraElement.style.textShadow = `${blurX * 2}px ${blurY * 2}px ${blurAmount * 2}px rgba(255, 255, 255, 0.3)`;
        }
    }, 50); // Update every 50ms for faster animation (was 100ms)
}

const OPENVERSE_DEFAULT_TOPICS = [
    'ritual art',
    'ancient sculpture',
    'mythic symbol',
    'sacred geometry',
    'museum artifact',
    'cosmic illustration',
    'botanical engraving',
    'alchemy diagram',
    'ancestral mask',
    'ethereal landscape'
];

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function fetchOpenverseMedia(subject = null, options = {}) {
    const { extensions = [] } = options;
    const queries = subject
        ? [subject, `${subject} artifact`, `${subject} illustration`]
        : OPENVERSE_DEFAULT_TOPICS;
    
    const shuffledQueries = shuffleArray(queries);
    
    for (const query of shuffledQueries) {
        try {
            const params = new URLSearchParams({
                q: query,
                page_size: '40',
                license: 'cc0,cc-by,cc-by-sa,cc-by-nd,cc-by-nc,cc-by-nc-sa,cc-by-nc-nd',
                ordering: 'relevance'
            });
            
            if (extensions.length > 0) {
                params.set('extension', extensions.join(','));
            } else {
                params.set('extension', 'jpg,png,jpeg,gif,webp');
            }
            
            const response = await fetch(`https://api.openverse.engineering/v1/images/?${params.toString()}`);
            if (!response.ok) continue;
            
            const data = await response.json();
            if (!data.results || data.results.length === 0) continue;
            
            const shuffledResults = shuffleArray(data.results);
            
            for (const result of shuffledResults) {
                const candidateUrl = result?.url || result?.thumbnail;
                if (!candidateUrl) continue;
                if (usedImageUrls.has(candidateUrl)) continue;
                
                try {
                    const headResponse = await fetch(candidateUrl, { method: 'HEAD' });
                    if (!headResponse.ok) continue;
                } catch (e) {
                    continue;
                }
                
                return candidateUrl;
            }
        } catch (error) {
            console.error('Openverse fetch error:', error);
            continue;
        }
    }
    
    return null;
}

async function fetchLibraryOfCongressMedia(subject = null) {
    const queries = subject
        ? [subject, `${subject} artifact`, `${subject} illustration`]
        : ['ritual object', 'museum artifact', 'mythic figure'];
    const shuffledQueries = shuffleArray(queries);
    
    for (const query of shuffledQueries) {
        try {
            const url = `https://www.loc.gov/search/?q=${encodeURIComponent(query)}&fo=json&c=75&fa=online-format:image`;
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            if (!data.results || data.results.length === 0) continue;
            
            const shuffledResults = shuffleArray(data.results);
            for (const result of shuffledResults) {
                if (!result.image_url || result.image_url.length === 0) continue;
                const candidateUrl = result.image_url[0];
                if (!candidateUrl || usedImageUrls.has(candidateUrl)) continue;
                try {
                    const headResp = await fetch(candidateUrl, { method: 'HEAD' });
                    if (!headResp.ok) continue;
                    return candidateUrl;
                } catch (e) {
                    continue;
                }
            }
        } catch (error) {
            console.error('Library of Congress fetch error:', error);
            continue;
        }
    }
    
    return null;
}

async function fetchNasaMedia(subject = null) {
    const queries = subject
        ? [subject, `${subject} space`, `${subject} nebula`]
        : ['cosmic ritual', 'starlight', 'constellation art'];
    const shuffledQueries = shuffleArray(queries);
    
    for (const query of shuffledQueries) {
        try {
            const apiUrl = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
            const response = await fetch(apiUrl);
            if (!response.ok) continue;
            const data = await response.json();
            const items = data?.collection?.items || [];
            if (items.length === 0) continue;
            
            const shuffledItems = shuffleArray(items);
            for (const item of shuffledItems) {
                const link = item.links?.find(l => l.href);
                const candidateUrl = link?.href;
                if (!candidateUrl || usedImageUrls.has(candidateUrl)) continue;
                try {
                    const headResp = await fetch(candidateUrl, { method: 'HEAD' });
                    if (!headResp.ok) continue;
                    return candidateUrl;
                } catch (e) {
                    continue;
                }
            }
        } catch (error) {
            console.error('NASA media fetch error:', error);
            continue;
        }
    }
    
    return null;
}

async function fetchInternetArchiveMedia(subject = null) {
    const query = subject ? `${subject}` : 'ritual';
    try {
        const apiUrl = `https://archive.org/advancedsearch.php?q=mediatype:(image)+AND+(${encodeURIComponent(query)})&fl[]=identifier&output=json&rows=60`;
        const response = await fetch(apiUrl);
        if (!response.ok) return null;
        const data = await response.json();
        const docs = data?.response?.docs || [];
        if (docs.length === 0) return null;
        
        const shuffledDocs = shuffleArray(docs);
        for (const doc of shuffledDocs) {
            const identifier = doc.identifier;
            if (!identifier) continue;
            const candidateUrl = `https://archive.org/services/img/${identifier}`;
            if (usedImageUrls.has(candidateUrl)) continue;
            try {
                const headResp = await fetch(candidateUrl, { method: 'HEAD' });
                if (!headResp.ok) continue;
                return candidateUrl;
            } catch (e) {
                continue;
            }
        }
    } catch (error) {
        console.error('Internet Archive fetch error:', error);
    }
    
    return null;
}

async function fetchWikipediaCommonsImage(subject = null) {
    // If subject is specified, search for that specific subject
    if (subject) {
        const subjectCategories = getSubjectCategories(subject);
        
        for (const category of subjectCategories) {
            try {
                const apiResponse = await fetch(
                    `https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:${category}&gcmlimit=200&prop=imageinfo&iiprop=url|dimensions&iiurlwidth=600&format=json&origin=*`
                );
                
                const data = await apiResponse.json();
                
                if (data.query && data.query.pages) {
                    const pages = Object.values(data.query.pages).filter(page => 
                        page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url
                    );
                    
                    if (pages.length > 0) {
                        const shuffledPages = [...pages].sort(() => Math.random() - 0.5);
                        
                        for (const page of shuffledPages) {
                            const thumbUrl = page.imageinfo[0].thumburl || page.imageinfo[0].url;
                            
                            if (usedImageUrls.has(thumbUrl)) {
                                continue;
                            }
                            
                            try {
                                const testResponse = await fetch(thumbUrl, { method: 'HEAD' });
                                if (testResponse.ok) {
                                    return thumbUrl;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error fetching from category ${category}:`, error);
                continue;
            }
        }
        
        // If subject-specific search fails, try search API
        try {
            const searchResponse = await fetch(
                `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(subject)}&gsrnamespace=6&gsrlimit=50&prop=imageinfo&iiprop=url|dimensions&iiurlwidth=600&format=json&origin=*`
            );
            
            const searchData = await searchResponse.json();
            
            if (searchData.query && searchData.query.pages) {
                const pages = Object.values(searchData.query.pages).filter(page => 
                    page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url
                );
                
                if (pages.length > 0) {
                    const shuffledPages = [...pages].sort(() => Math.random() - 0.5);
                    
                    for (const page of shuffledPages) {
                        const thumbUrl = page.imageinfo[0].thumburl || page.imageinfo[0].url;
                        
                        if (usedImageUrls.has(thumbUrl)) {
                            continue;
                        }
                        
                        try {
                            const testResponse = await fetch(thumbUrl, { method: 'HEAD' });
                            if (testResponse.ok) {
                                return thumbUrl;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error searching for ${subject}:`, error);
        }
    }
    
    // Default: Curated list of Commons categories for museum/altar-relevant imagery
    const categories = [
        'Religious_art',
        'Sculptures',
        'Ancient_art',
        'Religious_symbols',
        'Religious_objects',
        'Museum_objects',
        'Antiquities',
        'Ritual_objects',
        'Sacred_art',
        'Icons',
        'Religious_architecture',
        'Mythological_figures',
        'Art_in_museums',
        'Historical_artifacts',
        'Archaeological_artifacts',
        'Medieval_art'
    ];
    
    // Try multiple categories to find a unique image
    const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);
    
    for (const category of shuffledCategories) {
        try {
            // Use Wikimedia Commons API to fetch images from category
            // Increase limit to get more variety
            const apiResponse = await fetch(
                `https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:${category}&gcmlimit=200&prop=imageinfo&iiprop=url|dimensions&iiurlwidth=600&format=json&origin=*`
            );
            
            const data = await apiResponse.json();
            
            if (data.query && data.query.pages) {
                const pages = Object.values(data.query.pages).filter(page => 
                    page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url
                );
                
                if (pages.length > 0) {
                    // Shuffle pages to get random selection
                    const shuffledPages = [...pages].sort(() => Math.random() - 0.5);
                    
                    for (const page of shuffledPages) {
                        const thumbUrl = page.imageinfo[0].thumburl || page.imageinfo[0].url;
                        
                        // Skip if already used
                        if (usedImageUrls.has(thumbUrl)) {
                            continue;
                        }
                        
                        // Verify the URL is accessible
                        try {
                            const testResponse = await fetch(thumbUrl, { method: 'HEAD' });
                            if (testResponse.ok) {
                                return thumbUrl;
                            }
                        } catch (e) {
                            // Continue to next image
                            continue;
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error fetching from category ${category}:`, error);
            continue;
        }
    }
    
    // Try Library of Congress
    try {
        const locImage = await fetchLibraryOfCongressMedia(subject);
        if (locImage) {
            return locImage;
        }
    } catch (error) {
        console.error('Library of Congress fallback error:', error);
    }
    
    // Try Openverse still imagery
    try {
        const openverseImage = await fetchOpenverseMedia(subject);
        if (openverseImage) {
            return openverseImage;
        }
    } catch (error) {
        console.error('Openverse image fetch error:', error);
    }
    
    // Try Openverse GIFs for more variety
    try {
        const openverseGif = await fetchOpenverseMedia(subject, { extensions: ['gif'] });
        if (openverseGif) {
            return openverseGif;
        }
    } catch (error) {
        console.error('Openverse gif fetch error:', error);
    }
    
    // Try NASA imagery
    try {
        const nasaImage = await fetchNasaMedia(subject);
        if (nasaImage) {
            return nasaImage;
        }
    } catch (error) {
        console.error('NASA fallback error:', error);
    }
    
    // Try Internet Archive imagery
    try {
        const archiveImage = await fetchInternetArchiveMedia(subject);
        if (archiveImage) {
            return archiveImage;
        }
    } catch (error) {
        console.error('Internet Archive fallback error:', error);
    }
    
    // Fallback: use alternative image source
    return await fetchFallbackImage();
}

function getSubjectCategories(subject) {
    const subjectMap = {
        'bell': ['Bells', 'Church_bells', 'Temple_bells', 'Ritual_bells', 'Musical_instruments'],
        'candle': ['Candles', 'Religious_candles', 'Candlesticks', 'Altar_candles', 'Liturgical_objects'],
        'plinth': ['Plinths', 'Pedestals', 'Sculpture_bases', 'Architectural_elements'],
        'pedestal': ['Pedestals', 'Sculpture_bases', 'Columns', 'Architectural_elements'],
        'flowers': ['Flowers', 'Religious_flowers', 'Floral_arrangements', 'Botanical_illustrations'],
        'smoke': ['Smoke', 'Incense', 'Ritual_smoke', 'Religious_ceremonies'],
        'flame': ['Flames', 'Fire', 'Candles', 'Torches', 'Religious_fire'],
        'bones': ['Bones', 'Skeletons', 'Religious_relics', 'Archaeological_finds'],
        'feathers': ['Feathers', 'Birds', 'Ritual_objects', 'Indigenous_art'],
        'trinket': ['Trinkets', 'Small_objects', 'Religious_objects', 'Artifacts', 'Jewelry'],
        'symbol': ['Religious_symbols', 'Symbols', 'Icons', 'Sacred_symbols', 'Mystical_symbols'],
        'book': ['Books', 'Religious_books', 'Manuscripts', 'Sacred_texts', 'Ancient_manuscripts']
    };
    
    return subjectMap[subject] || [];
}

async function fetchFallbackImage() {
    // Fallback: Use Lorem Picsum with unique seeds for variety
    // Each piece gets a unique image based on timestamp and random number
    const seed = Date.now() + Math.random() * 10000;
    return `https://picsum.photos/seed/${Math.floor(seed)}/400/400`;
}

async function extractSubjectFromImage(imageUrl) {
    try {
        // Use Remove.bg API for perfect background removal
        // Note: You can get a free API key from https://www.remove.bg/api
        // For now, we'll use a free alternative approach
        return await removeBackground(imageUrl);
    } catch (error) {
        console.error('Subject extraction error:', error);
        return null;
    }
}

async function removeBackground(imageUrl) {
    // Option 1: Use Remove.bg API (requires API key)
    // Uncomment and add your API key if you have one
    /*
    const REMOVE_BG_API_KEY = 'YOUR_API_KEY_HERE';
    if (REMOVE_BG_API_KEY && REMOVE_BG_API_KEY !== 'YOUR_API_KEY_HERE') {
        try {
            const response = await fetch('https://api.remove.bg/v1.0/removebg', {
                method: 'POST',
                headers: {
                    'X-Api-Key': REMOVE_BG_API_KEY,
                },
                body: JSON.stringify({
                    image_url: imageUrl,
                    size: 'regular'
                })
            });
            
            if (response.ok) {
                const blob = await response.blob();
                return URL.createObjectURL(blob);
            }
        } catch (error) {
            console.error('Remove.bg API error:', error);
        }
    }
    */
    
    // Option 2: Use a free background removal service
    // Try using remove.bg's free service via proxy
    try {
        return await removeBackgroundFree(imageUrl);
    } catch (error) {
        console.error('Free background removal error:', error);
        // Fallback to advanced algorithm
        return await removeBackgroundAdvanced(imageUrl);
    }
}

async function removeBackgroundFree(imageUrl) {
    // Use a free background removal API
    // We'll use the clipdrop API or similar free service
    // For now, use an advanced algorithm that works client-side
    return await removeBackgroundAdvanced(imageUrl);
}

async function removeBackgroundAdvanced(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = async function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Limit canvas size for performance (but keep it larger for better quality)
                const maxSize = 1200;
                let width = img.width;
                let height = img.height;
                
                if (width > maxSize || height > maxSize) {
                    const scale = maxSize / Math.max(width, height);
                    width = Math.floor(width * scale);
                    height = Math.floor(height * scale);
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                let imageData;
                try {
                    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                } catch (e) {
                    // CORS error - can't read pixel data
                    // Return original image URL as fallback
                    console.warn('CORS error: Cannot process image. Using original.');
                    resolve(null);
                    return;
                }
                
                // Use advanced background removal algorithm
                const processedData = await processImageForBackgroundRemoval(imageData);
                
                ctx.putImageData(processedData, 0, 0);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        resolve(url);
                    } else {
                        resolve(null);
                    }
                }, 'image/png');
            } catch (error) {
                console.error('Advanced background removal error:', error);
                resolve(null);
            }
        };
        
        img.onerror = function() {
            resolve(null);
        };
        
        img.src = imageUrl;
    });
}

async function processImageForBackgroundRemoval(imageData) {
    const data = new Uint8ClampedArray(imageData.data);
    const width = imageData.width;
    const height = imageData.height;
    
    // Create a mask to identify background vs foreground
    // Strategy: Use edge detection and color clustering to identify the main subject
    
    // Step 1: Detect edges
    const edges = detectEdges(imageData);
    
    // Step 2: Use GrabCut-like algorithm or edge-based segmentation
    // For simplicity, we'll use a combination of:
    // - Edge detection
    // - Color distance from corners (assuming corners are background)
    // - Flood fill from edges
    
    const mask = createSubjectMask(imageData, edges);
    
    // Step 3: Apply mask with interesting edge variations
    for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);
        const maskValue = mask[y * width + x];
        
        if (maskValue < 0.05) {
            // Fully transparent background
            data[i + 3] = 0;
        } else {
            // Keep subject - use mask value directly for interesting edge transitions
            // Add some organic edge variation
            const edgeVariation = Math.sin(x * 0.2) * Math.cos(y * 0.2) * 0.05;
            const finalMaskValue = Math.max(0, Math.min(1, maskValue + edgeVariation));
            data[i + 3] = Math.floor(data[i + 3] * finalMaskValue);
        }
    }
    
    imageData.data.set(data);
    return imageData;
}

function detectEdges(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const edges = new Array(width * height).fill(0);
    
    // Sobel edge detection
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0, gy = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                    
                    gx += gray * sobelX[ky + 1][kx + 1];
                    gy += gray * sobelY[ky + 1][kx + 1];
                }
            }
            
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            edges[y * width + x] = magnitude;
        }
    }
    
    return edges;
}

function createSubjectMask(imageData, edges) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const mask = new Array(width * height).fill(0);
    
    // Strategy: Identify background by analyzing corners and edges
    // Use improved algorithm that considers edge density and color clustering
    
    // Sample corner colors (assuming corners are typically background)
    const cornerRegions = [
        { x1: 0, y1: 0, x2: width * 0.15, y2: height * 0.15 }, // top-left
        { x1: width * 0.85, y1: 0, x2: width, y2: height * 0.15 }, // top-right
        { x1: 0, y1: height * 0.85, x2: width * 0.15, y2: height }, // bottom-left
        { x1: width * 0.85, y1: height * 0.85, x2: width, y2: height } // bottom-right
    ];
    
    const cornerSamples = cornerRegions.map(region => 
        getAverageColor(data, width, height, region.x1, region.y1, region.x2, region.y2)
    );
    
    const avgBackground = getAverageOfColors(cornerSamples);
    
    // Calculate edge density map for better subject detection
    const edgeDensity = calculateEdgeDensity(edges, width, height, 5);
    
    // Create mask based on color distance from background and edge strength
    // Use adaptive threshold based on image statistics
    const colorDistances = [];
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const dist = Math.sqrt(
            Math.pow(r - avgBackground.r, 2) +
            Math.pow(g - avgBackground.g, 2) +
            Math.pow(b - avgBackground.b, 2)
        );
        colorDistances.push(dist);
    }
    
    // Calculate adaptive threshold (use median + standard deviation)
    colorDistances.sort((a, b) => a - b);
    const median = colorDistances[Math.floor(colorDistances.length / 2)];
    const mean = colorDistances.reduce((a, b) => a + b, 0) / colorDistances.length;
    const variance = colorDistances.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / colorDistances.length;
    const stdDev = Math.sqrt(variance);
    
    const threshold = Math.max(25, Math.min(50, median + stdDev * 0.5));
    const edgeThreshold = 40; // Lower edge threshold for better detection
    
    // First pass: identify subject pixels
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const pixelIdx = y * width + x;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            
            // Calculate color distance from background
            const colorDist = Math.sqrt(
                Math.pow(r - avgBackground.r, 2) +
                Math.pow(g - avgBackground.g, 2) +
                Math.pow(b - avgBackground.b, 2)
            );
            
            // Check if pixel is likely subject
            const edgeStrength = edges[pixelIdx];
            const density = edgeDensity[pixelIdx];
            const isStrongEdge = edgeStrength > edgeThreshold;
            const isForeground = colorDist > threshold;
            const isHighEdgeDensity = density > 0.3; // Areas with many edges are likely subject
            
            // Combine multiple signals for better detection
            let confidence = 0;
            if (isForeground) confidence += 0.4;
            if (isStrongEdge) confidence += 0.35;
            if (isHighEdgeDensity) confidence += 0.25;
            
            // Also check if pixel is in center region (more likely to be subject)
            const centerX = width / 2;
            const centerY = height / 2;
            const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
            
            // Create more interesting organic shapes - vary the center bias
            // Use multiple center points or irregular shapes
            const centerBias = 1 - (distFromCenter / maxDist) * 0.4;
            
            // Add some organic variation based on position
            const organicNoise = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.1;
            confidence = (confidence + organicNoise) * centerBias;
            
            // Create threshold with some fuzziness for interesting edges
            if (confidence > 0.4) {
                // Subject area - but allow some variation
                const variation = (Math.sin(x * 0.1 + y * 0.07) + 1) * 0.1;
                confidence = Math.min(1, confidence + variation);
            }
            
            mask[pixelIdx] = Math.max(0, Math.min(1, confidence));
        }
    }
    
    // Second pass: region growing - expand subject areas
    for (let pass = 0; pass < 2; pass++) {
        const newMask = new Array(width * height);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const pixelIdx = y * width + x;
                const currentConfidence = mask[pixelIdx];
                
                // Check neighbors
                let neighborConfidence = 0;
                let neighborCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        const nIdx = ny * width + nx;
                        neighborConfidence += mask[nIdx];
                        neighborCount++;
                    }
                }
                
                const avgNeighborConfidence = neighborConfidence / neighborCount;
                
                // If neighbors are mostly subject, this pixel might be too
                if (avgNeighborConfidence > 0.6 && currentConfidence < 0.5) {
                    newMask[pixelIdx] = Math.min(1, currentConfidence + 0.3);
                } else if (avgNeighborConfidence < 0.3 && currentConfidence > 0.5) {
                    // If neighbors are mostly background, this might be background too
                    newMask[pixelIdx] = Math.max(0, currentConfidence - 0.2);
                } else {
                    newMask[pixelIdx] = currentConfidence;
                }
            }
        }
        // Copy borders
        for (let y = 0; y < height; y++) {
            newMask[y * width] = mask[y * width];
            newMask[y * width + width - 1] = mask[y * width + width - 1];
        }
        for (let x = 0; x < width; x++) {
            newMask[x] = mask[x];
            newMask[(height - 1) * width + x] = mask[(height - 1) * width + x];
        }
        mask = newMask;
    }
    
    // Apply morphological operations to clean up the mask
    const cleanedMask = cleanMask(mask, width, height);
    
    // Add feathering for smooth edges
    return featherMask(cleanedMask, width, height, 2);
}

function getAverageColor(data, width, height, x1, y1, x2, y2) {
    let r = 0, g = 0, b = 0, count = 0;
    
    for (let y = Math.floor(y1); y < Math.floor(y2) && y < height; y++) {
        for (let x = Math.floor(x1); x < Math.floor(x2) && x < width; x++) {
            const idx = (y * width + x) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
        }
    }
    
    return {
        r: count > 0 ? r / count : 0,
        g: count > 0 ? g / count : 0,
        b: count > 0 ? b / count : 0
    };
}

function getAverageOfColors(colors) {
    let r = 0, g = 0, b = 0;
    for (const color of colors) {
        r += color.r;
        g += color.g;
        b += color.b;
    }
    return {
        r: r / colors.length,
        g: g / colors.length,
        b: b / colors.length
    };
}

function calculateEdgeDensity(edges, width, height, radius) {
    const density = new Array(width * height).fill(0);
    
    for (let y = radius; y < height - radius; y++) {
        for (let x = radius; x < width - radius; x++) {
            let edgeCount = 0;
            let total = 0;
            
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (edges[ny * width + nx] > 30) {
                        edgeCount++;
                    }
                    total++;
                }
            }
            
            density[y * width + x] = edgeCount / total;
        }
    }
    
    return density;
}

function cleanMask(mask, width, height) {
    // Apply erosion and dilation to clean up noise
    const cleaned = new Array(width * height);
    
    // Erosion (remove small isolated pixels) - only apply to low-confidence areas
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] < 0.5) {
                // For background areas, use erosion
                let min = 1;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        min = Math.min(min, mask[(y + dy) * width + (x + dx)]);
                    }
                }
                cleaned[idx] = min;
            } else {
                cleaned[idx] = mask[idx];
            }
        }
    }
    
    // Dilation (fill small holes) - only apply to high-confidence areas
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (cleaned[idx] > 0.5) {
                // For subject areas, use dilation
                let max = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        max = Math.max(max, cleaned[(y + dy) * width + (x + dx)]);
                    }
                }
                mask[idx] = max;
            } else {
                mask[idx] = cleaned[idx];
            }
        }
    }
    
    // Copy borders
    for (let y = 0; y < height; y++) {
        mask[y * width] = cleaned[y * width];
        mask[y * width + width - 1] = cleaned[y * width + width - 1];
    }
    for (let x = 0; x < width; x++) {
        mask[x] = cleaned[x];
        mask[(height - 1) * width + x] = cleaned[(height - 1) * width + x];
    }
    
    return mask;
}

function featherMask(mask, width, height, radius) {
    const feathered = new Array(width * height);
    
    // Create more interesting, organic edge feathering
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const centerValue = mask[y * width + x];
            const idx = y * width + x;
            
            if (centerValue > 0.85) {
                // Definitely subject - but add slight variation for interest
                const variation = Math.sin(x * 0.15 + y * 0.12) * 0.05;
                feathered[idx] = Math.min(1, centerValue + variation);
            } else if (centerValue < 0.15) {
                // Definitely background
                feathered[idx] = 0;
            } else {
                // Edge region - create organic feathering
                // Use distance-based feathering with noise for interesting shapes
                let minDistToEdge = radius;
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const neighborValue = mask[ny * width + nx];
                            if ((centerValue > 0.5 && neighborValue < 0.5) ||
                                (centerValue < 0.5 && neighborValue > 0.5)) {
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                minDistToEdge = Math.min(minDistToEdge, dist);
                            }
                        }
                    }
                }
                
                // Add organic variation to edge feathering
                const organicVar = (Math.sin(x * 0.2) * Math.cos(y * 0.18) + 1) * 0.1;
                const distFactor = minDistToEdge / radius;
                
                if (centerValue > 0.5) {
                    // Subject edge
                    const baseValue = 0.5 + distFactor * 0.4;
                    feathered[idx] = Math.min(1, baseValue + organicVar);
                } else {
                    // Background edge
                    const baseValue = 0.5 - distFactor * 0.4;
                    feathered[idx] = Math.max(0, baseValue - organicVar);
                }
            }
        }
    }
    
    return feathered;
}

function generatePieceLabel() {
    objectLabelCounter++;
    return `ALTAR OBJECT ${objectLabelCounter}`;
}

function renderAltarPiece(piece) {
    const canvas = document.getElementById('canvas');
    
    const pieceElement = document.createElement('div');
    pieceElement.className = 'altar-piece';
    pieceElement.id = piece.id;
    pieceElement.style.left = `${piece.x}px`;
    pieceElement.style.top = `${piece.y}px`;
    pieceElement.style.width = `${piece.width}px`;
    pieceElement.style.height = `${piece.height}px`;
    // No rotation - keep at 90 degrees
    pieceElement.style.willChange = 'left, top';
    pieceElement.style.transition = 'none'; // No transition during drag
    
    
    const img = document.createElement('img');
    img.src = piece.imageUrl;
    img.alt = piece.label;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    
    // Apply saved mask shape if it exists
    if (piece.maskShape) {
        img.style.clipPath = piece.maskShape;
        img.style.webkitClipPath = piece.maskShape;
    }
    
    img.onerror = function() {
        // If image fails to load, show placeholder
        this.style.display = 'none';
    };
    
    pieceElement.appendChild(img);
    
    // Add resize handles
    const resizeHandles = ['nw', 'ne', 'sw', 'se'];
    resizeHandles.forEach(handle => {
        const handleEl = document.createElement('div');
        handleEl.className = `resize-handle resize-${handle}`;
        handleEl.dataset.handle = handle;
        pieceElement.appendChild(handleEl);
    });
    
    pieceElement.addEventListener('mousedown', (e) => {
        // Don't drag piece if space is pressed (panning mode)
        if (spacePressed) {
            return;
        }
        
        // Check if clicking on resize handle
        if (e.target.classList.contains('resize-handle')) {
            e.stopPropagation();
            selectPiece(piece.id);
            startResize(e, piece, e.target.dataset.handle);
            return;
        }
        
        // Record click start position and time for click detection
        clickStartTime = Date.now();
        clickStartPos.x = e.clientX;
        clickStartPos.y = e.clientY;
        
        // If piece is already selected, prepare to potentially deselect on mouseup
        wasSelectedOnMouseDown = pieceElement.classList.contains('selected');
        
        // Regular drag (always allow dragging)
        e.stopPropagation();
        if (!wasSelectedOnMouseDown) {
            selectPiece(piece.id);
        }
        startDrag(e, piece);
    });
    
    pieceElement.addEventListener('dblclick', () => {
        deletePiece(piece.id);
    });
    
    // Append to content wrapper if it exists, otherwise to canvas
    const contentWrapper = document.getElementById('canvas-content');
    if (contentWrapper) {
        contentWrapper.appendChild(pieceElement);
    } else {
        canvas.appendChild(pieceElement);
    }
}

function selectPiece(pieceId) {
    // Deselect all pieces
    document.querySelectorAll('.altar-piece').forEach(p => p.classList.remove('selected'));
    
    // Select the clicked piece
    const pieceElement = document.getElementById(pieceId);
    if (pieceElement) {
        pieceElement.classList.add('selected');
        selectedPiece = altarPieces.find(p => p.id === pieceId);
    }
}

function deselectPiece() {
    // Deselect all pieces
    document.querySelectorAll('.altar-piece').forEach(p => p.classList.remove('selected'));
    selectedPiece = null;
}

function applyShapeMask() {
    if (!selectedPiece) {
        alert('Please select an image first by clicking on it.');
        return;
    }
    
    const pieceElement = document.getElementById(selectedPiece.id);
    if (!pieceElement) {
        alert('Selected piece not found.');
        return;
    }
    
    const img = pieceElement.querySelector('img');
    if (!img) return;
    
    // Generate shape mask - mix of perfect shapes and organic shapes
    const shapes = [
        // Perfect circles
        `circle(50% at 50% 50%)`,
        `circle(45% at 50% 50%)`,
        `circle(40% at 50% 50%)`,
        // Perfect ovals/ellipses
        `ellipse(60% 50% at 50% 50%)`,
        `ellipse(50% 60% at 50% 50%)`,
        `ellipse(55% 45% at 50% 50%)`,
        `ellipse(45% 55% at 50% 50%)`,
        // Organic ellipse variations
        `ellipse(${60 + Math.random() * 20}% ${55 + Math.random() * 20}% at ${45 + Math.random() * 10}% ${45 + Math.random() * 10}%)`,
        // Organic polygons
        `polygon(${generateOrganicPolygon()})`,
        // Circle with slight variation
        `circle(${45 + Math.random() * 10}% at ${48 + Math.random() * 4}% ${48 + Math.random() * 4}%)`,
        // Complex organic shape
        `polygon(${generateComplexOrganicShape()})`
    ];
    
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
    
    // Apply the mask
    img.style.clipPath = randomShape;
    img.style.webkitClipPath = randomShape;
    
    // Store mask shape for archive and export
    selectedPiece.maskShape = randomShape;
}

function generateOrganicPolygon() {
    const points = [];
    const numPoints = 6 + Math.floor(Math.random() * 4); // 6-9 points
    const centerX = 50;
    const centerY = 50;
    
    for (let i = 0; i < numPoints; i++) {
        const angle = (Math.PI * 2 * i) / numPoints + (Math.random() - 0.5) * 0.5;
        const radius = 30 + Math.random() * 20;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        points.push(`${x}% ${y}%`);
    }
    
    return points.join(', ');
}

function generateComplexOrganicShape() {
    const points = [];
    const numPoints = 8 + Math.floor(Math.random() * 6); // 8-13 points
    
    for (let i = 0; i < numPoints; i++) {
        const angle = (Math.PI * 2 * i) / numPoints;
        const radius = 25 + Math.random() * 25;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        points.push(`${x}% ${y}%`);
    }
    
    return points.join(', ');
}

function assembleGrid() {
    if (altarPieces.length === 0) {
        alert('No pieces to arrange in grid.');
        return;
    }
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    // Use canvas dimensions (which should fit the browser viewport)
    const canvasWidth = canvasRect.width;
    const canvasHeight = canvasRect.height;
    
    // Calculate square grid dimensions
    // Find the smallest square grid that can fit all pieces
    const numPieces = altarPieces.length;
    const gridSize = Math.ceil(Math.sqrt(numPieces)); // e.g., 9 pieces = 3x3, 16 pieces = 4x4
    
    // Calculate cell size with padding - use canvas dimensions to fit browser
    const padding = 20; // Padding between cells
    const totalPadding = padding * (gridSize + 1);
    const cellSize = Math.min(
        (canvasWidth - totalPadding) / gridSize,
        (canvasHeight - totalPadding) / gridSize
    );
    
    // Arrange pieces in grid
    altarPieces.forEach((piece, index) => {
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        
        // Calculate position (centered in canvas - both vertically and horizontally)
        const totalGridWidth = gridSize * cellSize + (gridSize - 1) * padding;
        const totalGridHeight = gridSize * cellSize + (gridSize - 1) * padding;
        const startX = (canvasWidth - totalGridWidth) / 2;
        const startY = (canvasHeight - totalGridHeight) / 2;
        
        // Position in grid cell
        piece.x = startX + col * (cellSize + padding);
        piece.y = startY + row * (cellSize + padding);
        
        // Scale to fit cell perfectly
        piece.width = cellSize;
        piece.height = cellSize;
        
        // Update DOM element
        const pieceElement = document.getElementById(piece.id);
        if (pieceElement) {
            pieceElement.style.left = `${piece.x}px`;
            pieceElement.style.top = `${piece.y}px`;
            pieceElement.style.width = `${piece.width}px`;
            pieceElement.style.height = `${piece.height}px`;
        }
    });
}

function startDrag(e, piece) {
    if (isResizing) return;
    
    // Prevent panning when dragging a piece
    isPanning = false;
    
    isDragging = true;
    selectedPiece = piece;
    const pieceElement = document.getElementById(piece.id);
    const rect = pieceElement.getBoundingClientRect();
    const canvasRect = document.getElementById('canvas').getBoundingClientRect();
    
    // Calculate offset accounting for zoom and pan
    const mouseX = (e.clientX - canvasRect.left - panOffset.x) / zoomLevel;
    const mouseY = (e.clientY - canvasRect.top - panOffset.y) / zoomLevel;
    dragOffset.x = mouseX - piece.x;
    dragOffset.y = mouseY - piece.y;
    
    // Ensure smooth dragging
    pieceElement.style.transition = 'none';
    pieceElement.style.willChange = 'left, top';
    
    document.body.style.cursor = 'grabbing';
}

function startResize(e, piece, handle) {
    isResizing = true;
    isDragging = false;
    selectedPiece = piece;
    resizeHandle = handle;
    
    document.body.style.cursor = getResizeCursor(handle);
    e.preventDefault();
}

function handleCanvasMouseDown(e) {
    // Don't start panning if clicking on a piece or if space is not pressed
    if (e.target.id === 'canvas' || e.target.classList.contains('grid-overlay')) {
        // Only deselect if not panning
        if (!spacePressed && e.button !== 2) {
            deselectPiece();
        }
    }
}

function updateCanvasCursor(e) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    
    const target = e.target || e;
    
    // If hovering over background (not a piece), show grab cursor
    if (target.id === 'canvas' || target.classList.contains('grid-overlay') || target.id === 'canvas-content') {
        if (spacePressed) {
            canvas.style.cursor = 'grabbing';
        } else {
            canvas.style.cursor = 'grab';
        }
    } else if (target.classList && (target.classList.contains('altar-piece') || target.closest('.altar-piece'))) {
        canvas.style.cursor = 'move';
    } else {
        canvas.style.cursor = 'grab';
    }
}

function handleCanvasMouseMove(e) {
    if (isResizing && selectedPiece && resizeHandle) {
        handleResize(e);
        return;
    }
    
    if (!isDragging || !selectedPiece) return;
    
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    // Smooth dragging without snap during movement
    // Account for zoom and pan when calculating mouse position
    const mouseX = (e.clientX - canvasRect.left - panOffset.x) / zoomLevel;
    const mouseY = (e.clientY - canvasRect.top - panOffset.y) / zoomLevel;
    
    // Calculate new position based on mouse position minus the offset
    let newX = mouseX - dragOffset.x;
    let newY = mouseY - dragOffset.y;
    
    // Keep within canvas bounds (account for zoom)
    newX = Math.max(0, Math.min(newX, canvasRect.width / zoomLevel - selectedPiece.width));
    newY = Math.max(0, Math.min(newY, canvasRect.height / zoomLevel - selectedPiece.height));
    
    // Update position smoothly
    selectedPiece.x = newX;
    selectedPiece.y = newY;
    
    const pieceElement = document.getElementById(selectedPiece.id);
    if (pieceElement) {
        // Use left/top for positioning during drag (smoother than transform with existing left/top)
        pieceElement.style.left = `${newX}px`;
        pieceElement.style.top = `${newY}px`;
        
    }
}

function handleResize(e) {
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const pieceElement = document.getElementById(selectedPiece.id);
    const pieceRect = pieceElement.getBoundingClientRect();
    
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;
    
    let newWidth = selectedPiece.width;
    let newHeight = selectedPiece.height;
    let newX = selectedPiece.x;
    let newY = selectedPiece.y;
    
    const aspectRatio = selectedPiece.width / selectedPiece.height;
    
    switch(resizeHandle) {
        case 'se': // South-east (bottom-right)
            newWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, mouseX - selectedPiece.x));
            newHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, mouseY - selectedPiece.y));
            break;
        case 'sw': // South-west (bottom-left)
            newWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, (selectedPiece.x + selectedPiece.width) - mouseX));
            newHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, mouseY - selectedPiece.y));
            newX = mouseX;
            break;
        case 'ne': // North-east (top-right)
            newWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, mouseX - selectedPiece.x));
            newHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, (selectedPiece.y + selectedPiece.height) - mouseY));
            newY = mouseY;
            break;
        case 'nw': // North-west (top-left)
            newWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, (selectedPiece.x + selectedPiece.width) - mouseX));
            newHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, (selectedPiece.y + selectedPiece.height) - mouseY));
            newX = mouseX;
            newY = mouseY;
            break;
    }
    
    // Keep within bounds
    if (newX + newWidth > canvasRect.width) {
        newWidth = canvasRect.width - newX;
    }
    if (newY + newHeight > canvasRect.height) {
        newHeight = canvasRect.height - newY;
    }
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);
    
    selectedPiece.width = newWidth;
    selectedPiece.height = newHeight;
    selectedPiece.x = newX;
    selectedPiece.y = newY;
    
    pieceElement.style.width = `${newWidth}px`;
    pieceElement.style.height = `${newHeight}px`;
    pieceElement.style.left = `${newX}px`;
    pieceElement.style.top = `${newY}px`;
}

function getResizeCursor(handle) {
    switch(handle) {
        case 'nw': return 'nw-resize';
        case 'ne': return 'ne-resize';
        case 'sw': return 'sw-resize';
        case 'se': return 'se-resize';
        default: return 'default';
    }
}

function snapToPieces(x, y, currentPiece) {
    let snapX = x;
    let snapY = y;
    
    for (const piece of altarPieces) {
        if (piece.id === currentPiece.id) continue;
        
        const pieceElement = document.getElementById(piece.id);
        if (!pieceElement) continue;
        
        const pieceRect = pieceElement.getBoundingClientRect();
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        const pieceX = pieceRect.left - canvasRect.left;
        const pieceY = pieceRect.top - canvasRect.top;
        
        // Snap horizontal edges
        if (Math.abs(x - (pieceX + piece.width)) < 20) {
            snapX = pieceX + piece.width;
        } else if (Math.abs((x + currentPiece.width) - pieceX) < 20) {
            snapX = pieceX - currentPiece.width;
        } else if (Math.abs(x - pieceX) < 20) {
            snapX = pieceX;
        }
        
        // Snap vertical edges
        if (Math.abs(y - (pieceY + piece.height)) < 20) {
            snapY = pieceY + piece.height;
        } else if (Math.abs((y + currentPiece.height) - pieceY) < 20) {
            snapY = pieceY - currentPiece.height;
        } else if (Math.abs(y - pieceY) < 20) {
            snapY = pieceY;
        }
    }
    
    return { x: snapX, y: snapY };
}

function handleCanvasMouseUp(e) {
    if (isDragging && selectedPiece) {
        // Check if this was a click (not a drag) on an already-selected piece
        if (wasSelectedOnMouseDown && !isResizing) {
            const clickDuration = Date.now() - clickStartTime;
            const moveDistance = Math.sqrt(
                Math.pow(e.clientX - clickStartPos.x, 2) + 
                Math.pow(e.clientY - clickStartPos.y, 2)
            );
            
            // If it was a quick click with minimal movement, deselect instead of snapping
            if (clickDuration < CLICK_TIME_THRESHOLD && moveDistance < CLICK_THRESHOLD) {
                deselectPiece();
                isDragging = false;
                document.body.style.cursor = '';
                wasSelectedOnMouseDown = false;
                return;
            }
        }
        
        // Snap to grid on release for alignment
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        let newX = Math.round(selectedPiece.x / SNAP_DISTANCE) * SNAP_DISTANCE;
        let newY = Math.round(selectedPiece.y / SNAP_DISTANCE) * SNAP_DISTANCE;
        
        // Snap to other pieces
        const snapResult = snapToPieces(newX, newY, selectedPiece);
        newX = snapResult.x;
        newY = snapResult.y;
        
        // Keep within canvas bounds
        newX = Math.max(0, Math.min(newX, canvasRect.width - selectedPiece.width));
        newY = Math.max(0, Math.min(newY, canvasRect.height - selectedPiece.height));
        
        selectedPiece.x = newX;
        selectedPiece.y = newY;
        
        const pieceElement = document.getElementById(selectedPiece.id);
        if (pieceElement) {
            pieceElement.style.left = `${newX}px`;
            pieceElement.style.top = `${newY}px`;
            // No rotation transform needed
            pieceElement.style.willChange = 'auto';
            pieceElement.style.transition = '';
        }
        
        isDragging = false;
        document.body.style.cursor = '';
        wasSelectedOnMouseDown = false;
    }
    if (isResizing) {
        isResizing = false;
        resizeHandle = null;
        document.body.style.cursor = '';
        wasSelectedOnMouseDown = false;
    }
}

function deletePiece(pieceId) {
    const pieceElement = document.getElementById(pieceId);
    if (pieceElement) {
        pieceElement.remove();
    }
    altarPieces = altarPieces.filter(p => p.id !== pieceId);
    if (selectedPiece && selectedPiece.id === pieceId) {
        deselectPiece();
    }
}

function clearCanvas() {
    if (confirm('Clear all altar pieces?')) {
        altarPieces.forEach(piece => {
            const pieceElement = document.getElementById(piece.id);
            if (pieceElement) pieceElement.remove();
        });
        altarPieces = [];
        deselectPiece();
        // Clear used image URLs when clearing canvas
        usedImageUrls.clear();
        objectLabelCounter = 0;
        
        // Remove mantra text if it exists (check both body and canvas)
        const mantraText = document.getElementById('mantra-text');
        if (mantraText) {
            mantraText.remove();
        }
        currentMantra = null;
    }
}

function saveAltarToArchive() {
    console.log('saveAltarToArchive called');
    try {
        if (altarPieces.length === 0) {
            alert('No altar pieces to save.');
            return;
        }
        
        const canvas = document.getElementById('canvas');
        
        if (!canvas) {
            alert('Error: Canvas not found.');
            return;
        }
        
        console.log('Creating altar data, pieces count:', altarPieces.length);
        
        const altarData = {
            id: `altar-${Date.now()}`,
            timestamp: new Date().toISOString(),
            pieces: JSON.parse(JSON.stringify(altarPieces)),
            mantra: currentMantra,
            thumbnail: null
        };
        
        console.log('Altar data created, html2canvas available:', typeof html2canvas !== 'undefined');
        
        if (typeof html2canvas !== 'undefined') {
            const captureOptions = {
                backgroundColor: '#000000',
                useCORS: true,
                logging: false,
                allowTaint: true,
                scale: Math.max(2, window.devicePixelRatio || 1),
                imageTimeout: 5000,
                ignoreElements: (element) => element.classList && element.classList.contains('grid-overlay'),
                onclone: (clonedDoc) => {
                    const clonedMantra = clonedDoc.getElementById('mantra-text');
                    if (clonedMantra) {
                        clonedMantra.style.mixBlendMode = 'normal';
                        clonedMantra.style.color = '#ffffff';
                    }
                }
            };
            
            html2canvas(canvas, captureOptions).then(capturedCanvas => {
                try {
                    altarData.thumbnail = capturedCanvas.toDataURL('image/jpeg', 0.75);
                } catch (thumbnailError) {
                    console.error('Error generating thumbnail data URL:', thumbnailError);
                }
                saveAltarData(altarData);
            }).catch(error => {
                console.error('Thumbnail generation failed:', error);
                saveAltarData(altarData);
            });
        } else {
            console.warn('html2canvas not available, saving altar without images');
            saveAltarData(altarData);
        }
    } catch (error) {
        console.error('Error saving altar:', error);
        alert('Error saving altar: ' + (error.message || 'Unknown error'));
    }
}

function saveAltarData(altarData) {
    try {
        console.log('saveAltarData called, pieces:', altarData.pieces.length, 'mantra:', altarData.mantra);
        let archive = JSON.parse(localStorage.getItem('altarArchive') || '[]');
        archive.push(altarData);
        localStorage.setItem('altarArchive', JSON.stringify(archive));
        console.log('Altar saved to archive, archive size:', archive.length);
        alert('Altar saved to archive.');
    } catch (error) {
        console.error('Error in saveAltarData:', error);
        alert('Error saving to archive: ' + (error.message || 'Unknown error'));
    }
}

function openArchive() {
    const modal = document.getElementById('archiveModal');
    modal.style.display = 'block';
    loadArchive();
}

function closeArchive() {
    const modal = document.getElementById('archiveModal');
    modal.style.display = 'none';
}

function downloadArchiveThumbnail(imageDataUrl, timestamp) {
    try {
        if (!imageDataUrl) {
            alert('No image available to download.');
            return;
        }
        
        const triggerDownload = (source, isBlob = false) => {
            const date = new Date(timestamp);
            const filename = `altar-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.png`;
            
            const link = document.createElement('a');
            if (isBlob) {
                const blobUrl = URL.createObjectURL(source);
                link.href = blobUrl;
                link.dataset.blobUrl = blobUrl;
            } else {
                link.href = source;
            }
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            if (link.dataset.blobUrl) {
                URL.revokeObjectURL(link.dataset.blobUrl);
            }
        };
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const scaleFactor = 4;
                const baseWidth = Math.max(1, img.width);
                const baseHeight = Math.max(1, img.height);
                const targetWidth = baseWidth * scaleFactor;
                const targetHeight = baseHeight * scaleFactor;
                
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        triggerDownload(blob, true);
                    } else {
                        console.warn('Canvas toBlob returned null, downloading original thumbnail.');
                        triggerDownload(imageDataUrl);
                    }
                }, 'image/png', 0.95);
            } catch (scaleError) {
                console.error('Image upscale failed, downloading original thumbnail:', scaleError);
                triggerDownload(imageDataUrl);
            }
        };
        img.onerror = () => {
            console.warn('Unable to load thumbnail for upscale, downloading original.');
            triggerDownload(imageDataUrl);
        };
        img.src = imageDataUrl;
        
    } catch (error) {
        console.error('Error downloading image:', error);
        alert('Failed to download image. Please try again.');
    }
}

function loadArchive() {
    const archiveList = document.getElementById('archiveList');
    const archive = JSON.parse(localStorage.getItem('altarArchive') || '[]');
    
    archiveList.innerHTML = '';
    
    if (archive.length === 0) {
        archiveList.innerHTML = '<p style="color: #6a6a6a; text-align: center; padding: 40px;">ARCHIVE IS EMPTY</p>';
        return;
    }
    
    // Display most recent first
    archive.reverse().forEach(altar => {
        const item = document.createElement('div');
        item.className = 'archive-item';
        
        if (altar.thumbnail) {
            const img = document.createElement('img');
            img.src = altar.thumbnail;
            img.alt = 'Altar preview';
            img.onerror = function() {
                // If thumbnail fails to load, show placeholder
                this.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.style.color = '#4a4a4a';
                placeholder.style.fontSize = '12px';
                placeholder.textContent = `${altar.pieces.length} PIECES`;
                item.insertBefore(placeholder, this);
            };
            item.appendChild(img);
            
            // Add download button if thumbnail exists
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'archive-download';
            downloadBtn.innerHTML = '↓';
            downloadBtn.title = 'Download PNG';
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering item click
                downloadArchiveThumbnail(altar.thumbnail, altar.timestamp);
            });
            item.appendChild(downloadBtn);
        } else {
            const placeholder = document.createElement('div');
            placeholder.style.color = '#4a4a4a';
            placeholder.style.fontSize = '12px';
            placeholder.style.textAlign = 'center';
            placeholder.style.padding = '20px';
            placeholder.textContent = `${altar.pieces.length} PIECES`;
            item.appendChild(placeholder);
        }
        
        const date = document.createElement('div');
        date.className = 'archive-date';
        date.textContent = new Date(altar.timestamp).toLocaleString();
        item.appendChild(date);
        
        item.addEventListener('click', () => {
            loadAltarFromArchive(altar);
            closeArchive();
        });
        
        archiveList.appendChild(item);
    });
}

async function exportArchiveAltar(altar) {
    // Temporarily load the altar to export it
    const originalPieces = [...altarPieces];
    const originalSelected = selectedPiece;
    
    // Clear current altar
    altarPieces.forEach(piece => {
        const pieceElement = document.getElementById(piece.id);
        if (pieceElement) pieceElement.remove();
    });
    altarPieces = [];
    selectedPiece = null;
    usedImageUrls.clear();
    
    // Load archived pieces
    altar.pieces.forEach(piece => {
        piece.rotation = 0;
        if (piece.originalUrl) {
            usedImageUrls.add(piece.originalUrl);
        } else if (piece.imageUrl) {
            usedImageUrls.add(piece.imageUrl);
        }
        altarPieces.push(piece);
        renderAltarPiece(piece);
    });
    
    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate single mantra for export
    const mantraText = generateMantra();
    
    // Create export
    const width = 2160;
    const height = 2160;
    
    try {
        const canvas = await createStaticExportWithMantra(width, height, mantraText);
        
        canvas.toBlob((blob) => {
            if (!blob) {
                alert('Export failed. Please try again.');
                return;
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `altar-archive-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
        
        // Restore original altar
        setTimeout(() => {
            altarPieces.forEach(piece => {
                const pieceElement = document.getElementById(piece.id);
                if (pieceElement) pieceElement.remove();
            });
            altarPieces = originalPieces;
            selectedPiece = originalSelected;
            originalPieces.forEach(piece => {
                if (!document.getElementById(piece.id)) {
                    renderAltarPiece(piece);
                }
            });
        }, 1000);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
        
        // Restore original altar
        altarPieces.forEach(piece => {
            const pieceElement = document.getElementById(piece.id);
            if (pieceElement) pieceElement.remove();
        });
        altarPieces = originalPieces;
        selectedPiece = originalSelected;
        originalPieces.forEach(piece => {
            if (!document.getElementById(piece.id)) {
                renderAltarPiece(piece);
            }
        });
    }
}

function loadAltarFromArchive(altar) {
    if (confirm('Load this altar? Current altar will be cleared.')) {
        // Clear current altar pieces
        altarPieces.forEach(piece => {
            const pieceElement = document.getElementById(piece.id);
            if (pieceElement) pieceElement.remove();
        });
        altarPieces = [];
        selectedPiece = null;
        // Clear and rebuild used image URLs from archived pieces
        usedImageUrls.clear();
        
        // Remove existing mantra if it exists
        const existingMantra = document.getElementById('mantra-text');
        if (existingMantra) {
            existingMantra.remove();
        }
        
            // Load archived pieces - ensure rotation is 0
            altar.pieces.forEach(piece => {
                piece.rotation = 0; // Ensure no rotation
                // Track original URL if it exists
                if (piece.originalUrl) {
                    usedImageUrls.add(piece.originalUrl);
                } else if (piece.imageUrl) {
                    usedImageUrls.add(piece.imageUrl);
                }
                altarPieces.push(piece);
                renderAltarPiece(piece);
            });
            
            // Deselect any selected pieces after loading
            deselectPiece();
        
        // Restore mantra if it exists in archive
        if (altar.mantra) {
            currentMantra = altar.mantra;
            const mantraElement = document.createElement('div');
            mantraElement.id = 'mantra-text';
            mantraElement.className = 'mantra-text';
            mantraElement.textContent = currentMantra;
            
            // Add to content wrapper
            const canvas = document.getElementById('canvas');
            let contentWrapper = document.getElementById('canvas-content');
            if (!contentWrapper) {
                initializeContentWrapper();
                contentWrapper = document.getElementById('canvas-content');
            }
            contentWrapper.appendChild(mantraElement);
        } else {
            currentMantra = null;
        }
    }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('archiveModal');
    if (e.target === modal) {
        closeArchive();
    }
});


function generateRitualPoem() {
    const lines = [
        ['In the', 'sacred', 'silence'],
        ['where', 'ancient', 'echoes', 'dwell'],
        ['fragments', 'of', 'memory', 'converge'],
        ['forming', 'new', 'stories', 'to', 'tell'],
        [''],
        ['Each', 'piece', 'a', 'whisper'],
        ['from', 'distant', 'times'],
        ['stacked', 'with', 'intention'],
        ['in', 'ritual', 'rhymes'],
        [''],
        ['The', 'altar', 'breathes'],
        ['with', 'collected', 'grace'],
        ['a', 'temporary', 'sanctuary'],
        ['in', 'this', 'dark', 'space']
    ];
    
    // Select random lines to create variation
    const selectedLines = [];
    const numStanzas = 2 + Math.floor(Math.random() * 2); // 2-3 stanzas
    
    for (let i = 0; i < numStanzas; i++) {
        const stanzaStart = i * 4;
        const stanzaEnd = Math.min(stanzaStart + 4, lines.length);
        for (let j = stanzaStart; j < stanzaEnd; j++) {
            if (lines[j]) {
                selectedLines.push(lines[j]);
            }
        }
        if (i < numStanzas - 1) {
            selectedLines.push([]); // Empty line between stanzas
        }
    }
    
    return selectedLines;
}

async function exportAltar(format) {
    if (altarPieces.length === 0) {
        alert('No altar pieces to export.');
        return;
    }
    
    // Always use square format
    const width = 2160;
    const height = 2160;
    
    try {
        // Generate single mantra
        const mantraText = generateMantra();
        
        // Create static export image
        const canvas = await createStaticExportWithMantra(width, height, mantraText);
        
        // Convert to blob and download
        canvas.toBlob((blob) => {
            if (!blob) {
                alert('Export failed. Please try again.');
                return;
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `altar-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
    }
}

async function createStaticExport(width, height, poem) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate scaling factor from canvas to export dimensions
    const originalCanvas = document.getElementById('canvas');
    const originalRect = originalCanvas.getBoundingClientRect();
    const scaleX = width / originalRect.width;
    const scaleY = height / originalRect.height;
    
    // Draw all pieces
    for (const piece of altarPieces) {
        const pieceElement = document.getElementById(piece.id);
        if (!pieceElement) continue;
        
        const img = pieceElement.querySelector('img');
        if (!img || !img.src) continue;
        
        // Wait for image to load
        await new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
                resolve();
            } else {
                const timeout = setTimeout(resolve, 2000);
                img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                img.onerror = () => {
                    clearTimeout(timeout);
                    resolve();
                };
            }
        });
        
        // Calculate scaled position and size
        const scaledX = piece.x * scaleX;
        const scaledY = piece.y * scaleY;
        const scaledWidth = piece.width * scaleX;
        const scaledHeight = piece.height * scaleY;
        
        // Draw image with error handling
        try {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                ctx.save();
                
                // Apply mask shape if it exists (using canvas clipping)
                if (piece.maskShape) {
                    applyMaskToCanvas(ctx, piece.maskShape, scaledX, scaledY, scaledWidth, scaledHeight);
                }
                
                ctx.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight);
                ctx.restore();
            }
        } catch (e) {
            console.warn('Could not draw image:', e);
            // Draw placeholder rectangle if image fails
            ctx.fillStyle = '#333333';
            ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
        }
    }
    
    // Draw poem text overlay
    drawPoemText(ctx, width, height, poem, 1.0);
    
    return canvas;
}

async function createStaticExportWithMantra(width, height, mantraText) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate scaling factor from canvas to export dimensions
    const originalCanvas = document.getElementById('canvas');
    const originalRect = originalCanvas.getBoundingClientRect();
    const scaleX = width / originalRect.width;
    const scaleY = height / originalRect.height;
    
    // Draw all pieces
    for (const piece of altarPieces) {
        const pieceElement = document.getElementById(piece.id);
        if (!pieceElement) continue;
        
        const img = pieceElement.querySelector('img');
        if (!img || !img.src) continue;
        
        // Wait for image to load
        await new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
                resolve();
            } else {
                const timeout = setTimeout(resolve, 2000);
                img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                img.onerror = () => {
                    clearTimeout(timeout);
                    resolve();
                };
            }
        });
        
        // Calculate scaled position and size
        const scaledX = piece.x * scaleX;
        const scaledY = piece.y * scaleY;
        const scaledWidth = piece.width * scaleX;
        const scaledHeight = piece.height * scaleY;
        
        // Draw image with error handling
        try {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                ctx.save();
                
                // Apply mask shape if it exists (using canvas clipping)
                if (piece.maskShape) {
                    applyMaskToCanvas(ctx, piece.maskShape, scaledX, scaledY, scaledWidth, scaledHeight);
                }
                
                ctx.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight);
                ctx.restore();
            }
        } catch (e) {
            console.warn('Could not draw image:', e);
            // Draw placeholder rectangle if image fails
            ctx.fillStyle = '#333333';
            ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
        }
    }
    
    // Draw mantra text overlay (single line, uppercase, large)
    ctx.fillStyle = '#ffffff';
    const mantraFontSize = Math.max(80, Math.round(height * 0.104));
    ctx.font = `normal ${mantraFontSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalCompositeOperation = 'difference'; // Difference blend mode
    
    const textY = height * 0.5;
    ctx.fillText(mantraText.toUpperCase(), width / 2, textY);
    
    return canvas;
}

function applyMaskToCanvas(ctx, maskShape, x, y, width, height) {
    // Parse clip-path and apply as canvas clipping
    // This is a simplified version - full clip-path parsing would be complex
    // For now, we'll use common patterns
    
    ctx.beginPath();
    
    if (maskShape.includes('circle')) {
        // Extract circle parameters
        const match = maskShape.match(/circle\(([^)]+)\)/);
        if (match) {
            const params = match[1].split('at');
            const radius = parseFloat(params[0].trim().replace('%', '')) / 100;
            const centerX = params[1] ? parseFloat(params[1].split(' ')[0].trim().replace('%', '')) / 100 : 0.5;
            const centerY = params[1] ? parseFloat(params[1].split(' ')[1].trim().replace('%', '')) / 100 : 0.5;
            
            const cx = x + width * centerX;
            const cy = y + height * centerY;
            const r = Math.min(width, height) * radius;
            
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
    } else if (maskShape.includes('ellipse')) {
        // Extract ellipse parameters
        const match = maskShape.match(/ellipse\(([^)]+)\)/);
        if (match) {
            const params = match[1].split('at');
            const sizes = params[0].trim().split(' ');
            const rx = parseFloat(sizes[0].replace('%', '')) / 100;
            const ry = sizes[1] ? parseFloat(sizes[1].replace('%', '')) / 100 : rx;
            const centerX = params[1] ? parseFloat(params[1].split(' ')[0].trim().replace('%', '')) / 100 : 0.5;
            const centerY = params[1] ? parseFloat(params[1].split(' ')[1].trim().replace('%', '')) / 100 : 0.5;
            
            const cx = x + width * centerX;
            const cy = y + height * centerY;
            const ellipseRx = width * rx;
            const ellipseRy = height * ry;
            
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(ellipseRx, ellipseRy);
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
        }
    } else if (maskShape.includes('polygon')) {
        // Extract polygon points
        const match = maskShape.match(/polygon\(([^)]+)\)/);
        if (match) {
            const points = match[1].split(',').map(p => p.trim());
            if (points.length > 0) {
                const firstPoint = points[0].split(' ');
                const firstX = parseFloat(firstPoint[0].replace('%', '')) / 100;
                const firstY = parseFloat(firstPoint[1].replace('%', '')) / 100;
                ctx.moveTo(x + width * firstX, y + height * firstY);
                
                for (let i = 1; i < points.length; i++) {
                    const point = points[i].split(' ');
                    const px = parseFloat(point[0].replace('%', '')) / 100;
                    const py = parseFloat(point[1].replace('%', '')) / 100;
                    ctx.lineTo(x + width * px, y + height * py);
                }
                ctx.closePath();
            }
        }
    } else {
        // Default: no clipping
        return;
    }
    
    ctx.clip();
}

function drawPoemText(ctx, width, height, poem, progress) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Calculate text position (centered)
    const margin = 60;
    const textWidth = width - (margin * 2);
    const lineHeight = 50;
    
    // Start position (centered vertically)
    let startY = height * 0.4;
    
    poem.forEach((line, index) => {
        if (line.length === 0) {
            startY += lineHeight * 0.5; // Extra space for empty lines
            return;
        }
        
        const text = line.join(' ');
        // Word wrap if needed
        const words = text.split(' ');
        let currentLine = '';
        let y = startY;
        
        words.forEach((word, wordIndex) => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > textWidth && currentLine) {
                // Draw current line and start new one
                ctx.fillText(currentLine, width / 2, y);
                y += lineHeight;
                currentLine = word;
            } else {
                currentLine = testLine;
            }
            
            // Draw last word if it's the last word
            if (wordIndex === words.length - 1) {
                ctx.fillText(currentLine, width / 2, y);
            }
        });
        
        startY = y + lineHeight;
    });
}

