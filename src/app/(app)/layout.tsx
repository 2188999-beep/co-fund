import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BottomNav from '@/components/ui/BottomNav';
import { GroupProvider } from '@/components/GroupContext';
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <GroupProvider>
      <div className="relative min-h-screen">
        {/* Main content area — padded for bottom nav */}
        <main className="safe-bottom">{children}</main>

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </GroupProvider>
  );
}
