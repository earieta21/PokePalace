const SUBMISSION_STORAGE_KEY = "pokePalacePendingOrderSubmissions";
const LEGACY_STORAGE_KEY = "pokePalacePendingOrderSubmission";

const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

const secureRandomHex = (byteLength) => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Tu navegador no puede crear una credencial segura. Actualízalo e intenta de nuevo.");
  }
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isValidSubmission = (submission, actor) => Boolean(
  submission?.actor === actor &&
  CLIENT_ID_PATTERN.test(submission.clientOrderId || "") &&
  TOKEN_PATTERN.test(submission.orderToken || "")
);

const readSubmissions = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUBMISSION_STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Replace malformed storage below.
  }

  // One-time migration from the original single slot. Keeping it under its
  // actor prevents login/logout in another tab from orphaning that attempt.
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
    if (legacy?.actor && isValidSubmission(legacy, legacy.actor)) {
      const migrated = { [legacy.actor]: legacy };
      localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }
  } catch {
    // Ignore malformed legacy data.
  }

  return {};
};

const writeSubmissions = (submissions) => {
  localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(submissions));
};

export const getOrCreateOrderSubmission = (actor) => {
  const submissions = readSubmissions();
  if (isValidSubmission(submissions[actor], actor)) return submissions[actor];

  const suffix = globalThis.crypto?.randomUUID?.() || secureRandomHex(16);
  const submission = {
    actor,
    clientOrderId: `web:${suffix}`,
    orderToken: secureRandomHex(32),
    createdAt: new Date().toISOString(),
  };
  submissions[actor] = submission;
  writeSubmissions(submissions);
  return submission;
};

export const keepOrderSubmissionPayload = (submission, payload) => {
  const submissions = readSubmissions();
  const current = submissions[submission.actor];

  // Another tab may already have frozen this actor's request. Reuse it instead
  // of replacing a request whose promo/points might already be reserved.
  if (isValidSubmission(current, submission.actor) && current.payload) return current;

  const durableSubmission = { ...submission, payload };
  submissions[submission.actor] = durableSubmission;
  writeSubmissions(submissions);
  return durableSubmission;
};

export const clearOrderSubmission = (actor, expectedClientOrderId) => {
  const submissions = readSubmissions();
  const current = submissions[actor];
  if (!current) return;

  // Do not let an older tab clear a newer attempt for the same account.
  if (expectedClientOrderId && current.clientOrderId !== expectedClientOrderId) return;
  delete submissions[actor];
  writeSubmissions(submissions);
};
