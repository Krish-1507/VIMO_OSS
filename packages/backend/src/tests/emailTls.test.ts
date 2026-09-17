/**
 * Email TLS — certificates are verified unless the user explicitly opts out.
 *
 * Pitstop flagged `rejectUnauthorized: false` on both SMTP TLS paths: every
 * "secure" mail connection was silently MITM-able. The fix defaults to
 * verification with an explicit self-signed escape hatch. These tests pin
 * that contract: default-off, round-trip persistence, and a cert error that
 * names the toggle instead of dead-ending.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../index', () => ({ io: { emit: vi.fn() } }));

import {
  getEmailConfig,
  setEmailConfig,
  smtpTlsOptions,
  explainSmtpError,
} from '../services/emailService';

describe('email TLS verification', () => {
  it('defaults to verifying certificates', () => {
    setEmailConfig({ smtpAllowSelfSigned: false });
    expect(getEmailConfig().smtpAllowSelfSigned).toBe(false);
    expect(smtpTlsOptions(getEmailConfig())).toEqual({ rejectUnauthorized: true });
  });

  it('persists the self-signed opt-out and relaxes TLS only then', () => {
    setEmailConfig({ smtpAllowSelfSigned: true });
    expect(getEmailConfig().smtpAllowSelfSigned).toBe(true);
    expect(smtpTlsOptions(getEmailConfig())).toEqual({ rejectUnauthorized: false });
    setEmailConfig({ smtpAllowSelfSigned: false });
  });

  it('explains cert failures with the escape hatch', () => {
    const msg = explainSmtpError(new Error('self-signed certificate in chain'), false);
    expect(msg).toContain('self-signed certificate in chain');
    expect(msg).toContain('self-signed certificates');
  });

  it('passes errors through when already opted in or unrelated', () => {
    expect(explainSmtpError(new Error('self-signed certificate'), true)).toBe(
      'self-signed certificate',
    );
    expect(explainSmtpError(new Error('connect ECONNREFUSED 127.0.0.1:587'), false)).toBe(
      'connect ECONNREFUSED 127.0.0.1:587',
    );
  });
});
