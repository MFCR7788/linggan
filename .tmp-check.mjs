import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
readFileSync('.env.local', 'utf-8').split('\n')
  .filter(l => l && !l.startsWith('#'))
  .forEach(l => { const [k,v] = l.split('=').map(s => s.trim()); if(k) env[k]=v; });

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Check 15967675767 user's current balance
const { data: users } = await admin.auth.admin.listUsers({ perPage: 100 });
const target = users.users.find(u => u.phone === '8615967675767');
if (target) {
  console.log('User:', target.id, target.email);
  const { data: credits } = await admin.from('user_credits').select('*').eq('user_id', target.id).maybeSingle();
  console.log('Credits record:', credits);
  
  const { data: txns } = await admin.from('credit_transactions').select('*').eq('user_id', target.id).order('created_at', { ascending: false }).limit(5);
  console.log('Recent transactions:', txns?.length || 0);
} else {
  console.log('User 15967675767 not found!');
}

// Check other users' credit records
const { data: allCredits } = await admin.from('user_credits').select('*').limit(5);
console.log('\nSample user_credits records:', allCredits?.length || 0);
if (allCredits) for (const c of allCredits) console.log(' -', c.user_id?.substring(0,12), 'balance:', c.balance, 'tier:', c.tier);

