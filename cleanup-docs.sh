#!/bin/bash

# Script de nettoyage de la documentation
# Supprime les anciens fichiers markdown et garde uniquement la documentation consolidée

echo "🧹 Nettoyage de la documentation..."

# Dossier de sauvegarde pour les anciens fichiers
BACKUP_DIR="docs/archive-$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Liste des fichiers à archiver (tous les .md sauf ceux dans docs/ et les principaux)
FILES_TO_ARCHIVE=(
    "ACCOUNT_FILTERING_FEATURE_COMPLETED.md"
    "ACCOUNT_FILTERING_TEST_GUIDE.md"
    "ADVANCED_FILTERS_UX_IMPROVEMENT_COMPLETED.md"
    "AMOUNT_VALIDATION_FEATURE_COMPLETED.md"
    "ASSIGNMENT_HELPER_BUTTONS_COMPLETED.md"
    "CATEGORIES_INTEGRATION_COMPLETED.md"
    "CATEGORIES_INTEGRATION_TEST_GUIDE.md"
    "CATEGORY_FILTER_SYNC_COMPLETED.md"
    "CATEGORY_FILTERING_AUTOMATIC_HIDING_COMPLETED.md"
    "CATEGORY_FILTERING_IMPROVEMENT.md"
    "CATEGORY_SYNC_FINAL_COMPLETE.md"
    "CHART_HARMONIZATION_VALIDATION.md"
    "CHART_WIDTH_HARMONIZATION_COMPLETED.md"
    "COMPACT_PERSON_ASSIGNMENTS_COMPLETED.md"
    "COMPLETE_APPLICATION_SUMMARY.md"
    "COMPLETE_FEATURES_SUMMARY.md"
    "CORRECTION_COMPLETE_PDF_CARACTERES.md"
    "CORRECTION_ERREURS_PDF_COMPLETE.md"
    "CORRECTION_FINALE_COMPLETE.md"
    "CORRECTION_PDF_CARACTERES_FINALE.md"
    "CORRECTION_PDF_PAGINATION_ACCOMPLIE.md"
    "CORRECTION_SUPERPOSITION_PDF_RESUME.md"
    "CSV_UPDATE_SUMMARY.md"
    "DASHBOARD_STYLE_HARMONIZATION.md"
    "DEMO_TRANSACTION_DETAILS_GUIDE.md"
    "EMAIL_OPTIONAL_COMPLETED.md"
    "EMAIL_OPTIONAL_IMPLEMENTATION_FINAL.md"
    "EMAIL_OPTIONAL_TESTING.md"
    "FEATURE_COMPLETED.md"
    "FINAL_VALIDATION_MANUAL_TEST.md"
    "FUNCTIONAL_TESTING_PLAN.md"
    "GHOST_ASSIGNMENTS_CLEANUP_COMPLETED.md"
    "GHOST_ASSIGNMENTS_FINAL_FIX.md"
    "HISTOGRAM_IMPROVEMENTS_COMPLETED.md"
    "HISTOGRAM_IMPROVEMENTS.md"
    "INTEGRATION_FINAL_TEST_GUIDE.md"
    "INTEGRATION_TEST_RESULTS.md"
    "MANUAL_TESTING_GUIDE.md"
    "MISSION_ACCOMPLISHED.md"
    "MISSION_EXPORT_PDF_ACCOMPLIE.md"
    "MODAL_FORM_IMPLEMENTATION.md"
    "PAGINATION_FEATURE_COMPLETED.md"
    "PDF_PAGINATION_FIX_COMPLETE.md"
    "PERFORMANCE_AUDIT_REPORT.md"
    "PERSONS_MANAGER_COMPLETE.md"
    "PIE_CHART_AUTO_SCROLL_FEATURE.md"
    "PIE_CHART_DATA_FIX.md"
    "PIE_CHART_DOCUMENTATION.md"
    "PIE_CHART_FEATURE_COMPLETED.md"
    "PIECHART_BARCHART_WIDTH_HARMONIZATION.md"
    "PIECHART_BUG_RESOLUTION_FINAL.md"
    "POINTED_EXPENSES_FEATURE_COMPLETED.md"
    "POINTED_EXPENSES_TEST_GUIDE.md"
    "PROJECT_COMPLETION_SUMMARY.md"
    "PROJECT_FINAL_STATUS.md"
    "REAL_TIME_SYNC_SOLUTION_COMPLETE.md"
    "REAL_TIME_SYNC_TEST_GUIDE.md"
    "REIMBURSEMENT_MODULE_DOCUMENTATION.md"
    "REIMBURSEMENT_SUMMARY_REAL_DATA_COMPLETED.md"
    "REIMBURSEMENT_TRANSACTION_DETAILS_COMPLETED.md"
    "REIMBURSEMENT_TRANSACTION_DETAILS_TEST_GUIDE.md"
    "SYNCHRONIZATION_VALIDATION_COMPLETED.md"
    "TOOLTIP_POSITIONING_ISSUE_INVESTIGATION.md"
    "TRANSACTION_DETAILS_BUG_FIXED.md"
    "TRANSACTION_DETAILS_EXPANSION_FEATURE.md"
    "VALIDATION_FINALE_EXPORT_PDF_TRANSACTIONS.md"
    "VALIDATION-REPORT.md"
)

# Compter les fichiers
total_files=${#FILES_TO_ARCHIVE[@]}
moved_files=0

echo "📁 Archivage de $total_files fichiers..."

# Archiver chaque fichier s'il existe
for file in "${FILES_TO_ARCHIVE[@]}"; do
    if [ -f "$file" ]; then
        mv "$file" "$BACKUP_DIR/"
        echo "  ✅ $file → $BACKUP_DIR/"
        ((moved_files++))
    else
        echo "  ⚠️  $file (non trouvé)"
    fi
done

echo ""
echo "📊 Résumé du nettoyage:"
echo "  📁 Fichiers archivés: $moved_files"
echo "  📁 Dossier d'archive: $BACKUP_DIR"
echo ""
echo "📚 Documentation consolidée disponible dans ./docs/"
echo "  📖 Guide d'utilisation: docs/USER_GUIDE.md"
echo "  🏗️ Guide de développement: docs/DEVELOPER_GUIDE.md"
echo "  🧪 Guide de test: docs/TESTING_GUIDE.md"
echo "  🚀 Historique: docs/FEATURES_HISTORY.md"
echo "  🔧 Notes techniques: docs/TECHNICAL_NOTES.md"
echo ""
echo "✅ Nettoyage terminé!"
