import { File } from 'expo-file-system';
import { supabase } from './supabase';

export const CHAT_MEDIA_BUCKET = 'chat-media';

export type ChatMediaKind = 'image' | 'audio';

type UploadChatMediaInput = {
  conversationKey: string;
  senderId: string;
  uri: string;
  kind: ChatMediaKind;
  contentType?: string | null;
  fileName?: string | null;
};

function getExtensionFromName(name?: string | null) {
  if (!name) return null;
  const clean = name.split('?')[0];
  const parts = clean.split('.');
  if (parts.length < 2) return null;
  return parts[parts.length - 1]?.toLowerCase() || null;
}

function getExtensionFromUri(uri?: string | null) {
  if (!uri) return null;
  const clean = uri.split('?')[0];
  const parts = clean.split('.');
  if (parts.length < 2) return null;
  return parts[parts.length - 1]?.toLowerCase() || null;
}

function inferExtension(
  kind: ChatMediaKind,
  uri?: string | null,
  fileName?: string | null,
  contentType?: string | null
) {
  const fromName = getExtensionFromName(fileName);
  if (fromName) return fromName;

  const fromUri = getExtensionFromUri(uri);
  if (fromUri) return fromUri;

  const lowerMime = (contentType || '').toLowerCase();

  if (lowerMime.includes('png')) return 'png';
  if (lowerMime.includes('webp')) return 'webp';
  if (lowerMime.includes('heic')) return 'heic';
  if (lowerMime.includes('heif')) return 'heif';
  if (lowerMime.includes('jpeg') || lowerMime.includes('jpg')) return 'jpg';
  if (lowerMime.includes('mpeg') || lowerMime.includes('mp4') || lowerMime.includes('m4a'))
    return 'm4a';
  if (lowerMime.includes('aac')) return 'aac';
  if (lowerMime.includes('webm')) return 'webm';

  return kind === 'audio' ? 'm4a' : 'jpg';
}

function inferContentType(
  kind: ChatMediaKind,
  extension: string,
  provided?: string | null
) {
  if (provided && provided.trim()) return provided;

  const ext = extension.toLowerCase();

  if (kind === 'image') {
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'heic') return 'image/heic';
    if (ext === 'heif') return 'image/heif';
    return 'image/jpeg';
  }

  if (ext === 'aac') return 'audio/aac';
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'mp4') return 'audio/mp4';
  return 'audio/m4a';
}

export async function uploadChatMedia({
  conversationKey,
  senderId,
  uri,
  kind,
  contentType,
  fileName,
}: UploadChatMediaInput) {
  const extension = inferExtension(kind, uri, fileName, contentType);
  const finalContentType = inferContentType(kind, extension, contentType);

  const file = new File(uri);
  const body = await file.arrayBuffer();

  const path = `${conversationKey}/${senderId}/${kind}_${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, body, {
      contentType: finalContentType,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) throw error;

  return {
    path,
    contentType: finalContentType,
  };
}

export async function createChatMediaSignedUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;

  return data.signedUrl;
}