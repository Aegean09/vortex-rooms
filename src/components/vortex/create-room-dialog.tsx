"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Lock, Users, Hash } from 'lucide-react';

interface CreateRoomDialogProps {
  children: React.ReactNode;
  disabled?: boolean;
}

export function CreateRoomDialog({ children, disabled }: CreateRoomDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      const newSessionId = nanoid(5);
      
      // Build query params
      const params = new URLSearchParams();
      if (roomName.trim()) {
        params.set('name', roomName.trim());
      }
      if (password.trim()) {
        params.set('password', password.trim());
      }
      if (maxUsers.trim() && !isNaN(Number(maxUsers)) && Number(maxUsers) > 0) {
        params.set('maxUsers', maxUsers.trim());
      }

      const queryString = params.toString();
      const url = `/session/${newSessionId}/setup${queryString ? `?${queryString}` : ''}`;
      
      router.push(url);
      setOpen(false);
      
      // Reset form
      setRoomName('');
      setPassword('');
      setMaxUsers('');
    } catch (error) {
      console.error("Error creating room:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Create New Room
          </DialogTitle>
          <DialogDescription>
            Configure your room settings. All fields are optional.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="room-name" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Room Name
            </Label>
            <Input
              id="room-name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Gaming Session"
              maxLength={30}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Give your room a name
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password (optional)"
              maxLength={20}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Protect your room with a password
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="max-users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Max Users
            </Label>
            <Input
              id="max-users"
              type="number"
              value={maxUsers}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || (!isNaN(Number(value)) && Number(value) > 0 && Number(value) <= 100)) {
                  setMaxUsers(value);
                }
              }}
              placeholder="e.g. 10"
              min={1}
              max={100}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Set maximum number of users (1-100)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || disabled}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isCreating ? 'Creating...' : 'Create Room'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

