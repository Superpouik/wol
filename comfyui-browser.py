#!/usr/bin/env python3
"""
ComfyUI Browser - Navigateur dédié GTK avec WebKitGTK
Léger, natif, sans Chromium
"""

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.0')
from gi.repository import Gtk, WebKit2, Gdk, GLib
import json
import os

# Fichier de configuration
CONFIG_FILE = os.path.expanduser("~/.comfyui-browser-config.json")

class ComfyUIBrowser(Gtk.Window):
    def __init__(self):
        super().__init__(title="ComfyUI Browser")

        # Configuration de la fenêtre
        self.set_default_size(1400, 900)
        self.set_position(Gtk.WindowPosition.CENTER)

        # Charger la dernière URL
        self.last_url = self.load_last_url()

        if self.last_url:
            # Créer directement le navigateur
            self.create_browser(self.last_url)
        else:
            # Afficher l'écran de connexion
            self.create_connection_screen()

    def load_last_url(self):
        """Charger la dernière URL utilisée"""
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    return config.get('last_url')
        except:
            pass
        return None

    def save_url(self, url):
        """Sauvegarder l'URL pour la prochaine fois"""
        try:
            config = {'last_url': url}
            with open(CONFIG_FILE, 'w') as f:
                json.dump(config, f)
        except Exception as e:
            print(f"Erreur sauvegarde config: {e}")

    def create_connection_screen(self):
        """Créer l'écran de connexion"""
        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=20)
        vbox.set_halign(Gtk.Align.CENTER)
        vbox.set_valign(Gtk.Align.CENTER)

        # Titre
        title = Gtk.Label()
        title.set_markup("<span size='xx-large' weight='bold'>🎨 ComfyUI Browser</span>")
        vbox.pack_start(title, False, False, 0)

        subtitle = Gtk.Label()
        subtitle.set_markup("<span size='small' color='#666'>Navigateur natif GTK pour ComfyUI</span>")
        vbox.pack_start(subtitle, False, False, 0)

        # Champ URL
        url_label = Gtk.Label()
        url_label.set_markup("<b>Adresse du serveur ComfyUI :</b>")
        vbox.pack_start(url_label, False, False, 10)

        self.url_entry = Gtk.Entry()
        self.url_entry.set_text("http://localhost:8188")
        self.url_entry.set_width_chars(40)
        self.url_entry.connect("activate", self.on_connect_clicked)
        vbox.pack_start(self.url_entry, False, False, 0)

        # Boutons presets
        preset_box = Gtk.Box(spacing=10)
        preset_box.set_halign(Gtk.Align.CENTER)

        local_btn = Gtk.Button(label="Local")
        local_btn.connect("clicked", lambda w: self.url_entry.set_text("http://localhost:8188"))
        preset_box.pack_start(local_btn, False, False, 0)

        lan_btn = Gtk.Button(label="LAN")
        lan_btn.connect("clicked", lambda w: self.url_entry.set_text("http://192.168.1.100:8188"))
        preset_box.pack_start(lan_btn, False, False, 0)

        vbox.pack_start(preset_box, False, False, 0)

        # Bouton connexion
        connect_btn = Gtk.Button(label="Se connecter")
        connect_btn.get_style_context().add_class("suggested-action")
        connect_btn.connect("clicked", self.on_connect_clicked)
        vbox.pack_start(connect_btn, False, False, 10)

        # Info
        info = Gtk.Label()
        info.set_markup("<span size='small'>💡 Assurez-vous que ComfyUI est démarré</span>")
        vbox.pack_start(info, False, False, 0)

        self.add(vbox)
        self.show_all()

    def on_connect_clicked(self, widget):
        """Connexion au serveur ComfyUI"""
        url = self.url_entry.get_text().strip()

        # Ajouter http:// si manquant
        if not url.startswith(('http://', 'https://')):
            url = 'http://' + url

        # Ajouter le port par défaut si manquant
        if ':' not in url.split('//')[1]:
            url = url + ':8188'

        # Sauvegarder l'URL
        self.save_url(url)

        # Nettoyer la fenêtre
        for child in self.get_children():
            self.remove(child)

        # Créer le navigateur
        self.create_browser(url)

    def create_browser(self, url):
        """Créer le navigateur WebKit"""
        # Configuration WebKit pour performances maximales
        settings = WebKit2.Settings()
        settings.set_enable_webgl(True)
        settings.set_enable_webaudio(True)
        settings.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ALWAYS)
        settings.set_enable_developer_extras(False)
        settings.set_enable_page_cache(False)
        settings.set_enable_smooth_scrolling(True)
        settings.set_enable_accelerated_2d_canvas(True)
        settings.set_javascript_can_access_clipboard(True)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_allow_universal_access_from_file_urls(True)

        # Créer la WebView
        self.webview = WebKit2.WebView()
        self.webview.set_settings(settings)

        # Désactiver le cache
        context = self.webview.get_context()
        context.set_cache_model(WebKit2.CacheModel.DOCUMENT_VIEWER)

        # Permettre le contenu mixte (HTTP/HTTPS)
        context.set_process_model(WebKit2.ProcessModel.MULTIPLE_SECONDARY_PROCESSES)

        # Charger l'URL
        self.webview.load_uri(url)

        # Container avec scrolling
        scrolled = Gtk.ScrolledWindow()
        scrolled.add(self.webview)

        # Barre de contrôle
        toolbar = self.create_toolbar()

        # Layout
        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        vbox.pack_start(toolbar, False, False, 0)
        vbox.pack_start(scrolled, True, True, 0)

        self.add(vbox)
        self.show_all()

        # Mettre le focus sur la webview
        self.webview.grab_focus()

    def create_toolbar(self):
        """Créer la barre d'outils"""
        toolbar = Gtk.Box(spacing=5)
        toolbar.set_margin_start(5)
        toolbar.set_margin_end(5)
        toolbar.set_margin_top(5)
        toolbar.set_margin_bottom(5)

        # Bouton retour
        back_btn = Gtk.Button.new_from_icon_name("go-previous", Gtk.IconSize.BUTTON)
        back_btn.set_tooltip_text("Retour")
        back_btn.connect("clicked", lambda w: self.webview.go_back())
        toolbar.pack_start(back_btn, False, False, 0)

        # Bouton avant
        forward_btn = Gtk.Button.new_from_icon_name("go-next", Gtk.IconSize.BUTTON)
        forward_btn.set_tooltip_text("Suivant")
        forward_btn.connect("clicked", lambda w: self.webview.go_forward())
        toolbar.pack_start(forward_btn, False, False, 0)

        # Bouton reload
        reload_btn = Gtk.Button.new_from_icon_name("view-refresh", Gtk.IconSize.BUTTON)
        reload_btn.set_tooltip_text("Recharger")
        reload_btn.connect("clicked", lambda w: self.webview.reload())
        toolbar.pack_start(reload_btn, False, False, 0)

        # Bouton home
        home_btn = Gtk.Button.new_from_icon_name("go-home", Gtk.IconSize.BUTTON)
        home_btn.set_tooltip_text("Retour à la connexion")
        home_btn.connect("clicked", self.on_home_clicked)
        toolbar.pack_start(home_btn, False, False, 0)

        # Spacer
        toolbar.pack_start(Gtk.Label(), True, True, 0)

        # Bouton plein écran
        fullscreen_btn = Gtk.Button.new_from_icon_name("view-fullscreen", Gtk.IconSize.BUTTON)
        fullscreen_btn.set_tooltip_text("Plein écran (F11)")
        fullscreen_btn.connect("clicked", self.toggle_fullscreen)
        toolbar.pack_start(fullscreen_btn, False, False, 0)

        return toolbar

    def on_home_clicked(self, widget):
        """Retour à l'écran de connexion"""
        for child in self.get_children():
            self.remove(child)
        self.create_connection_screen()

    def toggle_fullscreen(self, widget):
        """Basculer le mode plein écran"""
        if self.is_maximized():
            self.unfullscreen()
        else:
            self.fullscreen()

def main():
    # Style CSS pour l'application
    css = b"""
    window {
        background-color: #f5f5f5;
    }

    .suggested-action {
        background-image: linear-gradient(to bottom, #667eea, #764ba2);
        color: white;
        font-weight: bold;
        padding: 10px 30px;
        border-radius: 8px;
    }
    """

    style_provider = Gtk.CssProvider()
    style_provider.load_from_data(css)
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(),
        style_provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    )

    # Créer et lancer l'application
    window = ComfyUIBrowser()
    window.connect("destroy", Gtk.main_quit)
    window.show_all()

    Gtk.main()

if __name__ == "__main__":
    main()
