#!/bin/bash

echo "========================================"
echo "  ComfyUI Browser GTK - Démarrage"
echo "========================================"
echo ""

# Vérifier si les dépendances sont installées
if ! python3 -c "import gi" 2>/dev/null; then
    echo "Installation des dépendances requises..."
    echo "Veuillez exécuter: ./install.sh"
    exit 1
fi

echo "Démarrage de l'application..."
python3 comfyui-browser.py
