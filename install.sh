#!/bin/bash

echo "========================================"
echo "  ComfyUI Browser - Installation"
echo "========================================"
echo ""

# Détecter la distribution
if [ -f /etc/debian_version ]; then
    # Debian/Ubuntu
    echo "Distribution Debian/Ubuntu détectée"
    echo "Installation des dépendances..."
    sudo apt update
    sudo apt install -y python3 python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.0
elif [ -f /etc/arch-release ]; then
    # Arch Linux
    echo "Distribution Arch Linux détectée"
    echo "Installation des dépendances..."
    sudo pacman -S --needed python python-gobject gtk3 webkit2gtk
elif [ -f /etc/fedora-release ]; then
    # Fedora
    echo "Distribution Fedora détectée"
    echo "Installation des dépendances..."
    sudo dnf install -y python3 python3-gobject gtk3 webkit2gtk3
else
    echo "Distribution non reconnue"
    echo ""
    echo "Veuillez installer manuellement :"
    echo "  - Python 3"
    echo "  - python3-gi (PyGObject)"
    echo "  - GTK 3"
    echo "  - WebKit2GTK"
    exit 1
fi

echo ""
echo "========================================"
echo "  Installation terminée !"
echo "========================================"
echo ""
echo "Pour lancer l'application, exécutez :"
echo "  ./start.sh"
echo ""
