/* ==========================================================================
   EduForge AI — Phase 1 RAG JavaScript Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // API endpoints
    const API_HEALTH = '/health';
    const API_UPLOAD = '/documents/upload';
    const API_CHAT = '/chat';

    // DOM Elements
    const statusDot = document.getElementById('backend-status-dot');
    const statusText = document.getElementById('backend-status-text');
    const apiKeyWarning = document.getElementById('api-key-warning');
    const statChunks = document.getElementById('stat-chunks');
    
    // Upload Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadProgressContainer = document.getElementById('upload-progress-container');
    const uploadingFilename = document.getElementById('uploading-filename');
    const uploadPercentage = document.getElementById('upload-percentage');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const processingMsg = document.getElementById('processing-msg');
    const uploadFeedback = document.getElementById('upload-feedback');

    // Chat Elements
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const welcomeScreen = document.getElementById('welcome-screen');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const suggestionsContainer = document.getElementById('suggestions-container');
    const suggestionPills = document.getElementById('suggestion-pills');

    // Drawer Elements
    const citationDrawer = document.getElementById('citation-drawer');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const drawerSourceTitle = document.getElementById('drawer-source-title');
    const drawerChunkText = document.getElementById('drawer-chunk-text');
    const drawerDistanceVal = document.getElementById('drawer-distance-val');
    const drawerDistanceBar = document.getElementById('drawer-distance-bar');
    const drawerChunkId = document.getElementById('drawer-chunk-id');
    const drawerFilePath = document.getElementById('drawer-file-path');

    // Store state locally
    let lastRetrievedChunks = [];
    let isUploading = false;
    let isGenerating = false;

    // Default suggested questions
    const defaultSuggestions = [
        "What is the difference between a process and a thread?",
        "Explain the process lifecycle states.",
        "What is CPU scheduling and why is it needed?",
        "Explain virtual memory and page faults."
    ];

    // ==========================================================================
    // Core API Connections & Init
    // ==========================================================================

    async function checkSystemHealth() {
        try {
            const response = await fetch(API_HEALTH);
            if (!response.ok) throw new Error('Unhealthy status');
            
            const data = await response.json();
            
            // Update connection status
            statusDot.className = 'status-dot online';
            statusText.textContent = 'System Active';
            
            // Update stats
            statChunks.textContent = data.total_indexed_chunks || 0;

            // Update suggestions if we have chunks
            if (data.total_indexed_chunks > 0) {
                suggestionsContainer.classList.remove('hidden');
                renderSuggestions();
            } else {
                suggestionsContainer.classList.add('hidden');
            }

            // Show API warning if key is not configured
            if (!data.gemini_api_key_configured) {
                apiKeyWarning.classList.remove('hidden');
            } else {
                apiKeyWarning.classList.add('hidden');
            }
        } catch (error) {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Offline (API Unavailable)';
            statChunks.textContent = '0';
            apiKeyWarning.classList.add('hidden');
            console.error('Health check failed:', error);
        }
    }

    // Run health check initially and then every 10 seconds
    checkSystemHealth();
    setInterval(checkSystemHealth, 10000);

    // Render suggestions
    function renderSuggestions() {
        suggestionPills.innerHTML = '';
        defaultSuggestions.forEach(q => {
            const pill = document.createElement('button');
            pill.className = 'suggestion-pill';
            pill.textContent = q;
            pill.type = 'button';
            pill.addEventListener('click', () => {
                chatInput.value = q;
                adjustTextareaHeight();
                chatForm.dispatchEvent(new Event('submit'));
            });
            suggestionPills.appendChild(pill);
        });
    }

    // ==========================================================================
    // File Upload Handler
    // ==========================================================================

    // Drag-over styling
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        }, false);
    });

    // File Dropped
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // Select file via dialog
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFileUpload(fileInput.files[0]);
        }
    });

    // Handle Upload Logic
    async function handleFileUpload(file) {
        if (isUploading) return;

        // 1. Validation
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showUploadFeedback("Invalid file format. Please upload a PDF document.", "error");
            return;
        }

        isUploading = true;
        uploadFeedback.classList.add('hidden');
        uploadProgressContainer.classList.remove('hidden');
        uploadingFilename.textContent = file.name;
        uploadPercentage.textContent = '0%';
        uploadProgressBar.style.width = '0%';
        processingMsg.classList.add('hidden');

        // Create form data
        const formData = new FormData();
        formData.append('file', file);

        try {
            // Using XMLHttpRequest to track file upload progress
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentage = Math.round((e.loaded / e.total) * 100);
                    // Leave some percentage margin for vector indexing process
                    const displayPercent = Math.min(percentage, 95);
                    uploadPercentage.textContent = `${displayPercent}%`;
                    uploadProgressBar.style.width = `${displayPercent}%`;
                    
                    if (displayPercent >= 95) {
                        processingMsg.classList.remove('hidden');
                    }
                }
            });

            const uploadPromise = new Promise((resolve, reject) => {
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(JSON.parse(xhr.responseText));
                        } else {
                            try {
                                const responseErr = JSON.parse(xhr.responseText);
                                reject(new Error(responseErr.detail || 'Failed to process document'));
                            } catch {
                                reject(new Error('Server responded with an error code'));
                            }
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Network transport error'));
            });

            xhr.open('POST', API_UPLOAD, true);
            xhr.send(formData);

            const result = await uploadPromise;

            // Success state
            uploadPercentage.textContent = '100%';
            uploadProgressBar.style.width = '100%';
            processingMsg.classList.add('hidden');
            
            showUploadFeedback(`Successfully indexed "${result.filename}" (${result.chunks_created} chunks created).`, "success");
            
            // Trigger health check to refresh chunk count
            setTimeout(checkSystemHealth, 500);

        } catch (error) {
            console.error('Upload error:', error);
            showUploadFeedback(`Upload failed: ${error.message}`, "error");
        } finally {
            isUploading = false;
            fileInput.value = ''; // Reset file input
            setTimeout(() => {
                uploadProgressContainer.classList.add('hidden');
            }, 3000);
        }
    }

    function showUploadFeedback(message, type) {
        uploadFeedback.textContent = message;
        uploadFeedback.className = `feedback-box ${type}`;
        uploadFeedback.classList.remove('hidden');
    }

    // ==========================================================================
    // Conversational Chat Handler
    // ==========================================================================

    // Auto resize textarea
    chatInput.addEventListener('input', () => {
        adjustTextareaHeight();
        sendBtn.disabled = !chatInput.value.trim();
    });

    function adjustTextareaHeight() {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${Math.min(chatInput.scrollHeight - 4, 100)}px`;
    }

    // Submit Chat Form
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const questionText = chatInput.value.trim();
        if (!questionText || isGenerating) return;

        // Clean input area
        chatInput.value = '';
        adjustTextareaHeight();
        sendBtn.disabled = true;
        welcomeScreen.classList.add('hidden');

        // Append user bubble
        appendBubble('user', questionText);
        
        // Append loading skeleton
        const skeletonId = appendSkeletonBubble();
        
        isGenerating = true;

        try {
            const response = await fetch(API_CHAT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: questionText })
            });

            // Remove loading skeleton
            removeSkeletonBubble(skeletonId);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'RAG engine failed to generate answer');
            }

            const data = await response.json();
            
            // Save chunks for citation click auditing
            if (data.retrieved_chunks) {
                lastRetrievedChunks = lastRetrievedChunks.concat(data.retrieved_chunks);
            }

            // Append response bubble
            appendBubble('assistant', data.answer, data.sources, data.retrieved_chunks);

        } catch (error) {
            removeSkeletonBubble(skeletonId);
            appendBubble('assistant', `⚠️ **Error:** ${error.message}. Please verify the backend logs and check that your Gemini API key is configured properly.`, [], []);
            console.error('Chat error:', error);
        } finally {
            isGenerating = false;
        }
    });

    // Handle Enter key for submission (Enter without Shift)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Helper: append chat bubbles
    function appendBubble(sender, text, sources = [], chunks = []) {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `chat-msg ${sender}`;

        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        
        // Convert simple markdown code and bold syntax for clean rendering
        bubble.innerHTML = formatMarkdown(text);
        messageWrapper.appendChild(bubble);

        // Add citations if assistant provides them
        if (sender === 'assistant' && sources && sources.length > 0) {
            const citationSection = document.createElement('div');
            citationSection.className = 'msg-citations';
            
            const citationTitle = document.createElement('span');
            citationTitle.className = 'citations-title';
            citationTitle.textContent = 'Grounded Sources:';
            citationSection.appendChild(citationTitle);

            const list = document.createElement('div');
            list.className = 'citations-list';

            sources.forEach(sourceStr => {
                // Find matching chunk to pass coordinates
                const matchedChunk = chunks.find(c => {
                    const formatted = `${c.metadata.source_filename} — Page ${c.metadata.page_number}`;
                    return formatted.toLowerCase() === sourceStr.toLowerCase() || 
                           sourceStr.toLowerCase().includes(c.metadata.source_filename.toLowerCase()) && 
                           sourceStr.includes(String(c.metadata.page_number));
                }) || lastRetrievedChunks.find(c => {
                    const formatted = `${c.metadata.source_filename} — Page ${c.metadata.page_number}`;
                    return formatted.toLowerCase() === sourceStr.toLowerCase();
                });

                const badge = document.createElement('button');
                badge.className = 'citation-badge';
                badge.type = 'button';
                badge.innerHTML = `
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                    <span>${sourceStr}</span>
                `;

                if (matchedChunk) {
                    badge.addEventListener('click', () => openCitationInspector(matchedChunk, sourceStr));
                } else {
                    badge.disabled = true;
                    badge.title = "Source text chunk detail unavailable";
                }
                
                list.appendChild(badge);
            });

            citationSection.appendChild(list);
            messageWrapper.appendChild(citationSection);
        }

        chatMessages.appendChild(messageWrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Helper: append typing skeleton bubble
    function appendSkeletonBubble() {
        const id = 'skeleton-' + Date.now();
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `chat-msg assistant skeleton`;
        messageWrapper.id = id;

        messageWrapper.innerHTML = `
            <div class="msg-bubble">
                <div class="skeleton-line w-90"></div>
                <div class="skeleton-line w-80"></div>
                <div class="skeleton-line w-60"></div>
            </div>
        `;
        chatMessages.appendChild(messageWrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return id;
    }

    // Helper: remove loading bubble
    function removeSkeletonBubble(id) {
        const skeleton = document.getElementById(id);
        if (skeleton) skeleton.remove();
    }

    // Clear Chat
    clearChatBtn.addEventListener('click', () => {
        // Confirm clear
        const messages = chatMessages.querySelectorAll('.chat-msg');
        if (messages.length === 0) return;
        
        chatMessages.innerHTML = '';
        chatMessages.appendChild(welcomeScreen);
        welcomeScreen.classList.remove('hidden');
        lastRetrievedChunks = [];
    });

    // Helper: Convert Markdown elements
    function formatMarkdown(text) {
        // Format bold text
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Format code snippets
        formatted = formatted.replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 4px; font-family: monospace; font-size: 0.9em;">$1</code>');
        // Convert newlines to breaks
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    // ==========================================================================
    // Drawer Citation Inspector Modal
    // ==========================================================================

    function openCitationInspector(chunk, citationLabel) {
        drawerSourceTitle.textContent = citationLabel;
        drawerChunkText.textContent = chunk.text;
        
        // Render distance score margin
        const distance = chunk.distance !== undefined ? chunk.distance.toFixed(4) : 'N/A';
        drawerDistanceVal.textContent = distance;
        
        // Calculate similarity percentage for aesthetic value
        let fillPercent = 80;
        if (chunk.distance !== undefined) {
            // Distance is usually 0.0 to 1.0 (cosine). Max similarity is 100% at distance=0
            const similarity = Math.max(0, Math.min(100, Math.round((1 - chunk.distance) * 100)));
            fillPercent = similarity;
        }
        drawerDistanceBar.style.width = `${fillPercent}%`;
        
        // Chunk ID and path
        drawerChunkId.textContent = chunk.id || 'N/A';
        drawerFilePath.textContent = `data/uploads/${chunk.metadata?.source_filename || ''}`;
        
        // Toggle visibility
        citationDrawer.classList.remove('hidden');
    }

    closeDrawerBtn.addEventListener('click', () => {
        citationDrawer.classList.add('hidden');
    });

    // Close on clicking overlay background
    citationDrawer.addEventListener('click', (e) => {
        if (e.target === citationDrawer) {
            citationDrawer.classList.add('hidden');
        }
    });

    // Esc Key closes drawer
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !citationDrawer.classList.contains('hidden')) {
            citationDrawer.classList.add('hidden');
        }
    });
});
