#!/usr/bin/env python3
"""
Serveur de shutdown à distance pour ComfyUI Mobile
Permet d'éteindre le PC depuis l'interface web
Port par défaut : 8081
"""

import os
import sys
import json
import time
import socket
import subprocess
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

class ShutdownHandler(BaseHTTPRequestHandler):
    
    def do_OPTIONS(self):
        """Gérer les requêtes CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def do_GET(self):
        """Gérer les requêtes GET"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/status':
            self.send_status()
        elif parsed_path.path == '/shutdown':
            # Permettre shutdown via GET pour simplicité
            params = parse_qs(parsed_path.query)
            delay = int(params.get('delay', [30])[0])
            force = params.get('force', ['false'])[0].lower() == 'true'
            self.shutdown_pc(delay, force)
        elif parsed_path.path == '/cancel':
            self.cancel_shutdown()
        elif parsed_path.path == '/reboot':
            params = parse_qs(parsed_path.query)
            delay = int(params.get('delay', [30])[0])
            self.reboot_pc(delay)
        else:
            self.send_error(404, "Endpoint not found")
    
    def do_POST(self):
        """Gérer les requêtes POST"""
        parsed_path = urlparse(self.path)
        
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
            else:
                data = {}
        except:
            data = {}
        
        if parsed_path.path == '/shutdown':
            delay = data.get('delay', 30)
            force = data.get('force', False)
            self.shutdown_pc(delay, force)
        elif parsed_path.path == '/reboot':
            delay = data.get('delay', 30)
            self.reboot_pc(delay)
        elif parsed_path.path == '/cancel':
            self.cancel_shutdown()
        else:
            self.send_error(404, "Endpoint not found")
    
    def send_status(self):
        """Envoyer le statut du serveur"""
        try:
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            
            # Vérifier si un shutdown est programmé (Windows)
            if os.name == 'nt':
                try:
                    result = subprocess.run(['schtasks', '/query', '/tn', 'ComfyUI_Shutdown'], 
                                          capture_output=True, text=True)
                    shutdown_scheduled = result.returncode == 0
                except:
                    shutdown_scheduled = False
            else:
                # Linux - vérifier avec 'shutdown'
                shutdown_scheduled = False
            
            status = {
                'status': 'online',
                'hostname': hostname,
                'local_ip': local_ip,
                'platform': os.name,
                'timestamp': datetime.now().isoformat(),
                'shutdown_scheduled': shutdown_scheduled,
                'version': '1.0'
            }
            
            self.send_json_response(status)
            
        except Exception as e:
            self.send_error(500, f"Error getting status: {str(e)}")
    
    def shutdown_pc(self, delay=30, force=False):
        """Programmer l'arrêt du PC"""
        try:
            if os.name == 'nt':  # Windows
                # Annuler un shutdown existant d'abord
                subprocess.run(['shutdown', '/a'], capture_output=True)
                
                # Programmer le nouveau shutdown
                cmd = ['shutdown', '/s', '/t', str(delay)]
                if force:
                    cmd.append('/f')
                
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    response = {
                        'success': True,
                        'message': f'Arrêt programmé dans {delay} secondes',
                        'delay': delay,
                        'force': force,
                        'timestamp': datetime.now().isoformat()
                    }
                else:
                    response = {
                        'success': False,
                        'message': f'Erreur: {result.stderr}',
                        'error': result.stderr
                    }
            
            else:  # Linux/Unix
                cmd = ['sudo', 'shutdown', '-h', f'+{delay//60}']
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                response = {
                    'success': result.returncode == 0,
                    'message': f'Arrêt programmé dans {delay} secondes' if result.returncode == 0 else f'Erreur: {result.stderr}',
                    'delay': delay,
                    'timestamp': datetime.now().isoformat()
                }
            
            self.send_json_response(response)
            
        except Exception as e:
            self.send_error(500, f"Error scheduling shutdown: {str(e)}")
    
    def reboot_pc(self, delay=30):
        """Programmer le redémarrage du PC"""
        try:
            if os.name == 'nt':  # Windows
                # Annuler un shutdown existant d'abord
                subprocess.run(['shutdown', '/a'], capture_output=True)
                
                # Programmer le redémarrage
                cmd = ['shutdown', '/r', '/t', str(delay)]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                response = {
                    'success': result.returncode == 0,
                    'message': f'Redémarrage programmé dans {delay} secondes' if result.returncode == 0 else f'Erreur: {result.stderr}',
                    'delay': delay,
                    'timestamp': datetime.now().isoformat()
                }
            
            else:  # Linux/Unix
                cmd = ['sudo', 'shutdown', '-r', f'+{delay//60}']
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                response = {
                    'success': result.returncode == 0,
                    'message': f'Redémarrage programmé dans {delay} secondes' if result.returncode == 0 else f'Erreur: {result.stderr}',
                    'delay': delay,
                    'timestamp': datetime.now().isoformat()
                }
            
            self.send_json_response(response)
            
        except Exception as e:
            self.send_error(500, f"Error scheduling reboot: {str(e)}")
    
    def cancel_shutdown(self):
        """Annuler un arrêt programmé"""
        try:
            if os.name == 'nt':  # Windows
                result = subprocess.run(['shutdown', '/a'], capture_output=True, text=True)
                success = "La commande d'arrêt" in result.stderr or result.returncode == 0
                
                response = {
                    'success': success,
                    'message': 'Arrêt annulé' if success else 'Aucun arrêt programmé',
                    'timestamp': datetime.now().isoformat()
                }
            
            else:  # Linux/Unix
                result = subprocess.run(['sudo', 'shutdown', '-c'], capture_output=True, text=True)
                
                response = {
                    'success': result.returncode == 0,
                    'message': 'Arrêt annulé' if result.returncode == 0 else 'Aucun arrêt programmé',
                    'timestamp': datetime.now().isoformat()
                }
            
            self.send_json_response(response)
            
        except Exception as e:
            self.send_error(500, f"Error canceling shutdown: {str(e)}")
    
    def send_json_response(self, data):
        """Envoyer une réponse JSON"""
        response_json = json.dumps(data, indent=2)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(response_json)))
        self.end_headers()
        self.wfile.write(response_json.encode('utf-8'))
        
        # Log
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.client_address[0]} - {self.path} - {data.get('message', 'Response sent')}")
    
    def log_message(self, format, *args):
        """Override pour un logging plus propre"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.client_address[0]} - {format % args}")

def main():
    """Fonction principale"""
    PORT = 8081
    
    print("=" * 60)
    print("🖥️  SERVEUR DE SHUTDOWN À DISTANCE - ComfyUI Mobile")
    print("=" * 60)
    print(f"🌐 Port: {PORT}")
    print(f"💻 Plateforme: {os.name}")
    print(f"📍 Hostname: {socket.gethostname()}")
    
    try:
        local_ip = socket.gethostbyname(socket.gethostname())
        print(f"🔗 IP locale: {local_ip}")
    except:
        print("🔗 IP locale: Non disponible")
    
    print("\n📡 Endpoints disponibles:")
    print(f"   GET  http://localhost:{PORT}/status")
    print(f"   GET  http://localhost:{PORT}/shutdown?delay=30&force=false")
    print(f"   GET  http://localhost:{PORT}/reboot?delay=30")
    print(f"   GET  http://localhost:{PORT}/cancel")
    print(f"   POST http://localhost:{PORT}/shutdown")
    print(f"   POST http://localhost:{PORT}/reboot")
    print(f"   POST http://localhost:{PORT}/cancel")
    
    print("\n⚠️  ATTENTION:")
    print("   - Ce serveur peut éteindre votre PC !")
    print("   - Assurez-vous que le port 8081 est ouvert dans votre firewall")
    print("   - Pour un accès externe, configurez le port forwarding")
    
    print("\n🚀 Démarrage du serveur...")
    print("   Ctrl+C pour arrêter")
    print("=" * 60)
    
    try:
        server = HTTPServer(('0.0.0.0', PORT), ShutdownHandler)
        print(f"✅ Serveur démarré sur le port {PORT}")
        print(f"🌐 Accessible sur: http://localhost:{PORT}/status")
        print()
        
        server.serve_forever()
        
    except KeyboardInterrupt:
        print("\n\n🛑 Arrêt du serveur...")
        server.shutdown()
        print("✅ Serveur arrêté")
        
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())