import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// This route is called by Supabase Database Webhook
// on AFTER INSERT to the transactions table

export async function POST(request: Request) {
  try {
    // Verify webhook secret
    const webhookSecret = request.headers.get('x-webhook-secret');
    if (webhookSecret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json();
    const { record } = payload; // The inserted transaction row

    if (!record?.group_id) {
      return NextResponse.json({ error: 'No group_id in payload' }, { status: 400 });
    }

    // Use service role key for admin access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Calculate remaining funds
    const { data: remainingFunds } = await supabase.rpc('get_group_funds_remaining', {
      p_group_id: record.group_id,
    });

    // Only alert if below ₹100
    if (remainingFunds === null || remainingFunds >= 100) {
      return NextResponse.json({
        message: 'Funds OK',
        remaining: remainingFunds,
      });
    }

    // Get group info and member emails
    const [groupRes, membersRes] = await Promise.all([
      supabase.from('groups').select('name').eq('id', record.group_id).single(),
      supabase
        .from('group_members')
        .select('profiles(email, name)')
        .eq('group_id', record.group_id),
    ]);

    const groupName = groupRes.data?.name || 'Your Group';

    interface MemberProfile {
      profiles: { email: string; name: string } | null;
    }

    const emails = (membersRes.data as unknown as MemberProfile[])
      ?.map((m) => m.profiles?.email)
      .filter(Boolean) as string[];

    if (emails.length === 0) {
      return NextResponse.json({ message: 'No emails to send to' });
    }

    // Send email via Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const formattedAmount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(remainingFunds);

    await transporter.sendMail({
      from: `"CoFund Alert" <${process.env.GMAIL_USER}>`,
      to: emails.join(', '),
      subject: `⚠️ Low Funds Alert — ${groupName}`,
      html: `
        <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
          <div style="background: linear-gradient(135deg, #fef2f2, #fff1f2); border-radius: 16px; padding: 24px; text-align: center;">
            <h2 style="color: #ef4444; margin: 0 0 8px 0; font-size: 20px;">⚠️ Low Funds Alert</h2>
            <p style="color: #64748b; margin: 0 0 16px 0; font-size: 14px;">${groupName}</p>
            <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px 0;">Remaining Balance</p>
              <p style="color: #ef4444; font-size: 28px; font-weight: 800; margin: 0;">${formattedAmount}</p>
            </div>
            <p style="color: #64748b; font-size: 13px; margin: 0;">
              Time to collect more funds! 💰
            </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({
      message: 'Alert sent',
      remaining: remainingFunds,
      recipients: emails.length,
    });
  } catch (error) {
    console.error('Alert webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
