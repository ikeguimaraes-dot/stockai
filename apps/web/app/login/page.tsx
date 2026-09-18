import { Access } from '@/components/access';
export default function Login() {
  return <Access configured={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)} />;
}
