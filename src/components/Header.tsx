import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { AuthService } from '@/services/auth';
import { NotebookLMService } from '@/services/notebooklm-api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, LogOut, Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { DonateMenu } from '@/components/DonateMenu';

export function Header() {
  const { auth, notebooks, selectedNotebookId, setSelectedNotebookId, setNotebooks, setLoading } =
    useStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (auth.isAuthenticated && notebooks.length === 0) {
      loadNotebooks();
    }
  }, [auth.isAuthenticated]);

  const loadNotebooks = async () => {
    setIsRefreshing(true);
    setLoading(true);
    try {
      const fetchedNotebooks = await NotebookLMService.getNotebooks();
      setNotebooks(fetchedNotebooks);
      if (fetchedNotebooks.length > 0 && !selectedNotebookId) {
        setSelectedNotebookId(fetchedNotebooks[0].id);
      }
    } catch (error) {
      console.error('Error loading notebooks:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Error loading notebooks',
        description: errorMessage.includes('Could not find notebooks API endpoint')
          ? 'API endpoints not configured. Please check API_DISCOVERY.md for instructions.'
          : 'Failed to load notebooks. Please check if you are logged in to NotebookLM.',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const handleCreateNotebook = async () => {
    setIsCreating(true);
    try {
      const name = `Notebook ${new Date().toLocaleDateString()}`;
      const newNotebook = await NotebookLMService.createNotebook(name);
      useStore.getState().addNotebook(newNotebook);
      setSelectedNotebookId(newNotebook.id);
      toast({
        title: 'Success',
        description: 'Notebook created successfully',
      });
    } catch (error) {
      console.error('Error creating notebook:', error);
      toast({
        title: 'Error',
        description: 'Failed to create notebook. Please check network requests.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRenameNotebook = async (notebookId: string, currentName: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const newName = prompt('Enter new notebook name:', currentName);
    if (!newName || newName.trim() === currentName || !newName.trim()) return;

    try {
      await NotebookLMService.renameNotebook(notebookId, newName.trim());
      
      // Update local state
      const updatedNotebooks = notebooks.map((nb) =>
        nb.id === notebookId ? { ...nb, name: newName.trim() } : nb
      );
      setNotebooks(updatedNotebooks);
      
      toast({
        title: 'Success',
        description: 'Notebook renamed successfully',
      });
    } catch (error) {
      console.error('Error renaming notebook:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to rename notebook',
        variant: 'destructive',
      });
    }
  };

  const handleLogout = async () => {
    try {
      await AuthService.logout();
      toast({
        title: 'Logged out',
        description: 'You have been logged out successfully',
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const { isLoading } = useStore();
  
  const getStatusColor = () => {
    if (!auth.isAuthenticated) return 'bg-red-500';
    if (isLoading) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <header className="border-b border-border bg-card p-4">
      <div className="flex flex-col gap-3">
        {/* First row: Title and status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
                N
              </div>
              <h1 className="text-lg font-semibold">NotebookLM Assistant</h1>
            </div>
            <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
          </div>
        </div>

        {/* Second row: Controls */}
        <div className="flex items-center gap-2">
          {auth.isAuthenticated && (
            <>
              <Select value={selectedNotebookId || ''} onValueChange={setSelectedNotebookId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select notebook" />
                </SelectTrigger>
                <SelectContent>
                  {notebooks.map((notebook) => (
                    <SelectItem key={notebook.id} value={notebook.id}>
                      {notebook.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedNotebookId) {
                    const notebook = notebooks.find(n => n.id === selectedNotebookId);
                    if (notebook) {
                      handleRenameNotebook(notebook.id, notebook.name, e);
                    }
                  }
                }}
                title="Rename notebook"
              >
                <span className="text-xs">✏️</span>
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleCreateNotebook}
                disabled={isCreating}
                title="Create new notebook"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={loadNotebooks}
                disabled={isRefreshing}
                title="Refresh notebooks"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>

              <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}

          <DonateMenu />
        </div>
      </div>
    </header>
  );
}
