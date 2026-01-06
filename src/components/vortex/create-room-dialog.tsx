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
import { Sparkles, Lock, Users } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface CreateRoomDialogProps {
  children: React.ReactNode;
  disabled?: boolean;
}

type RoomType = 'default' | 'custom';

export function CreateRoomDialog({ children, disabled }: CreateRoomDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roomType, setRoomType] = useState<RoomType>('default');
  const [password, setPassword] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      const newSessionId = nanoid(5);
      
      // Build query params only for custom rooms
      const params = new URLSearchParams();
      if (roomType === 'custom') {
        if (password.trim()) {
          params.set('password', password.trim());
        }
        if (maxUsers.trim() && !isNaN(Number(maxUsers)) && Number(maxUsers) > 0) {
          params.set('maxUsers', maxUsers.trim());
        }
      }

      const queryString = params.toString();
      const url = `/session/${newSessionId}/setup${queryString ? `?${queryString}` : ''}`;
      
      router.push(url);
      setOpen(false);
      
      // Reset form
      setRoomType('default');
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
            Choose room type and configure settings.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <RadioGroup value={roomType} onValueChange={(value) => setRoomType(value as RoomType)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="default" id="default" />
              <Label htmlFor="default" className="font-normal cursor-pointer">
                Default Room
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Create a room with default settings
            </p>

            <div className="flex items-center space-x-2 mt-4">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="font-normal cursor-pointer">
                Custom Room
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Add password and user limit
            </p>
          </RadioGroup>

          {roomType === 'custom' && (
            <div className="grid gap-4 pt-2 border-t">
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
                  type="text"
                  inputMode="numeric"
                  value={maxUsers}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Only allow digits
                    if (value === '' || /^\d+$/.test(value)) {
                      const numValue = value === '' ? 0 : Number(value);
                      if (value === '' || (numValue > 0 && numValue <= 100)) {
                        setMaxUsers(value);
                      }
                    }
                  }}
                  placeholder="e.g. 10"
                  disabled={isCreating}
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Set maximum number of users (1-100)
                </p>
              </div>
            </div>
          )}
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

