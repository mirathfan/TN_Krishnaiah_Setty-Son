const ADMIN_ALLOWLIST_TABLE = 'admin_users';

/**
 * Verify the current Supabase Auth token with the Auth server, then require a
 * matching row in the server-managed admin_users allowlist. The database RLS
 * policy only lets a user read their own membership row and never lets browser
 * clients modify the allowlist.
 */
export async function getAuthorizedAdminUser(client) {
  if (!client) return null;

  const {
    data: { user } = {},
    error: userError,
  } = await client.auth.getUser();

  if (userError) {
    const errorName = String(userError.name || '');
    const errorMessage = String(userError.message || '').toLowerCase();

    if (errorName === 'AuthSessionMissingError' || errorMessage.includes('session missing')) {
      return null;
    }

    throw userError;
  }
  if (!user?.id) return null;

  const { data: membership, error: membershipError } = await client
    .from(ADMIN_ALLOWLIST_TABLE)
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  return membership?.user_id === user.id ? user : null;
}

export { ADMIN_ALLOWLIST_TABLE };
