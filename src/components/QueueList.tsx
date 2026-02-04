import { useStore } from '@/store/useStore';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, XCircle, Trash2, FileText, Globe, Youtube, Type } from 'lucide-react';
import type { UploadItem } from '@/types';

const getStatusIcon = (status: UploadItem['status']) => {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'processing':
      return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

const getTypeIcon = (type: UploadItem['type']) => {
  switch (type) {
    case 'file':
      return <FileText className="h-4 w-4" />;
    case 'page':
      return <Globe className="h-4 w-4" />;
    case 'youtube':
      return <Youtube className="h-4 w-4" />;
    case 'note':
      return <Type className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export function QueueList() {
  const { uploadQueue, removeFromQueue } = useStore();

  if (uploadQueue.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No items in queue
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <div className="p-4">
        <h3 className="font-semibold mb-3">Upload Queue</h3>
        <div className="space-y-2">
          {uploadQueue.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {getTypeIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    {item.chunks && item.currentChunk !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Part {item.currentChunk} of {item.chunks}
                      </p>
                    )}
                    {item.error && !item.error.includes('RPC returned error code:') && (
                      <p className="text-xs text-red-500 mt-1">{item.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(item.status)}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeFromQueue(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {item.progress !== undefined && item.progress < 100 && (
                <Progress value={item.progress} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
