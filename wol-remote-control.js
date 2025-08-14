/**
 * Module WOL (Wake-on-LAN) et contrôle à distance
 * Permet d'allumer et d'éteindre le PC depuis l'interface mobile
 */

class WOLRemoteControl {
    constructor() {
        this.settings = {
            macAddress: '',
            broadcastIP: '255.255.255.255',
            wolPort: 9,
            shutdownServerUrl: 'http://192.168.1.100:8081', // À adapter selon votre config
            defaultShutdownDelay: 30
        };
        
        this.loadSettings();
    }
    
    loadSettings() {
        try {
            const saved = localStorage.getItem('wol_remote_settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('❌ Erreur chargement paramètres WOL:', error);
        }
    }
    
    saveSettings() {
        try {
            localStorage.setItem('wol_remote_settings', JSON.stringify(this.settings));
            console.log('✅ Paramètres WOL sauvegardés');
        } catch (error) {
            console.error('❌ Erreur sauvegarde paramètres WOL:', error);
        }
    }
    
    /**
     * Créer un paquet Magic Packet pour Wake-on-LAN
     * @param {string} macAddress - Adresse MAC (format: AA:BB:CC:DD:EE:FF)
     * @returns {Uint8Array} - Paquet Magic Packet
     */
    createMagicPacket(macAddress) {
        // Nettoyer l'adresse MAC
        const cleanMac = macAddress.replace(/[:-]/g, '').toUpperCase();
        
        if (cleanMac.length !== 12) {
            throw new Error('Adresse MAC invalide');
        }
        
        // Convertir en bytes
        const macBytes = [];
        for (let i = 0; i < 12; i += 2) {
            macBytes.push(parseInt(cleanMac.substr(i, 2), 16));
        }
        
        // Créer le Magic Packet
        // 6 bytes FF suivis de 16 répétitions de l'adresse MAC
        const packet = new Uint8Array(102);
        
        // 6 bytes FF
        for (let i = 0; i < 6; i++) {
            packet[i] = 0xFF;
        }
        
        // 16 répétitions de l'adresse MAC
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 6; j++) {
                packet[6 + i * 6 + j] = macBytes[j];
            }
        }
        
        return packet;
    }
    
    /**
     * Envoyer un paquet Wake-on-LAN via une requête au serveur
     * Note: Le WOL direct depuis le navigateur n'est pas possible pour des raisons de sécurité
     * Cette méthode utilise un service externe ou un proxy
     */
    async sendWOL() {
        try {
            if (!this.settings.macAddress) {
                throw new Error('Adresse MAC non configurée');
            }
            
            console.log('🌐 Envoi paquet Wake-on-LAN...');
            console.log('📍 MAC:', this.settings.macAddress);
            console.log('📡 Broadcast IP:', this.settings.broadcastIP);
            
            // Méthode 1: Utiliser un service WOL en ligne (wake-on-lan.net, etc.)
            const wolServiceUrl = `https://www.wake-on-lan.net/api/wake`;
            
            const response = await fetch(wolServiceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mac: this.settings.macAddress,
                    ip: this.settings.broadcastIP,
                    port: this.settings.wolPort
                })
            });
            
            if (response.ok) {
                console.log('✅ Paquet WOL envoyé avec succès');
                return { success: true, message: 'Paquet Wake-on-LAN envoyé' };
            } else {
                throw new Error(`Erreur service WOL: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur envoi WOL:', error);
            
            // Fallback: Essayer avec une requête GET simple vers le routeur (si configuré)
            try {
                // Cette méthode fonctionne si votre routeur supporte WOL via HTTP
                const routerWolUrl = `http://192.168.1.1/wol?mac=${this.settings.macAddress}`;
                await fetch(routerWolUrl, { mode: 'no-cors' });
                
                return { 
                    success: true, 
                    message: 'Tentative WOL via routeur (non vérifiable depuis le navigateur)',
                    note: 'Vérifiez si votre PC s\'allume dans quelques secondes'
                };
                
            } catch (routerError) {
                return { 
                    success: false, 
                    message: `Erreur WOL: ${error.message}`,
                    fallback_error: routerError.message
                };
            }
        }
    }
    
    /**
     * Alternative WOL: Envoyer une requête à votre propre serveur de shutdown
     * qui peut avoir une fonction WOL intégrée
     */
    async sendWOLViaShutdownServer() {
        try {
            const response = await fetch(`${this.settings.shutdownServerUrl}/wol`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mac: this.settings.macAddress,
                    broadcast: this.settings.broadcastIP
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur WOL via serveur shutdown:', error);
            return { success: false, message: error.message };
        }
    }
    
    /**
     * Vérifier le statut du serveur de shutdown
     */
    async checkServerStatus() {
        try {
            const response = await fetch(`${this.settings.shutdownServerUrl}/status`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const status = await response.json();
                return { online: true, ...status };
            } else {
                return { online: false, error: `HTTP ${response.status}` };
            }
            
        } catch (error) {
            return { online: false, error: error.message };
        }
    }
    
    /**
     * Programmer l'arrêt du PC
     */
    async shutdownPC(delay = null, force = false) {
        try {
            const shutdownDelay = delay || this.settings.defaultShutdownDelay;
            
            const response = await fetch(`${this.settings.shutdownServerUrl}/shutdown`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    delay: shutdownDelay,
                    force: force
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur shutdown:', error);
            return { success: false, message: error.message };
        }
    }
    
    /**
     * Programmer le redémarrage du PC
     */
    async rebootPC(delay = null) {
        try {
            const rebootDelay = delay || this.settings.defaultShutdownDelay;
            
            const response = await fetch(`${this.settings.shutdownServerUrl}/reboot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    delay: rebootDelay
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur reboot:', error);
            return { success: false, message: error.message };
        }
    }
    
    /**
     * Annuler un arrêt/redémarrage programmé
     */
    async cancelShutdown() {
        try {
            const response = await fetch(`${this.settings.shutdownServerUrl}/cancel`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                throw new Error(`Erreur serveur: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ Erreur annulation:', error);
            return { success: false, message: error.message };
        }
    }
    
    /**
     * Mettre à jour les paramètres
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }
    
    /**
     * Obtenir les paramètres actuels
     */
    getSettings() {
        return { ...this.settings };
    }
    
    /**
     * Valider une adresse MAC
     */
    isValidMacAddress(mac) {
        const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        return macRegex.test(mac);
    }
    
    /**
     * Détecter automatiquement l'adresse MAC (ne fonctionne pas dans le navigateur)
     * Cette fonction est là pour référence, mais ne peut pas fonctionner pour des raisons de sécurité
     */
    async detectMacAddress() {
        // Cette méthode ne peut pas fonctionner dans un navigateur pour des raisons de sécurité
        // L'utilisateur doit saisir manuellement son adresse MAC
        console.warn('⚠️ Détection automatique MAC impossible dans le navigateur');
        return null;
    }
}

// Export global
window.WOLRemoteControl = WOLRemoteControl;