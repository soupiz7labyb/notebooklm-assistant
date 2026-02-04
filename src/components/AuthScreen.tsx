import { Button } from '@/components/ui/button';
import { AuthService } from '@/services/auth';
import { useStore } from '@/store/useStore';
import { useToast } from '@/components/ui/use-toast';

export function AuthScreen() {
  const { setLoading } = useStore();
  const { toast } = useToast();

  const handleLogin = async () => {
    setLoading(true);
    try {
      await AuthService.authenticate();
      toast({
        title: 'Success',
        description: 'Authenticated successfully',
      });
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: 'Authentication Error',
        description: error instanceof Error ? error.message : 'Failed to authenticate',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-4">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Welcome to NotebookLM Assistant</h2>
        <p className="text-muted-foreground">
          Sign in with your Google account to get started
        </p>
      </div>
      <Button onClick={handleLogin} size="lg">
        Sign in with Google
      </Button>
      <p className="text-xs text-muted-foreground text-center max-w-md">
        <strong>Important:</strong> Make sure you are logged into notebooklm.google.com in this browser.
        The extension will use your browser cookies for authentication. OAuth is optional and only needed
        to display your email address.
      </p>
      <p className="text-xs text-muted-foreground text-center max-w-md">
        If you see an OAuth error, you can ignore it - the extension will work with cookies.
      </p>
    </div>
  );
}
