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

export class ShapeValidationError extends CliError {
  public constructor(message: string) {
    super("shape", message);
    this.name = "ShapeValidationError";
  }
}

export class FileIoError extends CliError {
  public constructor(message: string) {
    super("io", message);
    this.name = "FileIoError";
  }
}

export class InternalGenerationError extends CliError {
  public constructor(message: string) {
    super("internal", message);
    this.name = "InternalGenerationError";
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  if (isErrnoException(error)) {
    return new FileIoError(error.message);
  }

  if (error instanceof Error) {
    return new InternalGenerationError(error.message);
  }

  return new InternalGenerationError("Unknown internal error.");
}

export function exitCodeForCategory(category: ErrorCategory): number {
  switch (category) {
    case "input":
      return 2;
    case "shape":
      return 3;
    case "io":
      return 4;
    case "internal":
      return 5;
    default:
      return 5;
  }
}
