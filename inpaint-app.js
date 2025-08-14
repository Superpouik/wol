/**
 * ComfyUI Inpainting App
 * App séparée dédiée à l'inpainting
 */

class InpaintApp {
    constructor() {
        // Configuration réseau (réutilise la même que l'app principale)
        this.settings = this.loadSettings();
        this.serverUrl = this.settings.serverUrl || 'https://comfyui-mobile.duckdns.org/api';
        this.websocketUrl = this.settings.websocketUrl || 'ws://comfyui-mobile.duckdns.org/api/ws';
        
        // Données app
        this.workflow = null;
        this.availableCheckpoints = [];
        this.currentImage = null;
        this.currentMask = null;
        this.isGenerating = false;
        this.websocket = null;
        this.currentPromptId = null;
        this.previewCount = 0;
        this.previousPreviewUrl = null;
        
        // Paramètres inpainting
        this.params = {
            checkpoint: '',
            grow_mask_by: 15,
            prompt_positive: '',
            prompt_negative: '',
            seed: Math.floor(Math.random() * 1000000000),
            steps: 20,
            cfg: 8,
            denoise: 1,
            sampler_name: 'uni_pc_bh2',
            scheduler: 'normal'
        };
        
        // Mask Editor
        this.maskEditor = {
            canvas: null,
            ctx: null,
            originalImageData: null,
            currentTool: 'brush',
            brushSize: 20,
            brushOpacity: 0.8,
            undoStack: [],
            isDrawing: false
        };
        
        this.init();
    }
    
    loadSettings() {
        try {
            const saved = localStorage.getItem('comfyui_settings');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    }
    
    async init() {
        console.log('🖌️ Initialisation app inpainting...');
        
        this.setupEventListeners();
        this.randomizeSeed();
        
        // Connexion serveur
        try {
            await this.checkConnection();
            await this.loadModels();
            await this.loadWorkflow();
        } catch (error) {
            console.error('❌ Erreur initialisation:', error);
        }
    }
    
    setupEventListeners() {
        // Upload image
        document.getElementById('image_input').addEventListener('change', (e) => {
            this.loadImage(e.target.files[0]);
        });
        
        // Boutons image
        document.getElementById('edit_mask_btn').addEventListener('click', (e) => {
            console.log('🖱️ Bouton "Éditer le masque" cliqué', e);
            this.openMaskEditor();
        });
        
        document.getElementById('clear_mask_btn').addEventListener('click', () => {
            this.clearMask();
        });
        
        document.getElementById('remove_image_btn').addEventListener('click', () => {
            this.removeImage();
        });
        
        // Paramètres
        document.getElementById('inpaint_checkpoint').addEventListener('change', (e) => {
            this.params.checkpoint = e.target.value;
        });
        
        document.getElementById('grow_mask').addEventListener('change', (e) => {
            this.params.grow_mask_by = parseInt(e.target.value);
        });
        
        document.getElementById('prompt_positive').addEventListener('change', (e) => {
            this.params.prompt_positive = e.target.value;
        });
        
        document.getElementById('prompt_negative').addEventListener('change', (e) => {
            this.params.prompt_negative = e.target.value;
        });
        
        document.getElementById('seed').addEventListener('change', (e) => {
            this.params.seed = parseInt(e.target.value);
        });
        
        document.getElementById('steps').addEventListener('change', (e) => {
            this.params.steps = parseInt(e.target.value);
        });
        
        document.getElementById('cfg').addEventListener('change', (e) => {
            this.params.cfg = parseFloat(e.target.value);
        });
        
        document.getElementById('denoise').addEventListener('change', (e) => {
            this.params.denoise = parseFloat(e.target.value);
        });
        
        document.getElementById('sampler').addEventListener('change', (e) => {
            this.params.sampler_name = e.target.value;
        });
        
        document.getElementById('scheduler').addEventListener('change', (e) => {
            this.params.scheduler = e.target.value;
        });
        
        document.getElementById('random_seed').addEventListener('click', () => {
            this.randomizeSeed();
        });
        
        // Génération
        document.getElementById('generate_btn').addEventListener('click', () => {
            this.generate();
        });
        
        // Mask Editor
        document.getElementById('save_mask').addEventListener('click', () => {
            this.saveMask();
        });
        
        document.getElementById('cancel_mask').addEventListener('click', () => {
            this.closeMaskEditor();
        });
        
        document.getElementById('brush_tool').addEventListener('click', () => {
            this.selectTool('brush');
        });
        
        document.getElementById('eraser_tool').addEventListener('click', () => {
            this.selectTool('eraser');
        });
        
        document.getElementById('undo_mask').addEventListener('click', () => {
            this.undoMask();
        });
        
        document.getElementById('clear_all_mask').addEventListener('click', () => {
            this.clearAllMask();
        });
        
        // Sliders mask editor
        document.getElementById('brush_size').addEventListener('input', (e) => {
            this.maskEditor.brushSize = parseInt(e.target.value);
            document.getElementById('brush_size_value').textContent = e.target.value + 'px';
        });
        
        document.getElementById('brush_opacity').addEventListener('input', (e) => {
            this.maskEditor.brushOpacity = parseFloat(e.target.value);
            document.getElementById('brush_opacity_value').textContent = Math.round(e.target.value * 100) + '%';
        });
    }
    
    async checkConnection() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        try {
            statusText.textContent = 'Connexion...';
            statusIndicator.className = 'status-indicator';
            
            const response = await fetch(`${this.serverUrl}/object_info`);
            if (response.ok) {
                statusIndicator.classList.add('connected');
                statusText.textContent = 'Connecté';
                console.log('✅ Connexion serveur OK');
                return true;
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            statusIndicator.className = 'status-indicator';
            statusText.textContent = 'Déconnecté';
            console.error('❌ Erreur connexion:', error);
            throw error;
        }
    }
    
    async loadModels() {
        try {
            console.log('📦 Chargement des modèles...');
            const response = await fetch(`${this.serverUrl}/object_info`);
            const data = await response.json();
            
            // Extraire les checkpoints
            if (data.CheckpointLoaderSimple && data.CheckpointLoaderSimple.input && data.CheckpointLoaderSimple.input.required && data.CheckpointLoaderSimple.input.required.ckpt_name) {
                this.availableCheckpoints = data.CheckpointLoaderSimple.input.required.ckpt_name[0];
            }
            
            this.populateCheckpoints();
            console.log('✅ Modèles chargés:', this.availableCheckpoints.length, 'checkpoints');
            
        } catch (error) {
            console.error('❌ Erreur chargement modèles:', error);
        }
    }
    
    populateCheckpoints() {
        const select = document.getElementById('inpaint_checkpoint');
        select.innerHTML = '<option value="">Sélectionner un checkpoint...</option>';
        
        this.availableCheckpoints.forEach(checkpoint => {
            const option = document.createElement('option');
            option.value = checkpoint;
            option.textContent = checkpoint;
            select.appendChild(option);
        });
        
        // Sélectionner le premier checkpoint par défaut
        if (this.availableCheckpoints.length > 0) {
            select.value = this.availableCheckpoints[0];
            this.params.checkpoint = this.availableCheckpoints[0];
        }
    }
    
    async loadWorkflow() {
        try {
            console.log('📋 Chargement workflow inpainting...');
            const response = await fetch('./inpaint.json');
            this.workflow = await response.json();
            console.log('✅ Workflow chargé');
        } catch (error) {
            console.error('❌ Erreur chargement workflow:', error);
        }
    }
    
    randomizeSeed() {
        const newSeed = Math.floor(Math.random() * 1000000000);
        document.getElementById('seed').value = newSeed;
        this.params.seed = newSeed;
    }
    
    loadImage(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImage = {
                data: e.target.result,
                name: file.name,
                type: file.type,
                file: file
            };
            
            // Afficher preview
            const preview = document.getElementById('image_preview');
            const img = document.getElementById('image_display');
            
            img.src = e.target.result;
            preview.style.display = 'block';
            
            // Reset masque
            this.currentMask = null;
            document.getElementById('mask_status').style.display = 'none';
            
            this.updateGenerateButton();
            console.log('📷 Image chargée:', file.name);
        };
        reader.readAsDataURL(file);
    }
    
