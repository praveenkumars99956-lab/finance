import { supabase } from './supabase'

export async function writeAuditLog({
  action,
  entityType,
  entityId = null,
  details = {}
}) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (userError) {
    console.warn('AUDIT USER ERROR:', userError)
    return
  }

  if (!user) return

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.warn('AUDIT PROFILE ERROR:', profileError)
    return
  }

  const { error } = await supabase
    .from('security_audit_logs')
    .insert({
      actor_user_id: user.id,
      actor_role: profile?.role || null,
      action,
      entity_type: entityType,
      entity_id: entityId === null ? null : String(entityId),
      details
    })

  if (error) console.warn('AUDIT WRITE ERROR:', error)
}
