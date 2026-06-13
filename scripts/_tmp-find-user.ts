import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase-server');
  const supabase = createAdminClient();
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error('查询失败:', error); process.exit(1); }
  const user = users.find((u: any) => u.phone === '15967675767' || u.phone === '+8615967675767');
  if (!user) {
    console.log('未找到，列出含手机号的用户:');
    users.filter((u: any) => u.phone).forEach((u: any) => console.log(u.id, u.phone));
  } else {
    console.log(user.id, user.phone);
  }
}
main();
