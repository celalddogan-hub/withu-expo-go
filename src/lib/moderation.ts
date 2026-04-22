import { supabase } from './supabase';

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export type ModerationReportRow = {
  id: string;
  reporter_id: string | null;
  reported_user_id: string | null;
  source: string | null;
  reason: string | null;
  details: string | null;
  conversation_key: string | null;
  match_id: string | null;
  status: ReportStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

export async function isCurrentUserAdmin(): Promise<boolean> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return false;

  const { data, error } = await supabase
    .from('admins')
    .select('user_id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;

  return !!data;
}

export async function fetchModerationReports(): Promise<ModerationReportRow[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, reporter_id, reported_user_id, source, reason, details, conversation_key, match_id, status, admin_notes, reviewed_by, reviewed_at, created_at'
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as ModerationReportRow[];
}

export async function updateModerationReport(params: {
  reportId: string;
  status: ReportStatus;
  adminNotes?: string;
}): Promise<ModerationReportRow> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Du måste logga in.');

  const { data, error } = await supabase
    .from('reports')
    .update({
      status: params.status,
      admin_notes: params.adminNotes?.trim() || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.reportId)
    .select(
      'id, reporter_id, reported_user_id, source, reason, details, conversation_key, match_id, status, admin_notes, reviewed_by, reviewed_at, created_at'
    )
    .single();

  if (error) throw error;

  return data as ModerationReportRow;
}