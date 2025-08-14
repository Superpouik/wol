class ComfyUIInterface {
    constructor() {
        // Charger les paramètres depuis localStorage
        this.settings = this.loadSettings();
        this.serverUrl = this.settings.serverUrl;
        this.websocketUrl = this.settings.websocketUrl;
        this.currentWorkflow = null;
        this.currentWorkflowName = null;
        this.savedWorkflows = this.loadSavedWorkflows();
        this.objectInfo = null;
        this.availableModels = {
            checkpoints: [],
            loras: [],
            controlnets: [],
            vae: [],
            upscale_models: [],
            embeddings: []
        };
        this.nodeBypassStates = {};
        this.generatedImages = JSON.parse(localStorage.getItem('generatedImages') || '[]');
        this.websocket = null;
        this.currentPromptId = null;
        this.showIntermediateImages = false;
        this.previewCount = 0;
        this.previewHistory = [];
        this.currentExecutingNode = null; // Pour suivre le node en cours d'exécution
        this.isGenerating = false; // Suivre l'état de génération
        this.isCancelled = false; // Pour détecter l'annulation
        
        // LoRA Management
        this.powerLoraLoaderNode = null;
        this.availableLorasFiltered = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettingsUI();
        this.checkServerConnection().then(() => {
            console.log('🔌 Connexion serveur OK, chargement des modèles...');
            this.loadModels();
        }).catch(error => {
            console.error('❌ Pas de connexion serveur, pas de chargement des modèles');
        });
        this.loadGallery();
        this.updateWorkflowUI();
        
        // Charger le dernier workflow utilisé
        setTimeout(() => {
            this.loadLastWorkflow();
        }, 500);
    }

    setupEventListeners() {
        // Navigation par onglets
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Import de workflow
        document.getElementById('workflowFile').addEventListener('change', (e) => {
            this.loadWorkflow(e.target.files[0]);
        });

        // Actualisation des modèles
        document.getElementById('refreshModels').addEventListener('click', () => {
            this.loadModels();
        });

        // Génération d'image
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateImage();
        });
        
        // Prévisualisation du workflow
        document.getElementById('previewWorkflowBtn').addEventListener('click', () => {
            this.previewWorkflow();
        });
        
        // Fermer la prévisualisation
        document.getElementById('closePreviewBtn').addEventListener('click', () => {
            this.closePreview();
        });
        
        // Télécharger le workflow
        document.getElementById('downloadWorkflowBtn').addEventListener('click', () => {
            this.downloadWorkflow();
        });

        // Génération rapide / Annulation
        document.getElementById('quickGenerateBtn').addEventListener('click', () => {
            if (this.isGenerating) {
                this.cancelGeneration();
            } else {
                this.quickGenerate();
            }
        });

        // Vider la galerie
        document.getElementById('clearGallery').addEventListener('click', () => {
            this.clearGallery();
        });
        
        // LoRA Management
        this.setupLoraEventListeners();

        // Settings
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });
        
        document.getElementById('resetSettings').addEventListener('click', () => {
            this.resetSettings();
        });
        
        document.getElementById('testServerConnection').addEventListener('click', () => {
            this.testServerConnection();
        });
        
        document.getElementById('testWebSocketConnection').addEventListener('click', () => {
            this.testWebSocketConnection();
        });
    }

    switchTab(tabName) {
        // Mettre à jour les onglets
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Mettre à jour le contenu
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');
        
        // FORCER le chargement des modèles à chaque accès à Quick Gen
        if (tabName === 'quickgen') {
            console.log('🎯 Accès à Quick Gen - FORCAGE du chargement des modèles...');
            console.log('📊 État avant forcage:', {
                checkpoints: this.availableModels.checkpoints.length,
                controlnets: this.availableModels.controlnets.length
            });
            console.log('🔄 Lancement forcé de loadModels()...');
            this.loadModels();
        }
    }

    async checkServerConnection() {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');

        try {
            statusText.textContent = 'Connexion...';
            statusIndicator.className = 'status-indicator';

            // Test de connexion avec l'API ComfyUI
            const response = await fetch(`${this.serverUrl}/object_info`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                statusIndicator.classList.add('connected');
                statusText.textContent = 'Connecté';
                return true;
            } else {
                throw new Error('Server responded with error');
            }
        } catch (error) {
            statusIndicator.classList.add('error');
            statusText.textContent = 'Déconnecté';
            console.error('Erreur de connexion:', error);
            return false;
        }
    }

    async loadModels() {
        console.log('🔄 Début du chargement des modèles...');
        try {
            const response = await fetch(`${this.serverUrl}/object_info`);
            if (!response.ok) throw new Error('Impossible de charger les modèles');
            
            const data = await response.json();
            console.log('📦 Données object_info reçues:', Object.keys(data));
            
            // Extraire les différents types de modèles
            this.extractModels(data);
            console.log('🎯 Modèles extraits:', {
                checkpoints: this.availableModels.checkpoints.length,
                loras: this.availableModels.loras.length,
                controlnets: this.availableModels.controlnets.length,
                vae: this.availableModels.vae.length
            });
            
            this.displayModels();
            
        } catch (error) {
            console.error('Erreur lors du chargement des modèles:', error);
            this.showModelError();
        }
    }

    extractModels(objectInfo) {
        this.objectInfo = objectInfo;
        
        // Reset des modèles
        this.availableModels = {
            checkpoints: [],
            loras: [],
            controlnets: [],
            vae: [],
            upscale_models: [],
            embeddings: []
        };

        // Parcourir les nodes pour extraire les modèles
        Object.keys(objectInfo).forEach(nodeType => {
            const node = objectInfo[nodeType];
            
            if (node.input && node.input.required) {
                Object.keys(node.input.required).forEach(inputName => {
                    const input = node.input.required[inputName];
                    
                    if (Array.isArray(input) && Array.isArray(input[0])) {
                        const modelList = input[0];
                        
                        // Classer les modèles selon leur type
                        if (inputName.toLowerCase().includes('ckpt') || inputName.toLowerCase().includes('checkpoint') || nodeType.includes('CheckpointLoader')) {
                            this.availableModels.checkpoints = [...new Set([...this.availableModels.checkpoints, ...modelList])];
                        } else if (inputName.toLowerCase().includes('lora') || nodeType.includes('LoraLoader')) {
                            this.availableModels.loras = [...new Set([...this.availableModels.loras, ...modelList])];
                        } else if (inputName.toLowerCase().includes('control') || 
                                   nodeType.includes('ControlNet') ||
                                   inputName === 'control_net_name') {
                            console.log(`🎮 ControlNet détecté - Node: ${nodeType}, Input: ${inputName}, Models: ${modelList.length}`);
                            this.availableModels.controlnets = [...new Set([...this.availableModels.controlnets, ...modelList])];
                        } else if (inputName.toLowerCase().includes('vae') || nodeType.includes('VAE')) {
                            this.availableModels.vae = [...new Set([...this.availableModels.vae, ...modelList])];
                        } else if (inputName.toLowerCase().includes('upscale') || nodeType.includes('UpscaleModel')) {
                            this.availableModels.upscale_models = [...new Set([...this.availableModels.upscale_models, ...modelList])];
                        } else if (inputName.toLowerCase().includes('embedding')) {
                            this.availableModels.embeddings = [...new Set([...this.availableModels.embeddings, ...modelList])];
                        }
                    }
                });
            }
        });
    }

    displayModels() {
        // Afficher les checkpoints
        this.displayModelCategory('checkpointsList', this.availableModels.checkpoints);
        
        // Afficher les LoRAs
        this.displayModelCategory('lorasList', this.availableModels.loras);
        
        // Afficher les ControlNets
        this.displayModelCategory('controlnetsList', this.availableModels.controlnets);
        
        // Afficher les VAE
        this.displayModelCategory('vaesList', this.availableModels.vae);
        
        // Afficher les modèles d'upscaling
        if (this.availableModels.upscale_models.length > 0) {
            document.getElementById('upscaleCategory').style.display = 'block';
            this.displayModelCategory('upscalesList', this.availableModels.upscale_models);
        } else {
            document.getElementById('upscaleCategory').style.display = 'none';
        }
        
        // Afficher les embeddings
        if (this.availableModels.embeddings.length > 0) {
            document.getElementById('embeddingsCategory').style.display = 'block';
            this.displayModelCategory('embeddingsList', this.availableModels.embeddings);
        } else {
            document.getElementById('embeddingsCategory').style.display = 'none';
        }
    }

    displayModelCategory(containerId, models) {
        const container = document.getElementById(containerId);
        
        if (models.length === 0) {
            container.innerHTML = '<div class="no-models">Aucun modèle trouvé</div>';
            return;
        }

        const categoryName = containerId.replace('List', '').replace('s', '');
        
        container.innerHTML = `
            <div class="model-category-header">
                <span class="model-count">${models.length} modèles disponibles</span>
            </div>
            <div class="model-grid">
                ${models.map(model => `
                    <div class="model-item" data-model="${model}" title="${model}">
                        <div class="model-name">${model.split('/').pop().replace(/\.[^/.]+$/, "")}</div>
                        <div class="model-path">${model.includes('/') ? model.split('/').slice(0, -1).join('/') : ''}</div>
                    </div>
                `).join('')}
            </div>
        `;

        // Ajouter les événements de clic
        container.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', () => {
                // Désélectionner les autres dans la même catégorie
                container.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
                // Sélectionner l'item cliqué
                item.classList.add('selected');
                
                // Copier le nom dans le presse-papiers
                const modelName = item.dataset.model;
                navigator.clipboard.writeText(modelName).then(() => {
                    // Feedback visuel
                    const originalText = item.querySelector('.model-name').textContent;
                    item.querySelector('.model-name').textContent = '✓ Copié!';
                    setTimeout(() => {
                        item.querySelector('.model-name').textContent = originalText;
                    }, 1500);
                });
            });
        });
    }

    showModelError() {
        ['checkpointsList', 'lorasList', 'controlnetsList', 'vaesList'].forEach(id => {
            document.getElementById(id).innerHTML = '<div class="loading">Erreur de chargement</div>';
        });
    }

    async loadWorkflow(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const workflow = JSON.parse(text);
            
            this.currentWorkflow = workflow;
            this.currentWorkflowName = null; // Nouveau workflow non sauvegardé
            this.displayWorkflowInfo(workflow);
            this.generateWorkflowParams(workflow);
            
            // Activer les boutons de génération et prévisualisation
            document.getElementById('generateBtn').disabled = false;
            document.getElementById('previewWorkflowBtn').disabled = false;
            
            // Mettre à jour le statut du workflow
            this.updateWorkflowStatus(workflow);
            
            // Initialiser Quick Gen
            this.initQuickGen();
            
            // Mettre à jour l'interface de gestion des workflows
            this.updateWorkflowUI();
            
        } catch (error) {
            console.error('Erreur lors du chargement du workflow:', error);
            alert('Erreur: Le fichier workflow n\'est pas valide');
        }
    }

    displayWorkflowInfo(workflow, workflowName = null) {
        const infoContainer = document.getElementById('workflowInfo');
        const detailsContainer = infoContainer.querySelector('.workflow-details');
        
        const nodeCount = Object.keys(workflow).length;
        const nodeTypes = [...new Set(Object.values(workflow).map(node => node.class_type))];
        
        detailsContainer.innerHTML = `
            ${workflowName ? `<p><strong>Nom:</strong> ${workflowName}</p>` : ''}
            <p><strong>Nombre de nœuds:</strong> ${nodeCount}</p>
            <p><strong>Types de nœuds:</strong> ${nodeTypes.slice(0, 5).join(', ')}${nodeTypes.length > 5 ? '...' : ''}</p>
        `;
        
        infoContainer.style.display = 'block';
    }

    generateWorkflowParams(workflow) {
        const paramsContainer = document.getElementById('workflowParams');
        paramsContainer.innerHTML = '';
        
        // Reset bypass states
        this.nodeBypassStates = {};

        Object.keys(workflow).forEach(nodeId => {
            const node = workflow[nodeId];
            
            // Initialiser l'état bypass
            this.nodeBypassStates[nodeId] = false;
            
            // Créer le groupe de paramètres pour tous les nœuds
            const paramGroup = document.createElement('div');
            paramGroup.className = 'param-group';
            
            const bypassToggle = `
                <div class="node-header">
                    <div class="node-title">
                        <h4>${node._meta?.title || node.class_type} (${nodeId})</h4>
                        <span class="node-type">${node.class_type}</span>
                    </div>
                    <div class="node-controls">
                        <label class="bypass-toggle">
                            <input type="checkbox" id="bypass_${nodeId}" onchange="comfyUI.toggleNodeBypass('${nodeId}', this.checked)">
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">Bypass</span>
                        </label>
                        <div class="node-actions">
                            <button class="btn-node-action" onclick="comfyUI.duplicateNode('${nodeId}')" title="Dupliquer">
                                📋
                            </button>
                            <button class="btn-node-action btn-danger" onclick="comfyUI.removeNode('${nodeId}')" title="Supprimer">
                                🗑️
                            </button>
                            ${node.class_type === 'Power Lora Loader (rgthree)' ? `
                                <button class="btn-node-action" onclick="comfyUI.addLoraField('${nodeId}')" title="Ajouter LoRA">
                                    ➕
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            
            const nodeInputs = (node.inputs && Object.keys(node.inputs).length > 0) ? 
                this.generateNodeInputs(nodeId, node.inputs, node.class_type) : 
                '<p class="no-inputs">Pas de paramètres modifiables</p>';
            
            paramGroup.innerHTML = bypassToggle + '<div class="node-inputs">' + nodeInputs + '</div>';
            paramsContainer.appendChild(paramGroup);
        });

        if (paramsContainer.innerHTML === '') {
            paramsContainer.innerHTML = '<p class="no-workflow">Aucun nœud trouvé dans le workflow</p>';
        }
    }

    generateNodeInputs(nodeId, inputs, nodeType) {
        if (!this.objectInfo || !this.objectInfo[nodeType]) {
            // Mode de fallback pour les nœuds non reconnus
            return this.generateFallbackInputs(nodeId, inputs);
        }
        
        const nodeDefinition = this.objectInfo[nodeType];
        const requiredInputs = nodeDefinition.input?.required || {};
        const optionalInputs = nodeDefinition.input?.optional || {};
        
        let html = '';
        
        // Générer les inputs requis
        Object.keys(requiredInputs).forEach(inputName => {
            if (Array.isArray(inputs[inputName]) && inputs[inputName].length === 2 && typeof inputs[inputName][0] === 'string') {
                // C'est une connexion entre nœuds, afficher comme info mais ne pas permettre la modification
                html += this.generateConnectionInfo(nodeId, inputName, inputs[inputName], true);
                return;
            }
            
            const inputDef = requiredInputs[inputName];
            const currentValue = inputs[inputName];
            html += this.generateInputField(nodeId, inputName, inputDef, currentValue, true);
        });
        
        // Générer les inputs optionnels
        Object.keys(optionalInputs).forEach(inputName => {
            if (Array.isArray(inputs[inputName]) && inputs[inputName].length === 2 && typeof inputs[inputName][0] === 'string') {
                // C'est une connexion entre nœuds
                html += this.generateConnectionInfo(nodeId, inputName, inputs[inputName], false);
                return;
            }
            
            const inputDef = optionalInputs[inputName];
            const currentValue = inputs[inputName];
            html += this.generateInputField(nodeId, inputName, inputDef, currentValue, false);
        });
        
        // Générer les inputs personnalisés (comme Power LoRA Loader)
        Object.keys(inputs).forEach(inputName => {
            if (Array.isArray(inputs[inputName]) && inputs[inputName].length === 2 && typeof inputs[inputName][0] === 'string') {
                // C'est une connexion entre nœuds
                html += this.generateConnectionInfo(nodeId, inputName, inputs[inputName], false);
                return;
            }
            if (requiredInputs[inputName] || optionalInputs[inputName]) return;
            
            // Input personnalisé
            const currentValue = inputs[inputName];
            html += this.generateCustomInputField(nodeId, inputName, currentValue);
        });
        
        return html;
    }
    
    generateInputField(nodeId, inputName, inputDef, currentValue, required) {
        const inputId = `param_${nodeId}_${inputName}`;
        const isRequired = required ? ' *' : '';
        
        // inputDef peut être ["STRING", {"default": "value"}] ou ["INT", {"default": 0, "min": 0, "max": 100}] ou [options_array]
        if (Array.isArray(inputDef)) {
            if (Array.isArray(inputDef[0])) {
                // Liste d'options
                const options = inputDef[0];
                return `
                    <div class="param-container">
                        <label class="param-label" for="${inputId}">${inputName}${isRequired}:</label>
                        <select id="${inputId}" class="param-select" 
                                onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.value)">
                            ${options.map(option => `
                                <option value="${option}" ${option === currentValue ? 'selected' : ''}>
                                    ${typeof option === 'string' ? option.split('/').pop().replace(/\.[^/.]+$/, "") : option}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `;
            } else {
                // Type avec configuration
                const type = inputDef[0];
                const config = inputDef[1] || {};
                
                return this.generateTypedInput(nodeId, inputName, type, config, currentValue, required);
            }
        }
        
        return '';
    }
    
    generateTypedInput(nodeId, inputName, type, config, currentValue, required) {
        const inputId = `param_${nodeId}_${inputName}`;
        const isRequired = required ? ' *' : '';
        const defaultValue = currentValue !== undefined ? currentValue : config.default;
        
        switch (type) {
            case 'INT':
                return `
                    <div class="param-container">
                        <label class="param-label" for="${inputId}">${inputName}${isRequired}:</label>
                        <div class="number-input-container">
                            <input type="number" id="${inputId}" class="param-input" 
                                   value="${defaultValue || 0}" 
                                   min="${config.min || ''}" max="${config.max || ''}" 
                                   step="${config.step || 1}"
                                   onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', parseInt(this.value))">
                            ${config.min !== undefined ? `<small>Min: ${config.min}</small>` : ''}
                            ${config.max !== undefined ? `<small>Max: ${config.max}</small>` : ''}
                        </div>
                    </div>
                `;
                
            case 'FLOAT':
                return `
                    <div class="param-container">
                        <label class="param-label" for="${inputId}">${inputName}${isRequired}:</label>
                        <div class="number-input-container">
                            <input type="number" id="${inputId}" class="param-input" 
                                   value="${defaultValue || 0}" 
                                   min="${config.min || ''}" max="${config.max || ''}" 
                                   step="${config.step || 0.01}"
                                   onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', parseFloat(this.value))">
                            ${config.min !== undefined ? `<small>Min: ${config.min}</small>` : ''}
                            ${config.max !== undefined ? `<small>Max: ${config.max}</small>` : ''}
                        </div>
                    </div>
                `;
                
            case 'STRING':
                const isMultiline = config.multiline || (defaultValue && defaultValue.length > 50);
                if (isMultiline) {
                    return `
                        <div class="param-container">
                            <label class="param-label" for="${inputId}">${inputName}${isRequired}:</label>
                            <textarea id="${inputId}" class="param-textarea" 
                                      onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.value)">${defaultValue || ''}</textarea>
                        </div>
                    `;
                } else {
                    return `
                        <div class="param-container">
                            <label class="param-label" for="${inputId}">${inputName}${isRequired}:</label>
                            <input type="text" id="${inputId}" class="param-input" 
                                   value="${defaultValue || ''}" 
                                   onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.value)">
                        </div>
                    `;
                }
                
            case 'BOOLEAN':
                return `
                    <div class="param-container">
                        <label class="param-label checkbox-label">
                            <input type="checkbox" id="${inputId}" ${defaultValue ? 'checked' : ''} 
                                   onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.checked)">
                            <span class="checkmark"></span>
                            ${inputName}${isRequired}
                        </label>
                    </div>
                `;
                
            default:
                // Type non reconnu, traiter comme string
                return `
                    <div class="param-container">
                        <label class="param-label" for="${inputId}">${inputName}${isRequired} (${type}):</label>
                        <input type="text" id="${inputId}" class="param-input" 
                               value="${defaultValue || ''}" 
                               onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.value)">
                    </div>
                `;
        }
    }
    
    generateCustomInputField(nodeId, inputName, currentValue) {
        const inputId = `param_${nodeId}_${inputName}`;
        
        // Gérer les cas spéciaux comme Power LoRA Loader
        if (typeof currentValue === 'object' && currentValue !== null) {
            if (inputName.startsWith('lora_')) {
                return this.generateLoraField(nodeId, inputName, currentValue);
            }
            
            // Objet générique
            return `
                <div class="param-container object-container">
                    <label class="param-label">${inputName}:</label>
                    <div class="object-fields">
                        ${Object.keys(currentValue).map(key => {
                            const value = currentValue[key];
                            const subInputId = `${inputId}_${key}`;
                            
                            if (typeof value === 'boolean') {
                                return `
                                    <label class="param-label checkbox-label">
                                        <input type="checkbox" id="${subInputId}" ${value ? 'checked' : ''} 
                                               onchange="comfyUI.updateObjectParam('${nodeId}', '${inputName}', '${key}', this.checked)">
                                        <span class="checkmark"></span>
                                        ${key}
                                    </label>
                                `;
                            } else if (typeof value === 'number') {
                                return `
                                    <label class="param-label" for="${subInputId}">${key}:</label>
                                    <input type="number" id="${subInputId}" class="param-input" 
                                           value="${value}" step="0.01" 
                                           onchange="comfyUI.updateObjectParam('${nodeId}', '${inputName}', '${key}', parseFloat(this.value))">
                                `;
                            } else {
                                return `
                                    <label class="param-label" for="${subInputId}">${key}:</label>
                                    <input type="text" id="${subInputId}" class="param-input" 
                                           value="${value}" 
                                           onchange="comfyUI.updateObjectParam('${nodeId}', '${inputName}', '${key}', this.value)">
                                `;
                            }
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        // Fallback pour les autres types
        return this.generateFallbackInput(nodeId, inputName, currentValue);
    }
    
    generateLoraField(nodeId, inputName, loraData) {
        const inputId = `param_${nodeId}_${inputName}`;
        
        return `
            <div class="param-container lora-container">
                <label class="param-label">${inputName}:</label>
                <div class="lora-controls">
                    <label class="checkbox-label">
                        <input type="checkbox" ${loraData.on ? 'checked' : ''} 
                               onchange="comfyUI.updateObjectParam('${nodeId}', '${inputName}', 'on', this.checked)">
                        <span class="checkmark"></span>
                        Activé
                    </label>
                    <select class="param-select" 
                            onchange="comfyUI.updateObjectParam('${nodeId}', '${inputName}', 'lora', this.value)">
                        <option value="None">Aucun LoRA</option>
                        ${this.availableModels.loras.map(lora => `
                            <option value="${lora}" ${lora === loraData.lora ? 'selected' : ''}>
                                ${lora.split('/').pop().replace(/\.[^/.]+$/, "")}
                            </option>
                        `).join('')}
                    </select>
                    <input type="number" class="param-input" placeholder="Strength" 
                           value="${loraData.strength || 1.0}" step="0.01" min="-2" max="2" 
                           onchange="comfyUI.updateObjectParam('${nodeId}', '${inputName}', 'strength', parseFloat(this.value))">
                    <button class="btn-remove" onclick="comfyUI.removeLoraField('${nodeId}', '${inputName}')" title="Supprimer">
                        ❌
                    </button>
                </div>
            </div>
        `;
    }
    
    generateFallbackInput(nodeId, inputName, currentValue) {
        const inputId = `param_${nodeId}_${inputName}`;
        
        if (typeof currentValue === 'string') {
            return `
                <div class="param-container">
                    <label class="param-label" for="${inputId}">${inputName}:</label>
                    <input type="text" id="${inputId}" class="param-input" 
                           value="${currentValue}" 
                           onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.value)">
                </div>
            `;
        } else if (typeof currentValue === 'number') {
            return `
                <div class="param-container">
                    <label class="param-label" for="${inputId}">${inputName}:</label>
                    <input type="number" id="${inputId}" class="param-input" 
                           value="${currentValue}" step="0.01" 
                           onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', parseFloat(this.value))">
                </div>
            `;
        } else if (typeof currentValue === 'boolean') {
            return `
                <div class="param-container">
                    <label class="param-label checkbox-label">
                        <input type="checkbox" id="${inputId}" ${currentValue ? 'checked' : ''} 
                               onchange="comfyUI.updateWorkflowParam('${nodeId}', '${inputName}', this.checked)">
                        <span class="checkmark"></span>
                        ${inputName}
                    </label>
                </div>
            `;
        }
        
        return '';
    }
    
    generateConnectionInfo(nodeId, inputName, connection, required) {
        const connectedNodeId = connection[0];
        const outputIndex = connection[1];
        const isRequired = required ? ' *' : '';
        
        return `
            <div class="param-container connection-container">
                <label class="param-label connection-label">${inputName}${isRequired}:</label>
                <div class="connection-info">
                    <span class="connection-text">🔗 Connexion vers nœud ${connectedNodeId} (sortie ${outputIndex})</span>
                    <button class="btn-disconnect" onclick="comfyUI.disconnectNode('${nodeId}', '${inputName}')" title="Déconnecter">
                        🔗⛔
                    </button>
                </div>
            </div>
        `;
    }
    
    disconnectNode(nodeId, inputName) {
        if (confirm(`Déconnecter l'entrée '${inputName}' du nœud ${nodeId} ?`)) {
            // Remplacer la connexion par une valeur par défaut selon le type
            const nodeType = this.currentWorkflow[nodeId].class_type;
            const nodeDefinition = this.objectInfo && this.objectInfo[nodeType];
            
            if (nodeDefinition && nodeDefinition.input) {
                const inputDef = nodeDefinition.input.required[inputName] || nodeDefinition.input.optional[inputName];
                if (inputDef && Array.isArray(inputDef)) {
                    const type = inputDef[0];
                    const config = inputDef[1] || {};
                    
                    let defaultValue = config.default;
                    if (defaultValue === undefined) {
                        switch (type) {
                            case 'INT': defaultValue = 0; break;
                            case 'FLOAT': defaultValue = 0.0; break;
                            case 'STRING': defaultValue = ''; break;
                            case 'BOOLEAN': defaultValue = false; break;
                            default: defaultValue = null;
                        }
                    }
                    
                    this.currentWorkflow[nodeId].inputs[inputName] = defaultValue;
                } else {
                    // Valeur par défaut générique
                    this.currentWorkflow[nodeId].inputs[inputName] = null;
                }
            } else {
                this.currentWorkflow[nodeId].inputs[inputName] = null;
            }
            
            // Régénérer l'interface
            this.generateWorkflowParams(this.currentWorkflow);
        }
    }
    
    generateFallbackInputs(nodeId, inputs) {
        return Object.keys(inputs).map(inputName => {
            const value = inputs[inputName];
            if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
                return this.generateConnectionInfo(nodeId, inputName, value, false);
            }
            return this.generateFallbackInput(nodeId, inputName, value);
        }).join('');
    }

    getModelOptionsForInput(inputName, nodeType) {
        const inputLower = inputName.toLowerCase();
        const typeLower = nodeType.toLowerCase();
        
        if (inputLower.includes('ckpt') || inputLower.includes('checkpoint') || typeLower.includes('checkpointloader')) {
            return this.availableModels.checkpoints;
        } else if (inputLower.includes('lora') && !typeLower.includes('loraloader')) {
            return this.availableModels.loras;
        } else if (inputLower.includes('control') || typeLower.includes('controlnet')) {
            return this.availableModels.controlnets;
        } else if (inputLower.includes('vae') || typeLower.includes('vae')) {
            return this.availableModels.vae;
        } else if (inputLower.includes('upscale') || typeLower.includes('upscale')) {
            return this.availableModels.upscale_models;
        } else if (inputLower.includes('embedding')) {
            return this.availableModels.embeddings;
        }
        
        return null;
    }
    
    updateWorkflowParam(nodeId, inputName, value) {
        if (this.currentWorkflow && this.currentWorkflow[nodeId]) {
            this.currentWorkflow[nodeId].inputs[inputName] = value;
            console.log(`Updated ${nodeId}.${inputName} = ${value}`);
            // Mettre à jour le statut du workflow
            this.updateWorkflowStatus(this.currentWorkflow);
            
            // Synchronisation temps réel avec Quick Gen
            this.syncQuickGenInterface();
        }
    }
    
    updateObjectParam(nodeId, inputName, key, value) {
        if (this.currentWorkflow && this.currentWorkflow[nodeId] && this.currentWorkflow[nodeId].inputs[inputName]) {
            this.currentWorkflow[nodeId].inputs[inputName][key] = value;
            console.log(`Updated ${nodeId}.${inputName}.${key} = ${value}`);
            // Mettre à jour le statut du workflow
            this.updateWorkflowStatus(this.currentWorkflow);
            
            // Synchronisation temps réel avec Quick Gen
            this.syncQuickGenInterface();
        }
    }
    
    removeLoraField(nodeId, inputName) {
        if (confirm(`Supprimer ${inputName} ?`)) {
            if (this.currentWorkflow && this.currentWorkflow[nodeId] && this.currentWorkflow[nodeId].inputs[inputName]) {
                delete this.currentWorkflow[nodeId].inputs[inputName];
                this.generateWorkflowParams(this.currentWorkflow);
            }
        }
    }
    
    addLoraField(nodeId) {
        if (!this.currentWorkflow || !this.currentWorkflow[nodeId]) return;
        
        const node = this.currentWorkflow[nodeId];
        let nextLoraNumber = 1;
        
        // Trouver le prochain numéro de LoRA disponible
        while (node.inputs[`lora_${nextLoraNumber}`]) {
            nextLoraNumber++;
        }
        
        // Créer le nouveau LoRA
        node.inputs[`lora_${nextLoraNumber}`] = {
            on: true,
            lora: "None",
            strength: 1.0
        };
        
        // Régénérer l'interface
        this.generateWorkflowParams(this.currentWorkflow);
    }
    
    toggleNodeBypass(nodeId, bypassed) {
        this.nodeBypassStates[nodeId] = bypassed;
        
        // Ajouter l'effet visuel
        const paramGroup = document.querySelector(`#bypass_${nodeId}`).closest('.param-group');
        if (bypassed) {
            paramGroup.classList.add('bypassed');
        } else {
            paramGroup.classList.remove('bypassed');
        }
        
        console.log(`🔄 Node ${nodeId} bypass: ${bypassed}`);
        
        // Synchroniser les toggles Quick Gen
        this.syncToggleStatesFromWorkflow();
    }
    
    addLoraNode() {
        if (!this.currentWorkflow) {
            alert('Veuillez d\'abord charger un workflow');
            return;
        }
        
        // Trouver un ID libre pour le nouveau nœud LoRA
        let newNodeId = Math.max(...Object.keys(this.currentWorkflow).map(id => parseInt(id))) + 1;
        
        // Créer un nouveau nœud LoRA
        const newLoraNode = {
            inputs: {
                model: ["", 0],
                clip: ["", 1],
                lora_name: "None",
                strength_model: 1.0,
                strength_clip: 1.0
            },
            class_type: "LoraLoader",
            _meta: {
                title: `LoRA Loader ${newNodeId}`
            }
        };
        
        this.currentWorkflow[newNodeId] = newLoraNode;
        
        // Régénérer l'interface
        this.generateWorkflowParams(this.currentWorkflow);
        
        // Faire défiler vers le nouveau nœud
        setTimeout(() => {
            const newNodeElement = document.querySelector(`#bypass_${newNodeId}`).closest('.param-group');
            newNodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newNodeElement.style.border = '2px solid #667eea';
            setTimeout(() => {
                newNodeElement.style.border = '';
            }, 2000);
        }, 100);
    }
    
    removeNode(nodeId) {
        if (confirm(`Supprimer le nœud ${nodeId} ?`)) {
            if (this.currentWorkflow && this.currentWorkflow[nodeId]) {
                delete this.currentWorkflow[nodeId];
                this.generateWorkflowParams(this.currentWorkflow);
            }
        }
    }
    
    duplicateNode(nodeId) {
        if (!this.currentWorkflow || !this.currentWorkflow[nodeId]) return;
        
        const sourceNode = this.currentWorkflow[nodeId];
        let newNodeId = Math.max(...Object.keys(this.currentWorkflow).map(id => parseInt(id))) + 1;
        
        // Créer une copie du nœud
        const newNode = JSON.parse(JSON.stringify(sourceNode));
        newNode._meta.title = `${sourceNode._meta.title} (Copy)`;
        
        this.currentWorkflow[newNodeId] = newNode;
        this.generateWorkflowParams(this.currentWorkflow);
        
        // Faire défiler vers le nouveau nœud
        setTimeout(() => {
            const newNodeElement = document.querySelector(`#bypass_${newNodeId}`).closest('.param-group');
            newNodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newNodeElement.style.border = '2px solid #4CAF50';
            setTimeout(() => {
                newNodeElement.style.border = '';
            }, 2000);
        }, 100);
    }

    updateWorkflowStatus(workflow) {
        const statusContainer = document.getElementById('workflowStatus');
        const statusMessage = statusContainer.querySelector('.status-message');
        
        if (!workflow) {
            statusMessage.innerHTML = '<p>Aucun workflow chargé</p>';
            return;
        }
        
        const nodeCount = Object.keys(workflow).length;
        const bypassedCount = Object.values(this.nodeBypassStates).filter(b => b).length;
        const activeNodes = nodeCount - bypassedCount;
        
        statusMessage.innerHTML = `
            <p><strong>Workflow prêt</strong></p>
            <p>🔗 ${nodeCount} nœuds (${activeNodes} actifs, ${bypassedCount} bypassés)</p>
            <p>⏱️ Dernière modification: ${new Date().toLocaleTimeString()}</p>
        `;
    }
    
    previewWorkflow() {
        if (!this.currentWorkflow) {
            alert('Aucun workflow chargé');
            return;
        }
        
        const workflowToSend = this.applyBypassToWorkflow();
        const preview = document.getElementById('workflowPreview');
        const section = document.getElementById('workflowPreviewSection');
        
        preview.textContent = JSON.stringify(workflowToSend, null, 2);
        section.style.display = 'block';
        
        // Scroll vers la prévisualisation
        section.scrollIntoView({ behavior: 'smooth' });
    }
    
    closePreview() {
        document.getElementById('workflowPreviewSection').style.display = 'none';
    }
    
    downloadWorkflow() {
        if (!this.currentWorkflow) return;
        
        const workflowToDownload = this.applyBypassToWorkflow();
        const blob = new Blob([JSON.stringify(workflowToDownload, null, 2)], 
                             { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow_modified_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async generateImage() {
        if (!this.currentWorkflow) {
            alert('Veuillez d\'abord charger un workflow');
            return;
        }
        
        console.log('Génération démarrée avec le workflow:', this.currentWorkflow);

        const generateBtn = document.getElementById('generateBtn');
        const progressDiv = document.getElementById('generationProgress');
        const progressFill = progressDiv.querySelector('.progress-fill');
        const progressText = progressDiv.querySelector('.progress-text');
        
        try {
            generateBtn.disabled = true;
            generateBtn.textContent = '⏳ Génération...';
            progressDiv.style.display = 'block';
            progressFill.style.width = '0%';
            progressText.textContent = 'Préparation du workflow...';

            // Appliquer les bypass aux nœuds et vérifier les modifications
            const workflowToSend = this.applyBypassToWorkflow();
            
            console.log('Workflow final à envoyer:', workflowToSend);
            
            // Vérifier que les paramètres ont bien été modifiés
            this.validateWorkflowBeforeSend(workflowToSend);
            
            // Vérifier la structure du workflow
            console.log('📊 Structure du workflow:');
            console.log('- Nombre total de nœuds:', Object.keys(workflowToSend).length);
            console.log('- Nœuds bypassés:', Object.keys(this.nodeBypassStates).filter(id => this.nodeBypassStates[id]));
            console.log('- Nœuds actifs:', Object.keys(workflowToSend).length - Object.keys(this.nodeBypassStates).filter(id => this.nodeBypassStates[id]).length);

            // Générer un client_id unique
            const clientId = 'mobile_' + Math.random().toString(36).substr(2, 9);

            progressText.textContent = 'Envoi du workflow...';

            // Envoyer le workflow
            const promptResponse = await fetch(`${this.serverUrl}/prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: workflowToSend,
                    client_id: clientId
                })
            });

            if (!promptResponse.ok) {
                const errorData = await promptResponse.json();
                throw new Error(`Erreur serveur: ${errorData.error || 'Erreur inconnue'}`);
            }

            const promptResult = await promptResponse.json();
            const promptId = promptResult.prompt_id;
            
            console.log(`🎆 Workflow envoyé avec succès! Prompt ID: ${promptId}`);
            if (promptResult.number) {
                console.log(`🔢 Numéro de file: ${promptResult.number}`);
            }

            progressText.textContent = 'Génération en cours...';
            
            // Simuler la progression
            let progress = 10;
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.random() * 10;
                    progressFill.style.width = `${Math.min(progress, 90)}%`;
                }
            }, 1000);

            // Attendre et récupérer le résultat
            const result = await this.waitForResult(promptId);
            
            clearInterval(progressInterval);
            progressFill.style.width = '100%';
            progressText.textContent = 'Terminé!';

            if (result) {
                this.displayResult(result);
                this.addToGallery(result);
            }

        } catch (error) {
            console.error('Erreur lors de la génération:', error);
            alert('Erreur lors de la génération: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '⚡ Générer l\'image';
            setTimeout(() => {
                progressDiv.style.display = 'none';
            }, 2000);
        }
    }
    
    applyBypassToWorkflow() {
        const workflowCopy = JSON.parse(JSON.stringify(this.currentWorkflow));
        
        console.log('🔧 Application bypass - États:', this.nodeBypassStates);
        
        // Parcourir tous les nœuds et les bypasser selon plusieurs méthodes
        Object.keys(this.nodeBypassStates).forEach(nodeId => {
            if (this.nodeBypassStates[nodeId] && workflowCopy[nodeId]) {
                console.log(`� Bypass node ${nodeId}:`, workflowCopy[nodeId].class_type);
                
                // BYPASS avec mode: 4 (ComfyUI standard)
                workflowCopy[nodeId].mode = 4;
                
                console.log(`  ✅ Node ${nodeId} bypassé (mode: 4)`);
            } else if (workflowCopy[nodeId]) {
                // S'assurer que les nœuds actifs ne sont pas bypassés
                if (workflowCopy[nodeId].mode === 4) {
                    delete workflowCopy[nodeId].mode;
                }
            }
        });
        
        console.log('✅ Workflow avec bypass appliqué:', workflowCopy);
        
        // DEBUG: Afficher TOUS les nœuds ControlNet dans le workflow
        Object.keys(workflowCopy).forEach(nodeId => {
            const node = workflowCopy[nodeId];
            if (node.class_type && (
                node.class_type.includes('ControlNet') || 
                node.class_type === 'LoadImage' ||
                node.class_type.includes('Control')
            )) {
                console.log(`🔍 CONTROL: Node ${nodeId} (${node.class_type}) mode=${node.mode || 'normal'}`);
            }
        });
        return workflowCopy;
    }
    
    validateWorkflowBeforeSend(workflow) {
        // Vérification des paramètres critiques et des connexions
        console.log('=== VALIDATION DU WORKFLOW ===');
        
        Object.keys(workflow).forEach(nodeId => {
            const node = workflow[nodeId];
            
            if (node.class_type === 'FaceDetailer') {
                console.log(`👤 FaceDetailer ${nodeId}:`);
                console.log('  - Steps:', node.inputs.steps);
                console.log('  - CFG:', node.inputs.cfg);
                console.log('  - Denoise:', node.inputs.denoise);
                console.log('  - Image input:', node.inputs.image);
                console.log('  - Model input:', node.inputs.model);
            }
            
            if (node.class_type === 'KSampler (Efficient)') {
                console.log(`⚙️ KSampler ${nodeId}:`);
                console.log('  - Steps:', node.inputs.steps);
                console.log('  - CFG:', node.inputs.cfg);
                console.log('  - Sampler:', node.inputs.sampler_name);
                console.log('  - Denoise:', node.inputs.denoise);
                console.log('  - Latent input:', node.inputs.latent_image);
            }
            
            if (node.class_type === 'LatentUpscaleBy') {
                console.log(`🔍 LatentUpscaleBy ${nodeId}:`);
                console.log('  - Scale by:', node.inputs.scale_by);
                console.log('  - Method:', node.inputs.upscale_method);
                console.log('  - Samples input:', node.inputs.samples);
            }
            
            if (node.class_type === 'Power Lora Loader (rgthree)') {
                console.log(`🎨 Power LoRA ${nodeId}:`);
                Object.keys(node.inputs).forEach(key => {
                    if (key.startsWith('lora_')) {
                        console.log(`  - ${key}:`, node.inputs[key]);
                    }
                });
            }
        });
        
        console.log('=== FIN VALIDATION ===');
    }
    
    // ===== MÉTHODES QUICK GEN =====
    
    initQuickGen() {
        if (!this.currentWorkflow) {
            this.updateQuickStatus('Aucun workflow chargé', false);
            return;
        }
        
        this.updateQuickStatus('Workflow chargé - Interface prête', true);
        this.analyzeWorkflowForQuickGen();
        this.populateQuickGenFromWorkflow();
        document.getElementById('quickGenerateBtn').disabled = false;
        
        // Initialiser la gestion des LoRAs
        this.initLoraManagement();
    }
    
    updateQuickStatus(message, isReady) {
        const statusContainer = document.getElementById('quickStatus');
        statusContainer.innerHTML = `<p class="${isReady ? 'workflow-ready' : 'no-workflow'}">${message}</p>`;
    }
    
    analyzeWorkflowForQuickGen() {
        if (!this.currentWorkflow) return;
        
        // Analyser les nœuds disponibles
        const availableNodes = {
            faceDetailer: null,
            controlNets: [], // Support pour plusieurs ControlNets
            ks1: null,
            ks2: null,
            promptPos: null,
            promptNeg: null
        };
        
        Object.keys(this.currentWorkflow).forEach(nodeId => {
            const node = this.currentWorkflow[nodeId];
            
            switch (node.class_type) {
                case 'FaceDetailer':
                    availableNodes.faceDetailer = nodeId;
                    break;
                case 'ControlNetLoader':
                case 'ControlNetApplyAdvanced':
                case 'ControlNetApply':
                    // Détecter et grouper les nœuds ControlNet
                    this.detectControlNetChain(nodeId, node, availableNodes);
                    break;
                case 'KSampler (Efficient)':
                    if (!availableNodes.ks1) {
                        availableNodes.ks1 = nodeId;
                    } else {
                        availableNodes.ks2 = nodeId;
                    }
                    break;
                case 'CLIPTextEncodeSDXLRefiner':
                    // Déterminer si c'est positif ou négatif selon le contenu
                    if (node.inputs.text && node.inputs.text.length > 10) {
                        if (node.inputs.text.toLowerCase().includes('score_6') || node.inputs.text.toLowerCase().includes('worst')) {
                            availableNodes.promptNeg = nodeId;
                        } else {
                            availableNodes.promptPos = nodeId;
                        }
                    } else {
                        if (!availableNodes.promptPos) {
                            availableNodes.promptPos = nodeId;
                        } else {
                            availableNodes.promptNeg = nodeId;
                        }
                    }
                    break;
            }
        });
        
        this.quickGenNodes = availableNodes;
        
        // Compatibilité descendante - convertir l'ancien système vers le nouveau
        if (!availableNodes.controlNets || availableNodes.controlNets.length === 0) {
            if (availableNodes.controlNet && availableNodes.controlNetApply) {
                // Convertir l'ancien format vers le nouveau
                const legacyControlNet = {
                    id: availableNodes.controlNet,
                    type: 'ControlNetLoader',
                    loader: availableNodes.controlNet,
                    apply: availableNodes.controlNetApply,
                    loadImage: this.findConnectedLoadImageNode(availableNodes.controlNetApply),
                    model: this.currentWorkflow[availableNodes.controlNet]?.inputs?.control_net_name || '',
                    strength: this.currentWorkflow[availableNodes.controlNetApply]?.inputs?.strength || 1.0,
                    end_percent: this.currentWorkflow[availableNodes.controlNetApply]?.inputs?.end_percent || 1.0,
                    image: null
                };
                
                if (legacyControlNet.loadImage) {
                    const loadImageNode = this.currentWorkflow[legacyControlNet.loadImage];
                    legacyControlNet.image = loadImageNode.inputs?.image || null;
                }
                
                availableNodes.controlNets = [legacyControlNet];
                console.log('Ancien système ControlNet converti vers le nouveau format');
            }
        }
        
        console.log(`🎆 ControlNets détectés (${availableNodes.controlNets?.length || 0}):`, availableNodes.controlNets);
        this.updateQuickGenAvailability();
    }
    
    detectControlNetChain(nodeId, node, availableNodes) {
        // Trouver les chaînes complètes de ControlNet (LoadImage -> ControlNetLoader -> ControlNetApply)
        const controlNetChain = {
            id: nodeId,
            type: node.class_type,
            loader: null,
            apply: null,
            loadImage: null,
            model: null,
            strength: 1.0,
            end_percent: 1.0,
            image: null
        };
        
        if (node.class_type === 'ControlNetLoader') {
            controlNetChain.loader = nodeId;
            controlNetChain.model = node.inputs?.control_net_name || '';
            
            // Chercher le ControlNetApply correspondant
            Object.keys(this.currentWorkflow).forEach(applyNodeId => {
                const applyNode = this.currentWorkflow[applyNodeId];
                if ((applyNode.class_type === 'ControlNetApplyAdvanced' || applyNode.class_type === 'ControlNetApply') &&
                    this.isNodeConnected(nodeId, applyNodeId)) {
                    controlNetChain.apply = applyNodeId;
                    controlNetChain.strength = applyNode.inputs?.strength || 1.0;
                    controlNetChain.end_percent = applyNode.inputs?.end_percent || 1.0;
                }
            });
            
        } else if (node.class_type === 'ControlNetApplyAdvanced' || node.class_type === 'ControlNetApply') {
            controlNetChain.apply = nodeId;
            controlNetChain.strength = node.inputs?.strength || 1.0;
            controlNetChain.end_percent = node.inputs?.end_percent || 1.0;
            
            // Chercher le ControlNetLoader correspondant
            Object.keys(this.currentWorkflow).forEach(loaderNodeId => {
                const loaderNode = this.currentWorkflow[loaderNodeId];
                if (loaderNode.class_type === 'ControlNetLoader' &&
                    this.isNodeConnected(loaderNodeId, nodeId)) {
                    controlNetChain.loader = loaderNodeId;
                    controlNetChain.model = loaderNode.inputs?.control_net_name || '';
                }
            });
        }
        
        // Chercher le nœud LoadImage associé
        if (controlNetChain.apply) {
            controlNetChain.loadImage = this.findConnectedLoadImageNode(controlNetChain.apply);
            if (controlNetChain.loadImage) {
                const loadImageNode = this.currentWorkflow[controlNetChain.loadImage];
                controlNetChain.image = loadImageNode.inputs?.image || null;
                console.log(`🔗 ControlNet chain détectée:`, {
                    loader: controlNetChain.loader,
                    apply: controlNetChain.apply,
                    loadImage: controlNetChain.loadImage,
                    currentImage: controlNetChain.image
                });
            } else {
                console.warn(`⚠️ Pas de LoadImage trouvé pour ControlNet apply ${controlNetChain.apply}`);
                // Recherche alternative : chercher tous les LoadImage et voir lequel pourrait être connecté
                const allLoadImages = Object.keys(this.currentWorkflow).filter(id => 
                    this.currentWorkflow[id].class_type === 'LoadImage'
                );
                console.log(`🔍 LoadImage disponibles dans le workflow:`, allLoadImages.map(id => ({
                    id,
                    image: this.currentWorkflow[id].inputs?.image
                })));
                
                // Essayer de trouver le LoadImage le plus proche
                if (allLoadImages.length > 0) {
                    // Prendre le premier LoadImage disponible comme fallback
                    controlNetChain.loadImage = allLoadImages[0];
                    const loadImageNode = this.currentWorkflow[controlNetChain.loadImage];
                    controlNetChain.image = loadImageNode.inputs?.image || null;
                    console.log(`🛠️ Fallback LoadImage utilisé: ${controlNetChain.loadImage}`);
                }
            }
        }
        
        // Ajouter à la liste si complet
        if (controlNetChain.loader && controlNetChain.apply) {
            // Vérifier si déjà ajouté
            const exists = availableNodes.controlNets.find(cn => 
                cn.loader === controlNetChain.loader && cn.apply === controlNetChain.apply
            );
            if (!exists) {
                availableNodes.controlNets.push(controlNetChain);
            }
        }
    }
    
    isNodeConnected(fromNodeId, toNodeId) {
        // Vérifier si deux nœuds sont connectés
        const toNode = this.currentWorkflow[toNodeId];
        if (!toNode || !toNode.inputs) return false;
        
        for (const inputName in toNode.inputs) {
            const inputValue = toNode.inputs[inputName];
            if (Array.isArray(inputValue) && inputValue[0] === fromNodeId) {
                return true;
            }
        }
        return false;
    }
    
    findConnectedLoadImageNode(nodeId) {
        // Chercher un nœud LoadImage connecté
        const node = this.currentWorkflow[nodeId];
        if (!node || !node.inputs) {
            console.log(`🔍 findConnectedLoadImageNode: Node ${nodeId} non trouvé ou sans inputs`);
            return null;
        }
        
        console.log(`🔍 Recherche LoadImage connecté à ${nodeId}:`, node.inputs);
        
        for (const inputName in node.inputs) {
            const inputValue = node.inputs[inputName];
            console.log(`  - Input ${inputName}:`, inputValue);
            
            if (Array.isArray(inputValue) && inputValue.length >= 1) {
                const connectedNodeId = inputValue[0];
                const connectedNode = this.currentWorkflow[connectedNodeId];
                console.log(`    Connected to node ${connectedNodeId}:`, connectedNode?.class_type);
                
                if (connectedNode && connectedNode.class_type === 'LoadImage') {
                    console.log(`✅ LoadImage trouvé: ${connectedNodeId}`);
                    return connectedNodeId;
                }
                
                // Recherche récursive dans les nœuds connectés
                const recursiveResult = this.findConnectedLoadImageNode(connectedNodeId);
                if (recursiveResult) {
                    console.log(`✅ LoadImage trouvé récursivement: ${recursiveResult}`);
                    return recursiveResult;
                }
            }
        }
        
        console.log(`❌ Aucun LoadImage connecté à ${nodeId}`);
        return null;
    }
    
    updateQuickGenAvailability() {
        // FaceDetailer
        const faceStatus = document.getElementById('faceDetailerStatus');
        const faceSection = document.getElementById('faceDetailerSection');
        if (this.quickGenNodes.faceDetailer) {
            faceStatus.textContent = 'Disponible';
            faceStatus.className = 'availability-status available';
            faceSection.classList.remove('unavailable');
        } else {
            faceStatus.textContent = 'Non disponible dans ce workflow';
            faceStatus.className = 'availability-status unavailable';
            faceSection.classList.add('unavailable');
            document.getElementById('faceDetailerToggle').disabled = true;
        }
        
        // ControlNet
        const controlStatus = document.getElementById('controlNetStatus');
        const controlSection = document.getElementById('controlNetSection');
        if (this.quickGenNodes.controlNets && this.quickGenNodes.controlNets.length > 0) {
            const count = this.quickGenNodes.controlNets.length;
            controlStatus.textContent = `${count} ControlNet${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`;
            controlStatus.className = 'availability-status available';
            controlSection.classList.remove('unavailable');
            document.getElementById('controlNetToggle').disabled = false;
            
            // Attendre que les modèles soient chargés avant de créer l'interface
            if (this.availableModels.controlnets && this.availableModels.controlnets.length > 0) {
                this.createMultiControlNetInterface();
            } else {
                console.log('🔄 Attente du chargement des modèles ControlNet...');
                // Système de retry plus robuste
                this.waitForControlNetModels();
            }
        } else {
            controlStatus.textContent = 'Non disponible dans ce workflow';
            controlStatus.className = 'availability-status unavailable';
            controlSection.classList.add('unavailable');
            document.getElementById('controlNetToggle').disabled = true;
        }
    }
    
    waitForControlNetModels(attempt = 1, maxAttempts = 10) {
        console.log(`🔄 Tentative ${attempt}/${maxAttempts} - Attente des modèles ControlNet...`);
        console.log(`🔍 État actuel: controlnets = ${this.availableModels.controlnets?.length || 0} modèles`);
        console.log(`📊 Tous les modèles:`, {
            checkpoints: this.availableModels.checkpoints?.length || 0,
            loras: this.availableModels.loras?.length || 0,
            controlnets: this.availableModels.controlnets?.length || 0,
            vae: this.availableModels.vae?.length || 0
        });
        
        const content = document.getElementById('controlNetContent');
        if (content) {
            content.innerHTML = `<div class="loading">Chargement des ControlNets... (${attempt}/${maxAttempts})<br><small>Modèles trouvés: ${this.availableModels.controlnets?.length || 0}</small></div>`;
        }
        
        // Vérifier si les modèles sont maintenant disponibles
        if (this.availableModels.controlnets && this.availableModels.controlnets.length > 0) {
            console.log('✅ Modèles ControlNet chargés, création de l\'interface');
            this.createMultiControlNetInterface();
            return;
        }
        
        // Si on a épuisé les tentatives, forcer le rechargement multiple
        if (attempt >= maxAttempts) {
            console.warn('⚠️ Échec du chargement après plusieurs tentatives, rechargement forcé...');
            
            // Essayer d'abord juste loadModels()
            console.log('🔄 Première tentative de rechargement...');
            this.loadModels().then(() => {
                if (this.availableModels.controlnets && this.availableModels.controlnets.length > 0) {
                    console.log('✅ Succès après rechargement simple');
                    this.createMultiControlNetInterface();
                } else {
                    console.log('❌ Échec rechargement simple, tentative avec délai...');
                    // Si ça marche toujours pas, attendre et réessayer
                    setTimeout(() => {
                        this.loadModels().then(() => {
                            if (this.availableModels.controlnets && this.availableModels.controlnets.length > 0) {
                                console.log('✅ Succès après rechargement avec délai');
                                this.createMultiControlNetInterface();
                            } else {
                                // Dernière tentative - montrer l'erreur
                                console.error('❌ Échec final du chargement ControlNet');
                                if (content) {
                                    content.innerHTML = `
                                        <div class="loading error">
                                            ❌ Impossible de charger les modèles ControlNet<br>
                                            <small>Vérifiez la connexion au serveur</small><br>
                                            <button onclick="window.comfyUI.loadModels().then(() => window.comfyUI.createMultiControlNetInterface())" 
                                                    style="margin-top: 10px; padding: 8px 16px; background: var(--ios-blue); color: white; border: none; border-radius: 8px; cursor: pointer;">
                                                🔄 Réessayer
                                            </button>
                                        </div>`;
                                }
                            }
                        });
                    }, 2000);
                }
            }).catch(error => {
                console.error('❌ Erreur lors du rechargement des modèles:', error);
                if (content) {
                    content.innerHTML = '<div class="loading error">❌ Erreur de connexion serveur</div>';
                }
            });
            return;
        }
        
        // Retry après un délai progressif
        const delay = Math.min(500 + (attempt * 200), 2000); // 500ms à 2s max
        setTimeout(() => {
            this.waitForControlNetModels(attempt + 1, maxAttempts);
        }, delay);
    }
    
    createMultiControlNetInterface() {
        const content = document.getElementById('controlNetContent');
        if (!content) return;
        
        // Vérifier que les modèles sont chargés
        if (!this.availableModels.controlnets || this.availableModels.controlnets.length === 0) {
            console.warn('⚠️ Modèles ControlNet non chargés, utilisation du système de retry...');
            this.waitForControlNetModels();
            return;
        }
        
        console.log(`🎮 Création interface pour ${this.quickGenNodes.controlNets.length} ControlNet(s)`);
        console.log(`🎯 Modèles ControlNet disponibles:`, this.availableModels.controlnets);
        
        // Créer l'interface pour chaque ControlNet détecté
        let html = '<div class="multi-controlnet-container">';
        
        this.quickGenNodes.controlNets.forEach((controlNet, index) => {
            html += this.createControlNetItemHTML(controlNet, index);
        });
        
        html += '</div>';
        content.innerHTML = html;
        
        // Configurer les événements pour chaque ControlNet
        this.quickGenNodes.controlNets.forEach((controlNet, index) => {
            this.setupControlNetEvents(controlNet, index);
        });
    }
    
    createControlNetItemHTML(controlNet, index) {
        const modelName = controlNet.model ? controlNet.model.split('/').pop().replace(/\.[^/.]+$/, "") : 'Aucun modèle';
        const hasImage = controlNet.image && controlNet.image !== '';
        
        return `
            <div class="controlnet-item" data-index="${index}" data-loader="${controlNet.loader}" data-apply="${controlNet.apply}">
                <div class="controlnet-header">
                    <h4>ControlNet ${index + 1}</h4>
                    <span class="controlnet-model-name">${modelName}</span>
                </div>
                
                <div class="controlnet-params">
                    <div class="param-row">
                        <label>Modèle:</label>
                        <select class="controlnet-model-select quick-select" data-index="${index}">
                            <option value="">Sélectionner un modèle</option>
                            ${this.availableModels.controlnets.map(model => 
                                `<option value="${model}" ${model === controlNet.model ? 'selected' : ''}>${model.split('/').pop().replace(/\.[^/.]+$/, "")}</option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div class="param-row">
                        <label>Strength:</label>
                        <input type="number" class="controlnet-strength-input quick-input" 
                               data-index="${index}" 
                               value="${controlNet.strength}" 
                               step="0.01" min="0" max="2">
                    </div>
                    
                    <div class="param-row">
                        <label>End Percent:</label>
                        <input type="number" class="controlnet-end-input quick-input" 
                               data-index="${index}" 
                               value="${controlNet.end_percent}" 
                               step="0.01" min="0" max="1">
                    </div>
                    
                    <div class="param-row full-width">
                        <label>Image de contrôle:</label>
                        <div class="image-upload-container">
                            <input type="file" class="controlnet-image-input" 
                                   data-index="${index}" 
                                   accept="image/*" style="display: none;">
                            <button type="button" class="file-label-small controlnet-image-btn" 
                                    data-index="${index}">
                                🖼️ Charger une image
                            </button>
                            <div class="controlnet-preview" data-index="${index}" 
                                 style="display: ${hasImage ? 'block' : 'none'};">
                                <img class="controlnet-preview-img" 
                                     src="${hasImage ? controlNet.image : ''}" 
                                     alt="Preview ControlNet ${index + 1}">
                                <button class="btn-remove-image" data-index="${index}" 
                                        title="Supprimer l'image">
                                    ❌ Supprimer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    setupControlNetEvents(controlNet, index) {
        const container = document.querySelector(`.controlnet-item[data-index="${index}"]`);
        if (!container) return;
        
        // Modèle
        const modelSelect = container.querySelector('.controlnet-model-select');
        modelSelect.addEventListener('change', (e) => {
            this.updateControlNetParam(index, 'model', e.target.value);
        });
        
        // Strength
        const strengthInput = container.querySelector('.controlnet-strength-input');
        strengthInput.addEventListener('change', (e) => {
            this.updateControlNetParam(index, 'strength', parseFloat(e.target.value));
        });
        
        // End Percent
        const endInput = container.querySelector('.controlnet-end-input');
        endInput.addEventListener('change', (e) => {
            this.updateControlNetParam(index, 'end_percent', parseFloat(e.target.value));
        });
        
        // Image upload
        const imageInput = container.querySelector('.controlnet-image-input');
        const imageBtn = container.querySelector('.controlnet-image-btn');
        const removeBtn = container.querySelector('.btn-remove-image');
        
        imageBtn.addEventListener('click', () => {
            imageInput.click();
        });
        
        imageInput.addEventListener('change', (e) => {
            this.handleControlNetImageUpload(index, e.target.files[0]);
        });
        
        removeBtn.addEventListener('click', () => {
            this.removeControlNetImage(index);
        });
    }
    
    updateControlNetParam(index, param, value) {
        if (!this.quickGenNodes.controlNets[index]) return;
        
        const controlNet = this.quickGenNodes.controlNets[index];
        console.log(`ControlNet ${index + 1}: ${param} = ${value}`);
        
        switch (param) {
            case 'model':
                if (controlNet.loader && this.currentWorkflow[controlNet.loader]) {
                    this.currentWorkflow[controlNet.loader].inputs.control_net_name = value;
                    controlNet.model = value;
                    // Mettre à jour l'affichage du nom du modèle
                    const modelNameSpan = document.querySelector(`.controlnet-item[data-index="${index}"] .controlnet-model-name`);
                    if (modelNameSpan) {
                        modelNameSpan.textContent = value ? value.split('/').pop().replace(/\.[^/.]+$/, "") : 'Aucun modèle';
                    }
                }
                break;
                
            case 'strength':
                if (controlNet.apply && this.currentWorkflow[controlNet.apply]) {
                    this.currentWorkflow[controlNet.apply].inputs.strength = value;
                    controlNet.strength = value;
                }
                break;
                
            case 'end_percent':
                if (controlNet.apply && this.currentWorkflow[controlNet.apply]) {
                    this.currentWorkflow[controlNet.apply].inputs.end_percent = value;
                    controlNet.end_percent = value;
                }
                break;
        }
        
        // Synchroniser avec l'onglet Workflow
        this.syncWorkflowInterface();
    }
    
    async handleControlNetImageUpload(index, file) {
        if (!file) return;
        
        const controlNet = this.quickGenNodes.controlNets[index];
        console.log(`📎 ControlNet ${index + 1} - Début upload:`, {
            controlNet,
            fileName: file.name,
            loadImageNode: controlNet.loadImage
        });
        
        const preview = document.querySelector(`.controlnet-preview[data-index="${index}"]`);
        const previewImg = preview?.querySelector('.controlnet-preview-img');
        
        if (!preview || !previewImg) {
            console.error(`❌ Preview elements not found for ControlNet ${index + 1}`);
            return;
        }
        
        // Afficher le preview immédiatement
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            previewImg.src = imageData;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Uploader l'image vers ComfyUI AVANT de mettre à jour le workflow
        console.log(`📤 Upload de l'image vers ComfyUI...`);
        const serverFileName = await this.uploadImageToComfyUI(file);
        
        if (serverFileName) {
            // Utiliser le nom de fichier retourné par le serveur
            const success = this.updateControlNetImage(index, serverFileName);
            if (success) {
                console.log(`✅ Image ControlNet ${index + 1} uploadée et mise à jour: ${serverFileName}`);
                this.syncWorkflowInterface();
            } else {
                console.error(`❌ Échec mise à jour workflow pour ControlNet ${index + 1}`);
            }
        } else {
            console.error(`❌ Échec upload image ControlNet ${index + 1} vers serveur`);
        }
    }
    
    updateControlNetImage(index, fileName) {
        const controlNet = this.quickGenNodes.controlNets[index];
        if (!controlNet) {
            console.error(`❌ ControlNet ${index + 1} non trouvé`);
            return false;
        }
        
        console.log(`🔄 Mise à jour image ControlNet ${index + 1}:`, {
            fileName,
            controlNet,
            loadImageNode: controlNet.loadImage
        });
        
        // SÉCURITÉ: Valider et nettoyer le fileName
        const cleanFileName = fileName ? String(fileName).trim() : '';
        
        // Tentative 1: Utiliser le LoadImage détecté
        if (controlNet.loadImage && this.currentWorkflow[controlNet.loadImage]) {
            const oldImage = this.currentWorkflow[controlNet.loadImage].inputs.image;
            this.currentWorkflow[controlNet.loadImage].inputs.image = cleanFileName;
            controlNet.image = cleanFileName;
            
            console.log(`✅ Méthode 1 - Image mise à jour via LoadImage détecté:`, {
                nodeId: controlNet.loadImage,
                ancienneImage: oldImage,
                nouvelleImage: cleanFileName
            });
            return true;
        }
        
        // Tentative 2: Rechercher à nouveau le LoadImage
        console.log(`🔍 Recherche alternative du LoadImage...`);
        const newLoadImageId = this.findConnectedLoadImageNode(controlNet.apply);
        if (newLoadImageId && this.currentWorkflow[newLoadImageId]) {
            const oldImage = this.currentWorkflow[newLoadImageId].inputs.image;
            this.currentWorkflow[newLoadImageId].inputs.image = cleanFileName;
            controlNet.loadImage = newLoadImageId;
            controlNet.image = cleanFileName;
            
            console.log(`✅ Méthode 2 - Image mise à jour via recherche alternative:`, {
                nodeId: newLoadImageId,
                ancienneImage: oldImage,
                nouvelleImage: cleanFileName
            });
            return true;
        }
        
        // Tentative 3: Prendre le premier LoadImage disponible
        const allLoadImages = Object.keys(this.currentWorkflow).filter(id => 
            this.currentWorkflow[id].class_type === 'LoadImage'
        );
        
        if (allLoadImages.length > 0) {
            const fallbackLoadImage = allLoadImages[0];
            const oldImage = this.currentWorkflow[fallbackLoadImage].inputs.image;
            this.currentWorkflow[fallbackLoadImage].inputs.image = cleanFileName;
            controlNet.loadImage = fallbackLoadImage;
            controlNet.image = cleanFileName;
            
            console.log(`⚠️ Méthode 3 - Image mise à jour via fallback LoadImage:`, {
                nodeId: fallbackLoadImage,
                ancienneImage: oldImage,
                nouvelleImage: cleanFileName,
                availableLoadImages: allLoadImages
            });
            return true;
        }
        
        console.error(`❌ Échec de mise à jour - Aucun LoadImage disponible:`, {
            controlNet,
            workflowNodes: Object.keys(this.currentWorkflow).map(id => ({
                id,
                type: this.currentWorkflow[id].class_type
            }))
        });
        return false;
    }
    
    async uploadImageToComfyUI(file) {
        try {
            console.log(`📤 Upload image vers ComfyUI: ${file.name}`);
            
            // Créer FormData pour l'upload
            const formData = new FormData();
            formData.append('image', file);
            
            // Utiliser un nom fixe qui écrase l'ancienne image
            const fixedName = `controlnet_image.png`;
            formData.append('filename', fixedName);
            
            // Uploader vers ComfyUI
            const response = await fetch(`${this.serverUrl}/upload/image`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Erreur upload: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log(`✅ Image uploadée avec succès (écrase l'ancienne):`, result);
            
            // Retourner le nom de fichier utilisé par ComfyUI
            return result.name || fixedName;
            
        } catch (error) {
            console.error(`❌ Erreur upload image:`, error);
            return null;
        }
    }
    
    removeControlNetImage(index) {
        const controlNet = this.quickGenNodes.controlNets[index];
        const preview = document.querySelector(`.controlnet-preview[data-index="${index}"]`);
        const previewImg = preview.querySelector('.controlnet-preview-img');
        const imageInput = document.querySelector(`.controlnet-image-input[data-index="${index}"]`);
        
        preview.style.display = 'none';
        previewImg.src = '';
        imageInput.value = '';
        
        // Utiliser la nouvelle fonction de mise à jour
        const success = this.updateControlNetImage(index, '');
        if (success) {
            // Synchroniser avec l'onglet Workflow
            this.syncWorkflowInterface();
        }
    }
    
    syncMultiControlNetInterface() {
        // Synchroniser l'interface multi-ControlNet avec les données du workflow
        if (!this.quickGenNodes.controlNets || this.quickGenNodes.controlNets.length === 0) return;
        
        this.quickGenNodes.controlNets.forEach((controlNet, index) => {
            const container = document.querySelector(`.controlnet-item[data-index="${index}"]`);
            if (!container) return;
            
            // Synchroniser le modèle
            if (controlNet.loader && this.currentWorkflow[controlNet.loader]) {
                const loaderNode = this.currentWorkflow[controlNet.loader];
                const modelSelect = container.querySelector('.controlnet-model-select');
                const modelName = container.querySelector('.controlnet-model-name');
                
                if (modelSelect && loaderNode.inputs.control_net_name) {
                    modelSelect.value = loaderNode.inputs.control_net_name;
                    controlNet.model = loaderNode.inputs.control_net_name;
                    
                    if (modelName) {
                        modelName.textContent = loaderNode.inputs.control_net_name ? 
                            loaderNode.inputs.control_net_name.split('/').pop().replace(/\.[^/.]+$/, "") : 
                            'Aucun modèle';
                    }
                }
            }
            
            // Synchroniser les paramètres
            if (controlNet.apply && this.currentWorkflow[controlNet.apply]) {
                const applyNode = this.currentWorkflow[controlNet.apply];
                
                const strengthInput = container.querySelector('.controlnet-strength-input');
                const endInput = container.querySelector('.controlnet-end-input');
                
                if (strengthInput && applyNode.inputs.strength !== undefined) {
                    strengthInput.value = applyNode.inputs.strength;
                    controlNet.strength = applyNode.inputs.strength;
                }
                
                if (endInput && applyNode.inputs.end_percent !== undefined) {
                    endInput.value = applyNode.inputs.end_percent;
                    controlNet.end_percent = applyNode.inputs.end_percent;
                }
            }
            
            // Synchroniser l'image
            if (controlNet.loadImage && this.currentWorkflow[controlNet.loadImage]) {
                const loadImageNode = this.currentWorkflow[controlNet.loadImage];
                const preview = container.querySelector('.controlnet-preview');
                const previewImg = container.querySelector('.controlnet-preview-img');
                
                if (loadImageNode.inputs.image && loadImageNode.inputs.image !== '') {
                    controlNet.image = loadImageNode.inputs.image;
                    if (preview && previewImg) {
                        preview.style.display = 'block';
                        // Note: En réalité, il faudrait récupérer l'URL de l'image depuis le serveur
                        // Pour l'instant, on utilise juste le nom de fichier
                    }
                } else {
                    controlNet.image = null;
                    if (preview) {
                        preview.style.display = 'none';
                    }
                }
            }
        });
    }
    
    populateQuickGenFromWorkflow() {
        if (!this.currentWorkflow || !this.quickGenNodes) return;
        
        // FaceDetailer
        if (this.quickGenNodes.faceDetailer) {
            const faceNode = this.currentWorkflow[this.quickGenNodes.faceDetailer];
            document.getElementById('quick_face_guide_size').value = faceNode.inputs.guide_size || 832;
            document.getElementById('quick_face_max_size').value = faceNode.inputs.max_size || 1216;
            document.getElementById('quick_face_steps').value = faceNode.inputs.steps || 20;
            document.getElementById('quick_face_cfg').value = faceNode.inputs.cfg || 5;
            document.getElementById('quick_face_sampler').value = faceNode.inputs.sampler_name || 'euler_ancestral';
            document.getElementById('quick_face_scheduler').value = faceNode.inputs.scheduler || 'normal';
            document.getElementById('quick_face_sam_hint').value = faceNode.inputs.sam_detection_hint || 'center-1';
        }
        
        // ControlNet - Simple synchronisation depuis le workflow
        if (this.quickGenNodes.controlNets && this.quickGenNodes.controlNets.length > 0) {
            // S'assurer que les modèles ControlNet sont chargés
            if (this.availableModels.controlnets.length === 0) {
                console.log('🔄 Rechargement des modèles ControlNet...');
                this.loadModels().then(() => {
                    this.syncMultiControlNetInterface();
                });
            } else {
                this.syncMultiControlNetInterface();
            }
        }
        
        // Prompts
        if (this.quickGenNodes.promptPos) {
            const promptNode = this.currentWorkflow[this.quickGenNodes.promptPos];
            document.getElementById('quick_prompt_positive').value = promptNode.inputs.text || '';
        }
        if (this.quickGenNodes.promptNeg) {
            const promptNode = this.currentWorkflow[this.quickGenNodes.promptNeg];
            document.getElementById('quick_prompt_negative').value = promptNode.inputs.text || '';
        }
        
        // Synchroniser les toggles avec les états de bypass
        this.syncToggleStatesFromWorkflow();
        
        // KSamplers
        if (this.quickGenNodes.ks1) {
            const ks1Node = this.currentWorkflow[this.quickGenNodes.ks1];
            document.getElementById('quick_ks1_seed').value = ks1Node.inputs.seed || Math.floor(Math.random() * 1000000000);
            document.getElementById('quick_ks1_steps').value = ks1Node.inputs.steps || 8;
            document.getElementById('quick_ks1_cfg').value = ks1Node.inputs.cfg || 2;
            document.getElementById('quick_ks1_denoise').value = ks1Node.inputs.denoise || 1;
            document.getElementById('quick_ks1_sampler').value = ks1Node.inputs.sampler_name || 'euler_ancestral';
            document.getElementById('quick_ks1_scheduler').value = ks1Node.inputs.scheduler || 'normal';
        }
        
        if (this.quickGenNodes.ks2) {
            const ks2Node = this.currentWorkflow[this.quickGenNodes.ks2];
            document.getElementById('quick_ks2_seed').value = ks2Node.inputs.seed || Math.floor(Math.random() * 1000000000);
            document.getElementById('quick_ks2_steps').value = ks2Node.inputs.steps || 15;
            document.getElementById('quick_ks2_cfg').value = ks2Node.inputs.cfg || 7;
            document.getElementById('quick_ks2_denoise').value = ks2Node.inputs.denoise || 0.2;
            document.getElementById('quick_ks2_sampler').value = ks2Node.inputs.sampler_name || 'euler_ancestral';
            document.getElementById('quick_ks2_scheduler').value = ks2Node.inputs.scheduler || 'normal';
        }
    }
    
    syncToggleStatesFromWorkflow() {
        // Synchroniser les toggles Quick Gen avec les états de bypass du workflow
        console.log('🔄 Synchronisation toggles depuis workflow:', this.nodeBypassStates);
        
        // FaceDetailer
        if (this.quickGenNodes.faceDetailer) {
            const isBypassed = this.nodeBypassStates[this.quickGenNodes.faceDetailer];
            const toggle = document.getElementById('faceDetailerToggle');
            if (toggle) {
                toggle.checked = !isBypassed; // Toggle ON = nœud actif (pas bypassé)
                const content = document.getElementById('faceDetailerContent');
                if (content) {
                    content.style.display = toggle.checked ? 'block' : 'none';
                }
                console.log(`👤 FaceDetailer toggle: ${toggle.checked} (bypass: ${isBypassed})`);
            }
        }
        
        // ControlNet - Vérifier via strength au lieu de bypass
        if (this.quickGenNodes.controlNets && this.quickGenNodes.controlNets.length > 0) {
            // Vérifier si au moins un ControlNet a strength > 0
            let anyControlNetActive = false;
            this.quickGenNodes.controlNets.forEach(controlNet => {
                if (controlNet.apply && this.currentWorkflow[controlNet.apply]) {
                    const applyNode = this.currentWorkflow[controlNet.apply];
                    const strength = applyNode.inputs.strength || 0;
                    
                    // Si strength > 0, le ControlNet est actif
                    if (strength > 0) {
                        anyControlNetActive = true;
                    }
                    
                    console.log(`🎯 ControlNet apply ${controlNet.apply}: strength = ${strength}`);
                }
            });
            
            const toggle = document.getElementById('controlNetToggle');
            if (toggle) {
                toggle.checked = anyControlNetActive;
                const content = document.getElementById('controlNetContent');
                if (content) {
                    content.style.display = toggle.checked ? 'block' : 'none';
                }
                console.log(`🎮 ControlNet toggle: ${toggle.checked} (anyActive par strength: ${anyControlNetActive})`);
            }
        }
    }
    
    syncWorkflowBypassInterface() {
        // Synchroniser les toggles de bypass dans l'onglet Workflow
        console.log('🔧 Synchronisation interface Workflow avec états bypass:', this.nodeBypassStates);
        
        Object.keys(this.nodeBypassStates).forEach(nodeId => {
            const bypassToggle = document.getElementById(`bypass_${nodeId}`);
            console.log(`  - Node ${nodeId}: bypass = ${this.nodeBypassStates[nodeId]}, toggle trouvé = ${!!bypassToggle}`);
            
            if (bypassToggle) {
                const shouldBeChecked = this.nodeBypassStates[nodeId];
                const currentlyChecked = bypassToggle.checked;
                
                console.log(`    Avant: toggle.checked = ${currentlyChecked}, devrait être = ${shouldBeChecked}`);
                
                if (currentlyChecked !== shouldBeChecked) {
                    bypassToggle.checked = shouldBeChecked;
                    
                    // Ajouter/enlever l'effet visuel
                    const paramGroup = bypassToggle.closest('.param-group');
                    if (shouldBeChecked) {
                        paramGroup.classList.add('bypassed');
                    } else {
                        paramGroup.classList.remove('bypassed');
                    }
                    
                    console.log(`    ✅ Mis à jour: ${nodeId} bypass = ${shouldBeChecked}`);
                } else {
                    console.log(`    ⏭️ Déjà à jour: ${nodeId}`);
                }
            } else {
                console.log(`    ❌ Toggle bypass_${nodeId} non trouvé dans le DOM`);
            }
        });
        
        // Mettre à jour le statut du workflow
        this.updateWorkflowStatus(this.currentWorkflow);
    }
    
    toggleQuickFaceDetailer(enabled) {
        const content = document.getElementById('faceDetailerContent');
        content.style.display = enabled ? 'block' : 'none';
        
        if (this.quickGenNodes.faceDetailer) {
            // Toggle bypass du nœud FaceDetailer
            this.nodeBypassStates[this.quickGenNodes.faceDetailer] = !enabled;
            console.log(`👤 FaceDetailer ${enabled ? 'activé' : 'désactivé'} (bypass: ${!enabled})`);
            
            // Synchroniser l'interface Workflow
            this.syncWorkflowBypassInterface();
        }
    }
    
    toggleQuickControlNet(enabled) {
        const content = document.getElementById('controlNetContent');
        content.style.display = enabled ? 'block' : 'none';
        
        if (this.quickGenNodes.controlNets && this.quickGenNodes.controlNets.length > 0) {
            console.log(`🎮 Toggle ControlNet: ${enabled} (${this.quickGenNodes.controlNets.length} ControlNets)`);
            
            // Au lieu de bypass, modifier la strength pour activer/désactiver
            this.quickGenNodes.controlNets.forEach((controlNet, index) => {
                console.log(`  ControlNet ${index + 1}:`, controlNet);
                
                if (controlNet.apply && this.currentWorkflow[controlNet.apply]) {
                    const applyNode = this.currentWorkflow[controlNet.apply];
                    
                    if (enabled) {
                        // Activer : mettre 1.0 par défaut (tu peux changer manuellement après)
                        applyNode.inputs.strength = 1.0;
                        console.log(`    ✅ ControlNet ${index + 1} activé (strength: 1.0)`);
                    } else {
                        // Désactiver : mettre à 0
                        applyNode.inputs.strength = 0.0;
                        console.log(`    🚫 ControlNet ${index + 1} désactivé (strength: 0.0)`);
                    }
                }
            });
            
            // Synchroniser avec l'onglet Workflow
            this.syncWorkflowInterface();
        }
    }
    
    updateQuickParam(section, param, value) {
        if (!this.currentWorkflow || !this.quickGenNodes) return;
        
        console.log(`Quick Gen: ${section}.${param} = ${value}`);
        
        switch (section) {
            case 'face':
                if (this.quickGenNodes.faceDetailer) {
                    this.currentWorkflow[this.quickGenNodes.faceDetailer].inputs[param] = value;
                }
                break;
                
            case 'controlnet':
                // Cette section est maintenant gérée par updateControlNetParam
                console.warn('updateQuickParam pour ControlNet est déprécié, utilisez updateControlNetParam');
                break;
                
            case 'prompt':
                if (param === 'positive' && this.quickGenNodes.promptPos) {
                    this.currentWorkflow[this.quickGenNodes.promptPos].inputs.text = value;
                } else if (param === 'negative' && this.quickGenNodes.promptNeg) {
                    this.currentWorkflow[this.quickGenNodes.promptNeg].inputs.text = value;
                }
                break;
                
            case 'ks1':
                if (this.quickGenNodes.ks1) {
                    this.currentWorkflow[this.quickGenNodes.ks1].inputs[param] = value;
                }
                break;
                
            case 'ks2':
                if (this.quickGenNodes.ks2) {
                    this.currentWorkflow[this.quickGenNodes.ks2].inputs[param] = value;
                }
                break;
        }
        
        // Mettre à jour le statut du workflow principal
        this.updateWorkflowStatus(this.currentWorkflow);
        
        // Synchronisation temps réel avec l'onglet Workflow
        this.syncWorkflowInterface();
    }
    
    randomizeSeed(inputId, section) {
        const newSeed = Math.floor(Math.random() * 1000000000);
        document.getElementById(inputId).value = newSeed;
        this.updateQuickParam(section, 'seed', newSeed);
    }
    
    // Cette fonction est maintenant remplacée par handleControlNetImageUpload
    handleControlNetImage(input) {
        console.warn('handleControlNetImage est dépréciée, utilisez handleControlNetImageUpload');
        // Compatibilité descendante
        if (input.files && input.files[0]) {
            this.handleControlNetImageUpload(0, input.files[0]);
        }
    }
    
    // Cette fonction est maintenant remplacée par removeControlNetImage avec index
    
    findLoadImageNode() {
        // Chercher un nœud LoadImage dans le workflow
        for (const nodeId in this.currentWorkflow) {
            if (this.currentWorkflow[nodeId].class_type === 'LoadImage') {
                return nodeId;
            }
        }
        return null;
    }
    
    async quickGenerate() {
        if (!this.currentWorkflow) {
            alert('Aucun workflow chargé');
            return;
        }
        
        // Réinitialiser le flag d'annulation
        this.isCancelled = false;
        
        // Démarrer la génération
        this.setGeneratingState(true);
        
        console.log('🚀 Quick Gen: Démarrage de la génération rapide');
        
        // Auto-randomisation des seeds pour KSampler 1 & 2 (si activée)
        const autoRandomSeeds = document.getElementById('autoRandomSeeds').checked;
        if (autoRandomSeeds) {
            console.log('🎲 Auto-randomisation des seeds...');
            this.randomizeSeed('quick_ks1_seed', 'ks1');
            this.randomizeSeed('quick_ks2_seed', 'ks2');
        }
        
        const quickBtn = document.getElementById('quickGenerateBtn');
        const quickProgress = document.getElementById('quickGenerationProgress');
        const quickProgressFill = quickProgress.querySelector('.progress-fill');
        const quickProgressText = quickProgress.querySelector('.progress-text');
        const quickResult = document.getElementById('quickGenerationResult');
        
        try {
            // Ne pas désactiver le bouton, juste changer l'état via setGeneratingState
            // quickBtn.disabled = true; // Supprimé !
            // quickBtn.textContent = '⏳ Génération...'; // Géré par setGeneratingState
            quickProgress.style.display = 'block';
            quickProgressFill.style.width = '0%';
            quickProgressText.textContent = 'Préparation...';
            
            // Appliquer les bypass (FaceDetailer et ControlNet)
            const workflowToSend = this.applyBypassToWorkflow();
            
            console.log('🔎 Quick Gen - Workflow final:', workflowToSend);
            console.log('🔎 Bypass states:', this.nodeBypassStates);
            
            // Générer un client_id unique
            const clientId = 'quickgen_' + Math.random().toString(36).substr(2, 9);
            this.currentPromptId = null;
            
            // Initialiser la WebSocket pour les previews (si activé)
            const enablePreviews = document.getElementById('enablePreviews').checked;
            if (enablePreviews) {
                this.initWebSocket(clientId);
                this.previewCount = 0;
                this.previewHistory = [];
            }
            
            quickProgressText.textContent = 'Envoi du workflow...';
            quickProgressFill.style.width = '10%';
            
            // Envoyer le workflow
            const promptResponse = await fetch(`${this.serverUrl}/prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: workflowToSend,
                    client_id: clientId
                })
            });
            
            if (!promptResponse.ok) {
                const errorData = await promptResponse.json();
                throw new Error(`Erreur serveur: ${errorData.error || 'Erreur inconnue'}`);
            }
            
            const promptResult = await promptResponse.json();
            this.currentPromptId = promptResult.prompt_id;
            console.log(`🎆 Quick Gen - Prompt ID: ${this.currentPromptId}`);
            
            // Afficher le container de preview (si activé)
            if (enablePreviews) {
                document.getElementById('previewContainer').style.display = 'block';
            }
            
            quickProgressText.textContent = 'Génération en cours...';
            
            // Animation de progression de base (sera mise à jour par WebSocket si connecté)
            let progress = 20;
            const progressInterval = setInterval(() => {
                if (progress < 90 && !this.websocket) {
                    // Seulement animer si pas de WebSocket
                    progress += Math.random() * 5;
                    quickProgressFill.style.width = `${Math.min(progress, 90)}%`;
                }
            }, 1500);
            
            // Attendre le résultat
            const result = await this.waitForResult(promptResult.prompt_id);
            
            clearInterval(progressInterval);
            
            quickProgressFill.style.width = '100%';
            quickProgressText.textContent = 'Terminé!';
            
            if (result) {
                const imageUrl = this.buildImageUrl(result);
                if (imageUrl) {
                    quickResult.innerHTML = `
                        <img src="${imageUrl}" alt="Image générée" class="result-image" onclick="comfyUI.viewImage('${imageUrl}')">
                    `;
                } else {
                    quickResult.innerHTML = `
                        <div class="error-message">
                            <p>❌ Erreur: Impossible de construire l'URL de l'image</p>
                        </div>
                    `;
                }
                this.addToGallery(result);
                console.log('✅ Quick Gen - Image générée avec succès!');
            }
            
        } catch (error) {
            console.error('❌ Quick Gen - Erreur:', error);
            
            // Ne pas afficher de popup/message pour les annulations
            if (!error.message.includes('annulée par l\'utilisateur')) {
                alert('Erreur lors de la génération: ' + error.message);
                quickResult.innerHTML = `
                    <div class="error-message">
                        <p>❌ Erreur: ${error.message}</p>
                    </div>
                `;
            }
        } finally {
            // Arrêter l'état de génération
            this.setGeneratingState(false);
            this.currentPromptId = null;
            
            // Fermer la WebSocket
            this.closeWebSocket();
            
            setTimeout(() => {
                quickProgress.style.display = 'none';
                // Cacher le preview après un délai
                setTimeout(() => {
                    document.getElementById('previewContainer').style.display = 'none';
                }, 3000);
            }, 2000);
        }
    }
    
    async performGeneration() {
        // Logique commune de génération
        const workflowToSend = this.applyBypassToWorkflow();
        console.log('Workflow Quick Gen:', workflowToSend);
        
        const clientId = 'quickgen_' + Math.random().toString(36).substr(2, 9);
        
        const promptResponse = await fetch(`${this.serverUrl}/prompt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: workflowToSend,
                client_id: clientId
            })
        });
        
        if (!promptResponse.ok) {
            const errorData = await promptResponse.json();
            throw new Error(`Erreur serveur: ${errorData.error || 'Erreur inconnue'}`);
        }
        
        const promptResult = await promptResponse.json();
        return await this.waitForResult(promptResult.prompt_id);
    }

    async waitForResult(promptId, maxAttempts = 120) { // 2 minutes au lieu de 30 secondes
        console.log(`🕐 Attente du résultat pour prompt ${promptId}`);
        
        for (let i = 0; i < maxAttempts; i++) {
            // Vérifier si la génération a été annulée
            if (this.isCancelled) {
                console.log('🛑 waitForResult interrompu - génération annulée');
                throw new Error('Génération annulée par l\'utilisateur');
            }
            
            try {
                const historyResponse = await fetch(`${this.serverUrl}/history/${promptId}`);
                if (historyResponse.ok) {
                    const history = await historyResponse.json();
                    
                    if (history[promptId]) {
                        const execution = history[promptId];
                        
                        console.log(`🔄 Exécution ${i + 1}/${maxAttempts}:`, {
                            status: execution.status,
                            outputs: Object.keys(execution.outputs || {}),
                            messages: execution.messages
                        });
                        
                        // Analyser les nœuds exécutés
                        if (execution.outputs) {
                            console.log('🎨 Nœuds qui ont produit des sorties:', Object.keys(execution.outputs));
                            
                            Object.keys(execution.outputs).forEach(nodeId => {
                                const output = execution.outputs[nodeId];
                                if (output.images) {
                                    console.log(`🖼️ Nœud ${nodeId} a généré ${output.images.length} image(s):`, output.images.map(img => img.filename));
                                    
                                    // Afficher les previews seulement si WebSocket pas connecté (fallback)
                                    if (this.showIntermediateImages && !this.websocket) {
                                        this.displayPreviewImages(output.images);
                                    }
                                }
                            });
                        }
                        
                        if (execution.status && execution.status.completed) {
                            console.log('✅ Exécution terminée!');
                            
                            // Trouver la dernière image générée (probablement FaceDetailer ou dernière étape)
                            const outputs = execution.outputs;
                            
                            // Priorité aux nœuds de fin de chaîne
                            const nodeOrder = ['29', '27', '11', '10']; // FaceDetailer, SaveImage, Preview en priorité
                            
                            for (const nodeId of nodeOrder) {
                                if (outputs[nodeId] && outputs[nodeId].images) {
                                    const image = outputs[nodeId].images[0];
                                    console.log(`🎆 Image finale prise du nœud ${nodeId}:`, image.filename);
                                    return {
                                        filename: image.filename,
                                        subfolder: image.subfolder,
                                        type: image.type
                                    };
                                }
                            }
                            
                            // Fallback : prendre n'importe quelle image
                            for (const nodeId in outputs) {
                                if (outputs[nodeId].images) {
                                    const image = outputs[nodeId].images[0];
                                    console.log(`🖼️ Image de fallback du nœud ${nodeId}:`, image.filename);
                                    return {
                                        filename: image.filename,
                                        subfolder: image.subfolder,
                                        type: image.type
                                    };
                                }
                            }
                        }
                        
                        // Vérifier les erreurs
                        if (execution.status && execution.status.status_str && execution.status.status_str.includes('error')) {
                            console.error('❌ Erreur d\'exécution:', execution.status);
                            throw new Error(`Erreur d'exécution: ${execution.status.status_str}`);
                        }
                    }
                }
                
                // Attendre 2 secondes avant le prochain essai
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error('Erreur lors de la vérification du résultat:', error);
            }
        }
        
        throw new Error('Timeout: La génération a pris trop de temps');
    }

    displayResult(imageInfo) {
        const resultContainer = document.getElementById('generationResult');
        const imageUrl = this.buildImageUrl(imageInfo);
        
        if (imageUrl) {
            resultContainer.innerHTML = `
                <img src="${imageUrl}" alt="Image générée" class="result-image" onclick="comfyUI.viewImage('${imageUrl}')">
            `;
        } else {
            resultContainer.innerHTML = `
                <div class="error-message">
                    <p>❌ Erreur: Impossible d'afficher l'image</p>
                </div>
            `;
        }
    }

    addToGallery(imageInfo) {
        const imageUrl = this.buildImageUrl(imageInfo);
        if (!imageUrl) {
            console.error('❌ Impossible d\'ajouter à la galerie, URL invalide:', imageInfo);
            return;
        }
        
        const imageData = {
            ...imageInfo,
            timestamp: Date.now(),
            url: imageUrl
        };
        
        this.generatedImages.unshift(imageData);
        
        // Garder seulement les 50 dernières images
        if (this.generatedImages.length > 50) {
            this.generatedImages = this.generatedImages.slice(0, 50);
        }
        
        localStorage.setItem('generatedImages', JSON.stringify(this.generatedImages));
        this.loadGallery();
    }

    loadGallery() {
        const galleryGrid = document.getElementById('galleryGrid');
        
        if (this.generatedImages.length === 0) {
            galleryGrid.innerHTML = '<p class="no-images">Aucune image générée</p>';
            return;
        }
        
        // Force le rechargement en vidant d'abord
        galleryGrid.innerHTML = '';
        galleryGrid.innerHTML = this.generatedImages.map((image, index) => {
            // Vérifier que l'URL existe
            if (!image.url) {
                console.warn(`❌ Image ${index + 1} sans URL:`, image);
                return `
                    <div class="gallery-item error">
                        <div class="image-error">❌ Image indisponible</div>
                        <div class="overlay">
                            <span>${image.filename || `Image ${index + 1}`}</span>
                        </div>
                    </div>
                `;
            }
            
            const itemHtml = `<div class="gallery-item" onclick="comfyUI.viewImage('${image.url}')"><img src="${image.url}" alt="Image ${index + 1}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=&quot;gallery-error&quot;>❌ Erreur de chargement</div>';"></div>`;
            return itemHtml;
        }).join('');
    }

    viewImage(url) {
        // Activer temporairement le zoom pour cette modal
        const viewport = document.querySelector('meta[name="viewport"]');
        const originalViewport = viewport.content;
        viewport.content = 'width=device-width, initial-scale=1.0';
        
        // Modal ULTRA SIMPLE - Copie exacte de la version qui marche
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.9); display: flex; align-items: center;
            justify-content: center; z-index: 1000; cursor: pointer;
        `;
        
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'max-width: 95%; max-height: 95%; object-fit: contain; touch-action: auto;';
        
        modal.appendChild(img);
        document.body.appendChild(modal);
        
        modal.addEventListener('click', () => {
            // Restaurer le viewport original
            viewport.content = originalViewport;
            document.body.removeChild(modal);
        });
    }

    clearGallery() {
        if (confirm('Êtes-vous sûr de vouloir vider la galerie ?')) {
            this.generatedImages = [];
            localStorage.removeItem('generatedImages');
            this.loadGallery();
        }
    }

    // === WEBSOCKET ET PREVIEW DYNAMIQUE ===
    
    initWebSocket(clientId) {
        // Utiliser l'URL WebSocket configurée
        const wsUrl = this.websocketUrl;
        
        console.log('🔌 Connexion WebSocket ComfyUI:', wsUrl);
        
        try {
            this.websocket = new WebSocket(`${wsUrl}?clientId=${clientId}`);
            
            this.websocket.onopen = () => {
                console.log('✅ WebSocket ComfyUI connectée');
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    // Vérifier que les données sont du JSON et pas du Blob
                    if (typeof event.data === 'string') {
                        const message = JSON.parse(event.data);
                        this.handleWebSocketMessage(message);
                    } else if (event.data instanceof Blob) {
                        // Traiter les données binaires selon l'API ComfyUI
                        this.handleBinaryImageData(event.data);
                    }
                } catch (error) {
                    console.warn('⚠️ Message WebSocket non-JSON ignoré:', error.message);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ Erreur WebSocket:', error);
                console.log('🔄 Fallback vers polling...');
                this.enablePollingPreviews();
            };
            
            this.websocket.onclose = () => {
                console.log('🔌 WebSocket fermée');
                this.websocket = null;
            };
            
        } catch (error) {
            console.error('❌ Impossible de créer la WebSocket:', error);
            this.enablePollingPreviews();
        }
    }
    
    handleWebSocketMessage(message) {
        // Réduire les logs pour les messages fréquents
        if (message.type !== 'progress_state') {
            console.log('📨 Message WebSocket:', message);
        }
        
        switch (message.type) {
            case 'status':
                this.handleStatusMessage(message.data);
                break;
                
            case 'progress':
                this.handleProgressMessage(message.data);
                break;
                
            case 'executing':
                this.handleExecutingMessage(message.data);
                break;
                
            case 'executed':
                this.handleExecutedMessage(message.data);
                break;
                
            case 'execution_start':
                console.log('🚀 Début d\'exécution:', message.data);
                break;
                
            case 'execution_cached':
                console.log('💾 Nœud en cache:', message.data);
                break;
        }
    }
    
    handleStatusMessage(data) {
        console.log('📊 Status:', data);
    }
    
    handleProgressMessage(data) {
        console.log('📈 Progress:', data);
        
        if (data.value !== undefined && data.max !== undefined) {
            const percentage = (data.value / data.max) * 100;
            const progressFill = document.querySelector('#quickGenerationProgress .progress-fill');
            const progressText = document.querySelector('#quickGenerationProgress .progress-text');
            
            if (progressFill) {
                progressFill.style.width = `${percentage}%`;
            }
            
            if (progressText) {
                const nodeInfo = data.node ? ` (Nœud ${data.node})` : '';
                progressText.textContent = `Génération: ${data.value}/${data.max} (${Math.round(percentage)}%)${nodeInfo}`;
            }
        }
    }
    
    handleExecutingMessage(data) {
        console.log('⚙️ Executing node:', data);
        this.currentExecutingNode = data.node;
        
        if (data.prompt_id === this.currentPromptId) {
            const progressText = document.querySelector('#quickGenerationProgress .progress-text');
            if (progressText && data.node) {
                progressText.textContent = `Exécution du nœud ${data.node}...`;
            }
        }
    }
    
    handleExecutedMessage(data) {
        console.log('✅ Executed node:', data);
        
        // ComfyUI envoie les données dans data.data au lieu de data directement
        const nodeData = data.data || data;
        
        if (nodeData && nodeData.output) {
            // Chercher des previews dans la sortie
            if (nodeData.output.images) {
                this.displayPreviewImages(nodeData.output.images);
            }
        }
    }
    
    // Ancienne fonction supprimée - remplacée par handleBinaryImageData
    
    handleBinaryImageData(blob) {
        console.log('🖼️ Données binaires reçues:', blob.size, 'bytes, node actuel:', this.currentExecutingNode);
        
        // Vérifier si on est dans un node qui produit des images (basé sur vos logs)
        if (this.currentExecutingNode && 
            (this.currentExecutingNode === '9' ||  // KSampler qui produit ComfyUI_temp_yjflz_
             this.currentExecutingNode === '18' || // Produit ComfyUI_temp_zgyxh_
             this.currentExecutingNode === '21' || // Produit ComfyUI_temp_plvpg_
             this.currentExecutingNode === '27' || // Image finale
             this.currentExecutingNode === '7')) { // Node 7 des logs
            
            this.processBinaryImageData(blob);
        } else {
            console.log('📋 Données binaires ignorées (node non-image)');
        }
    }
    
    processBinaryImageData(blob) {
        // Convertir le Blob en ArrayBuffer pour traiter les bytes
        blob.arrayBuffer().then(buffer => {
            // Selon l'API ComfyUI, ignorer les 8 premiers bytes (header)
            const imageData = buffer.slice(8);
            
            if (imageData.byteLength < 1000) {
                console.warn('⚠️ Données binaires trop petites après suppression du header:', imageData.byteLength);
                return;
            }
            
            // Créer un nouveau Blob avec les données d'image
            const imageBlob = new Blob([imageData], { type: 'image/jpeg' });
            const blobUrl = URL.createObjectURL(imageBlob);
            
            console.log('✅ Image binaire traitée:', imageBlob.size, 'bytes');
            
            // Créer une miniature canvas stable
            this.createThumbnailFromBlob(blobUrl, (thumbnailDataUrl) => {
                if (thumbnailDataUrl) {
                    this.displayBlobPreview(blobUrl, thumbnailDataUrl);
                } else {
                    console.warn('⚠️ Impossible de créer la miniature depuis les données binaires');
                    URL.revokeObjectURL(blobUrl);
                }
            });
            
        }).catch(error => {
            console.error('❌ Erreur traitement données binaires:', error);
        });
    }
    
    createThumbnailFromBlob(blobUrl, callback) {
        const img = new Image();
        img.onload = () => {
            try {
                // Créer un canvas pour la miniature
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Taille de la miniature
                const maxSize = 60;
                let { width, height } = img;
                
                // Calculer les nouvelles dimensions en gardant le ratio
                if (width > height) {
                    if (width > maxSize) {
                        height = height * (maxSize / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = width * (maxSize / height);
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Dessiner l'image redimensionnée
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convertir en data URL
                const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                callback(thumbnailDataUrl);
            } catch (error) {
                console.error('❌ Erreur création miniature:', error);
                callback(null);
            }
        };
        
        img.onerror = () => {
            console.error('❌ Erreur chargement image pour miniature');
            callback(null);
        };
        
        img.src = blobUrl;
    }
    
    createThumbnailFromUrl(url, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Pour éviter les problèmes CORS
        
        img.onload = () => {
            try {
                // Créer un canvas pour la miniature
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Taille de la miniature
                const maxSize = 60;
                let { width, height } = img;
                
                // Calculer les nouvelles dimensions en gardant le ratio
                if (width > height) {
                    if (width > maxSize) {
                        height = height * (maxSize / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = width * (maxSize / height);
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Dessiner l'image redimensionnée
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convertir en data URL
                const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                callback(thumbnailDataUrl);
            } catch (error) {
                console.warn('⚠️ CORS ou erreur création miniature, utilisation URL originale:', error.message);
                callback(null); // Utiliser l'URL originale
            }
        };
        
        img.onerror = () => {
            console.warn('⚠️ Erreur chargement image, utilisation URL originale');
            callback(null); // Utiliser l'URL originale
        };
        
        img.src = url;
    }
    
    displayBlobPreview(blobUrl, dataUrl) {
        const previewContainer = document.getElementById('previewContainer');
        const previewImage = document.getElementById('previewImage');
        const previewInfo = document.getElementById('previewInfo');
        
        // Ajouter à l'historique avec les deux URLs
        this.previewCount++;
        this.previewHistory.push({
            url: blobUrl, // Pour l'affichage principal
            thumbnailUrl: dataUrl, // Pour les miniatures (plus stable)
            filename: `preview_live_${this.previewCount}.png`,
            count: this.previewCount,
            isBlob: true
        });
        
        // Mettre à jour l'image principale avec fallback
        previewImage.onerror = () => {
            console.log('❌ Blob URL expiré, basculement vers data URL');
            if (dataUrl && previewImage.src !== dataUrl) {
                previewImage.src = dataUrl;
                previewInfo.textContent = `🔄 Preview Live ${this.previewCount} (fallback)`;
            } else {
                console.log('❌ Erreur complète de chargement du preview');
                previewInfo.textContent = `❌ Erreur preview ${this.previewCount}`;
            }
        };
        
        previewImage.onload = () => {
            console.log('✅ Preview Blob chargé');
        };
        
        previewImage.src = blobUrl;
        previewInfo.textContent = `🔄 Preview Live ${this.previewCount}`;
        previewContainer.style.display = 'block';
        
        // Mettre à jour l'historique visuel
        this.updatePreviewHistory();
        
        // Nettoyer les anciens blob URLs pour libérer la mémoire (garder les 10 derniers)
        this.cleanupOldBlobUrls();
        
        console.log(`🖼️ Preview Live ${this.previewCount} affiché`);
    }
    
    displayPreviewImages(images) {
        const previewContainer = document.getElementById('previewContainer');
        const previewImage = document.getElementById('previewImage');
        const previewInfo = document.getElementById('previewInfo');
        const previewHistory = document.getElementById('previewHistory');
        
        if (images.length > 0) {
            const latestImage = images[images.length - 1];
            const previewUrl = this.buildImageUrl(latestImage);
            
            if (previewUrl) {
                // Créer une miniature canvas pour plus de stabilité
                this.createThumbnailFromUrl(previewUrl, (thumbnailDataUrl) => {
                    this.previewHistory.push({
                        url: previewUrl,
                        thumbnailUrl: thumbnailDataUrl || previewUrl,
                        filename: latestImage.filename,
                        count: this.previewCount + 1
                    });
                    this.updatePreviewHistory();
                });
                
                // Mettre à jour l'image principale
                previewImage.onerror = () => {
                    console.log('❌ Erreur de chargement pour:', latestImage.filename);
                    previewInfo.textContent = `❌ Erreur: ${latestImage.filename}`;
                };
                
                previewImage.onload = () => {
                    console.log('✅ Preview chargé:', latestImage.filename);
                };
                
                previewImage.src = previewUrl;
                this.previewCount++;
                previewInfo.textContent = `🔄 Preview ${this.previewCount}: ${latestImage.filename}`;
                previewContainer.style.display = 'block';
                
                console.log(`🖼️ Preview ${this.previewCount}:`, previewUrl);
            } else {
                console.error('❌ URL preview invalide:', latestImage);
                previewInfo.textContent = `❌ Preview invalide`;
            }
        }
    }
    
    updatePreviewHistory() {
        const previewHistory = document.getElementById('previewHistory');
        
        previewHistory.innerHTML = this.previewHistory.map((preview, index) => {
            // Utiliser thumbnailUrl si disponible (pour les Blobs), sinon url normale
            const thumbnailSrc = preview.thumbnailUrl || preview.url;
            return `
                <img src="${thumbnailSrc}" 
                     alt="Preview ${preview.count}" 
                     class="preview-thumbnail ${index === this.previewHistory.length - 1 ? 'current loading' : ''}"
                     onclick="comfyUI.showPreviewFromHistory(${index})"
                     title="Preview ${preview.count}: ${preview.filename}"
                     onload="this.classList.remove('loading')"
                     onerror="this.style.opacity='0.5'; this.classList.remove('loading'); this.title='❌ Miniature en erreur: ${preview.filename}'; console.error('❌ Miniature cassée:', '${preview.filename}')">
            `;
        }).join('');
    }
    
    cleanupOldBlobUrls() {
        // Garder seulement les 10 dernières previews pour limiter l'usage mémoire
        const maxPreviews = 10;
        if (this.previewHistory.length > maxPreviews) {
            const toRemove = this.previewHistory.splice(0, this.previewHistory.length - maxPreviews);
            toRemove.forEach(preview => {
                if (preview.isBlob && preview.url && preview.url.startsWith('blob:')) {
                    URL.revokeObjectURL(preview.url);
                    console.log(`🧹 Ancien Blob URL supprimé: ${preview.filename}`);
                }
            });
        }
    }
    
    showPreviewFromHistory(index) {
        const preview = this.previewHistory[index];
        if (preview) {
            const previewImage = document.getElementById('previewImage');
            const previewInfo = document.getElementById('previewInfo');
            
            previewImage.src = preview.url;
            previewInfo.textContent = `🔄 Preview ${preview.count}: ${preview.filename}`;
            
            // Mettre à jour les classes current
            document.querySelectorAll('.preview-thumbnail').forEach((thumb, i) => {
                thumb.classList.toggle('current', i === index);
            });
        }
    }
    
    enablePollingPreviews() {
        console.log('📊 Activation des previews par polling');
        this.showIntermediateImages = true;
        this.previewCount = 0;
        this.previewHistory = [];
    }

    closeWebSocket() {
        this.showIntermediateImages = false;
        
        // Nettoyer les URLs d'objets Blob (seulement les blobUrl, pas les dataUrl)
        this.previewHistory.forEach(preview => {
            if (preview.isBlob && preview.url && preview.url.startsWith('blob:')) {
                URL.revokeObjectURL(preview.url);
            }
        });
        
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
    }

    // === UTILITAIRES ===
    
    buildImageUrl(imageInfo) {
        const { filename, subfolder, type } = imageInfo;
        
        if (!filename) {
            console.error('❌ Filename manquant:', imageInfo);
            return null;
        }
        
        // Construire les paramètres de l'URL
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

    // === GESTION DES PARAMÈTRES ===
    
    loadSettings() {
        const defaultSettings = {
            serverUrl: 'https://comfyui-mobile.duckdns.org/api',
            showModelsTab: false
        };
        
        try {
            const saved = localStorage.getItem('comfyui_settings');
            const settings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
            
            // Auto-générer l'URL WebSocket depuis l'URL serveur
            settings.websocketUrl = this.generateWebSocketUrl(settings.serverUrl);
            
            return settings;
        } catch (error) {
            console.error('Erreur lors du chargement des paramètres:', error);
            return { ...defaultSettings, websocketUrl: this.generateWebSocketUrl(defaultSettings.serverUrl) };
        }
    }
    
    generateWebSocketUrl(serverUrl) {
        try {
            const url = new URL(serverUrl);
            
            // Déterminer le protocole WebSocket
            const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            
            // Construire l'URL WebSocket
            let wsUrl = `${wsProtocol}//${url.host}`;
            
            // Si l'URL contient /api, utiliser /api/ws (pas juste /ws)
            if (url.pathname.includes('/api')) {
                wsUrl += '/api/ws';
            } else {
                wsUrl += '/ws';
            }
            
            console.log(`🔄 WebSocket auto-généré: ${serverUrl} → ${wsUrl}`);
            return wsUrl;
        } catch (error) {
            console.error('❌ Erreur génération WebSocket URL:', error);
            // Fallback simple - utiliser /api/ws
            return serverUrl.replace('https://', 'wss://').replace('http://', 'ws://').replace(/\/api$/, '') + '/api/ws';
        }
    }
    
    loadSettingsUI() {
        document.getElementById('serverUrl').value = this.settings.serverUrl;
        document.getElementById('websocketUrl').value = this.settings.websocketUrl;
        
        // Event listener pour auto-générer WebSocket quand l'URL serveur change
        document.getElementById('serverUrl').addEventListener('input', (e) => {
            const newWsUrl = this.generateWebSocketUrl(e.target.value);
            document.getElementById('websocketUrl').value = newWsUrl;
        });
    }
    
    saveSettings() {
        const serverUrl = document.getElementById('serverUrl').value.trim();
        
        if (!serverUrl) {
            alert('⚠️ Veuillez saisir l\'adresse du serveur');
            return;
        }

        // Auto-générer l'URL WebSocket
        const websocketUrl = this.generateWebSocketUrl(serverUrl);
        
        this.settings = { serverUrl, websocketUrl, showModelsTab: this.settings.showModelsTab };
        this.serverUrl = serverUrl;
        this.websocketUrl = websocketUrl;
        
        // Mettre à jour l'affichage WebSocket
        document.getElementById('websocketUrl').value = websocketUrl;
        
        try {
            localStorage.setItem('comfyui_settings', JSON.stringify(this.settings));
            alert('✅ Paramètres sauvegardés !\n🔄 WebSocket: ' + websocketUrl);
            console.log('🔧 Nouveaux paramètres:', this.settings);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            alert('❌ Erreur lors de la sauvegarde');
        }
    }
    
    resetSettings() {
        if (confirm('🔄 Réinitialiser les paramètres par défaut ?')) {
            localStorage.removeItem('comfyui_settings');
            const defaultSettings = this.loadSettings();
            document.getElementById('serverUrl').value = defaultSettings.serverUrl;
            document.getElementById('websocketUrl').value = defaultSettings.websocketUrl;
            alert('✅ Paramètres réinitialisés');
        }
    }
    
    async testServerConnection() {
        const serverUrl = document.getElementById('serverUrl').value.trim();
        const statusElement = document.getElementById('serverStatus');
        
        if (!serverUrl) {
            statusElement.textContent = 'URL manquante';
            statusElement.className = 'connection-result error';
            return;
        }
        
        statusElement.textContent = 'Test en cours...';
        statusElement.className = 'connection-result testing';
        
        try {
            const response = await fetch(`${serverUrl}/object_info`, {
                method: 'GET',
                timeout: 10000
            });
            
            if (response.ok) {
                statusElement.textContent = '✅ Connexion réussie';
                statusElement.className = 'connection-result success';
            } else {
                statusElement.textContent = `❌ Erreur ${response.status}`;
                statusElement.className = 'connection-result error';
            }
        } catch (error) {
            console.error('Test serveur échoué:', error);
            statusElement.textContent = '❌ Connexion échouée';
            statusElement.className = 'connection-result error';
        }
    }
    
    testWebSocketConnection() {
        const websocketUrl = document.getElementById('websocketUrl').value.trim();
        const statusElement = document.getElementById('websocketStatus');
        
        if (!websocketUrl) {
            statusElement.textContent = 'URL manquante';
            statusElement.className = 'connection-result error';
            return;
        }
        
        statusElement.textContent = 'Test en cours...';
        statusElement.className = 'connection-result testing';
        
        try {
            const testWs = new WebSocket(websocketUrl);
            
            const timeout = setTimeout(() => {
                testWs.close();
                statusElement.textContent = '⏱️ Timeout de connexion';
                statusElement.className = 'connection-result error';
            }, 10000);
            
            testWs.onopen = () => {
                clearTimeout(timeout);
                testWs.close();
                statusElement.textContent = '✅ WebSocket OK';
                statusElement.className = 'connection-result success';
            };
            
            testWs.onerror = () => {
                clearTimeout(timeout);
                statusElement.textContent = '❌ Connexion échouée';
                statusElement.className = 'connection-result error';
            };
            
            testWs.onclose = (event) => {
                if (event.code !== 1000 && statusElement.textContent === 'Test en cours...') {
                    clearTimeout(timeout);
                    statusElement.textContent = '❌ WebSocket fermée';
                    statusElement.className = 'connection-result error';
                }
            };
            
        } catch (error) {
            console.error('Test WebSocket échoué:', error);
            statusElement.textContent = '❌ Erreur de test';
            statusElement.className = 'connection-result error';
        }
    }
    
    // === GESTION DE L'ANNULATION ===
    
    setGeneratingState(isGenerating) {
        this.isGenerating = isGenerating;
        const quickBtn = document.getElementById('quickGenerateBtn');
        
        if (isGenerating) {
            quickBtn.textContent = '⏹️ Annuler';
            quickBtn.classList.add('cancel-state');
            quickBtn.disabled = false; // Garder le bouton actif pour pouvoir annuler !
        } else {
            quickBtn.textContent = '⚡ Génération Rapide';
            quickBtn.classList.remove('cancel-state');
            quickBtn.disabled = false;
        }
    }
    
    async cancelGeneration() {
        if (!this.currentPromptId) {
            console.warn('⚠️ Aucune génération à annuler');
            return;
        }
        
        console.log('🛑 Annulation de la génération:', this.currentPromptId);
        
        // Marquer comme annulé pour interrompre waitForResult
        this.isCancelled = true;
        
        try {
            // Envoyer la requête d'annulation à l'API ComfyUI
            const cancelResponse = await fetch(`${this.serverUrl}/interrupt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (cancelResponse.ok) {
                console.log('✅ Génération annulée avec succès');
                
                // Fermer la WebSocket et nettoyer
                this.closeWebSocket();
                
                // Réinitialiser l'interface
                const quickProgress = document.getElementById('quickGenerationProgress');
                const quickProgressText = quickProgress.querySelector('.progress-text');
                const quickResult = document.getElementById('quickGenerationResult');
                
                quickProgressText.textContent = 'Génération annulée';
                quickResult.innerHTML = `
                    <div class="info-message">
                        <p>🛑 Génération annulée par l'utilisateur</p>
                    </div>
                `;
                
                // Arrêter l'état de génération après un court délai
                setTimeout(() => {
                    this.setGeneratingState(false);
                    this.currentPromptId = null;
                    quickProgress.style.display = 'none';
                }, 1500);
                
            } else {
                throw new Error('Échec de l\'annulation');
            }
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'annulation:', error);
            alert('Erreur lors de l\'annulation: ' + error.message);
            
            // En cas d'erreur, forcer l'arrêt local
            this.setGeneratingState(false);
            this.currentPromptId = null;
            this.closeWebSocket();
        }
    }
    
    // === GESTION ONGLET MODÈLES ===
    
    toggleModelsTab(show) {
        const modelsTab = document.getElementById('modelsTab');
        if (show) {
            modelsTab.style.display = 'block';
        } else {
            modelsTab.style.display = 'none';
            
            // Si l'onglet Modèles est actuellement actif, basculer vers Workflow
            if (modelsTab.classList.contains('active')) {
                this.switchTab('workflow');
            }
        }
        
        console.log(`🔧 Onglet Modèles ${show ? 'affiché' : 'masqué'}`);
    }
    
    // === SYNCHRONISATION TEMPS RÉEL ===
    
    syncWorkflowInterface() {
        // Regénérer l'interface Workflow pour synchroniser avec Quick Gen
        if (this.currentWorkflow) {
            // Utiliser un timeout pour éviter trop de regénérations
            clearTimeout(this.syncWorkflowTimeout);
            this.syncWorkflowTimeout = setTimeout(() => {
                this.generateWorkflowParams(this.currentWorkflow);
            }, 100);
        }
    }
    
    syncQuickGenInterface() {
        // Synchroniser Quick Gen avec les changements du Workflow
        if (this.currentWorkflow && this.quickGenNodes) {
            // Utiliser un timeout pour éviter trop de regénérations
            clearTimeout(this.syncQuickGenTimeout);
            this.syncQuickGenTimeout = setTimeout(() => {
                this.populateQuickGenFromWorkflow();
                this.displayActiveLoras();
                
                // S'assurer que l'interface ControlNet est à jour
                if (this.quickGenNodes.controlNets && this.quickGenNodes.controlNets.length > 0) {
                    // Vérifier si l'interface existe déjà
                    const content = document.getElementById('controlNetContent');
                    const hasInterface = content && content.querySelector('.multi-controlnet-container');
                    
                    if (!hasInterface) {
                        console.log('🔄 Re-création interface ControlNet...');
                        this.createMultiControlNetInterface();
                    } else {
                        // Synchroniser les valeurs existantes
                        this.syncMultiControlNetInterface();
                    }
                }
            }, 100);
        }
    }
    
    // === LORA MANAGEMENT ===
    
    setupLoraEventListeners() {
        // Recherche de LoRA
        const searchInput = document.getElementById('loraSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterAvailableLoras(e.target.value);
            });
        }
        
        // Sélection d'un LoRA à ajouter
        const loraSelect = document.getElementById('loraAddSelect');
        if (loraSelect) {
            loraSelect.addEventListener('change', (e) => {
                const addBtn = document.getElementById('addLoraBtn');
                addBtn.disabled = !e.target.value;
            });
        }
    }
    
    findPowerLoraLoader() {
        if (!this.currentWorkflow) return null;
        
        // Chercher le nœud Power Lora Loader
        for (const nodeId in this.currentWorkflow) {
            const node = this.currentWorkflow[nodeId];
            if (node.class_type === 'Power Lora Loader (rgthree)') {
                return nodeId;
            }
        }
        return null;
    }
    
    initLoraManagement() {
        const lorasSection = document.getElementById('lorasSection');
        if (!lorasSection) return;
        
        this.powerLoraLoaderNode = this.findPowerLoraLoader();
        
        if (this.powerLoraLoaderNode) {
            lorasSection.style.display = 'block';
            this.populateAvailableLoras();
            this.displayActiveLoras();
        } else {
            lorasSection.style.display = 'none';
        }
    }
    
    populateAvailableLoras() {
        const loraSelect = document.getElementById('loraAddSelect');
        if (!loraSelect || !this.availableModels.loras) return;
        
        // Garder seulement l'option par défaut
        loraSelect.innerHTML = '<option value="">+ Ajouter LoRA</option>';
        
        // Ajouter tous les LoRAs disponibles
        this.availableModels.loras.forEach(lora => {
            const option = document.createElement('option');
            option.value = lora;
            option.textContent = lora.split('/').pop().replace('.safetensors', '');
            loraSelect.appendChild(option);
        });
        
        this.availableLorasFiltered = [...this.availableModels.loras];
    }
    
    filterAvailableLoras(searchTerm) {
        const loraSelect = document.getElementById('loraAddSelect');
        if (!loraSelect) return;
        
        const trimmedTerm = searchTerm.trim();
        let filtered;
        
        if (trimmedTerm === '') {
            // Si pas de recherche, afficher tous les LoRAs
            filtered = this.availableModels.loras || [];
        } else {
            // Filtrer par nom
            filtered = (this.availableModels.loras || []).filter(lora => 
                lora.toLowerCase().includes(trimmedTerm.toLowerCase())
            );
        }
        
        // Mettre à jour le dropdown
        loraSelect.innerHTML = `<option value="">+ Ajouter LoRA (${filtered.length})</option>`;
        
        filtered.forEach(lora => {
            const option = document.createElement('option');
            option.value = lora;
            const displayName = lora.split('/').pop().replace('.safetensors', '');
            option.textContent = displayName;
            loraSelect.appendChild(option);
        });
        
        // Ouvrir automatiquement le dropdown si il y a des résultats et une recherche
        if (trimmedTerm && filtered.length > 0 && filtered.length <= 20) {
            // Petit délai pour que l'utilisateur voit les résultats
            setTimeout(() => {
                loraSelect.focus();
                loraSelect.click();
            }, 100);
        }
        
        this.availableLorasFiltered = filtered;
        
        // Log pour debug
        if (trimmedTerm) {
            console.log(`🔍 Recherche LoRA: "${trimmedTerm}" → ${filtered.length} résultats`);
        }
    }
    
    displayActiveLoras() {
        const activeLorasList = document.getElementById('activeLorasList');
        if (!activeLorasList || !this.powerLoraLoaderNode) return;
        
        const loraNode = this.currentWorkflow[this.powerLoraLoaderNode];
        const loras = this.extractLorasFromNode(loraNode);
        
        if (loras.length === 0) {
            activeLorasList.innerHTML = '<p class="no-loras">Aucun LoRA configuré</p>';
            return;
        }
        
        let html = '';
        loras.forEach((lora, index) => {
            const loraName = lora.lora.split('/').pop().replace('.safetensors', '');
            const isFirst = index === 0;
            const isLast = index === loras.length - 1;
            
            html += `
                <div class="lora-item ${!lora.on ? 'disabled' : ''}" data-lora-key="${lora.key}">
                    <div class="lora-name">
                        <span>📄</span>
                        <span class="lora-filename">${loraName}</span>
                    </div>
                    
                    <label class="lora-toggle">
                        <input type="checkbox" ${lora.on ? 'checked' : ''} 
                               onchange="comfyUI.toggleLora('${lora.key}', this.checked)">
                        <span class="lora-toggle-slider"></span>
                    </label>
                    
                    <div class="lora-controls">
                        <div class="lora-weight-container">
                            <input type="range" class="lora-weight-slider" 
                                   min="-5" max="5" step="0.1" value="${lora.strength}"
                                   onchange="comfyUI.updateLoraWeight('${lora.key}', parseFloat(this.value))"
                                   oninput="this.nextElementSibling.textContent = this.value">
                            <span class="lora-weight-value">${lora.strength}</span>
                        </div>
                    </div>
                    
                    <div class="lora-actions">
                        <button class="lora-action-btn move-up ${isFirst ? 'disabled' : ''}" 
                                onclick="comfyUI.moveLoraUp('${lora.key}')" 
                                ${isFirst ? 'disabled' : ''} title="Monter">⬆️</button>
                        <button class="lora-action-btn move-down ${isLast ? 'disabled' : ''}" 
                                onclick="comfyUI.moveLoraDown('${lora.key}')" 
                                ${isLast ? 'disabled' : ''} title="Descendre">⬇️</button>
                        <button class="lora-action-btn delete" 
                                onclick="comfyUI.deleteLora('${lora.key}')" title="Supprimer">❌</button>
                    </div>
                </div>
            `;
        });
        
        activeLorasList.innerHTML = html;
    }
    
    extractLorasFromNode(loraNode) {
        if (!loraNode || !loraNode.inputs) return [];
        
        const loras = [];
        const inputs = loraNode.inputs;
        
        // Extraire tous les lora_X
        Object.keys(inputs).forEach(key => {
            if (key.startsWith('lora_') && typeof inputs[key] === 'object' && inputs[key].lora) {
                loras.push({
                    key: key,
                    ...inputs[key]
                });
            }
        });
        
        // Trier par numéro (lora_1, lora_2, etc.)
        return loras.sort((a, b) => {
            const aNum = parseInt(a.key.replace('lora_', ''));
            const bNum = parseInt(b.key.replace('lora_', ''));
            return aNum - bNum;
        });
    }
    
    addQuickLora() {
        const loraSelect = document.getElementById('loraAddSelect');
        const selectedLora = loraSelect.value;
        
        if (!selectedLora || !this.powerLoraLoaderNode) return;
        
        const loraNode = this.currentWorkflow[this.powerLoraLoaderNode];
        const nextLoraNumber = this.getNextLoraNumber(loraNode);
        const newLoraKey = `lora_${nextLoraNumber}`;
        
        // Ajouter le nouveau LoRA au workflow
        loraNode.inputs[newLoraKey] = {
            on: true,
            lora: selectedLora,
            strength: 1.0
        };
        
        // Réinitialiser la sélection
        loraSelect.value = '';
        document.getElementById('addLoraBtn').disabled = true;
        
        // Mettre à jour l'affichage et synchroniser
        this.displayActiveLoras();
        this.syncWorkflowInterface();
        
        console.log(`LoRA ajouté: ${selectedLora} avec la clé ${newLoraKey}`);
    }
    
    getNextLoraNumber(loraNode) {
        let maxNumber = 0;
        Object.keys(loraNode.inputs).forEach(key => {
            if (key.startsWith('lora_')) {
                const number = parseInt(key.replace('lora_', ''));
                if (!isNaN(number) && number > maxNumber) {
                    maxNumber = number;
                }
            }
        });
        return maxNumber + 1;
    }
    
    toggleLora(loraKey, isOn) {
        if (!this.powerLoraLoaderNode) return;
        
        const loraNode = this.currentWorkflow[this.powerLoraLoaderNode];
        if (loraNode.inputs[loraKey]) {
            loraNode.inputs[loraKey].on = isOn;
            
            // Mettre à jour l'affichage
            const loraItem = document.querySelector(`[data-lora-key="${loraKey}"]`);
            if (loraItem) {
                if (isOn) {
                    loraItem.classList.remove('disabled');
                } else {
                    loraItem.classList.add('disabled');
                }
            }
            
            this.syncWorkflowInterface();
            console.log(`LoRA ${loraKey} ${isOn ? 'activé' : 'désactivé'}`);
        }
    }
    
    updateLoraWeight(loraKey, weight) {
        if (!this.powerLoraLoaderNode) return;
        
        const loraNode = this.currentWorkflow[this.powerLoraLoaderNode];
        if (loraNode.inputs[loraKey]) {
            loraNode.inputs[loraKey].strength = weight;
            this.syncWorkflowInterface();
            console.log(`LoRA ${loraKey} poids mis à jour: ${weight}`);
        }
    }
    
    moveLoraUp(loraKey) {
        this.moveLoraPosition(loraKey, -1);
    }
    
    moveLoraDown(loraKey) {
        this.moveLoraPosition(loraKey, 1);
    }
    
    moveLoraPosition(loraKey, direction) {
        if (!this.powerLoraLoaderNode) return;
        
        const loraNode = this.currentWorkflow[this.powerLoraLoaderNode];
        const loras = this.extractLorasFromNode(loraNode);
        const currentIndex = loras.findIndex(lora => lora.key === loraKey);
        const newIndex = currentIndex + direction;
        
        if (newIndex < 0 || newIndex >= loras.length) return;
        
        // Échanger les positions
        const temp = loras[currentIndex];
        loras[currentIndex] = loras[newIndex];
        loras[newIndex] = temp;
        
        // Reconstruire les inputs avec les nouvelles positions
        loras.forEach(lora => {
            delete loraNode.inputs[lora.key];
        });
        
        loras.forEach((lora, index) => {
            const newKey = `lora_${index + 1}`;
            loraNode.inputs[newKey] = {
                on: lora.on,
                lora: lora.lora,
                strength: lora.strength
            };
        });
        
        this.displayActiveLoras();
        this.syncWorkflowInterface();
        console.log(`LoRA ${loraKey} déplacé`);
    }
    
    deleteLora(loraKey) {
        if (!confirm('Supprimer ce LoRA ?')) return;
        if (!this.powerLoraLoaderNode) return;
        
        const loraNode = this.currentWorkflow[this.powerLoraLoaderNode];
        delete loraNode.inputs[loraKey];
        
        // Réorganiser les clés pour éviter les trous
        this.reorganizeLoraKeys(loraNode);
        
        this.displayActiveLoras();
        this.syncWorkflowInterface();
        console.log(`LoRA ${loraKey} supprimé`);
    }
    
    reorganizeLoraKeys(loraNode) {
        const loras = this.extractLorasFromNode(loraNode);
        
        // Supprimer tous les anciens LoRAs
        Object.keys(loraNode.inputs).forEach(key => {
            if (key.startsWith('lora_')) {
                delete loraNode.inputs[key];
            }
        });
        
        // Recréer avec des clés séquentielles
        loras.forEach((lora, index) => {
            const newKey = `lora_${index + 1}`;
            loraNode.inputs[newKey] = {
                on: lora.on,
                lora: lora.lora,
                strength: lora.strength
            };
        });
    }
    
    // === WORKFLOW MANAGEMENT ===
    
    loadSavedWorkflows() {
        try {
            const saved = localStorage.getItem('comfyui_saved_workflows');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('❌ Erreur chargement workflows sauvegardés:', error);
            return {};
        }
    }
    
    saveSavedWorkflows() {
        try {
            localStorage.setItem('comfyui_saved_workflows', JSON.stringify(this.savedWorkflows));
            localStorage.setItem('comfyui_last_workflow', this.currentWorkflowName || '');
            this.updateWorkflowUI();
        } catch (error) {
            console.error('❌ Erreur sauvegarde workflows:', error);
            alert('Erreur lors de la sauvegarde des workflows');
        }
    }
    
    updateWorkflowUI() {
        const saveBtn = document.getElementById('saveWorkflowBtn');
        const manageBtn = document.getElementById('manageWorkflowBtn');
        const exportBtn = document.getElementById('exportAllBtn');
        const workflowsList = document.getElementById('savedWorkflowsList');
        
        const hasWorkflow = !!this.currentWorkflow;
        const hasProjects = Object.keys(this.savedWorkflows).length > 0;
        
        // Activer/désactiver les boutons
        saveBtn.disabled = !hasWorkflow;
        manageBtn.disabled = !hasProjects;
        exportBtn.disabled = !hasProjects;
        
        // Mettre à jour la liste déroulante
        workflowsList.innerHTML = '<option value="">📂 Mes workflows sauvegardés</option>';
        
        Object.keys(this.savedWorkflows).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `📄 ${name}`;
            if (name === this.currentWorkflowName) {
                option.selected = true;
            }
            workflowsList.appendChild(option);
        });
    }
    
    async saveCurrentWorkflow() {
        if (!this.currentWorkflow) {
            alert('Aucun workflow à sauvegarder');
            return;
        }
        
        const name = prompt('Nom du workflow:', this.currentWorkflowName || 'Mon Workflow');
        if (!name || name.trim() === '') return;
        
        const finalName = name.trim();
        
        // Vérifier si le nom existe déjà
        if (this.savedWorkflows[finalName] && finalName !== this.currentWorkflowName) {
            if (!confirm(`Un workflow nommé "${finalName}" existe déjà. Le remplacer ?`)) {
                return;
            }
        }
        
        // Sauvegarder le workflow avec ses paramètres actuels
        this.savedWorkflows[finalName] = {
            workflow: JSON.parse(JSON.stringify(this.currentWorkflow)),
            savedAt: new Date().toISOString(),
            description: `Sauvegardé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`
        };
        
        this.currentWorkflowName = finalName;
        this.saveSavedWorkflows();
        
        console.log(`💾 Workflow "${finalName}" sauvegardé`);
        alert(`✅ Workflow "${finalName}" sauvegardé avec succès !`);
    }
    
    loadSavedWorkflow(workflowName) {
        if (!workflowName || !this.savedWorkflows[workflowName]) {
            return;
        }
        
        const savedData = this.savedWorkflows[workflowName];
        this.currentWorkflow = JSON.parse(JSON.stringify(savedData.workflow));
        this.currentWorkflowName = workflowName;
        
        // Mettre à jour l'interface
        this.displayWorkflowInfo(this.currentWorkflow, workflowName);
        this.generateWorkflowParams(this.currentWorkflow);
        this.updateWorkflowStatus(this.currentWorkflow);
        this.initQuickGen();
        this.updateWorkflowUI();
        
        console.log(`📂 Workflow "${workflowName}" chargé`);
    }
    
    openWorkflowManager() {
        const workflowNames = Object.keys(this.savedWorkflows);
        if (workflowNames.length === 0) {
            alert('Aucun workflow sauvegardé');
            return;
        }
        
        let managerHtml = `
            <div style="background: #2d2d2d; color: white; padding: 20px; border-radius: 8px; max-width: 500px;">
                <h3 style="margin-bottom: 15px; color: #667eea;">🗂️ Gestionnaire de workflows</h3>
                <div style="max-height: 300px; overflow-y: auto;">
        `;
        
        workflowNames.forEach(name => {
            const workflow = this.savedWorkflows[name];
            managerHtml += `
                <div style="background: #404040; padding: 10px; margin-bottom: 8px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${name}</strong><br>
                        <small style="color: #888;">${workflow.description}</small>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="comfyUI.renameWorkflow('${name}')" style="background: #667eea; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer;">✏️</button>
                        <button onclick="comfyUI.exportWorkflow('${name}')" style="background: #4CAF50; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer;">📤</button>
                        <button onclick="comfyUI.deleteWorkflow('${name}')" style="background: #f44336; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer;">🗑️</button>
                    </div>
                </div>
            `;
        });
        
        managerHtml += `
                </div>
                <div style="text-align: center; margin-top: 15px;">
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #666; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Fermer</button>
                </div>
            </div>
        `;
        
        // Créer et afficher la popup
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.8); z-index: 10000; 
            display: flex; align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box;
        `;
        overlay.innerHTML = managerHtml;
        document.body.appendChild(overlay);
        
        // Fermer en cliquant sur l'overlay
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }
    
    renameWorkflow(oldName) {
        const newName = prompt('Nouveau nom:', oldName);
        if (!newName || newName.trim() === '' || newName === oldName) return;
        
        const finalName = newName.trim();
        
        if (this.savedWorkflows[finalName]) {
            alert(`Un workflow nommé "${finalName}" existe déjà`);
            return;
        }
        
        // Renommer
        this.savedWorkflows[finalName] = this.savedWorkflows[oldName];
        delete this.savedWorkflows[oldName];
        
        // Mettre à jour le nom actuel si c'est le workflow en cours
        if (this.currentWorkflowName === oldName) {
            this.currentWorkflowName = finalName;
        }
        
        this.saveSavedWorkflows();
        
        // Fermer et rouvrir le gestionnaire pour actualiser
        document.querySelector('div[style*="position: fixed"]')?.remove();
        this.openWorkflowManager();
        
        console.log(`✏️ Workflow renommé: "${oldName}" → "${finalName}"`);
    }
    
    deleteWorkflow(name) {
        if (!confirm(`Supprimer le workflow "${name}" ?`)) return;
        
        delete this.savedWorkflows[name];
        
        // Si c'était le workflow actuel, le décharger
        if (this.currentWorkflowName === name) {
            this.currentWorkflowName = null;
        }
        
        this.saveSavedWorkflows();
        
        // Fermer et rouvrir le gestionnaire pour actualiser
        document.querySelector('div[style*="position: fixed"]')?.remove();
        this.openWorkflowManager();
        
        console.log(`🗑️ Workflow "${name}" supprimé`);
    }
    
    exportWorkflow(name) {
        const workflow = this.savedWorkflows[name];
        if (!workflow) return;
        
        const dataStr = JSON.stringify(workflow.workflow, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `${name}.json`;
        link.click();
        
        console.log(`📤 Workflow "${name}" exporté`);
    }
    
    exportAllWorkflows() {
        if (Object.keys(this.savedWorkflows).length === 0) {
            alert('Aucun workflow à exporter');
            return;
        }
        
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            workflows: this.savedWorkflows
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `comfyui_workflows_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        console.log('📤 Sauvegarde complète exportée');
    }
    
    importWorkflowBackup(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                
                // Vérifier le format
                if (!importData.workflows) {
                    alert('Fichier de sauvegarde invalide');
                    return;
                }
                
                let imported = 0;
                let skipped = 0;
                
                Object.entries(importData.workflows).forEach(([name, workflow]) => {
                    if (this.savedWorkflows[name]) {
                        if (confirm(`Le workflow "${name}" existe déjà. Le remplacer ?`)) {
                            this.savedWorkflows[name] = workflow;
                            imported++;
                        } else {
                            skipped++;
                        }
                    } else {
                        this.savedWorkflows[name] = workflow;
                        imported++;
                    }
                });
                
                this.saveSavedWorkflows();
                alert(`✅ Import terminé: ${imported} workflows importés, ${skipped} ignorés`);
                
                console.log(`📥 Sauvegarde importée: ${imported} workflows`);
                
            } catch (error) {
                console.error('❌ Erreur import:', error);
                alert('Erreur lors de l\'import du fichier');
            }
        };
        
        reader.readAsText(file);
        fileInput.value = '';
    }
    
    loadLastWorkflow() {
        try {
            const lastWorkflowName = localStorage.getItem('comfyui_last_workflow');
            if (lastWorkflowName && this.savedWorkflows[lastWorkflowName]) {
                console.log(`🔄 Rechargement du dernier workflow: "${lastWorkflowName}"`);
                this.loadSavedWorkflow(lastWorkflowName);
                return true;
            }
        } catch (error) {
            console.error('❌ Erreur rechargement dernier workflow:', error);
        }
        return false;
    }
    
    // ===== MÉTHODES WOL ET CONTRÔLE À DISTANCE =====
    
    initWOLRemoteControl() {
        console.log('📶 Initialisation contrôle à distance...');
        
        // Initialiser le module WOL
        this.wolControl = new WOLRemoteControl();
        
        // Charger les paramètres existants
        this.loadWOLSettings();
        
        // Événements
        this.setupWOLEventListeners();
        
        // Vérifier le statut initial
        this.checkRemoteServerStatus();
    }
    
    loadWOLSettings() {
        const settings = this.wolControl.getSettings();
        
        // Remplir les champs
        const macField = document.getElementById('macAddress');
        const serverField = document.getElementById('shutdownServerUrl');
        const delayField = document.getElementById('shutdownDelay');
        
        if (macField) macField.value = settings.macAddress || '';
        if (serverField) serverField.value = settings.shutdownServerUrl || '';
        if (delayField) delayField.value = settings.defaultShutdownDelay || 30;
        
        // Mettre à jour l'état des boutons
        this.updateWOLButtonStates();
    }
    
    setupWOLEventListeners() {
        // Sauvegarder les paramètres quand ils changent
        ['macAddress', 'shutdownServerUrl', 'shutdownDelay'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => {
                    this.saveWOLSettings();
                });
            }
        });
        
        // Boutons de contrôle
        const checkStatusBtn = document.getElementById('checkRemoteStatus');
        const sendWOLBtn = document.getElementById('sendWOL');
        const shutdownBtn = document.getElementById('shutdownPC');
        const rebootBtn = document.getElementById('rebootPC');
        const cancelBtn = document.getElementById('cancelShutdown');
        
        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => {
                this.checkRemoteServerStatus();
            });
        }
        
        if (sendWOLBtn) {
            sendWOLBtn.addEventListener('click', () => {
                this.sendWakeOnLAN();
            });
        }
        
        if (shutdownBtn) {
            shutdownBtn.addEventListener('click', () => {
                this.shutdownRemotePC();
            });
        }
        
        if (rebootBtn) {
            rebootBtn.addEventListener('click', () => {
                this.rebootRemotePC();
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.cancelRemoteShutdown();
            });
        }
    }
    
    saveWOLSettings() {
        const macAddress = document.getElementById('macAddress')?.value || '';
        const shutdownServerUrl = document.getElementById('shutdownServerUrl')?.value || '';
        const shutdownDelay = parseInt(document.getElementById('shutdownDelay')?.value) || 30;
        
        this.wolControl.updateSettings({
            macAddress: macAddress,
            shutdownServerUrl: shutdownServerUrl,
            defaultShutdownDelay: shutdownDelay
        });
        
        this.updateWOLButtonStates();
    }
    
    updateWOLButtonStates() {
        const settings = this.wolControl.getSettings();
        const hasValidMac = this.wolControl.isValidMacAddress(settings.macAddress);
        const hasServerUrl = settings.shutdownServerUrl && settings.shutdownServerUrl.trim() !== '';
        
        // Bouton WOL
        const sendWOLBtn = document.getElementById('sendWOL');
        if (sendWOLBtn) {
            sendWOLBtn.disabled = !hasValidMac;
        }
        
        // Boutons shutdown/reboot/cancel
        ['shutdownPC', 'rebootPC', 'cancelShutdown'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = !hasServerUrl;
            }
        });
    }
    
    async checkRemoteServerStatus() {
        const indicator = document.getElementById('remoteStatusIndicator');
        const text = document.getElementById('remoteStatusText');
        const checkBtn = document.getElementById('checkRemoteStatus');
        
        if (!indicator || !text) return;
        
        // État "vérification"
        indicator.className = 'status-indicator checking';
        text.textContent = 'Vérification...';
        if (checkBtn) checkBtn.disabled = true;
        
        try {
            const status = await this.wolControl.checkServerStatus();
            
            if (status.online) {
                indicator.className = 'status-indicator online';
                text.textContent = `En ligne - ${status.hostname || 'Serveur actif'}`;
                console.log('✅ Serveur de shutdown en ligne:', status);
            } else {
                indicator.className = 'status-indicator offline';
                text.textContent = `Hors ligne - ${status.error || 'Serveur inaccessible'}`;
                console.log('❌ Serveur de shutdown hors ligne:', status.error);
            }
            
        } catch (error) {
            indicator.className = 'status-indicator offline';
            text.textContent = `Erreur - ${error.message}`;
            console.error('❌ Erreur vérification statut:', error);
        }
        
        if (checkBtn) checkBtn.disabled = false;
    }
    
    async sendWakeOnLAN() {
        const btn = document.getElementById('sendWOL');
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '🔄 Envoi...';
        
        try {
            console.log('🔌 Envoi Wake-on-LAN...');
            
            // Essayer d'abord via le serveur shutdown (si disponible)
            let result = await this.wolControl.sendWOLViaShutdownServer();
            
            if (!result.success) {
                // Fallback vers le service WOL externe
                result = await this.wolControl.sendWOL();
            }
            
            if (result.success) {
                btn.textContent = '✅ Envoyé !';
                console.log('✅ WOL envoyé:', result.message);
                
                // Afficher un message à l'utilisateur
                const message = result.note ? `${result.message}\n\n${result.note}` : result.message;
                alert('✅ ' + message);
                
                // Vérifier le statut du serveur après 10 secondes
                setTimeout(() => {
                    this.checkRemoteServerStatus();
                }, 10000);
                
            } else {
                btn.textContent = '❌ Échec';
                console.error('❌ Échec WOL:', result.message);
                alert('❌ Erreur WOL: ' + result.message);
            }
            
        } catch (error) {
            btn.textContent = '❌ Erreur';
            console.error('❌ Erreur WOL:', error);
            alert('❌ Erreur: ' + error.message);
        }
        
        // Restaurer le bouton après 3 secondes
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);
    }
    
    async shutdownRemotePC() {
        const delay = parseInt(document.getElementById('shutdownDelay')?.value) || 30;
        
        if (!confirm(`⚠️ Êtes-vous sûr de vouloir éteindre le PC dans ${delay} secondes ?`)) {
            return;
        }
        
        const btn = document.getElementById('shutdownPC');
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '🔄 Arrêt...';
        
        try {
            const result = await this.wolControl.shutdownPC(delay, false);
            
            if (result.success) {
                btn.textContent = '✅ Programmé';
                console.log('✅ Shutdown programmé:', result.message);
                alert('✅ ' + result.message);
                
                // Mettre à jour le statut
                this.checkRemoteServerStatus();
                
            } else {
                btn.textContent = '❌ Échec';
                console.error('❌ Échec shutdown:', result.message);
                alert('❌ Erreur: ' + result.message);
            }
            
        } catch (error) {
            btn.textContent = '❌ Erreur';
            console.error('❌ Erreur shutdown:', error);
            alert('❌ Erreur: ' + error.message);
        }
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);
    }
    
    async rebootRemotePC() {
        const delay = parseInt(document.getElementById('shutdownDelay')?.value) || 30;
        
        if (!confirm(`⚠️ Êtes-vous sûr de vouloir redémarrer le PC dans ${delay} secondes ?`)) {
            return;
        }
        
        const btn = document.getElementById('rebootPC');
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '🔄 Redémarrage...';
        
        try {
            const result = await this.wolControl.rebootPC(delay);
            
            if (result.success) {
                btn.textContent = '✅ Programmé';
                console.log('✅ Reboot programmé:', result.message);
                alert('✅ ' + result.message);
                
                this.checkRemoteServerStatus();
                
            } else {
                btn.textContent = '❌ Échec';
                console.error('❌ Échec reboot:', result.message);
                alert('❌ Erreur: ' + result.message);
            }
            
        } catch (error) {
            btn.textContent = '❌ Erreur';
            console.error('❌ Erreur reboot:', error);
            alert('❌ Erreur: ' + error.message);
        }
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);
    }
    
    async cancelRemoteShutdown() {
        const btn = document.getElementById('cancelShutdown');
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '🔄 Annulation...';
        
        try {
            const result = await this.wolControl.cancelShutdown();
            
            if (result.success) {
                btn.textContent = '✅ Annulé';
                console.log('✅ Shutdown annulé:', result.message);
                alert('✅ ' + result.message);
                
                this.checkRemoteServerStatus();
                
            } else {
                btn.textContent = '⚠️ Aucun';
                console.log('⚠️ Aucun shutdown à annuler:', result.message);
                alert('ℹ️ ' + result.message);
            }
            
        } catch (error) {
            btn.textContent = '❌ Erreur';
            console.error('❌ Erreur annulation:', error);
            alert('❌ Erreur: ' + error.message);
        }
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);
    }
}

// Initialiser l'interface
const comfyUI = new ComfyUIInterface();

// Initialiser WOL après le chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Attendre que tous les éléments soient chargés
    setTimeout(() => {
        if (typeof WOLRemoteControl !== 'undefined') {
            comfyUI.initWOLRemoteControl();
        } else {
            console.warn('⚠️ Module WOL non chargé');
        }
    }, 1000);
});