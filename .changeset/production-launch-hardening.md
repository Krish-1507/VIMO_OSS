---
"@vimo-oss/cli": patch
"vimo": minor
---

Production launch path + installer hardening.

- Single-port production mode: the backend serves the built frontend (same origin), so `npm run build:app` + `npm run start:app` (and the launcher) need only one process and one port.
- CLI renamed to `@vimo-oss/cli` (the `vimo` npm name belongs to an unrelated package); installs now provide both `vimo` and `VIMO` commands; downloads a tarball instead of requiring git; probes free ports; `--update`, `--doctor` flags.
- Scheduler: restart no longer publishes future-dated posts early (rescue query filters by time, plus a not-due guard in processPost).
- Auth: `/api/auth/setup` can no longer overwrite an existing PIN unauthenticated; reset codes are returned inline only to loopback requests; server binds to `127.0.0.1` unless `HOST` is set.
- First run: the system check sends new users to the PIN setup screen instead of silently generating a PIN they never see.
- Frontend: all API calls go through the shared client (session + CSRF headers everywhere); automatic session renewal with transparent retry on 401; demo mode immune to login redirects.
