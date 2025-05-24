/**
 * Types principaux pour l'analyseur financier Bankin
 */

export interface CsvFile {
  file: File
  name: string
  size: number
  lastModified: number
}

export interface UploadState {
  isUploading: boolean
  isSuccess: boolean
  error: string | null
}

export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
  account: string
}
