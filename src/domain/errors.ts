export type ErrorCategory = "input" | "shape" | "io" | "internal";

export class CliError extends Error {
  public readonly category: ErrorCategory;

  public constructor(category: ErrorCategory, message: string) {
    super(message);
    this.category = category;
    this.name = "CliError";
  }
}

export class InputValidationError extends CliError {
  public constructor(message: string) {
    super("input", message);
    this.name = "InputValidationError";
  }
}
