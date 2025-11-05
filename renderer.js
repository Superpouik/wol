// Gestion de l'historique des connexions
const RECENT_CONNECTIONS_KEY = 'comfyui_recent_connections';

// Charger l'historique au démarrage
window.addEventListener('DOMContentLoaded', () => {
    loadRecentConnections();

    // Permettre la connexion avec Enter
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

    // Validation de base
    if (!url) {
        alert('Veuillez entrer une adresse de serveur');
        return;
    }

    // Ajouter http:// si manquant
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }

    // Ajouter le port par défaut si manquant
    if (!url.match(/:\d+/) && !url.includes('https://')) {
        url = url + ':8188';
    }

    // Valider l'URL
    try {
        new URL(url);
    } catch (e) {
        alert('Adresse invalide. Format attendu : http://localhost:8188');
        return;
    }

    // Sauvegarder dans l'historique
    saveRecentConnection(url);

    // Se connecter via Electron IPC
    if (window.electronAPI) {
        window.electronAPI.connectToComfyUI(url);
    } else {
        // Fallback pour tests en navigateur classique
        window.location.href = url;
    }
}

function saveRecentConnection(url) {
    let recent = getRecentConnections();

    // Retirer l'URL si elle existe déjà
    recent = recent.filter(item => item.url !== url);

    // Ajouter en première position
    recent.unshift({
        url: url,
        timestamp: Date.now()
    });

    // Garder seulement les 5 dernières
    recent = recent.slice(0, 5);

    localStorage.setItem(RECENT_CONNECTIONS_KEY, JSON.stringify(recent));
}

function getRecentConnections() {
    try {
        const data = localStorage.getItem(RECENT_CONNECTIONS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function loadRecentConnections() {
    const recent = getRecentConnections();

    if (recent.length === 0) return;

    const container = document.getElementById('recentConnections');
    const list = document.getElementById('recentList');

    list.innerHTML = '';

    recent.forEach(item => {
        const div = document.createElement('div');
        div.className = 'recent-item';

        const urlSpan = document.createElement('span');
        urlSpan.textContent = item.url;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'time';
        timeSpan.textContent = getTimeAgo(item.timestamp);

        div.appendChild(urlSpan);
        div.appendChild(timeSpan);

        div.onclick = () => {
            document.getElementById('serverUrl').value = item.url;
            connect();
        };

        list.appendChild(div);
    });

    container.style.display = 'block';
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'à l\'instant';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' h';
    return Math.floor(seconds / 86400) + ' j';
}
