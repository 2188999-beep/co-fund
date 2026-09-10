'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Group } from '@/lib/types';

interface GroupContextType {
  activeGroup: Group | null;
  allGroups: Group[];
  setActiveGroupId: (id: string) => void;
  loading: boolean;
  reloadGroups: () => Promise<void>;
}

const GroupContext = createContext<GroupContextType>({
  activeGroup: null,
  allGroups: [],
  setActiveGroupId: () => {},
  loading: true,
  reloadGroups: async () => {},
});

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadGroups = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch all memberships for this user, including the joined group data
    const { data: memberships, error } = await supabase
      .from('group_members')
      .select('group_id, groups(*)')
      .eq('user_id', user.id);

    if (error || !memberships || memberships.length === 0) {
      setAllGroups([]);
      setActiveGroup(null);
      setLoading(false);
      return;
    }

    // Extract the group objects from the join
    const fetchedGroups = memberships
      .map(m => m.groups as unknown as Group)
      .filter(Boolean); // remove any nulls if join failed

    setAllGroups(fetchedGroups);

    if (fetchedGroups.length > 0) {
      // Check localStorage for saved preference
      const savedGroupId = localStorage.getItem('cofund_active_group_id');
      const savedGroup = fetchedGroups.find(g => g.id === savedGroupId);

      if (savedGroup) {
        setActiveGroup(savedGroup);
      } else {
        setActiveGroup(fetchedGroups[0]);
        localStorage.setItem('cofund_active_group_id', fetchedGroups[0].id);
      }
    } else {
      setActiveGroup(null);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const setActiveGroupId = (id: string) => {
    const group = allGroups.find(g => g.id === id);
    if (group) {
      setActiveGroup(group);
      localStorage.setItem('cofund_active_group_id', id);
    }
  };

  return (
    <GroupContext.Provider value={{ activeGroup, allGroups, setActiveGroupId, loading, reloadGroups: loadGroups }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  return useContext(GroupContext);
}