    removeImage() {
        this.currentImage = null;
        this.currentMask = null;
        
        document.getElementById('image_preview').style.display = 'none';
        document.getElementById('image_input').value = '';
        document.getElementById('mask_status').style.display = 'none';
        
        this.updateGenerateButton();
    }
    
    clearMask() {
        this.currentMask = null;
        document.getElementById('mask_status').style.display = 'none';
        
        // Cacher la preview du masque
        const maskPreview = document.getElementById('mask_preview');
        if (maskPreview) {
            maskPreview.style.display = 'none';
        }
        
        this.updateGenerateButton();
    }
    
    updateGenerateButton() {
        const btn = document.getElementById('generate_btn');
        const hasImage = !!this.currentImage;
        const hasMask = !!this.currentMask;
        const hasCheckpoint = !!this.params.checkpoint;
        
        btn.disabled = !hasImage || !hasMask || !hasCheckpoint || this.isGenerating;
        
        if (this.isGenerating) {
            btn.textContent = '⏳ Génération en cours...';
        } else {
            btn.textContent = '🖌️ Générer Inpainting';
        }
    }
    
    // === MASK EDITOR ===
    
    openMaskEditor() {
        console.log('🎨 openMaskEditor appelé');
        
        if (!this.currentImage) {
            console.log('❌ Pas d\'image chargée');
            alert('Veuillez d\'abord charger une image');
            return;
        }
        
        console.log('✅ Image disponible, ouverture modal...');
        
        const modal = document.getElementById('maskEditorModal');
        if (!modal) {
            console.error('❌ Element maskEditorModal non trouvé !');
            return;
        }
        
        console.log('📦 Modal trouvé:', modal);
        
        // Forcer l'affichage
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        console.log('🎯 Modal affiché, style:', modal.style.display);
        
        setTimeout(() => {
            console.log('🔧 Initialisation mask editor...');
            this.initMaskEditor();
        }, 100);
    }
    
