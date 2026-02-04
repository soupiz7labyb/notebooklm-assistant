import { Heart, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { useState } from 'react';

const DONATE_ADDRESSES = {
  USDT_Tron: 'THVezQ7rXz7kZXZYYXWPB17pYL9v2ewJPN',
  USDT_Ethereum: '0x421f61C9c13aBc8F42014F932B5F9E03D46213e7',
  USDC_Ethereum: '0x421f61C9c13aBc8F42014F932B5F9E03D46213e7',
};

export function DonateMenu() {
  const { toast } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopy = async (address: string, label: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast({
        title: 'Copied!',
        description: `${label.replace('_', ' ')} address copied to clipboard`,
      });
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy address',
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Donate to the project">
          <Heart className="h-4 w-4 text-red-500 fill-red-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Donate to the project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(DONATE_ADDRESSES).map(([label, address]) => (
          <DropdownMenuItem
            key={label}
            onClick={() => handleCopy(address, label)}
            className="flex flex-col items-start gap-1 py-3 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-medium text-sm">{label.replace('_', ' ')}</span>
              {copiedAddress === address ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 opacity-50" />
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono break-all">{address}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
