---
"@vimo/backend": patch
---

Verify SMTP TLS certificates by default (pitstop audit fix).

- **Security**: both SMTP paths (implicit TLS + STARTTLS) now verify the mail
  server certificate. A new explicit `smtp_allow_self_signed` opt-out exists
  for private mail servers, surfaced as an honestly-labeled checkbox in
  Settings → Email, and cert failures name the toggle instead of dead-ending.
- **Tests**: new `emailTls.test.ts` pins default-on verification, the opt-out
  round-trip, and the error explanation.
