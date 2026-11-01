import { supabase } from './supabase'

export async function getCurrentWorkspaceId() {
  const { data, error } = await supabase.rpc('finance_current_workspace_id')

  if (error) {
    throw new Error(`Unable to verify workspace: ${error.message}`)
  }

  if (typeof data !== 'string' || !data) {
    throw new Error('Unable to verify the current workspace.')
  }

  return data
}
