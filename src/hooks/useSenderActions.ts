import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { SenderAction } from '../lib/types';

type UnsubscribeStatus = SenderAction['unsubscribe_status'];

// Who the user has already unsubscribed from (sender_actions), keyed by the
// lowercased sender address. Shared by the Senders screen and the dashboard.
export function useSenderActions() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, UnsubscribeStatus>>({});

  useEffect(() => {
    if (!user) return;
    supabase
      .from('sender_actions')
      .select('sender, unsubscribe_status')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const map: Record<string, UnsubscribeStatus> = {};
        for (const row of data ?? []) map[row.sender] = row.unsubscribe_status;
        setStatuses(map);
      });
  }, [user]);

  const setStatus = useCallback(
    (key: string, status: UnsubscribeStatus) => setStatuses((prev) => ({ ...prev, [key]: status })),
    []
  );

  return { statuses, setStatus };
}
