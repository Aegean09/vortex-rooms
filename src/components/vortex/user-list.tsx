
"use client";

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

export interface User {
  id: string;
  name: string;
  isMuted?: boolean;
  subSessionId?: string; // Add subSessionId to user type
}

interface UserListProps {
  users: User[];
  currentUser: User | null;
}

export function UserList({ users, currentUser }: UserListProps) {
  return (
    <Card className="w-full max-w-xs h-full flex flex-col bg-transparent shadow-none border-none">
      <CardContent className="flex-grow overflow-y-auto p-4">
        <ul className="space-y-3">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3">
              <div className="relative">
                <Avatar>
                  <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
              </div>
              <span className="font-medium text-sm truncate">
                {user.name} {user.id === currentUser?.id ? '(You)' : ''}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
