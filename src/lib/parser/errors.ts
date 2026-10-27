export type ParseErrorCode =
  | "unsupported"
  | "too_large"
  | "empty"
  | "zip_bomb"
  | "timeout"
  | "llm_failed";

export class ParseError extends Error {
  constructor(
    public code: ParseErrorCode,
    message: string,
  ) {
    super(message);
  }
}
