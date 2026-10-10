import { describe, expect, it, vi } from 'vitest';

import { getAuthorizedAdminUser } from '../src/services/adminAuthorization';

function createClient({ user = null, userError = null, membership = null, membershipError = null } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership, error: membershipError });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: userError }),
    },
    from,
    spies: { from, select, eq, maybeSingle },
  };
}

describe('Supabase administrator authorization', () => {
  it('returns the verified Auth user only when their UUID is allowlisted', async () => {
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test' };
    const client = createClient({ user, membership: { user_id: user.id } });

    await expect(getAuthorizedAdminUser(client)).resolves.toEqual(user);
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(client.spies.from).toHaveBeenCalledWith('admin_users');
    expect(client.spies.eq).toHaveBeenCalledWith('user_id', user.id);
  });

  it('rejects a valid authenticated user without an allowlist row', async () => {
    const user = { id: '22222222-2222-4222-8222-222222222222' };
    const client = createClient({ user, membership: null });

    await expect(getAuthorizedAdminUser(client)).resolves.toBeNull();
  });

  it('rejects requests without a verified Auth user before querying the allowlist', async () => {
    const client = createClient({ user: null });

    await expect(getAuthorizedAdminUser(client)).resolves.toBeNull();
    expect(client.spies.from).not.toHaveBeenCalled();
  });

  it('treats an absent Supabase session as signed out', async () => {
    const noSession = Object.assign(new Error('Auth session missing!'), {
      name: 'AuthSessionMissingError',
    });
    const client = createClient({ userError: noSession });

    await expect(getAuthorizedAdminUser(client)).resolves.toBeNull();
    expect(client.spies.from).not.toHaveBeenCalled();
  });

  it('fails closed when Auth or allowlist verification fails', async () => {
    const authFailure = new Error('invalid token');
    const authClient = createClient({ userError: authFailure });
    await expect(getAuthorizedAdminUser(authClient)).rejects.toBe(authFailure);

    const user = { id: '33333333-3333-4333-8333-333333333333' };
    const policyFailure = new Error('permission denied');
    const policyClient = createClient({ user, membershipError: policyFailure });
    await expect(getAuthorizedAdminUser(policyClient)).rejects.toBe(policyFailure);
  });
});