    closeMaskEditor() {
        const modal = document.getElementById('maskEditorModal');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    
    initMaskEditor() {
        console.log('🎨 initMaskEditor - début');
        
        this.maskEditor.canvas = document.getElementById('maskCanvas');
        if (!this.maskEditor.canvas) {
            console.error('❌ Canvas maskCanvas non trouvé !');
            return;
        }
        
        console.log('✅ Canvas trouvé:', this.maskEditor.canvas);
        
        this.maskEditor.ctx = this.maskEditor.canvas.getContext('2d');
        console.log('✅ Context 2D créé');
        
        const img = new Image();
        img.onload = () => {
            console.log('🖼️ Image chargée dans mask editor:', img.width, 'x', img.height);
            
            // Calculer la taille optimale pour l'écran mobile fullscreen
            const containerWidth = window.innerWidth - 40; // Marge réduite pour plus d'espace
            const containerHeight = window.innerHeight * 0.7; // 70% de la hauteur d'écran pour plus d'espace
            
            let canvasWidth = img.width;
            let canvasHeight = img.height;
            
            // Redimensionner si trop grand pour l'écran
            const scaleW = containerWidth / img.width;
            const scaleH = containerHeight / img.height;
            const scale = Math.min(scaleW, scaleH, 1); // Ne pas agrandir, seulement réduire
            
            if (scale < 1) {
                canvasWidth = Math.floor(img.width * scale);
                canvasHeight = Math.floor(img.height * scale);
                console.log('📏 Redimensionnement:', img.width, 'x', img.height, '→', canvasWidth, 'x', canvasHeight, '(scale:', scale.toFixed(2), ')');
            }
            
            this.maskEditor.canvas.width = canvasWidth;
            this.maskEditor.canvas.height = canvasHeight;
            this.maskEditor.canvas.style.width = canvasWidth + 'px';
            this.maskEditor.canvas.style.height = canvasHeight + 'px';
            
            // Stocker les dimensions originales pour l'export
            this.maskEditor.originalImageWidth = img.width;
            this.maskEditor.originalImageHeight = img.height;
            this.maskEditor.canvasScale = scale;
            
            // Dessiner l'image
            this.maskEditor.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
            
            // Sauvegarder l'original
            this.maskEditor.originalImageData = this.maskEditor.ctx.getImageData(0, 0, canvasWidth, canvasHeight);
            this.maskEditor.undoStack = [this.maskEditor.originalImageData.data.slice()];
            
            this.setupMaskEditorEvents();
            console.log('🎨 Mask editor initialisé');
        };
        
        img.src = this.currentImage.data;
    }
    
    setupMaskEditorEvents() {
        const canvas = this.maskEditor.canvas;
        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;
        
        const getCoords = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            
            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        };
        
        const startDrawing = (e) => {
            e.preventDefault();
            isDrawing = true;
            const coords = getCoords(e);
            lastX = coords.x;
            lastY = coords.y;
            // Dessiner immédiatement pour supporter le tap simple
            this.drawOnMask(lastX, lastY, lastX, lastY);
        };
        
        const draw = (e) => {
            e.preventDefault();
            if (!isDrawing) return;
            
            const coords = getCoords(e);
            this.drawOnMask(lastX, lastY, coords.x, coords.y);
            lastX = coords.x;
            lastY = coords.y;
        };
        
        const stopDrawing = (e) => {
            e.preventDefault();
            if (isDrawing) {
                isDrawing = false;
                this.saveUndoState();
            }
        };
        
        // Events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);
    }
    
