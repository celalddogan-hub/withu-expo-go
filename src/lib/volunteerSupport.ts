import { supabase } from './supabase';

export type VolunteerSupportRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled';

export type VolunteerAvailabilityRow = {
  id: string;
  volunteer_user_id: string;
  status: string | null;
  title: string | null;
  message: string | null;
  active_from: string | null;
  active_until: string | null;
  max_pending_requests: number | null;
  created_at?: string | null;
};

export type VolunteerProfileRow = {
  id: string;
  user_id: string;
  role_sv: string | null;
  role_en?: string | null;
  role_ru?: string | null;
  bio_sv?: string | null;
  bio_en?: string | null;
  bio_ru?: string | null;
};

export type BasicProfileRow = {
  id: string;
  name: string | null;
  city: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
};

export type ActiveVolunteerNowRow = {
  availability_id: string;
  volunteer_user_id: string;
  status: string | null;
  title: string | null;
  message: string | null;
  active_from: string | null;
  active_until: string | null;
  max_pending_requests: number;
  pending_requests: number;
  name: string | null;
  city: string | null;
  avatar_emoji: string | null;
  is_bankid_verified: boolean | null;
  role_sv: string | null;
};

export type VolunteerSupportRequestRow = {
  id: string;
  availability_id: string;
  volunteer_user_id: string;
  requester_user_id: string;
  intro_message: string | null;
  status: VolunteerSupportRequestStatus;
  conversation_key: string | null;
  created_at: string;
  updated_at: string | null;
};

export type IncomingVolunteerSupportRequest = {
  id: string;
  availability_id: string;
  volunteer_user_id: string;
  requester_user_id: string;
  intro_message: string | null;
  status: VolunteerSupportRequestStatus;
  conversation_key: string | null;
  created_at: string;
  updated_at: string | null;
  requester_name: string | null;
  requester_city: string | null;
  requester_avatar_emoji: string | null;
  requester_bankid_verified: boolean | null;
};

export type MyVolunteerStatus = {
  isApprovedVolunteer: boolean;
  roleSv: string | null;
  activeAvailability: VolunteerAvailabilityRow | null;
  pendingRequests: number;
  acceptedOpenRequests: number;
};

