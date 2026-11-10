'use client';
import { useState } from 'react';
import { Crown, Shield, Star, MoreHorizontal, Eye, EyeOff, Phone, UserPlus, MessageCircle, Flag, Ban, UserMinus, ArrowRightLeft } from 'lucide-react';
import { Avatar } from '../Avatar';
import type { Member, PresenceInfo, RoomRole } from '@/lib/types';
import { ROLE_LABEL, canModerate, roleRank } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface MemberActions {
  setRole(userId: string, role: RoomRole): void;
  transfer(userId: string): void;
  kick(userId: string, ban: boolean): void;
  addFriend(userId: string): void;
  message(userId: string): void;
  report(userId: string): void;
  block(userId: string): void;
}

const RoleIcon = ({ role }: { role: RoomRole }) =>
  role === 'owner' ? <Crown className="h-3.5 w-3.5 text-beam" /> :
  role === 'cohost' ? <Star className="h-3.5 w-3.5 text-lilac" /> :
  role === 'moderator' ? <Shield className="h-3.5 w-3.5 text-emerald-300" /> : null;

export function ParticipantsPanel({ members, presence, me, myRole, actions }: {
  members: Member[]; presence: Record<string, PresenceInfo>; me: string; myRole: RoomRole | null; actions: MemberActions;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const sorted = [...members].sort((a, b) =>
    (presence[b.user_id] ? 1 : 0) - (presence[a.user_id] ? 1 : 0) || roleRank(b.role) - roleRank(a.role));
  const online = sorted.filter((m) => presence[m.user_id]).length;

  return (
    <div className="scroll-thin h-full overflow-y-auto p-3">
      <p className="px-2 pb-2 text-xs text-white/45">{online} online · {members.length} in room</p>
      <ul className="space-y-0.5">
        {sorted.map((m) => {
          const p = presence[m.user_id];
          const isMe = m.user_id === me;
          const canAct = !isMe && myRole && canModerate(myRole) && roleRank(myRole) > roleRank(m.role);
          return (
            <li key={m.user_id} className="relative">
              <div className={cn('flex items-center gap-3 rounded-xl px-2 py-2', !p && 'opacity-55')}>
                <Avatar name={m.profile?.display_name || m.profile?.username} src={m.profile?.avatar_url} size={36} online={!!p} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{m.profile?.display_name || m.profile?.username}{isMe && ' (you)'}</span>
                    <RoleIcon role={m.role} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-white/45">
                    <span>{ROLE_LABEL[m.role]}</span>
                    {p && (p.watching ? <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />watching</span> : <span className="flex items-center gap-0.5"><EyeOff className="h-3 w-3" />away</span>)}
                    {p?.in_call && <span className="flex items-center gap-0.5 text-emerald-300"><Phone className="h-3 w-3" />in call</span>}
                  </div>
                </div>
                {!isMe && (
                  <button className="icon-btn h-8 w-8" onClick={() => setMenu(menu === m.user_id ? null : m.user_id)} aria-label={`Actions for ${m.profile?.username}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              </div>
              {menu === m.user_id && (
                <div className="glass-strong absolute right-2 top-12 z-20 w-56 rounded-2xl p-1.5 shadow-2xl" onMouseLeave={() => setMenu(null)}>
                  {myRole === 'owner' && (
                    <>
                      {m.role !== 'cohost' && <MenuItem icon={Star} onClick={() => actions.setRole(m.user_id, 'cohost')}>Make co-host</MenuItem>}
                      {m.role !== 'moderator' && <MenuItem icon={Shield} onClick={() => actions.setRole(m.user_id, 'moderator')}>Make moderator</MenuItem>}
                      {m.role !== 'member' && <MenuItem icon={UserMinus} onClick={() => actions.setRole(m.user_id, 'member')}>Remove role</MenuItem>}
                      <MenuItem icon={ArrowRightLeft} onClick={() => actions.transfer(m.user_id)}>Make host</MenuItem>
                    </>
                  )}
                  {canAct && (
                    <>
                      <MenuItem icon={UserMinus} danger onClick={() => actions.kick(m.user_id, false)}>Remove from room</MenuItem>
                      <MenuItem icon={Ban} danger onClick={() => actions.kick(m.user_id, true)}>Ban from room</MenuItem>
                    </>
                  )}
                  <div className="my-1 h-px bg-white/10" />
                  <MenuItem icon={UserPlus} onClick={() => actions.addFriend(m.user_id)}>Add friend</MenuItem>
                  <MenuItem icon={MessageCircle} onClick={() => actions.message(m.user_id)}>Send private message</MenuItem>
                  <MenuItem icon={Flag} onClick={() => actions.report(m.user_id)}>Report</MenuItem>
                  <MenuItem icon={Ban} danger onClick={() => actions.block(m.user_id)}>Block</MenuItem>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  function MenuItem({ icon: I, children, onClick, danger }: { icon: typeof Star; children: React.ReactNode; onClick(): void; danger?: boolean }) {
    return (
      <button onClick={() => { setMenu(null); onClick(); }} className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5', danger && 'text-rose-300')}>
        <I className="h-4 w-4" />{children}
      </button>
    );
  }
}

/** Compact horizontal strip for mobile / under the player. */
export function ParticipantStrip({ members, presence }: { members: Member[]; presence: Record<string, PresenceInfo> }) {
  const online = members.filter((m) => presence[m.user_id]);
  return (
    <div className="scroll-thin flex gap-3 overflow-x-auto px-1 py-1">
      {online.map((m) => (
        <div key={m.user_id} className="flex w-14 shrink-0 flex-col items-center gap-1">
          <div className={cn('rounded-full p-0.5', presence[m.user_id]?.in_call ? 'ring-2 ring-emerald-400/70' : '')}>
            <Avatar name={m.profile?.display_name || m.profile?.username} src={m.profile?.avatar_url} size={40} online />
          </div>
          <span className="w-full truncate text-center text-[11px] text-white/60">{m.profile?.display_name || m.profile?.username}</span>
        </div>
      ))}
    </div>
  );
}
