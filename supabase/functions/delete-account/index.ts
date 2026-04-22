import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type AdminClient = ReturnType<typeof createClient>

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function runDelete(
  label: string,
  action: () => Promise<{ error: any }>
) {
  const { error } = await action()

  if (!error) return

  const message = String(error?.message ?? error)

  if (
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('schema cache') ||
    message.includes('Could not find')
  ) {
    console.log(`Skipping ${label}: ${message}`)
    return
  }

  throw new Error(`${label}: ${message}`)
}

async function safeList(
  adminClient: AdminClient,
  bucket: string,
  path: string
) {
  const { data, error } = await adminClient.storage.from(bucket).list(path, {
    limit: 100,
    offset: 0,
  })

  if (error) {
    const message = String(error?.message ?? error)
    if (
      message.includes('not found') ||
      message.includes('does not exist') ||
      message.includes('Bucket not found')
    ) {
      console.log(`Skipping list ${bucket}/${path}: ${message}`)
      return []
    }

    throw new Error(`storage list ${bucket}/${path}: ${message}`)
  }

  return data ?? []
}

async function deleteStoragePrefix(
  adminClient: AdminClient,
  bucket: string,
  prefix: string
) {
  try {
    const entries = await safeList(adminClient, bucket, prefix)
    if (!entries.length) return

    const files: string[] = []
    const folders: string[] = []

    for (const entry of entries) {
      const name = entry?.name
      if (!name) continue

      if (entry?.id) {
        files.push(`${prefix}/${name}`)
      } else {
        folders.push(`${prefix}/${name}`)
      }
    }

    if (files.length > 0) {
      const { error } = await adminClient.storage.from(bucket).remove(files)
      if (error) {
        throw new Error(`storage remove ${bucket}: ${String(error?.message ?? error)}`)
      }
    }

    for (const folder of folders) {
      await deleteStoragePrefix(adminClient, bucket, folder)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('Bucket not found') ||
      message.includes('not found') ||
      message.includes('does not exist')
    ) {
      console.log(`Skipping storage prefix ${bucket}/${prefix}: ${message}`)
      return
    }
    throw error
  }
}

async function deleteStoragePaths(
  adminClient: AdminClient,
  bucket: string,
  inputPaths: Array<string | null | undefined>
) {
  const paths = [...new Set(inputPaths.filter(Boolean) as string[])]
  if (paths.length === 0) return

  const { error } = await adminClient.storage.from(bucket).remove(paths)
  if (error) {
    const message = String(error?.message ?? error)
    if (
      message.includes('Bucket not found') ||
      message.includes('not found') ||
      message.includes('does not exist')
    ) {
      console.log(`Skipping storage remove ${bucket}: ${message}`)
      return
    }
    throw new Error(`storage remove ${bucket}: ${message}`)
  }
}

function extractProfileImagePathFromUrl(avatarUrl?: string | null) {
  if (!avatarUrl) return null

  const marker = '/storage/v1/object/public/profile-images/'
  const index = avatarUrl.indexOf(marker)
  if (index === -1) return null

  return avatarUrl.slice(index + marker.length)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse(401, { error: 'Missing authorization header' })
    }

    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return jsonResponse(401, { error: 'Missing bearer token' })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse(401, { error: userError?.message || 'Unauthorized' })
    }

    const body = await req.json().catch(() => ({}))
    const confirmText = String(body?.confirmText ?? '').trim().toUpperCase()

    if (confirmText !== 'TA BORT') {
      return jsonResponse(400, { error: 'Confirmation text invalid' })
    }

    const userId = user.id
    console.log(`Starting delete-account for user ${userId}`)

    // Hämta först paths till media innan rows raderas
    const [{ data: profileRow }, { data: messageRows }] = await Promise.all([
      adminClient
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .maybeSingle(),
      adminClient
        .from('messages')
        .select('image_path, audio_path')
        .eq('sender_id', userId),
    ])

    const avatarPath = extractProfileImagePathFromUrl(
      (profileRow as { avatar_url?: string | null } | null)?.avatar_url ?? null
    )

    const imagePaths =
      ((messageRows ?? []) as Array<{ image_path?: string | null }>).map(
        (row) => row.image_path ?? null
      ) ?? []

    const audioPaths =
      ((messageRows ?? []) as Array<{ audio_path?: string | null }>).map(
        (row) => row.audio_path ?? null
      ) ?? []

    // Storage cleanup
    if (avatarPath) {
      await deleteStoragePaths(adminClient, 'profile-images', [avatarPath])
    } else {
      await deleteStoragePrefix(adminClient, 'profile-images', userId)
    }

    await deleteStoragePaths(adminClient, 'chat-images', imagePaths)
    await deleteStoragePaths(adminClient, 'voice-messages', audioPaths)

    // Appdata cleanup
    await runDelete('thought_reactions', () =>
      adminClient.from('thought_reactions').delete().eq('user_id', userId)
    )

    await runDelete('thought_comments', () =>
      adminClient.from('thought_comments').delete().eq('user_id', userId)
    )

    await runDelete('thought_talk_requests', () =>
      adminClient
        .from('thought_talk_requests')
        .delete()
        .or(`requester_id.eq.${userId},owner_id.eq.${userId}`)
    )

    await runDelete('thoughts', () =>
      adminClient.from('thoughts').delete().eq('user_id', userId)
    )

    await runDelete('hidden_conversations', () =>
      adminClient.from('hidden_conversations').delete().eq('user_id', userId)
    )

    await runDelete('blocked_users', () =>
      adminClient
        .from('blocked_users')
        .delete()
        .or(`blockerad_av.eq.${userId},blockerad.eq.${userId}`)
    )

    await runDelete('matches', () =>
      adminClient
        .from('matches')
        .delete()
        .or(`user_id.eq.${userId},target_id.eq.${userId}`)
    )

    await runDelete('messages', () =>
      adminClient.from('messages').delete().eq('sender_id', userId)
    )

    await runDelete('push_tokens', () =>
      adminClient.from('push_tokens').delete().eq('user_id', userId)
    )

    await runDelete('volunteer_support_requests', () =>
      adminClient
        .from('volunteer_support_requests')
        .delete()
        .or(`requester_user_id.eq.${userId},volunteer_user_id.eq.${userId}`)
    )

    await runDelete('volunteer_availability', () =>
      adminClient.from('volunteer_availability').delete().eq('volunteer_user_id', userId)
    )

    await runDelete('volunteer_profiles', () =>
      adminClient.from('volunteer_profiles').delete().eq('user_id', userId)
    )

    await runDelete('volunteer_applications', () =>
      adminClient.from('volunteer_applications').delete().eq('user_id', userId)
    )

    await runDelete('admins', () =>
      adminClient.from('admins').delete().eq('user_id', userId)
    )

    await runDelete('profiles', () =>
      adminClient.from('profiles').delete().eq('id', userId)
    )

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      throw new Error(`auth.admin.deleteUser: ${deleteUserError.message}`)
    }

    console.log(`Finished delete-account for user ${userId}`)

    return jsonResponse(200, { success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('delete-account failed:', message)
    return jsonResponse(500, { error: message })
  }
})