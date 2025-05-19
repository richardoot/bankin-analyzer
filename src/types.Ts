export type CsvRow = {
  Montant: string;
  Date: string;
  Description: string;
  Compte: string;
  'Catégorie': string;
  'Sous-Categorie': string;
  Note: string;
  Pointée: string;
  [key: string]: string | number;
}