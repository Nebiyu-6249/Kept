/**
 * The one error shape (§8) and the helpers that produce it.
 *
 * Every route returns `{ error: { code, message, field? } }` on failure. A route
 * never returns a bare string and never leaks a stack trace to the client.
 */

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "AI_UNAVAILABLE"
  | "CONFLICT"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  AI_UNAVAILABLE: 503,
  CONFLICT: 409,
  INTERNAL: 500,
};

export type ApiError = { error: { code: ErrorCode; message: string; field?: string } };

export function fail(
  code: ErrorCode,
  message: string,
  field?: string,
  status?: number,
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: field ? { code, message, field } : { code, message } },
    { status: status ?? STATUS[code] },
  );
}

export function ok<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status });
}

/** Thrown by helpers so a route can `try`/`catch` into one error response. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export function toResponse(error: unknown): NextResponse<ApiError> {
  if (error instanceof ApiFailure) return fail(error.code, error.message, error.field);
  if (error instanceof ZodError) return zodFail(error);
  console.error("[api] unhandled", error);
  return fail("INTERNAL", "Something went wrong on our side. Try again.");
}

function zodFail(error: ZodError): NextResponse<ApiError> {
  const first = error.issues[0];
  const field = first?.path.join(".") || undefined;
  return fail("VALIDATION", first?.message ?? "That request was not valid.", field);
}

/**
 * Parse a request body against a schema. Unknown keys are rejected by the
 * schemas themselves (`z.strictObject`), so a typo in a client payload is a 400
 * rather than a silently ignored field.
 */
export async function parseBody<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<import("zod").infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("VALIDATION", "Send a JSON body.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiFailure(
      "VALIDATION",
      first?.message ?? "That request was not valid.",
      first?.path.join(".") || undefined,
    );
  }
  return result.data;
}

export function parseQuery<S extends ZodType>(
  url: string,
  schema: S,
): import("zod").infer<S> {
  const params = Object.fromEntries(new URL(url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiFailure(
      "VALIDATION",
      first?.message ?? "That query was not valid.",
      first?.path.join(".") || undefined,
    );
  }
  return result.data;
}
