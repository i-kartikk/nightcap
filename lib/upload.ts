'use client';
import { getSupabase } from './supabase/client';

/** Uploads an image into the user's own folder in the public avatars bucket. */
export async function uploadImage(file: File, folder: 'profile' | 'rooms'): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Use a PNG, JPG, WebP or GIF image.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Images must be under 2 MB.');
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first.');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${user.id}/${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
