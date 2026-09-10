'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useGroup } from '@/components/GroupContext';

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const supabase = createClient();
  const { reloadGroups, setActiveGroupId } = useGroup();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);

  const { code } = use(params);
  const inviteCode = code?.toUpperCase();

  const loadInvite = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    // Not logged in? Go to login, but come back here!
    if (!user) {
      router.push(`/login?next=/invite/${inviteCode}`);
      return;
    }

    const { data: groupData, error: dbError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('invite_code', inviteCode)
      .single();

    if (dbError || !groupData) {
      setError(`This invite link is invalid or has expired. DB Error: ${dbError?.message || 'No data'}`);
      setLoading(false);
      return;
    }

    setGroup(groupData);
    setLoading(false);
  }, [inviteCode, router, supabase]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  const handleJoin = async () => {
    if (!group) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id });

    if (error && error.code !== '23505') { // Ignore if already joined
      setError("Failed to join group. Please try again.");
      setLoading(false);
      return;
    }

    // Success! Update context and redirect to dashboard
    localStorage.setItem('cofund_active_group_id', group.id);
    await reloadGroups();
    router.push('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Oops!</h1>
        <p className="text-slate-500 mb-8">{error}</p>
        <button onClick={() => router.push('/groups')} className="btn btn-secondary px-8">
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6">
      <div className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50">
          <span className="text-4xl">👋</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">You're Invited!</h1>
        <p className="text-slate-500 mb-8">
          You've been invited to join the <br/>
          <strong className="text-slate-900 text-lg">{group?.name}</strong> fund.
        </p>
        <button onClick={handleJoin} className="btn btn-primary w-full py-3 text-base">
          Accept Invite
        </button>
        <button onClick={() => router.push('/groups')} className="mt-4 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors">
          Decline
        </button>
      </div>
    </div>
  );
}
