import { create } from 'zustand';
import type { AppState, Notebook, UploadItem, AuthState } from '@/types';

interface Store extends AppState {
  // Auth actions
  setAuth: (auth: AuthState) => void;
  logout: () => void;

  // Notebook actions
  setNotebooks: (notebooks: Notebook[]) => void;
  setSelectedNotebookId: (id: string | null) => void;
  addNotebook: (notebook: Notebook) => void;

  // Upload queue actions
  addToQueue: (item: UploadItem) => void;
  updateQueueItem: (id: string, updates: Partial<UploadItem>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;

  // UI actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Load initial state from Chrome storage
const loadInitialState = async (): Promise<Partial<Store>> => {
  try {
    const stored = await chrome.storage.local.get('notebooklm-storage');
    if (stored['notebooklm-storage']) {
      return stored['notebooklm-storage'];
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
  return {
    auth: { isAuthenticated: false },
    notebooks: [],
    selectedNotebookId: null,
  };
};

// Save state to Chrome storage
const saveState = (state: Partial<Store>) => {
  const toSave = {
    auth: state.auth,
    selectedNotebookId: state.selectedNotebookId,
    notebooks: state.notebooks,
  };
  chrome.storage.local.set({ 'notebooklm-storage': toSave }).catch(console.error);
};

export const useStore = create<Store>((set, get) => {
  // Initialize with default state
  const store: Store = {
    // Initial state
    auth: {
      isAuthenticated: false,
    },
    notebooks: [],
    selectedNotebookId: null,
    uploadQueue: [],
    isLoading: false,
    error: null,

    // Auth actions
    setAuth: (auth) => {
      set({ auth });
      saveState({ auth, notebooks: get().notebooks, selectedNotebookId: get().selectedNotebookId });
    },
    logout: () => {
      const cleared = {
        auth: { isAuthenticated: false },
        notebooks: [],
        selectedNotebookId: null,
      };
      set(cleared);
      saveState(cleared);
    },

    // Notebook actions
    setNotebooks: (notebooks) => {
      set({ notebooks });
      saveState({ auth: get().auth, notebooks, selectedNotebookId: get().selectedNotebookId });
    },
    setSelectedNotebookId: (id) => {
      set({ selectedNotebookId: id });
      saveState({ auth: get().auth, notebooks: get().notebooks, selectedNotebookId: id });
    },
    addNotebook: (notebook) => {
      const notebooks = [...get().notebooks, notebook];
      set({ notebooks });
      saveState({ auth: get().auth, notebooks, selectedNotebookId: get().selectedNotebookId });
    },

    // Upload queue actions
    addToQueue: (item) =>
      set((state) => ({
        uploadQueue: [...state.uploadQueue, item],
      })),
    updateQueueItem: (id, updates) =>
      set((state) => ({
        uploadQueue: state.uploadQueue.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        ),
      })),
    removeFromQueue: (id) =>
      set((state) => ({
        uploadQueue: state.uploadQueue.filter((item) => item.id !== id),
      })),
    clearQueue: () => set({ uploadQueue: [] }),

    // UI actions
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
  };

  // Load initial state asynchronously
  loadInitialState().then((initial) => {
    if (initial.auth) set({ auth: initial.auth });
    if (initial.notebooks) set({ notebooks: initial.notebooks });
    if (initial.selectedNotebookId !== undefined) set({ selectedNotebookId: initial.selectedNotebookId });
  });

  return store;
});
