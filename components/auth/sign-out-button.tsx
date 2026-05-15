import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

interface SignOutButtonProps {
  label?: string;
}

export function SignOutButton({ label = "Çıkış Yap" }: SignOutButtonProps) {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        {label}
      </Button>
    </form>
  );
}
