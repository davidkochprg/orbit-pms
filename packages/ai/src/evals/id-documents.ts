import type { IdDocumentReading } from '@orbit/shared';

export interface IdDocumentFixture {
  id: string;
  /** A JPEG in `id-documents/`, rendered from the SVG of the same name. */
  file: string;
  /** The fields that must be read exactly; `address` is not scored when absent here. */
  expected: Partial<IdDocumentReading> & Pick<IdDocumentReading, 'readable'>;
}

/**
 * Synthetic specimen documents, drawn for the eval (no real design is copied and every one says
 * SPECIMEN), photographed slightly askew on a desk.
 */
export const idDocumentFixtures: IdDocumentFixture[] = [
  {
    id: 'id-card-cz',
    file: 'id-card-cz.jpg',
    expected: {
      readable: true,
      documentType: 'id_card',
      fullName: 'Jana Ukázková',
      nationality: 'CZ',
      dateOfBirth: '1990-04-12',
      documentNumber: '219876543',
      expiresOn: '2032-09-03',
    },
  },
  {
    id: 'passport-de',
    file: 'passport-de.jpg',
    expected: {
      readable: true,
      documentType: 'passport',
      fullName: 'Erika Mustermann',
      nationality: 'DE',
      dateOfBirth: '1964-08-12',
      documentNumber: 'C01X00T47',
      expiresOn: '2031-10-31',
    },
  },
  { id: 'receipt', file: 'receipt.jpg', expected: { readable: false } },
];
