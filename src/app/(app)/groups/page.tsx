'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useGroup } from '@/components/GroupContext';
import { generateInviteCode } from '@/lib/utils';

export default function GroupsListPage() {
  const router = useRouter();
  const supabase = createClient();
  const { allGroups, setActiveGroupId, loading: groupLoading, reloadGroups } = useGroup();

  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');

  // Handle Create Group
  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreatingGroup(true);

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Create group with new invite code
    const newInviteCode = generateInviteCode();
    const { data: newGroup, error: groupError } = await supabase
      .from('groups')
      .insert({ 
        name: groupName.trim(), 
        manager_id: authUser.id,
        invite_code: newInviteCode
      })
      .select()
      .single();

    if (groupError || !newGroup) {
      setCreatingGroup(false);
      return;
    }

    // Add creator as member
    await supabase
      .from('group_members')
      .insert({ group_id: newGroup.id, user_id: authUser.id });

    setCreatingGroup(false);
    setGroupName('');
    localStorage.setItem('cofund_active_group_id', newGroup.id);
    await reloadGroups();
    router.push('/dashboard');
  };

  // Handle Join by Token
  const handleJoinGroup = async () => {
    if (!inviteCode.trim()) return;
    setJoiningGroup(true);
    setJoinError('');

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Find group by invite code
    const { data: groupToJoin } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .single();

    if (!groupToJoin) {
      setJoinError('Invalid invite code');
      setJoiningGroup(false);
      return;
    }

    // Add user to group
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: groupToJoin.id, user_id: authUser.id });

    if (error && error.code !== '23505') { // Ignore unique violation if already member
      setJoinError('Failed to join group');
      setJoiningGroup(false);
      return;
    }

    setJoiningGroup(false);
    setInviteCode('');
    localStorage.setItem('cofund_active_group_id', groupToJoin.id);
    await reloadGroups();
    router.push('/dashboard');
  };

  if (groupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-12 flex flex-col items-center">
      <div className="w-full max-w-sm animate-fade-in-up">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-200">
            <span className="text-3xl">🍕</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">CompanyFund</h1>
          <p className="text-sm text-slate-500">Track your street food kitty</p>
        </div>

        {/* Existing Groups List */}
        {allGroups.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Your Groups</h2>
            <div className="space-y-2">
              {allGroups.map((g) => (
                <Link
                  key={g.id}
                  href="/dashboard"
                  prefetch={true}
                  onClick={() => {
                    setActiveGroupId(g.id);
                  }}
                  className="w-full card p-4 flex items-center justify-between hover:border-emerald-200 hover:ring-2 hover:ring-emerald-50 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <span className="text-lg">👥</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{g.name}</p>
                      <p className="text-[11px] text-slate-400 font-medium tracking-wide">
                        Code: {g.invite_code || 'NONE'}
                      </p>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-6">
          <div className="card p-5 border border-emerald-100 bg-emerald-50/30">
            <h3 className="font-bold text-slate-900 mb-1">Create New Group</h3>
            <p className="text-xs text-slate-500 mb-4">Start a new shared fund</p>
            <div className="space-y-3">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., Street Food Gang 🍕"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || creatingGroup}
                className="btn btn-primary w-full py-2.5 disabled:opacity-50"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-xs font-semibold text-slate-400">OR</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <div className="card p-5">
            <h3 className="font-bold text-slate-900 mb-1">Join with Code</h3>
            <p className="text-xs text-slate-500 mb-4">Enter a 6-character invite code</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g., XT49M2"
                maxLength={6}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleJoinGroup}
                disabled={inviteCode.length < 6 || joiningGroup}
                className="btn btn-secondary px-6"
              >
                {joiningGroup ? '...' : 'Join'}
              </button>
            </div>
            {joinError && <p className="text-[10px] text-rose-500 mt-2 font-medium">{joinError}</p>}
          </div>
        </div>

      </div>
    </div>
  );
}
