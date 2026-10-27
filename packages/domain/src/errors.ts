export type DomainErrorCode =
  'invalid_date_range' | 'invalid_party' | 'over_capacity' | 'not_found' | 'conflict';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
