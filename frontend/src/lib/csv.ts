/**
 * Reading delimited text the way the format actually works.
 *
 * ## Why this exists
 *
 * The import used to split the file on newlines and parse each line on its
 * own. That is correct right up until a field contains a newline of its own —
 * a note written on two lines, say — at which point one record becomes two
 * fragments, both short of a full row, and both silently dropped. A real
 * export did exactly that and lost a transaction without a word.
 *
 * A newline inside quotes is data, not a record boundary. The only way to know
 * which one it is, is to walk the text once and keep track of whether the
 * quotes are open — which is what this does.
 *
 * Also handles what the previous line-based parser already did: doubled quotes
 * (`""`) as a literal quote, and CRLF endings.
 */

export interface CsvRecord {
  /** The fields of one record, quotes removed. */
  fields: string[]
  /** 1-based line the record starts on, for reporting a bad row. */
  line: number
}

/**
 * Split delimited text into records, honouring quoted fields.
 *
 * Trailing empty records are dropped, so a file ending with a newline does not
 * produce a phantom row.
 */
export function parseCsvRecords(text: string, delimiter = ';'): CsvRecord[] {
  const records: CsvRecord[] = []

  let fields: string[] = []
  let current = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let started = false

  const endField = (): void => {
    fields.push(current)
    current = ''
  }

  const endRecord = (): void => {
    endField()
    // A record of one empty field is a blank line, not a row.
    if (!(fields.length === 1 && fields[0] === '')) {
      records.push({ fields, line: recordLine })
    }
    fields = []
    started = false
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      started = true
      continue
    }

    if (!inQuotes && char === delimiter) {
      endField()
      started = true
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      // Swallow the LF of a CRLF pair rather than counting a second line.
      if (char === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
      continue
    }

    if (!started) {
      started = true
      recordLine = line
    }
    // Inside quotes a newline is part of the field; the line counter still
    // has to follow it so later records report where they really start.
    if (inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++
      current += '\n'
      line++
      continue
    }
    current += char
  }

  // Whatever is left when the text runs out is a final record, unless the file
  // ended on a clean newline.
  if (started || current !== '' || fields.length > 0) {
    endRecord()
  }

  return records
}
