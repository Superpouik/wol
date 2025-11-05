#!/bin/bash

echo "========================================"
echo "  ComfyUI Browser - Démarrage"
echo "  Version 2.0 - Stable Edition"
echo "========================================"
echo ""

# Vérifier si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "Installation des dépendances..."
    npm install
    echo ""
fi

echo "Démarrage de l'application..."
npm start
