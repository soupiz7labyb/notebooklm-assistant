import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { AuthService } from '@/services/auth';
import { Header } from '@/components/Header';
import { MainContent } from '@/components/MainContent';
import { QueueList } from '@/components/QueueList';
import { SourcesList } from '@/components/SourcesList';
import { AuthScreen } from '@/components/AuthScreen';
import { Toaster } from '@/components/ui/toaster';

function App() {
  const { auth } = useStore();

  useEffect(() => {
    // Check auth status on mount
    if (!auth.isAuthenticated) {
      AuthService.checkNotebookLMAuth().then((isAuthed) => {
        if (isAuthed) {
          // User is logged in via cookies, set auth state
          useStore.getState().setAuth({
            isAuthenticated: true,
            userEmail: undefined,
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <div className="flex-1 overflow-y-auto">
        {auth.isAuthenticated ? (
          <>
            <MainContent />
            <QueueList />
            <SourcesList />
          </>
        ) : (
          <AuthScreen />
        )}
      </div>
      <Toaster />
    </div>
  );
}

export default App;
