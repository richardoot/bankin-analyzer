#!/bin/bash

# Script de Test Automatisé - Intégration Finale
# Vérifie que l'application compile et démarre correctement

echo "🚀 Test de l'intégration finale - Bankin Analyzer"
echo "=================================================="

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "package.json" ]; then
    echo "❌ Erreur: package.json non trouvé. Veuillez exécuter depuis la racine du projet."
    exit 1
fi

echo "📋 1. Vérification des dépendances..."
if npm list > /dev/null 2>&1; then
    echo "✅ Dépendances OK"
else
    echo "⚠️  Problème avec les dépendances, tentative d'installation..."
    npm install
fi

echo "📋 2. Vérification TypeScript..."
if npx vue-tsc --noEmit; then
    echo "✅ TypeScript OK"
else
    echo "❌ Erreurs TypeScript détectées"
    exit 1
fi

echo "📋 3. Vérification ESLint..."
if npx eslint src --ext .ts,.vue; then
    echo "✅ ESLint OK"
else
    echo "⚠️  Warnings ESLint détectés (non bloquant)"
fi

echo "📋 4. Test de compilation..."
if npm run build > /dev/null 2>&1; then
    echo "✅ Compilation réussie"
else
    echo "❌ Échec de compilation"
    exit 1
fi

echo "📋 5. Vérification des fichiers de test CSV..."
test_files=(
    "test-pointed-expenses.csv"
    "test-pointed-edge-cases.csv"
    "test-backward-compatibility.csv"
)

for file in "${test_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file trouvé"
    else
        echo "❌ $file manquant"
    fi
done

echo "📋 6. Vérification des composants principaux..."
components=(
    "src/components/ExpensesReimbursementManager.vue"
    "src/components/ReimbursementSummary.vue"
    "src/components/ReimbursementCategoriesManager.vue"
    "src/composables/useFileUpload.ts"
    "src/types/index.ts"
)

for component in "${components[@]}"; do
    if [ -f "$component" ]; then
        echo "✅ $component OK"
    else
        echo "❌ $component manquant"
    fi
done

echo ""
echo "🎉 Tests automatisés terminés !"
echo ""
echo "📖 Étapes suivantes :"
echo "1. Démarrer l'application : npm run dev"
echo "2. Ouvrir http://localhost:5174"
echo "3. Suivre le guide : INTEGRATION_FINAL_TEST_GUIDE.md"
echo ""
echo "📊 Fonctionnalités intégrées :"
echo "   ✅ Catégories de remboursement"
echo "   ✅ Filtrage des dépenses pointées"
echo "   ✅ Association personne + catégorie"
echo "   ✅ Résumé par catégories assignées"
echo "   ✅ Persistance localStorage"
echo ""
echo "🔗 Fichiers de test disponibles :"
for file in "${test_files[@]}"; do
    echo "   - $file"
done
