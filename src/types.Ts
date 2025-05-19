export type CsvRow = {
  Montant: string;
  Date: string;
  Description: string;
  Compte: string;
  'Catégorie': string;
  'Sous-Catégorie': string;
  Note: string;
  Pointée: string;
  [key: string]: string | number;
}