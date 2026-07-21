// Public UI surface of the qr-codes slice: the print sheet is a client
// component, so it can't ride the server-only barrel (index.ts). Cross-slice
// consumers reach it through this sanctioned `ui/**` entry (menu rule #14).
export { QrPrintSheet } from '../qr-generation/qr-print-sheet'
