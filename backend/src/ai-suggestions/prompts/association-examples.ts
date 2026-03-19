/**
 * Exemples d'associations typiques entre catégories de dépenses et remboursements.
 * Utilisés pour le few-shot prompting avec LangChain.
 */
export const ASSOCIATION_EXAMPLES = [
  {
    expense: 'Frais médicaux',
    income: 'Remboursement Sécurité Sociale',
    reasoning: "Les frais médicaux sont remboursés par l'assurance maladie",
  },
  {
    expense: 'Pharmacie',
    income: 'Remboursement Sécurité Sociale',
    reasoning: 'Les médicaments sont partiellement remboursés par la Sécu',
  },
  {
    expense: 'Transport professionnel',
    income: 'Indemnités kilométriques',
    reasoning: "Les déplacements pro sont remboursés par l'employeur",
  },
  {
    expense: 'Frais de repas professionnels',
    income: 'Notes de frais',
    reasoning: "Les repas d'affaires sont remboursés sur note de frais",
  },
  {
    expense: 'Mutuelle santé',
    income: 'Remboursement mutuelle',
    reasoning:
      'Les soins non couverts par la Sécu sont remboursés par la mutuelle',
  },
  {
    expense: 'Formation professionnelle',
    income: 'Prise en charge formation',
    reasoning: "Les formations peuvent être financées par l'employeur ou OPCO",
  },
  {
    expense: 'Frais dentaires',
    income: 'Remboursement mutuelle',
    reasoning:
      'Les soins dentaires sont principalement remboursés par la mutuelle',
  },
  {
    expense: 'Lunettes et optique',
    income: 'Remboursement mutuelle',
    reasoning:
      "L'optique est remboursée par la mutuelle avec un forfait annuel",
  },
  {
    expense: 'Frais de télétravail',
    income: 'Allocation télétravail',
    reasoning:
      "Les frais de télétravail peuvent être compensés par l'employeur",
  },
  {
    expense: 'Frais de garde',
    income: 'Aide CAF',
    reasoning:
      'Les frais de garde peuvent être partiellement compensés par la CAF',
  },
]
