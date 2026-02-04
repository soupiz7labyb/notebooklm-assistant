export interface Notebook {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Source {
  id: string;
  title: string;
  type: string;
  typeCode?: number;
  url?: string | null;
  status: number;
}

export interface UploadItem {
  id: string;
  type: 'page' | 'selection' | 'file' | 'youtube' | 'note';
  title: string;
  content?: string;
  url?: string;
  file?: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number;
  error?: string;
  notebookId?: string;
  chunks?: number;
  currentChunk?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  token?: string;
  userEmail?: string;
}

export interface AppState {
  auth: AuthState;
  notebooks: Notebook[];
  selectedNotebookId: string | null;
  uploadQueue: UploadItem[];
  isLoading: boolean;
  error: string | null;
}