    drawOnMask(x1, y1, x2, y2) {
        const ctx = this.maskEditor.ctx;
        
        if (this.maskEditor.currentTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = this.maskEditor.brushOpacity * 0.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        } else if (this.maskEditor.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            
            const imageData = this.maskEditor.originalImageData;
            const size = this.maskEditor.brushSize;
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(x2, y2, size/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.putImageData(imageData, 0, 0);
            ctx.restore();
            return;
        }
        
        ctx.lineWidth = this.maskEditor.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Vérifier si c'est un tap simple (même coordonnées)
        const isTap = Math.abs(x2 - x1) < 2 && Math.abs(y2 - y1) < 2;
        
        if (isTap) {
            // Dessiner un cercle pour le tap simple
            ctx.beginPath();
            ctx.arc(x1, y1, this.maskEditor.brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Dessiner une ligne pour le drag
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }
    
    selectTool(tool) {
        this.maskEditor.currentTool = tool;
        
        // Mettre à jour UI
        document.getElementById('brush_tool').className = 
            tool === 'brush' ? 'btn btn-primary tool-btn active' : 'btn btn-secondary tool-btn';
        document.getElementById('eraser_tool').className = 
            tool === 'eraser' ? 'btn btn-primary tool-btn active' : 'btn btn-secondary tool-btn';
    }
    
    saveUndoState() {
        const canvas = this.maskEditor.canvas;
        const imageData = this.maskEditor.ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.maskEditor.undoStack.push(imageData.data.slice());
        
        if (this.maskEditor.undoStack.length > 20) {
            this.maskEditor.undoStack.shift();
        }
    }
    
    undoMask() {
        if (this.maskEditor.undoStack.length > 1) {
            this.maskEditor.undoStack.pop();
            const previousState = this.maskEditor.undoStack[this.maskEditor.undoStack.length - 1];
            
            const canvas = this.maskEditor.canvas;
            const imageData = this.maskEditor.ctx.createImageData(canvas.width, canvas.height);
            imageData.data.set(previousState);
            this.maskEditor.ctx.putImageData(imageData, 0, 0);
        }
    }
    
    clearAllMask() {
        if (this.maskEditor.originalImageData) {
            this.maskEditor.ctx.putImageData(this.maskEditor.originalImageData, 0, 0);
            this.saveUndoState();
        }
    }
    
    saveMask() {
        if (!this.maskEditor.canvas) {
            alert('Aucun masque à sauvegarder');
            return;
        }
        
        // Créer le masque
        const canvas = this.maskEditor.canvas;
        const currentImageData = this.maskEditor.ctx.getImageData(0, 0, canvas.width, canvas.height);
        const originalImageData = this.maskEditor.originalImageData;
        
        // Créer canvas temporaire pour masque à la taille appropriée
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Utiliser les dimensions originales de l'image si disponibles
        const originalWidth = this.maskEditor.originalImageWidth || canvas.width;
        const originalHeight = this.maskEditor.originalImageHeight || canvas.height;
        
        // Créer masque à la taille du canvas d'édition
        const maskCanvas = document.createElement('canvas');
        const maskCtx = maskCanvas.getContext('2d');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        
        const maskImageData = maskCtx.createImageData(canvas.width, canvas.height);
        
        // Comparer pixels sur le canvas d'édition
        for (let i = 0; i < currentImageData.data.length; i += 4) {
            const currentR = currentImageData.data[i];
            const currentG = currentImageData.data[i + 1];
            const currentB = currentImageData.data[i + 2];
            
            const originalR = originalImageData.data[i];
            const originalG = originalImageData.data[i + 1];
            const originalB = originalImageData.data[i + 2];
            
            const diff = Math.abs(currentR - originalR) + Math.abs(currentG - originalG) + Math.abs(currentB - originalB);
            
            if (diff > 30) {
                // Zone modifiée = blanc
                maskImageData.data[i] = 255;
                maskImageData.data[i + 1] = 255;
                maskImageData.data[i + 2] = 255;
            } else {
                // Zone normale = noir
                maskImageData.data[i] = 0;
                maskImageData.data[i + 1] = 0;
                maskImageData.data[i + 2] = 0;
            }
            maskImageData.data[i + 3] = 255;
        }
        
        maskCtx.putImageData(maskImageData, 0, 0);
        
        // Si l'image a été redimensionnée, agrandir le masque à la taille originale
        if (this.maskEditor.canvasScale && this.maskEditor.canvasScale < 1) {
            tempCanvas.width = originalWidth;
            tempCanvas.height = originalHeight;
            // Redimensionner le masque à la taille originale
            tempCtx.drawImage(maskCanvas, 0, 0, originalWidth, originalHeight);
            console.log('📏 Masque redimensionné à la taille originale:', originalWidth, 'x', originalHeight);
        } else {
            // Pas de redimensionnement nécessaire
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx.drawImage(maskCanvas, 0, 0);
        }
        
        this.currentMask = {
            canvas: tempCanvas,
            dataURL: tempCanvas.toDataURL('image/png')
        };
        
        console.log('💾 Masque sauvegardé');
        document.getElementById('mask_status').style.display = 'block';
        
        // Afficher le masque sur la preview
        this.showMaskPreview();
        
        this.updateGenerateButton();
        this.closeMaskEditor();
    }
    
    showMaskPreview() {
        if (!this.currentMask) return;
        
        const maskCanvas = document.getElementById('mask_preview');
        const img = document.getElementById('image_display');
        
        if (!maskCanvas || !img) return;
        
        // Ajuster la taille du canvas à l'image affichée
        maskCanvas.width = img.naturalWidth;
        maskCanvas.height = img.naturalHeight;
        maskCanvas.style.width = img.offsetWidth + 'px';
        maskCanvas.style.height = img.offsetHeight + 'px';
        
        const ctx = maskCanvas.getContext('2d');
        
        // Dessiner le masque original sur le canvas preview
        ctx.drawImage(this.currentMask.canvas, 0, 0, maskCanvas.width, maskCanvas.height);
        
        // Afficher le canvas
        maskCanvas.style.display = 'block';
        
        console.log('🎭 Preview du masque affiché');
    }
    
    // === GÉNÉRATION ===
    
    async generate() {
        console.log('🎨 Tentative génération inpainting...');
        console.log('📊 État actuel - isGenerating:', this.isGenerating, 'workflow:', !!this.workflow, 'currentImage:', !!this.currentImage, 'currentMask:', !!this.currentMask);
        
        if (this.isGenerating) {
            console.log('⚠️ Génération déjà en cours, abandon');
            return;
        }
        
        if (!this.workflow || !this.currentImage || !this.currentMask) {
            alert('Workflow, image ou masque manquant');
            return;
        }
        
        console.log('✅ Validation OK, démarrage génération');
        this.isGenerating = true;
        this.updateGenerateButton();
        
        try {
            console.log('🎨 Début génération inpainting...');
            
            // Préparer workflow
            const workflow = JSON.parse(JSON.stringify(this.workflow));
            
            // Mettre à jour paramètres
            workflow['29'].inputs.ckpt_name = this.params.checkpoint;
            workflow['6'].inputs.text = this.params.prompt_positive;
            workflow['7'].inputs.text = this.params.prompt_negative;
            workflow['3'].inputs.seed = this.params.seed;
            workflow['3'].inputs.steps = this.params.steps;
            workflow['3'].inputs.cfg = this.params.cfg;
            workflow['3'].inputs.sampler_name = this.params.sampler_name;
            workflow['3'].inputs.scheduler = this.params.scheduler;
            workflow['3'].inputs.denoise = this.params.denoise;
            workflow['26'].inputs.grow_mask_by = this.params.grow_mask_by;
            
            // Créer image composite avec masque dans canal alpha
            console.log('🎨 Création image composite avec masque...');
            const compositeBlob = await this.createCompositeImageWithMask();
            
            const formData = new FormData();
            formData.append('image', compositeBlob, 'inpaint_composite.png');
            formData.append('type', 'input');
            formData.append('subfolder', '');
            
            const uploadResponse = await fetch(`${this.serverUrl}/upload/image`, {
                method: 'POST',
                body: formData
            });
            
            if (!uploadResponse.ok) {
                throw new Error('Erreur upload image composite');
            }
            
            const uploadResult = await uploadResponse.json();
            console.log('📤 Upload image composite terminé:', uploadResult);
            
            // Mettre à jour workflow avec nom fichier
            workflow['20'].inputs.image = uploadResult.name;
            
            // Envoyer workflow
            const response = await fetch(`${this.serverUrl}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: workflow })
            });
            
            if (!response.ok) {
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
            const result = await response.json();
            this.currentPromptId = result.prompt_id;
            
            console.log('🚀 Inpainting lancé, prompt_id:', this.currentPromptId);
            
            // Afficher progression
            document.getElementById('progress').style.display = 'block';
            
            // Connecter WebSocket pour suivi
            this.connectWebSocket();
            
            // Timeout de sécurité au cas où on ne reçoit pas le message de fin
            this.resultTimeout = setTimeout(() => {
                console.log('⏰ Timeout atteint, tentative de récupération du résultat...');
                if (this.isGenerating && this.currentPromptId) {
                    console.log('⏰ Timeout - forcer la récupération du résultat');
                    this.fetchResult();
                } else {
                    console.log('⏰ Timeout - mais génération non active');
                    this.finalizeGeneration();
                }
            }, 90000); // 90 secondes pour plus de sécurité
            
        } catch (error) {
            console.error('❌ Erreur génération:', error);
            alert('Erreur: ' + error.message);
            this.finalizeGeneration();
        }
    }
    
    dataURLToBlob(dataURL) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(resolve, 'image/png');
            };
            
            img.src = dataURL;
        });
    }
    
    createCompositeImageWithMask() {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Charger l'image originale
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                
                // Dessiner l'image de base
                ctx.drawImage(img, 0, 0);
                
                // Charger le masque
                const maskImg = new Image();
                maskImg.onload = () => {
                    // Créer un canvas temporaire pour redimensionner le masque
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    
                    // Redimensionner le masque pour qu'il ait la même taille que l'image
                    tempCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
                    
                    // Récupérer les données d'image
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const maskData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    // Appliquer le masque dans le canal alpha
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        // Le masque est en noir/blanc, on utilise le canal rouge
                        const maskValue = maskData.data[i]; // 0 = noir (préserver), 255 = blanc (inpaint)
                        
                        // Dans ComfyUI, alpha = 0 signifie "zone à inpaint", alpha = 255 signifie "préserver"
                        // Donc on inverse le masque : blanc (255) → alpha 0, noir (0) → alpha 255
                        imageData.data[i + 3] = 255 - maskValue;
                    }
                    
                    // Appliquer les données modifiées
                    ctx.putImageData(imageData, 0, 0);
                    
                    // Convertir en blob
                    canvas.toBlob(resolve, 'image/png');
                    
                    console.log('✅ Image composite créée:', canvas.width, 'x', canvas.height);
                };
                
                maskImg.src = this.currentMask.dataURL;
            };
            
            img.src = this.currentImage.data;
        });
    }
    
    connectWebSocket() {
        try {
            // Fermer l'ancienne connexion si elle existe
            if (this.websocket) {
                this.websocket.close();
                this.websocket = null;
            }
            
            console.log('🔗 Connexion WebSocket pour prompt_id:', this.currentPromptId);
            this.websocket = new WebSocket(this.websocketUrl);
            
            this.websocket.onopen = () => {
                console.log('🔌 WebSocket connecté pour', this.currentPromptId);
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    // Vérifier que les données sont du JSON et pas du Blob
                    if (typeof event.data === 'string') {
                        // Ignorer les messages vides ou trop courts
                        if (event.data.length < 3) {
                            console.log('🚫 Message trop court ignoré:', event.data.length);
                            return;
                        }
                        
                        console.log('📝 Message JSON WebSocket reçu (', event.data.length, 'chars):', event.data.substring(0, 200) + (event.data.length > 200 ? '...' : ''));
                        const message = JSON.parse(event.data);
                        console.log('📄 Message parsé - type:', message.type, 'prompt_id:', message.data?.prompt_id);
                        this.handleWebSocketMessage(message);
                    } else if (event.data instanceof Blob) {
                        // Traiter les données binaires selon l'API ComfyUI
                        console.log('🖼️ Données binaires reçues:', event.data.size, 'bytes, type:', event.data.type);
                        this.handleBinaryImageData(event.data);
                    } else {
                        console.log('❓ Type de message inconnu:', typeof event.data, event.data);
                    }
                } catch (error) {
                    console.warn('⚠️ Erreur traitement message WebSocket:', error.message);
                    console.warn('Data type:', typeof event.data, 'length:', event.data?.length || 'N/A');
                    if (typeof event.data === 'string' && event.data.length < 500) {
                        console.warn('Data content:', event.data);
                    }
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ Erreur WebSocket:', error);
            };
            
            this.websocket.onclose = () => {
                console.log('🔌 WebSocket fermé');
                this.websocket = null;
                
                // Nettoyer les URLs de preview
                if (this.previousPreviewUrl) {
                    URL.revokeObjectURL(this.previousPreviewUrl);
                    this.previousPreviewUrl = null;
                }
            };
            
        } catch (error) {
            console.error('❌ Erreur connexion WebSocket:', error);
        }
    }
    
    handleWebSocketMessage(data) {
        // Messages de type "executing" (ancien format)
        if (data.type === 'executing' && data.data.prompt_id === this.currentPromptId) {
            if (data.data.node === null) {
                // Génération terminée
                console.log('✅ Génération terminée (executing)');
                this.onGenerationComplete();
            } else if (data.data.node) {
                // Mise à jour progression
                console.log('🔄 Exécution nœud:', data.data.node);
                this.updateProgress(`Traitement nœud ${data.data.node}...`);
            }
        } 
        // Messages de type "progress_state" (nouveau format)
        else if (data.type === 'progress_state' && data.data.prompt_id === this.currentPromptId) {
            const nodes = data.data.nodes;
            console.log('📊 Progress state reçu:', Object.keys(nodes), 'états:', Object.values(nodes).map(n => n.state));
            
            const allFinished = Object.values(nodes).every(node => node.state === 'finished');
            const hasMultipleNodes = Object.keys(nodes).length > 1;
            
            // Chercher spécifiquement le nœud SaveImage (9) 
            const saveImageNode = nodes['9'];
            const hasSaveImageFinished = saveImageNode && saveImageNode.state === 'finished';
            
            if (hasSaveImageFinished && allFinished) {
                // Le nœud SaveImage ET tous les autres sont terminés
                console.log('✅ Génération terminée (progress_state) - SaveImage fini + tous finis:', Object.keys(nodes));
                this.onGenerationComplete();
            } else {
                // Mise à jour progression
                const runningNodes = Object.values(nodes).filter(node => node.state === 'running');
                if (runningNodes.length > 0) {
                    const currentNode = runningNodes[0];
                    const progress = Math.round((currentNode.value / currentNode.max) * 100);
                    this.updateProgress(`Nœud ${currentNode.node_id}: ${progress}%`, progress);
                } else if (allFinished && hasMultipleNodes) {
                    console.log('⚠️ Tous finis mais pas de SaveImage détecté');
                    // NE PAS déclencher de timeout ici, attendre les vrais nœuds de fin
                }
            }
        }
        // Messages de progression individuelle
        else if (data.type === 'progress' && data.data.prompt_id === this.currentPromptId) {
            // Mise à jour barre de progression
            const progress = Math.round((data.data.value / data.data.max) * 100);
            this.updateProgress(`Génération: ${progress}%`, progress);
        }
        // Messages de status - fallback pour détecter fin de queue
        else if (data.type === 'status' && data.data.status && data.data.status.exec_info) {
            const queueRemaining = data.data.status.exec_info.queue_remaining;
            console.log('📋 Status reçu - queue_remaining:', queueRemaining);
            
            if (queueRemaining === 0 && this.isGenerating && this.currentPromptId) {
                console.log('🎯 Queue vide détectée - génération probablement finie');
                // Attendre un peu puis forcer la récupération si toujours en génération
                setTimeout(() => {
                    if (this.isGenerating && this.currentPromptId) {
                        console.log('🔄 Timeout status - forcer completion par queue vide');
                        this.onGenerationComplete();
                    }
                }, 5000);
            }
        }
    }
    
    onGenerationComplete() {
        console.log('🎉 Génération complètement terminée !');
        
        // Nettoyer le timeout de sécurité
        if (this.resultTimeout) {
            clearTimeout(this.resultTimeout);
            this.resultTimeout = null;
        }
        
        // Afficher un message de récupération de l'image finale
        const resultContainer = document.getElementById('result');
        resultContainer.innerHTML = `
            <div class="fetching-result">
                <p style="color: var(--ios-blue); text-align: center; margin-bottom: var(--ios-spacing-8); font-weight: 600;">
                    🔄 Récupération de l'image finale...
                </p>
                <div style="text-align: center;">
                    <div class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 2px solid var(--ios-separator); border-top: 2px solid var(--ios-blue); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                </div>
            </div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
        
        // Récupérer l'image et PUIS mettre à jour l'état
        setTimeout(() => {
            this.fetchResult();
        }, 3000); // 3 secondes pour laisser le temps au serveur de sauvegarder
    }
    
    handleBinaryImageData(blob) {
        console.log('🖼️ Données binaires reçues:', blob.size, 'bytes, prompt_id actuel:', this.currentPromptId);
        
        // Vérifier si on est en cours de génération
        if (this.isGenerating && this.currentPromptId) {
            this.processBinaryImageData(blob);
        } else {
            console.log('📋 Données binaires ignorées (pas en génération)');
        }
    }
    
    processBinaryImageData(blob) {
        console.log('🔧 Traitement des données binaires - taille:', blob.size, 'type:', blob.type);
        
        // Vérifier la taille minimum du blob
        if (blob.size < 100) {
            console.warn('⚠️ Blob trop petit:', blob.size);
            return;
        }
        
        // Convertir le Blob en ArrayBuffer pour traiter les bytes
        blob.arrayBuffer().then(buffer => {
            console.log('📦 ArrayBuffer créé, taille:', buffer.byteLength);
            
            // Selon l'API ComfyUI, ignorer les 8 premiers bytes (header)
            const imageData = buffer.slice(8);
            
            if (imageData.byteLength < 1000) {
                console.warn('⚠️ Données binaires trop petites après suppression du header:', imageData.byteLength);
                // Essayer sans enlever le header
                console.log('🔄 Tentative sans suppression du header...');
                const imageBlob = new Blob([buffer], { type: 'image/png' });
                const blobUrl = URL.createObjectURL(imageBlob);
                this.displayBlobPreview(blobUrl);
                return;
            }
            
            console.log('✅ Image binaire traitée:', imageData.byteLength, 'bytes');
            
            // Créer un nouveau Blob sans le header
            const imageBlob = new Blob([imageData], { type: 'image/png' });
            const blobUrl = URL.createObjectURL(imageBlob);
            
            console.log('🖼️ Blob URL créée:', blobUrl);
            
            // Afficher la preview
            this.displayBlobPreview(blobUrl);
            
        }).catch(error => {
            console.error('❌ Erreur traitement des données binaires:', error);
            // Fallback: essayer d'afficher le blob directement
            console.log('🔄 Fallback: affichage du blob brut...');
            const blobUrl = URL.createObjectURL(blob);
            this.displayBlobPreview(blobUrl);
        });
    }
    
    displayBlobPreview(blobUrl) {
        const resultContainer = document.getElementById('result');
        
        // Incrémenter le compteur de previews si on n'en a pas
        if (!this.previewCount) this.previewCount = 0;
        this.previewCount++;
        
        // Masquer la progression et afficher le preview en grand
        const progressDiv = document.getElementById('progress');
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
        
        resultContainer.innerHTML = `
            <div class="preview-result">
                <p style="color: var(--ios-blue); text-align: center; margin-bottom: var(--ios-spacing-8); font-weight: 600;">
                    🔄 Preview Live #${this.previewCount}
                </p>
                <div style="text-align: center; margin-bottom: var(--ios-spacing-8);">
                    <div class="preview-badge" style="display: inline-block; background: var(--ios-blue); color: white; padding: var(--ios-spacing-4) var(--ios-spacing-8); border-radius: 12px; font-size: 12px; font-weight: 600;">Génération en cours...</div>
                </div>
                <img src="${blobUrl}" alt="Aperçu inpainting" style="max-width: 100%; border-radius: var(--ios-corner-radius-medium); border: 2px solid var(--ios-blue); box-shadow: var(--ios-shadow-large);" onload="console.log('✅ Preview Blob #${this.previewCount} chargé')" onerror="console.error('❌ Erreur chargement preview blob #${this.previewCount}')">
                <p style="color: var(--ios-label-secondary); text-align: center; margin-top: var(--ios-spacing-8); font-size: 14px;">Mise à jour automatique...</p>
            </div>
        `;
        
        console.log('👁️ Preview affichée:', this.previewCount, 'URL:', blobUrl);
        
        // Nettoyer les anciennes URLs pour éviter les fuites mémoire
        if (this.previousPreviewUrl) {
            URL.revokeObjectURL(this.previousPreviewUrl);
        }
        this.previousPreviewUrl = blobUrl;
    }
    
    updateProgress(text, percentage = null) {
        const progressText = document.querySelector('.progress-text');
        const progressFill = document.querySelector('.progress-fill');
        
        if (progressText) {
            progressText.textContent = text;
        }
        
        if (percentage !== null && progressFill) {
            progressFill.style.width = percentage + '%';
        }
    }
    
    async fetchResult() {
        try {
            console.log('🔍 Récupération du résultat pour prompt_id:', this.currentPromptId);
            
            // Essayer plusieurs fois avec un délai entre chaque tentative
            let maxRetries = 3;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                try {
                    console.log(`🔄 Tentative ${retryCount + 1}/${maxRetries}...`);
                    
                    const response = await fetch(`${this.serverUrl}/history/${this.currentPromptId}`);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const history = await response.json();
                    console.log('📋 Historique reçu, clés:', Object.keys(history));
                    
                    if (history[this.currentPromptId]) {
                        const execution = history[this.currentPromptId];
                        console.log('✅ Execution trouvée pour prompt_id:', this.currentPromptId);
                        console.log('📊 Status:', execution.status?.status_str || 'non défini');
                        console.log('📤 Outputs disponibles:', execution.outputs ? Object.keys(execution.outputs) : 'aucun');
                        
                        if (execution.outputs) {
                            const outputs = execution.outputs;
                            
                            // Chercher l'image de sortie dans tous les nœuds
                            let imageFound = false;
                            for (const nodeId in outputs) {
                                const output = outputs[nodeId];
                                console.log(`🔍 Vérification nœud ${nodeId}:`, output);
                                
                                if (output.images && output.images.length > 0) {
                                    const image = output.images[0];
                                    console.log('🖼️ Image trouvée dans nœud', nodeId, ':', image);
                                    
                                    // Utiliser la même méthode que l'app principale
                                    const imageUrl = this.buildImageUrl(image);
                                    if (imageUrl) {
                                        console.log('✅ URL image construite:', imageUrl);
                                        this.displayResult(imageUrl);
                                        this.finalizeGeneration();
                                        return;
                                    } else {
                                        console.log('⚠️ Échec construction URL pour:', image);
                                    }
                                    imageFound = true;
                                    break;
                                }
                            }
                            
                            if (imageFound) {
                                // Une image a été trouvée mais l'URL n'a pas pu être construite
                                console.log('⚠️ Image trouvée mais URL non constructible');
                                break;
                            }
                            
                            console.log('⚠️ Aucune image dans les outputs, tentative suivante...');
                        } else {
                            console.log('⚠️ Pas d\'outputs, tentative suivante...');
                        }
                    } else {
                        console.log('⚠️ Prompt ID non trouvé, tentative suivante...');
                    }
                    
                } catch (fetchError) {
                    console.log('⚠️ Erreur lors de la tentative', retryCount + 1, ':', fetchError.message);
                }
                
                retryCount++;
                
                // Attendre avant la prochaine tentative (sauf pour la dernière)
                if (retryCount < maxRetries) {
                    console.log('⏳ Attente de 2 secondes avant nouvelle tentative...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            console.log('❌ Aucune image trouvée après', maxRetries, 'tentatives');
            this.displayError('Aucune image générée trouvée après plusieurs tentatives');
            this.finalizeGeneration();
            
        } catch (error) {
            console.error('❌ Erreur générale récupération résultat:', error);
            this.displayError('Erreur lors de la récupération du résultat: ' + error.message);
            this.finalizeGeneration();
        }
    }
    
    buildImageUrl(imageInfo) {
        const { filename, subfolder, type } = imageInfo;
        
        if (!filename) {
            console.error('❌ Filename manquant:', imageInfo);
            return null;
        }
        
        // Construire les paramètres de l'URL comme dans l'app principale
        const params = new URLSearchParams();
        params.set('filename', filename);
        
        if (subfolder && subfolder !== '') {
            params.set('subfolder', subfolder);
        }
        
        if (type && type !== '') {
            params.set('type', type);
        }
        
        const imageUrl = `${this.serverUrl}/view?${params.toString()}`;
        console.log('🖼️ URL construite:', imageUrl);
        return imageUrl;
    }
    
    displayResult(imageUrl) {
        const resultContainer = document.getElementById('result');
        resultContainer.innerHTML = `
            <div class="image-result">
                <p style="color: var(--ios-green); text-align: center; margin-bottom: var(--ios-spacing-12); font-weight: 600; font-size: 16px;">
                    ✅ Inpainting terminé avec succès !
                </p>
                <div style="text-align: center; margin-bottom: var(--ios-spacing-12);">
                    <div class="success-badge" style="display: inline-block; background: var(--ios-green); color: white; padding: var(--ios-spacing-6) var(--ios-spacing-12); border-radius: 16px; font-size: 14px; font-weight: 600;">🎉 Génération réussie</div>
                </div>
                <img src="${imageUrl}" alt="Résultat inpainting" class="result-image" style="max-width: 100%; border-radius: var(--ios-corner-radius-medium); border: 2px solid var(--ios-green); box-shadow: var(--ios-shadow-large);" onload="console.log('✅ Image résultat chargée depuis:', '${imageUrl}')" onerror="console.error('❌ Erreur chargement image résultat depuis:', '${imageUrl}')">
                <div style="margin-top: var(--ios-spacing-16); text-align: center; display: flex; gap: var(--ios-spacing-8); justify-content: center; flex-wrap: wrap;">
                    <a href="${imageUrl}" download="inpaint_result.png" class="btn btn-primary" style="text-decoration: none;">💾 Télécharger</a>
                    <button class="btn btn-secondary" onclick="navigator.share && navigator.share({files: [fetch('${imageUrl}').then(r => r.blob()).then(b => new File([b], 'inpaint_result.png', {type: 'image/png'}))]}).catch(e => console.log('Partage non disponible'))">📤 Partager</button>
                </div>
            </div>
        `;
        
        console.log('🖼️ Résultat affiché:', imageUrl);
    }
    
    finalizeGeneration() {
        console.log('🏁 Finalisation de la génération');
        console.log('📊 État avant finalisation - isGenerating:', this.isGenerating, 'currentPromptId:', this.currentPromptId);
        
        this.isGenerating = false;
        this.updateGenerateButton();
        document.getElementById('progress').style.display = 'none';
        
        // Fermer et nettoyer le WebSocket
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
            console.log('🔌 WebSocket fermé après génération');
        }
        
        // Nettoyer les previews
        if (this.previousPreviewUrl) {
            URL.revokeObjectURL(this.previousPreviewUrl);
            this.previousPreviewUrl = null;
        }
        
        // Reset compteur
        this.previewCount = 0;
        this.currentPromptId = null;
        
        console.log('✅ Finalisation terminée - prêt pour nouvelle génération');
    }
    
    displayError(message) {
        const resultContainer = document.getElementById('result');
        resultContainer.innerHTML = `
            <div class="error-result">
                <p style="color: var(--ios-red); text-align: center; padding: var(--ios-spacing-16); background: var(--ios-background-secondary); border-radius: var(--ios-corner-radius-medium);">
                    ❌ ${message}
                </p>
            </div>
        `;
    }
}

// Fonctions utilitaires pour les sections collapsibles (copiées de l'app principale)
function handleHeaderClick(event, targetId, header) {
    // Empêcher la propagation vers le bouton collapse
    if (event.target.closest('.collapse-btn')) {
        return;
    }
    toggleSectionCollapse(targetId, header.querySelector('.collapse-btn'));
}

function toggleSectionCollapse(contentId, btn) {
    const content = document.getElementById(contentId);
    const icon = btn.querySelector('.collapse-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
        btn.title = 'Réduire/Agrandir';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
        btn.title = 'Réduire/Agrandir';
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Démarrage inpaint-app.js');
    console.log('📍 URL actuelle:', window.location.href);
    console.log('📍 Pathname:', window.location.pathname);
    
    // Vérifier qu'on est sur la bonne page
    if (!window.location.pathname.includes('inpaint-app.html')) {
        console.error('❌ ERREUR: inpaint-app.js chargé sur la mauvaise page!');
        console.error('✅ Pour utiliser l\'inpainting, allez sur inpaint-app.html');
        alert('❌ Cette page n\'est pas l\'app inpainting!\n\n✅ Cliquez sur le lien "Inpaint" dans la barre de navigation pour accéder à l\'inpainting.');
        return;
    }
    
    console.log('✅ Page inpainting détectée, initialisation...');
    window.inpaintApp = new InpaintApp();
});