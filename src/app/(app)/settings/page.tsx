'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { GroupMember, Profile } from '@/lib/types';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { useGroup } from '@/components/GroupContext';

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { activeGroup: group, loading: groupLoading, userProfile, reloadGroups, setActiveGroupId } = useGroup();
  
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<(GroupMember & { profiles: Profile })[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [guestPassword, setGuestPassword] = useState('');
  
  // Group editing state
  const [groupName, setGroupName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  
  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [observerSuccess, setObserverSuccess] = useState('');

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (groupLoading) return;
    setLoading(true);
    
    if (!userProfile || !group) {
      if (typeof window !== 'undefined') window.location.href = '/groups';
      return;
    }

    const { data: membersRes } = await supabase
      .from('group_members')
      .select('*, profiles(*)')
      .eq('group_id', group.id);

    setGuestPassword(group.guest_password);
    setGroupName(group.name);
    setIsManager(group.manager_id === userProfile.id);
    
    if (membersRes) {
      setMembers(membersRes as (GroupMember & { profiles: Profile })[]);
    }
    setLoading(false);
  }, [supabase, group, groupLoading]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdatePassword = async () => {
    if (!group || !guestPassword.trim()) return;
    setSaving(true);
    await supabase
      .from('groups')
      .update({ guest_password: guestPassword.trim() })
      .eq('id', group.id);
    setSaving(false);
    await reloadGroups();
  };

  const handleUpdateGroupName = async () => {
    if (!group || !groupName.trim() || groupName === group.name) {
      setIsEditingName(false);
      return;
    }
    setSaving(true);
    await supabase
      .from('groups')
      .update({ name: groupName.trim() })
      .eq('id', group.id);
    setSaving(false);
    setIsEditingName(false);
    await reloadGroups();
  };

  const handleCopyInviteLink = () => {
    if (!group || !group.invite_code) return;
    const link = `${window.location.origin}/invite/${group.invite_code}`;
    navigator.clipboard.writeText(link);
    setInviteSuccess('Copied to clipboard!');
    setTimeout(() => setInviteSuccess(''), 2000);
  };

  const handleCopyObserverLink = () => {
    if (!group) return;
    const link = `${window.location.origin}/observer/${group.id}?pwd=${group.guest_password}`;
    navigator.clipboard.writeText(link);
    setObserverSuccess('Copied to clipboard!');
    setTimeout(() => setObserverSuccess(''), 2000);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!group) return;
    if (confirm("Are you sure you want to remove this member?")) {
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', userId);
      loadData();
    }
  };

  const handleCopyGuestLink = () => {
    if (!group) return;
    const link = `${window.location.origin}/guest/${group.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteGroup = async () => {
    if (!group) return;
    if (confirm("🚨 WARNING 🚨\nAre you sure you want to permanently delete this group? All expenses, members, and funds will be lost forever. This cannot be undone.")) {
      setLoading(true);
      await supabase.from('groups').delete().eq('id', group.id);
      localStorage.removeItem('cofund_active_group_id');
      await reloadGroups();
      router.push('/groups');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 animate-fade-in-up">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Settings ⚙️
        </h1>
        <button 
          onClick={() => window.location.href = '/groups'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full border border-slate-200 hover:bg-slate-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Groups
        </button>
      </div>

      {/* Group Info */}
      {/* Group Info & Edit Name */}
      <div className="card p-4 mb-4 animate-fade-in-up delay-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">Group</h2>
          {isManager && (
            <button 
              onClick={() => {
                if (isEditingName) handleUpdateGroupName();
                else setIsEditingName(true);
              }}
              disabled={saving}
              className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full hover:bg-emerald-100 transition-colors"
            >
              {isEditingName ? (saving ? 'Saving...' : 'Save') : 'Edit Name'}
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
            <span className="text-lg">👥</span>
          </div>
          <div className="flex-1">
            {isEditingName ? (
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            ) : (
              <p className="text-base font-bold text-slate-900">{group?.name}</p>
            )}
            <p className="text-[11px] text-slate-400 mt-0.5">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Invite Member */}
        {isManager && (
          <div className="mb-4 pb-4 border-b border-slate-100">
            <h3 className="text-xs font-semibold text-slate-600 mb-2">Invite Members</h3>
            <p className="text-xs text-slate-500 mb-3">
              Friends can join by entering code <strong className="text-slate-700">{group?.invite_code}</strong> or by clicking your invite link.
            </p>
            <button
              onClick={handleCopyInviteLink}
              className="btn btn-primary w-full gap-2 text-sm mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.553a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 116.364 6.364l-1.757 1.757" />
              </svg>
              {inviteSuccess ? 'Copied!' : 'Copy Invite Link'}
            </button>
            
            <h3 className="text-xs font-semibold text-slate-600 mb-2 mt-4">Observer Access</h3>
            <p className="text-xs text-slate-500 mb-3">
              Share a read-only dashboard link with shop owners or external friends. 
              Password: <strong className="text-slate-700">{group?.guest_password}</strong>
            </p>
            <button
              onClick={handleCopyObserverLink}
              className="btn btn-secondary w-full gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {observerSuccess ? 'Copied!' : 'Copy Observer Link'}
            </button>
          </div>
        )}

        {/* Members List */}
        <h3 className="text-xs font-semibold text-slate-600 mb-2">Members</h3>
        <div className="space-y-2">
          {members.map((m, idx) => {
            const profile = m.profiles as unknown as Profile;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${getAvatarColor(idx)}`}
                >
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    getInitials(profile?.name || '?')
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {profile?.name}
                  </p>
                  <p className="text-[10px] text-slate-400">{profile?.email}</p>
                </div>
                {m.user_id === group?.manager_id ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-semibold">
                    Admin
                  </span>
                ) : (
                  isManager && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-[10px] text-rose-500 font-semibold px-2 py-1 bg-rose-50 rounded-lg hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Guest Access */}
      <div className="card p-4 mb-4 animate-fade-in-up delay-2">
        <h2 className="text-sm font-bold text-slate-900 mb-3">
          Observer Access (Shop Owner)
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Share this link with your shop owner so they can see the balance
        </p>

        {/* Copy Link */}
        <button
          onClick={handleCopyGuestLink}
          className="btn btn-secondary w-full mb-3 gap-2 text-sm"
          id="copy-guest-link-btn"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.553a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 116.364 6.364l-1.757 1.757" />
              </svg>
              Copy Guest Link
            </>
          )}
        </button>

        {/* Guest Password */}
        {isManager && (
          <div>
            <label className="text-xs text-slate-500 font-medium mb-1.5 block">
              Guest Password
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={guestPassword}
                onChange={(e) => setGuestPassword(e.target.value)}
                className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                id="guest-password-setting"
              />
              <button
                onClick={handleUpdatePassword}
                disabled={saving}
                className="btn btn-primary text-sm px-4"
                id="save-password-btn"
              >
                {saving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Group */}
      {isManager && (
        <button
          onClick={handleDeleteGroup}
          className="btn btn-danger w-full mb-4 animate-fade-in-up delay-2"
          id="delete-group-btn"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.158 0c-.36-.05-.72-.102-1.08-.15m-1.08-.15A59.76 59.76 0 0012 5.25c-2.625 0-5.25.415-7.875 1.24m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.158 0c-.36-.05-.72-.102-1.08-.15m-1.08-.15A59.76 59.76 0 0012 5.25c-2.625 0-5.25.415-7.875 1.24" />
          </svg>
          Delete Group
        </button>
      )}

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="btn bg-slate-200 text-slate-700 hover:bg-slate-300 w-full animate-fade-in-up delay-3 font-bold py-3.5 rounded-xl"
        id="logout-btn"
      >
        Sign Out
      </button>
    </div>
  );
}
