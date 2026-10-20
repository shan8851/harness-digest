// Sends an email through Resend's HTTP API. One request, no SDK needed.
//
// Recipients come from DIGEST_EMAIL_TO (comma-separated) so no addresses live
// in the repo. Without a verified domain, Resend only delivers from its
// onboarding address to the account owner, which is fine for now.

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "harness-digest <onboarding@resend.dev>";

export function recipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.DIGEST_EMAIL_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export async function sendEmail(message: { subject: string; html: string; text: string }): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = recipients();
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (to.length === 0) throw new Error("DIGEST_EMAIL_TO is not set");

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.DIGEST_EMAIL_FROM ?? DEFAULT_FROM, to, ...message }),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}: ${body.message ?? "no message"}`);
  return body.id ?? "unknown";
}
