import { ERROR_MESSAGE_KEYS, type ServerErrorCode } from "@/server/action-result";

// What the upload route answers (build plan 0.12): the file's id, or a refusal with a code and a
// plain-words message key (11-screens-and-ux.md, smooth feel 4). Types and constants only, so the
// browser helper may import this file.

/** The refusals of the upload itself, besides the wrapper's. */
export const UPLOAD_ERROR_CODES = ["too_large", "not_an_allowed_type", "not_an_image"] as const;
export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

export type UploadFailureCode = UploadErrorCode | ServerErrorCode | "network";

export const UPLOAD_MESSAGE_KEYS = {
  ...ERROR_MESSAGE_KEYS,
  too_large: "errors.file.tooLarge",
  not_an_allowed_type: "errors.file.notAllowedType",
  not_an_image: "errors.file.notAnImage",
} as const satisfies Record<UploadFailureCode, string>;

export type UploadResult =
  | { ok: true; data: { id: string } }
  | {
      ok: false;
      error: {
        code: UploadFailureCode;
        messageKey: (typeof UPLOAD_MESSAGE_KEYS)[UploadFailureCode];
      };
    };

/** The HTTP status of each answer. */
export const UPLOAD_STATUS = {
  invalid_input: 400,
  signed_out: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale_version: 409,
  wrong_status: 409,
  too_large: 413,
  not_an_allowed_type: 415,
  not_an_image: 422,
  unexpected: 500,
  network: 0,
} as const satisfies Record<UploadFailureCode, number>;

export function uploadFailure(code: UploadFailureCode): UploadResult {
  return { ok: false, error: { code, messageKey: UPLOAD_MESSAGE_KEYS[code] } };
}
