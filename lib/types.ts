export type RoomRole = 'owner' | 'cohost' | 'moderator' | 'member';
export type SourceType = 'none' | 'youtube' | 'html5' | 'hls' | 'iframe' | 'netflix';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  last_seen?: string;
}

export interface Room {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  is_public: boolean;
  has_password: boolean;
  everyone_can_control: boolean;
  source_type: SourceType;
  source_url: string | null;
  source_title: string | null;
  is_playing: boolean;
  position: number;
  playback_rate: number;
  state_updated_at: string;
  state_version: number;
  countdown_at: string | null;
  created_at: string;
  last_activity: string;
}

export interface Member {
  room_id: string;
  user_id: string;
  role: RoomRole;
  joined_at: string;
  last_active: string;
  profile?: Profile;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  gif_url: string | null;
  reply_to: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface Reaction {
  room_id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface Notification {
  id: string;
  type: 'friend_request' | 'friend_accepted' | 'dm' | 'room_invite' | 'role_changed' | 'host_transferred' | string;
  payload: Record<string, string>;
  read: boolean;
  created_at: string;
}

/** Authoritative playback state, as stored in the rooms row. */
export interface PlaybackState {
  is_playing: boolean;
  position: number;
  playback_rate: number;
  updatedAtMs: number; // server clock, ms
  version: number;
  source_type: SourceType;
  source_url: string | null;
  source_title: string | null;
  countdownAtMs: number | null;
  origin: 'db' | 'broadcast' | 'local';
}

export interface PresenceInfo {
  user_id: string;
  username: string;
  avatar_url: string | null;
  watching: boolean;
  in_call: boolean;
  /** True while this person is sharing their screen. */
  sharing?: boolean;
  online_at: string;
}

export const ROLE_LABEL: Record<RoomRole, string> = {
  owner: 'Host',
  cohost: 'Co-host',
  moderator: 'Moderator',
  member: 'Member',
};

export const canControl = (role: RoomRole | null | undefined, everyone: boolean) =>
  role === 'owner' || role === 'cohost' || (!!role && everyone);
export const canModerate = (role: RoomRole | null | undefined) =>
  role === 'owner' || role === 'cohost' || role === 'moderator';
export const roleRank = (role: RoomRole) => ({ owner: 4, cohost: 3, moderator: 2, member: 1 })[role];