export function makeConversationKey(a: string, b: string) {
  return [a, b].sort().join('__');
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export async function refreshExpiredMyAvailability(userId: string) {
  if (!userId) return;

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('volunteer_availability')
    .update({ status: 'ended' })
    .eq('volunteer_user_id', userId)
    .eq('status', 'active')
    .lt('active_until', nowIso);

  if (error) throw error;
}

export async function listActiveVolunteers(): Promise<ActiveVolunteerNowRow[]> {
  const nowIso = new Date().toISOString();

  const { data: availabilityData, error: availabilityError } = await supabase
    .from('volunteer_availability')
    .select(
      'id, volunteer_user_id, status, title, message, active_from, active_until, max_pending_requests, created_at'
    )
    .eq('status', 'active')
    .gt('active_until', nowIso)
    .order('created_at', { ascending: false });

  if (availabilityError) throw availabilityError;

  const availabilityRows = (availabilityData ?? []) as VolunteerAvailabilityRow[];

  if (availabilityRows.length === 0) {
    return [];
  }

  const volunteerUserIds = [...new Set(availabilityRows.map((row) => row.volunteer_user_id))];
  const availabilityIds = availabilityRows.map((row) => row.id);

  const [
    { data: volunteerProfilesData, error: volunteerProfilesError },
    { data: profilesData, error: profilesError },
    { data: pendingData, error: pendingError },
  ] = await Promise.all([
    supabase
      .from('volunteer_profiles')
      .select('id, user_id, role_sv, role_en, role_ru, bio_sv, bio_en, bio_ru')
      .in('user_id', volunteerUserIds),
    supabase
      .from('profiles')
      .select('id, name, city, avatar_emoji, is_bankid_verified')
      .in('id', volunteerUserIds),
    supabase
      .from('volunteer_support_requests')
      .select('id, availability_id, status')
      .in('availability_id', availabilityIds)
      .eq('status', 'pending'),
  ]);

  if (volunteerProfilesError) throw volunteerProfilesError;
  if (profilesError) throw profilesError;
  if (pendingError) throw pendingError;

  const volunteerProfileMap = new Map<string, VolunteerProfileRow>();
  ((volunteerProfilesData ?? []) as VolunteerProfileRow[]).forEach((row) => {
    volunteerProfileMap.set(row.user_id, row);
  });

  const profileMap = new Map<string, BasicProfileRow>();
  ((profilesData ?? []) as BasicProfileRow[]).forEach((row) => {
    profileMap.set(row.id, row);
  });

  const pendingCountMap = new Map<string, number>();
  ((pendingData ?? []) as Array<{ id: string; availability_id: string; status: string }>).forEach(
    (row) => {
      pendingCountMap.set(
        row.availability_id,
        (pendingCountMap.get(row.availability_id) ?? 0) + 1
      );
    }
  );

  return availabilityRows
    .filter((availability) => volunteerProfileMap.has(availability.volunteer_user_id))
    .map((availability) => {
      const volunteerProfile = volunteerProfileMap.get(availability.volunteer_user_id) ?? null;
      const profile = profileMap.get(availability.volunteer_user_id) ?? null;

      return {
        availability_id: availability.id,
        volunteer_user_id: availability.volunteer_user_id,
        status: availability.status,
        title: availability.title,
        message: availability.message,
        active_from: availability.active_from,
        active_until: availability.active_until,
        max_pending_requests: availability.max_pending_requests ?? 5,
        pending_requests: pendingCountMap.get(availability.id) ?? 0,
        name: profile?.name ?? null,
        city: profile?.city ?? null,
        avatar_emoji: profile?.avatar_emoji ?? null,
        is_bankid_verified: profile?.is_bankid_verified ?? null,
        role_sv: volunteerProfile?.role_sv ?? 'Volontär',
      };
    });
}

export async function getMyVolunteerRequests(
  requesterUserId: string
): Promise<VolunteerSupportRequestRow[]> {
  if (!requesterUserId) return [];

  const { data, error } = await supabase
    .from('volunteer_support_requests')
    .select(
      'id, availability_id, volunteer_user_id, requester_user_id, intro_message, status, conversation_key, created_at, updated_at'
    )
    .eq('requester_user_id', requesterUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as VolunteerSupportRequestRow[];
}

export async function sendVolunteerSupportRequest({
  availabilityId,
  volunteerUserId,
  requesterUserId,
  introMessage,
}: {
  availabilityId: string;
  volunteerUserId: string;
  requesterUserId: string;
  introMessage: string;
}) {
  const trimmed = introMessage.trim();

  if (!availabilityId || !volunteerUserId || !requesterUserId) {
    throw new Error('Saknar uppgifter för att skicka hjälpfrågan.');
  }

  if (volunteerUserId === requesterUserId) {
    throw new Error('Du kan inte skicka en hjälpfråga till dig själv.');
  }

  if (trimmed.length < 3) {
    throw new Error('Skriv lite mer innan du skickar.');
  }

  const { data: existingData, error: existingError } = await supabase
    .from('volunteer_support_requests')
    .select(
      'id, availability_id, volunteer_user_id, requester_user_id, intro_message, status, conversation_key, created_at, updated_at'
    )
    .eq('availability_id', availabilityId)
    .eq('volunteer_user_id', volunteerUserId)
    .eq('requester_user_id', requesterUserId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  const existing = ((existingData ?? []) as VolunteerSupportRequestRow[])[0];
  if (existing?.status === 'pending') {
    throw new Error('Du har redan en väntande hjälpfråga till den här volontären.');
  }
  if (existing?.status === 'accepted') {
    throw new Error('Den här volontären har redan godkänt din förfrågan.');
  }

  const { data: availabilityData, error: availabilityError } = await supabase
    .from('volunteer_availability')
    .select('id, volunteer_user_id, status, active_until, max_pending_requests')
    .eq('id', availabilityId)
    .eq('volunteer_user_id', volunteerUserId)
    .eq('status', 'active')
    .maybeSingle();

  if (availabilityError) throw availabilityError;
  if (!availabilityData) {
    throw new Error('Volontären är inte tillgänglig längre.');
  }

  const activeUntil = availabilityData.active_until as string | null;
  if (activeUntil && new Date(activeUntil).getTime() <= Date.now()) {
    throw new Error('Volontären är inte tillgänglig längre.');
  }

  const { data: pendingCountData, error: pendingCountError } = await supabase
    .from('volunteer_support_requests')
    .select('id')
    .eq('availability_id', availabilityId)
    .eq('status', 'pending');

  if (pendingCountError) throw pendingCountError;

  const currentPending = pendingCountData?.length ?? 0;
  const maxPending = (availabilityData.max_pending_requests as number | null) ?? 5;

  if (currentPending >= maxPending) {
    throw new Error('Volontären har redan för många väntande frågor just nu.');
  }

  const { error } = await supabase.from('volunteer_support_requests').insert({
    availability_id: availabilityId,
    volunteer_user_id: volunteerUserId,
    requester_user_id: requesterUserId,
    intro_message: trimmed,
    status: 'pending',
  });

  if (error) throw error;
}

export async function getMyVolunteerStatus(userId: string): Promise<MyVolunteerStatus> {
  if (!userId) {
    return {
      isApprovedVolunteer: false,
      roleSv: null,
      activeAvailability: null,
      pendingRequests: 0,
      acceptedOpenRequests: 0,
    };
  }

  const nowIso = new Date().toISOString();

  const { data: volunteerProfileData, error: volunteerProfileError } = await supabase
    .from('volunteer_profiles')
    .select('id, user_id, role_sv, role_en, role_ru, bio_sv, bio_en, bio_ru')
    .eq('user_id', userId)
    .maybeSingle();

  if (volunteerProfileError) throw volunteerProfileError;

  const volunteerProfile = volunteerProfileData as VolunteerProfileRow | null;

  if (!volunteerProfile) {
    return {
      isApprovedVolunteer: false,
      roleSv: null,
      activeAvailability: null,
      pendingRequests: 0,
      acceptedOpenRequests: 0,
    };
  }

  const { data: activeAvailabilityData, error: activeAvailabilityError } = await supabase
    .from('volunteer_availability')
    .select(
      'id, volunteer_user_id, status, title, message, active_from, active_until, max_pending_requests, created_at'
    )
    .eq('volunteer_user_id', userId)
    .eq('status', 'active')
    .gt('active_until', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeAvailabilityError) throw activeAvailabilityError;

  const activeAvailability = (activeAvailabilityData ?? null) as VolunteerAvailabilityRow | null;

  if (!activeAvailability) {
    return {
      isApprovedVolunteer: true,
      roleSv: volunteerProfile.role_sv ?? 'Volontär',
      activeAvailability: null,
      pendingRequests: 0,
      acceptedOpenRequests: 0,
    };
  }

  const { data: requestData, error: requestError } = await supabase
    .from('volunteer_support_requests')
    .select('id, status')
    .eq('availability_id', activeAvailability.id);

  if (requestError) throw requestError;

  const rows = (requestData ?? []) as Array<{ id: string; status: VolunteerSupportRequestStatus }>;

  return {
    isApprovedVolunteer: true,
    roleSv: volunteerProfile.role_sv ?? 'Volontär',
    activeAvailability,
    pendingRequests: rows.filter((row) => row.status === 'pending').length,
    acceptedOpenRequests: rows.filter((row) => row.status === 'accepted').length,
  };
}

export async function listIncomingVolunteerRequests(
  volunteerUserId: string
): Promise<IncomingVolunteerSupportRequest[]> {
  if (!volunteerUserId) return [];

  const { data: requestData, error: requestError } = await supabase
    .from('volunteer_support_requests')
    .select(
      'id, availability_id, volunteer_user_id, requester_user_id, intro_message, status, conversation_key, created_at, updated_at'
    )
    .eq('volunteer_user_id', volunteerUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (requestError) throw requestError;

  const requests = (requestData ?? []) as VolunteerSupportRequestRow[];

  if (requests.length === 0) return [];

  const requesterIds = [...new Set(requests.map((row) => row.requester_user_id))];

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, city, avatar_emoji, is_bankid_verified')
    .in('id', requesterIds);

  if (profileError) throw profileError;

  const profileMap = new Map<string, BasicProfileRow>();
  ((profileData ?? []) as BasicProfileRow[]).forEach((row) => {
    profileMap.set(row.id, row);
  });

  return requests.map((request) => {
    const requester = profileMap.get(request.requester_user_id) ?? null;

    return {
      ...request,
      requester_name: requester?.name ?? null,
      requester_city: requester?.city ?? null,
      requester_avatar_emoji: requester?.avatar_emoji ?? null,
      requester_bankid_verified: requester?.is_bankid_verified ?? null,
    };
  });
}

export async function setVolunteerActiveNow({
  userId,
  minutes,
  title,
  message,
  maxPendingRequests,
}: {
  userId: string;
  minutes: number;
  title: string;
  message: string;
  maxPendingRequests: number;
}) {
  const trimmedTitle = title.trim();
  const trimmedMessage = message.trim();

  if (!userId) throw new Error('Saknar användare.');
  if (!trimmedTitle) throw new Error('Rubrik saknas.');
  if (!trimmedMessage) throw new Error('Text saknas.');

  const { data: volunteerProfileData, error: volunteerProfileError } = await supabase
    .from('volunteer_profiles')
    .select('id, user_id, role_sv')
    .eq('user_id', userId)
    .maybeSingle();

  if (volunteerProfileError) throw volunteerProfileError;
  if (!volunteerProfileData) {
    throw new Error('Du är inte godkänd som volontär.');
  }

  await endMyVolunteerAvailability(userId);

  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('volunteer_availability').insert({
    volunteer_user_id: userId,
    status: 'active',
    title: trimmedTitle,
    message: trimmedMessage,
    active_from: nowIso,
    active_until: addMinutesIso(minutes),
    max_pending_requests: maxPendingRequests,
  });

  if (error) throw error;
}

export async function endMyVolunteerAvailability(userId: string) {
  if (!userId) return;

  const { error } = await supabase
    .from('volunteer_availability')
    .update({ status: 'ended' })
    .eq('volunteer_user_id', userId)
    .eq('status', 'active');

  if (error) throw error;
}

export async function acceptVolunteerSupportRequest({
  requestId,
  volunteerUserId,
}: {
  requestId: string;
  volunteerUserId: string;
}): Promise<{ conversationKey: string; requesterUserId: string }> {
  if (!requestId || !volunteerUserId) {
    throw new Error('Saknar uppgifter för att acceptera frågan.');
  }

  const { data: requestData, error: requestError } = await supabase
    .from('volunteer_support_requests')
    .select(
      'id, availability_id, volunteer_user_id, requester_user_id, intro_message, status, conversation_key, created_at, updated_at'
    )
    .eq('id', requestId)
    .eq('volunteer_user_id', volunteerUserId)
    .maybeSingle();

  if (requestError) throw requestError;

  const request = requestData as VolunteerSupportRequestRow | null;
  if (!request) throw new Error('Kunde inte hitta hjälpfrågan.');

  const conversationKey =
    request.conversation_key ||
    makeConversationKey(request.requester_user_id, request.volunteer_user_id);

  const { error } = await supabase
    .from('volunteer_support_requests')
    .update({
      status: 'accepted',
      conversation_key: conversationKey,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('volunteer_user_id', volunteerUserId);

  if (error) throw error;

  return {
    conversationKey,
    requesterUserId: request.requester_user_id,
  };
}

export async function declineVolunteerSupportRequest({
  requestId,
  volunteerUserId,
}: {
  requestId: string;
  volunteerUserId: string;
}) {
  if (!requestId || !volunteerUserId) {
    throw new Error('Saknar uppgifter för att neka frågan.');
  }

  const { error } = await supabase
    .from('volunteer_support_requests')
    .update({
      status: 'declined',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('volunteer_user_id', volunteerUserId);

  if (error) throw error;
}

export async function hasAcceptedVolunteerConversationAccess(
  currentUserId: string,
  otherUserId: string
): Promise<boolean> {
  if (!currentUserId || !otherUserId) return false;

  const pairFilter = `and(volunteer_user_id.eq.${currentUserId},requester_user_id.eq.${otherUserId}),and(volunteer_user_id.eq.${otherUserId},requester_user_id.eq.${currentUserId})`;

  const { data, error } = await supabase
    .from('volunteer_support_requests')
    .select('id')
    .eq('status', 'accepted')
    .or(pairFilter)
    .limit(1);

  if (error) throw error;

  return (data?.length ?? 0) > 0;
}