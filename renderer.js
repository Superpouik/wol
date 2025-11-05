// Configuration
const CONFIG_KEY = 'comfyui_config';

// Charger la configuration au démarrage
window.addEventListener('DOMContentLoaded', () => {
    loadConfig();

    // Enter pour connecter
    document.getElementById('serverUrl').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            connect();
        }
    });
});

function setPreset(url) {
    document.getElementById('serverUrl').value = url;
}

function connect() {
    const urlInput = document.getElementById('serverUrl');
    let url = urlInput.value.trim();

    if (!url) {
        alert('Veuillez entrer une adresse');
        return;
    }

    // Ajouter http:// si manquant
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }

    // Ajouter le port par défaut si manquant
    if (!url.match(/:\d+$/) && !url.includes('https://')) {
        url = url + ':8188';
    }

    // Valider l'URL
    try {
        new URL(url);
    } catch (e) {
        alert('Adresse invalide. Format: http://localhost:8188');
        return;
    }

    // Sauvegarder la config
    saveConfig(url);

    // Se connecter
    if (window.electronAPI) {
        window.electronAPI.connectToComfyUI(url);
    }
}

function saveConfig(url) {
    try {
        const config = { lastUrl: url, savedAt: Date.now() };
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
        console.error('Failed to save config:', e);
    }
}

function loadConfig() {
    try {
        const data = localStorage.getItem(CONFIG_KEY);
        if (data) {
            const config = JSON.parse(data);
            if (config.lastUrl) {
                document.getElementById('serverUrl').value = config.lastUrl;
            }
        }
    } catch (e) {
        console.error('Failed to load config:', e);
    }
}
